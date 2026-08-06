export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireWorkspaceMember } from "@/lib/auth/requireWorkspaceMember";
import { createAuthCode } from "@/lib/companion/extensionAuth";
import { enforceRateLimit, clientIpFromHeaders } from "@/lib/companion/extensionRateLimit";
import { isAllowedExtensionId } from "@/lib/companion/extensionClients";

// POST /api/extension/connect/authorize
//
// Called by the AUTHENTICATED /extension/connect page (session cookie), NOT by
// the extension. Requires a valid Locator Beast session + active workspace
// membership + entitlement, then mints a single-use, PKCE-bound authorization
// code for the confirmed (user, workspace, extension). The raw code is returned
// to the page, which hands ONLY { code, state } to the extension via
// chrome.runtime.sendMessage. Never logs the code, challenge, or state.

const CHALLENGE_RE = /^[A-Za-z0-9\-_]{43}$/; // base64url S256 (32 bytes → 43 chars, no padding)
const STATE_RE = /^[A-Za-z0-9\-_]{16,128}$/;

export async function POST(req: Request) {
  const ip = clientIpFromHeaders(req.headers);

  // Session + active membership (entitlement enforced explicitly below, per the
  // resolved workspace, so multi-workspace mixed entitlement is handled right).
  const guard = await requireWorkspaceMember({ requireBilling: false });
  if (!guard.ok) return guard.response;
  const { userId, supabase } = guard;

  const rl = await enforceRateLimit([
    { key: `ext:authorize:user:${userId}`, limit: 20, windowSeconds: 60 },
    { key: `ext:authorize:ip:${ip}`, limit: 40, windowSeconds: 60 },
  ]);
  if (!rl.ok) return rl.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  const b = (body ?? {}) as Record<string, unknown>;
  const extensionId = String(b.extensionId ?? "").trim();
  const codeChallenge = String(b.codeChallenge ?? "").trim();
  const state = String(b.state ?? "").trim();
  const requestedWs = b.workspaceId ? String(b.workspaceId).trim() : null;

  if (
    !CHALLENGE_RE.test(codeChallenge) ||
    !STATE_RE.test(state) ||
    extensionId.length < 8 ||
    extensionId.length > 64
  ) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  let extAllowed: boolean;
  try {
    extAllowed = isAllowedExtensionId(extensionId);
  } catch {
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
  if (!extAllowed) return NextResponse.json({ error: "extension_not_allowed" }, { status: 403 });

  // Resolve the workspace. Never inferred silently when there is more than one.
  const { data: memberships } = await supabase
    .from("workspace_members")
    .select("workspace_id, workspaces(name)")
    .eq("user_id", userId)
    .eq("status", "active");
  // PostgREST types the embedded to-one join as an array; normalize the name.
  const active = ((memberships ?? []) as unknown as Array<{
    workspace_id: string;
    workspaces: { name: string | null } | { name: string | null }[] | null;
  }>).map((m) => ({
    workspaceId: m.workspace_id,
    name: Array.isArray(m.workspaces) ? (m.workspaces[0]?.name ?? null) : (m.workspaces?.name ?? null),
  }));

  if (active.length === 0) return NextResponse.json({ error: "no_workspace" }, { status: 403 });

  let workspaceId: string;
  if (active.length === 1) {
    workspaceId = active[0].workspaceId;
  } else {
    if (!requestedWs || !active.some((m) => m.workspaceId === requestedWs)) {
      return NextResponse.json(
        {
          error: "workspace_selection_required",
          workspaces: active.map((m) => ({ id: m.workspaceId, name: m.name })),
        },
        { status: 409 },
      );
    }
    workspaceId = requestedWs;
  }

  // Entitlement on the RESOLVED workspace (same source RLS uses; fail closed).
  const { data: entitled, error: entErr } = await supabase.rpc("lb_workspace_has_access", { ws: workspaceId });
  if (!entErr && entitled === false) {
    return NextResponse.json({ error: "billing", manageBillingUrl: "/billing" }, { status: 403 });
  }

  const result = await createAuthCode({ userId, workspaceId, extensionId, codeChallenge, state });
  if ("error" in result) return NextResponse.json({ error: "issue_failed" }, { status: 500 });

  return NextResponse.json({ code: result.code, state, expiresInSeconds: 60 });
}
