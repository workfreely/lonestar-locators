import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

// Shared server-side guard for authenticated, workspace-scoped API routes.
//
//   const guard = await requireWorkspaceMember()
//   if (!guard.ok) return guard.response      // 401 (no session) or 403 (not a member)
//   const { userId, workspaceId, supabase } = guard
//
// - Verifies the caller with auth.getUser() (reads the session cookie) → 401.
// - Resolves the caller's ACTIVE workspace membership via the RLS-enforced
//   client → 403 if none.
// - Exposes userId + workspaceId derived ENTIRELY from the session — never from
//   the request body — plus the RLS-enforced `supabase` client so routes can do
//   scoped reads/writes without minting a service-role client.
//
// Routes must never trust a client-supplied workspace_id / user_id / owner id;
// use the returned workspaceId instead.
//
// By default this ALSO enforces billing entitlement (active subscription or a
// live trial for the workspace owner) via the lb_workspace_has_access() DB
// function — the same source of truth the RLS policies use. These CRM routes
// run with the service role (which bypasses RLS), so this is the server-side
// gate that stops a lapsed user from mutating CRM data through direct API
// calls. Pass { requireBilling: false } only for routes that must work without
// an active subscription (none today).
export type WorkspaceGuardOk = {
  ok: true
  userId: string
  workspaceId: string
  supabase: Awaited<ReturnType<typeof createClient>>
}
export type WorkspaceGuardFail = { ok: false; response: NextResponse }

export async function requireWorkspaceMember(
  opts: { requireBilling?: boolean } = {}
): Promise<WorkspaceGuardOk | WorkspaceGuardFail> {
  const requireBilling = opts.requireBilling ?? true
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
  }

  // The RLS policy on workspace_members lets a member read their own row.
  const { data: membership } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", user.id)
    .eq("status", "active")
    .limit(1)
    .maybeSingle()

  if (!membership?.workspace_id) {
    return { ok: false, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) }
  }

  if (requireBilling) {
    // Server-side entitlement check via the shared DB function. Fail CLOSED on a
    // definitive "not entitled" (false); fail OPEN only on an unexpected error
    // (e.g., the function isn't migrated yet) so a transient issue can't lock
    // out paying customers. The RLS layer still enforces entitlement for any
    // browser-client (session) access regardless.
    const { data: entitled, error } = await supabase.rpc("lb_workspace_has_access", {
      ws: membership.workspace_id,
    })
    if (!error && entitled === false) {
      return {
        ok: false,
        response: NextResponse.json(
          { error: "Subscription required", reason: "billing", manageBillingUrl: "/billing" },
          { status: 403 }
        ),
      }
    }
  }

  return { ok: true, userId: user.id, workspaceId: membership.workspace_id, supabase }
}
