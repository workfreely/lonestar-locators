import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  mintToken,
  sha256Hex,
  codeChallengeS256,
  ACCESS_TOKEN_PREFIX,
  REFRESH_TOKEN_PREFIX,
  AUTH_CODE_PREFIX,
  ACCESS_TTL_SECONDS,
  REFRESH_TTL_SECONDS,
  AUTH_CODE_TTL_SECONDS,
  COMPANION_READONLY_SCOPES,
} from "@/lib/companion/tokens";
import { isAllowedExtensionId } from "@/lib/companion/extensionClients";

// Companion EXTENSION auth — server library (Milestone B). Mirrors LB's device-
// token model (lib/companion/auth.ts): identity is resolved SERVER-SIDE from the
// opaque Bearer token; the request body is never trusted. All persistence uses
// the atomic RPCs (companion_exchange_auth_code / companion_rotate_refresh) via
// the service role — the raw tokens are minted HERE and only their sha256 hashes
// cross into the DB. Never logs a raw token.

const REQUIRED_SCOPE = COMPANION_READONLY_SCOPES[0]; // "lead:read"

function ttlISO(seconds: number): string {
  return new Date(Date.now() + seconds * 1000).toISOString();
}

export type IssuedTokens = {
  access: string;
  accessExpiresAt: string;
  refresh: string;
  refreshExpiresAt: string;
  connectionId: string;
  userId: string;
  workspaceId: string;
  scopes: string[];
};

// ── /authorize: mint a single-use, PKCE-bound authorization code ─────────────
// Called from the session-authed connect route AFTER the user has confirmed the
// account + workspace. Stores only the code HASH + the PKCE challenge. Throws if
// the extension client isn't allowed (fail closed in production).
export async function createAuthCode(params: {
  userId: string;
  workspaceId: string;
  extensionId: string;
  codeChallenge: string;
  state: string;
  scopes?: string[];
}): Promise<{ code: string } | { error: string }> {
  if (!isAllowedExtensionId(params.extensionId)) return { error: "extension_not_allowed" };
  const { raw, hash } = mintToken(AUTH_CODE_PREFIX);
  const { error } = await supabaseAdmin.from("companion_auth_codes").insert({
    code_hash: hash,
    user_id: params.userId,
    workspace_id: params.workspaceId,
    extension_id: params.extensionId,
    scopes: params.scopes ?? [...COMPANION_READONLY_SCOPES],
    code_challenge: params.codeChallenge,
    code_challenge_method: "S256",
    state: params.state,
    expires_at: ttlISO(AUTH_CODE_TTL_SECONDS),
  });
  if (error) {
    console.error("[ext-auth] createAuthCode failed:", error.message);
    return { error: "issue_failed" };
  }
  return { code: raw }; // raw returned once to the trusted route → the connect page → runtime message
}

// ── /token (grant_type=authorization_code): atomic exchange → tokens ─────────
export async function exchangeAuthCode(params: {
  code: string;
  codeVerifier: string;
  extensionId: string;
  state: string;
  label?: string;
}): Promise<{ ok: true; tokens: IssuedTokens } | { ok: false; error: string }> {
  if (!isAllowedExtensionId(params.extensionId)) return { ok: false, error: "extension_not_allowed" };

  const access = mintToken(ACCESS_TOKEN_PREFIX);
  const refresh = mintToken(REFRESH_TOKEN_PREFIX);
  const accessExpiresAt = ttlISO(ACCESS_TTL_SECONDS);
  const refreshExpiresAt = ttlISO(REFRESH_TTL_SECONDS);

  const { data, error } = await supabaseAdmin.rpc("companion_exchange_auth_code", {
    p_code_hash: sha256Hex(params.code),
    p_computed_challenge: codeChallengeS256(params.codeVerifier), // PKCE enforced in-DB, in the WHERE
    p_extension_id: params.extensionId,
    p_state: params.state,
    p_refresh_hash: refresh.hash,
    p_refresh_expires: refreshExpiresAt,
    p_access_hash: access.hash,
    p_access_expires: accessExpiresAt,
    p_label: params.label ?? null,
  });
  if (error) {
    console.error("[ext-auth] exchange rpc error:", error.message);
    return { ok: false, error: "exchange_failed" };
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || row.status !== "ok") return { ok: false, error: "invalid_grant" };

  return {
    ok: true,
    tokens: {
      access: access.raw,
      accessExpiresAt,
      refresh: refresh.raw,
      refreshExpiresAt,
      connectionId: row.connection_id,
      userId: row.user_id,
      workspaceId: row.workspace_id,
      scopes: row.scopes ?? [],
    },
  };
}

// ── /token (grant_type=refresh_token): atomic rotation with reuse detection ──
export async function rotateRefresh(params: {
  refresh: string;
}): Promise<{ ok: true; tokens: IssuedTokens } | { ok: false; error: string; reuseDetected?: boolean }> {
  const access = mintToken(ACCESS_TOKEN_PREFIX);
  const refresh = mintToken(REFRESH_TOKEN_PREFIX);
  const accessExpiresAt = ttlISO(ACCESS_TTL_SECONDS);
  const refreshExpiresAt = ttlISO(REFRESH_TTL_SECONDS);

  const { data, error } = await supabaseAdmin.rpc("companion_rotate_refresh", {
    p_old_hash: sha256Hex(params.refresh),
    p_new_refresh_hash: refresh.hash,
    p_new_refresh_expires: refreshExpiresAt,
    p_new_access_hash: access.hash,
    p_new_access_expires: accessExpiresAt,
  });
  if (error) {
    console.error("[ext-auth] rotate rpc error:", error.message);
    return { ok: false, error: "rotate_failed" };
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return { ok: false, error: "invalid_grant" };
  if (row.status === "reuse_detected") return { ok: false, error: "reuse_detected", reuseDetected: true };
  if (row.status !== "rotated") return { ok: false, error: "invalid_grant" };

  return {
    ok: true,
    tokens: {
      access: access.raw,
      accessExpiresAt,
      refresh: refresh.raw,
      refreshExpiresAt,
      connectionId: row.connection_id,
      userId: row.user_id,
      workspaceId: row.workspace_id,
      scopes: row.scopes ?? [],
    },
  };
}

// ── Per-request access verification + FULL revalidation (safeguard #5) ───────
export type ExtAuthOk = {
  ok: true;
  userId: string;
  workspaceId: string;
  connectionId: string;
  extensionId: string;
  scopes: string[];
};
export type ExtAuthFail = { ok: false; response: NextResponse };

// GENERIC failure only — never reveal whether a user/connection/token exists,
// or which specific check failed. The extension's client logic is uniform: on
// 401 it attempts one refresh, and if that also fails it clears credentials and
// shows Disconnected. `server_error` (500) is only the fail-closed config case.
function denied(): ExtAuthFail {
  return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
}
function serverError(): ExtAuthFail {
  return { ok: false, response: NextResponse.json({ error: "Server error" }, { status: 500 }) };
}

export async function verifyAccessBearer(req: Request): Promise<ExtAuthOk | ExtAuthFail> {
  const authz = req.headers.get("authorization") || "";
  const raw = authz.startsWith("Bearer ") ? authz.slice(7).trim() : "";
  if (!raw.startsWith(ACCESS_TOKEN_PREFIX)) return denied();

  // 1) access token exists, not revoked, not expired
  const { data: tok } = await supabaseAdmin
    .from("companion_access_tokens")
    .select("id, connection_id, expires_at, revoked_at")
    .eq("token_hash", sha256Hex(raw))
    .maybeSingle();
  if (!tok || tok.revoked_at) return denied();
  if (new Date(tok.expires_at).getTime() <= Date.now()) return denied();

  // 2) connection exists + not revoked
  const { data: conn } = await supabaseAdmin
    .from("companion_connections")
    .select("id, user_id, workspace_id, extension_id, scopes, revoked_at")
    .eq("id", tok.connection_id)
    .maybeSingle();
  if (!conn || conn.revoked_at) return denied();

  // 3) extension client still allowed (fail closed on prod misconfig)
  let extAllowed = false;
  try {
    extAllowed = isAllowedExtensionId(conn.extension_id);
  } catch {
    return serverError();
  }
  if (!extAllowed) return denied();

  // 4) scope
  if (!Array.isArray(conn.scopes) || !conn.scopes.includes(REQUIRED_SCOPE)) return denied();

  // 5) ACTIVE workspace membership (covers active-user + membership-revoked)
  const { data: member } = await supabaseAdmin
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", conn.user_id)
    .eq("workspace_id", conn.workspace_id)
    .eq("status", "active")
    .maybeSingle();
  if (!member) return denied();

  // 6) entitlement / trial (owner billing) — same source RLS uses; fail closed on definitive false
  const { data: entitled, error: entErr } = await supabaseAdmin.rpc("lb_workspace_has_access", {
    ws: conn.workspace_id,
  });
  if (!entErr && entitled === false) return denied();

  // best-effort activity stamp — never block on it
  const nowIso = new Date().toISOString();
  await supabaseAdmin.from("companion_access_tokens").update({ last_used_at: nowIso }).eq("id", tok.id);
  await supabaseAdmin.from("companion_connections").update({ last_used_at: nowIso }).eq("id", conn.id);

  return {
    ok: true,
    userId: conn.user_id,
    workspaceId: conn.workspace_id,
    connectionId: conn.id,
    extensionId: conn.extension_id,
    scopes: conn.scopes,
  };
}

// ── /revoke (Disconnect): revoke the connection + all its tokens ─────────────
export async function revokeConnection(connectionId: string): Promise<{ ok: boolean }> {
  const now = new Date().toISOString();
  await supabaseAdmin
    .from("companion_access_tokens")
    .update({ revoked_at: now })
    .eq("connection_id", connectionId)
    .is("revoked_at", null);
  await supabaseAdmin
    .from("companion_refresh_tokens")
    .update({ revoked_at: now })
    .eq("connection_id", connectionId)
    .is("revoked_at", null);
  const { error } = await supabaseAdmin
    .from("companion_connections")
    .update({ revoked_at: now })
    .eq("id", connectionId)
    .is("revoked_at", null);
  if (error) console.error("[ext-auth] revokeConnection failed:", error.message);
  return { ok: !error };
}
