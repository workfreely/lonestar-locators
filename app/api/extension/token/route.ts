export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { exchangeAuthCode, rotateRefresh, type IssuedTokens } from "@/lib/companion/extensionAuth";
import { enforceRateLimit, clientIpFromHeaders } from "@/lib/companion/extensionRateLimit";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { displayFullName } from "@bc/companion-shared";

// POST /api/extension/token
//
// Public endpoint the extension's SERVICE WORKER calls (no session). Two grants:
//   - authorization_code: { code, code_verifier, extension_id, state } → tokens
//   - refresh_token:      { refresh_token } → rotated tokens
// Both go through the verified atomic RPCs. All failures return a GENERIC
// "invalid_grant" (never revealing whether a code/token/user/connection exists,
// and treating refresh reuse the same as any other failure — the extension
// clears credentials and reconnects either way). Never logs codes/verifiers/tokens.

export async function POST(req: Request) {
  const ip = clientIpFromHeaders(req.headers);
  const rl = await enforceRateLimit([{ key: `ext:token:ip:${ip}`, limit: 60, windowSeconds: 60 }]);
  if (!rl.ok) return rl.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  const b = (body ?? {}) as Record<string, unknown>;
  const grant = String(b.grant_type ?? "");

  if (grant === "authorization_code") {
    const code = String(b.code ?? "");
    const codeVerifier = String(b.code_verifier ?? "");
    const extensionId = String(b.extension_id ?? "").trim();
    const state = String(b.state ?? "");
    if (!code || !codeVerifier || !extensionId || !state) {
      return NextResponse.json({ error: "invalid_grant" }, { status: 400 });
    }
    let result: Awaited<ReturnType<typeof exchangeAuthCode>>;
    try {
      result = await exchangeAuthCode({ code, codeVerifier, extensionId, state });
    } catch {
      return NextResponse.json({ error: "server_error" }, { status: 500 });
    }
    if (!result.ok) return NextResponse.json({ error: "invalid_grant" }, { status: 400 });
    return tokenResponse(result.tokens);
  }

  if (grant === "refresh_token") {
    const refresh = String(b.refresh_token ?? "");
    if (!refresh) return NextResponse.json({ error: "invalid_grant" }, { status: 400 });
    const result = await rotateRefresh({ refresh });
    // Generic on ALL failures, including reuse_detected (family already revoked
    // server-side) — the extension clears credentials + reconnects regardless.
    if (!result.ok) return NextResponse.json({ error: "invalid_grant" }, { status: 400 });
    return tokenResponse(result.tokens);
  }

  return NextResponse.json({ error: "unsupported_grant_type" }, { status: 400 });
}

// Token payload + the account display for the extension's "Connected as [name] ·
// [workspace]" footer. This is the user's OWN data over authenticated HTTPS —
// distinct from onMessageExternal (which only ever carries code + state).
async function tokenResponse(t: IssuedTokens) {
  const [{ data: profile }, { data: ws }] = await Promise.all([
    supabaseAdmin.from("profiles").select("preferred_name, preferred_first_name, preferred_last_name, first_name, last_name, full_name").eq("id", t.userId).maybeSingle(),
    supabaseAdmin.from("workspaces").select("name").eq("id", t.workspaceId).maybeSingle(),
  ]);
  const name =
    displayFullName({
      preferredFirst: profile?.preferred_first_name,
      preferredLast: profile?.preferred_last_name,
      legalFirst: profile?.first_name,
      legalLast: profile?.last_name,
    }) ||
    (profile?.preferred_name || profile?.full_name || "").trim() ||
    null;
  return NextResponse.json({
    token_type: "Bearer",
    access_token: t.access,
    access_expires_at: t.accessExpiresAt,
    refresh_token: t.refresh,
    refresh_expires_at: t.refreshExpiresAt,
    scope: t.scopes.join(" "),
    account: { name, workspace: ws?.name ?? null },
  });
}
