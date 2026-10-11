import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { isAgentBetaUser } from "@/lib/social/agentBeta"

// Shared server-side guard for AGENT-ONLY Social Beast routes.
//
//   const guard = await requireSocialAgent()
//   if (!guard.ok) return guard.response        // 401 / 403
//   const { userId, connectionIds, ownerUserIds, supabase } = guard
//
// This is the ONE authorization boundary for the agent surface, the counterpart to
// requirePlatformAdmin. Three checks, in this order, each of which alone is sufficient to refuse:
//
//   1. SESSION      auth.getUser() — 401 when unauthenticated.
//   2. BETA         the env allowlist — 403 for everyone not explicitly named. This is what keeps
//                   the feature invisible to the rest of the platform while it is being built.
//   3. CONNECTIONS  at least one social_connections row with agent_user_id = this user. An agent
//                   with no connected account has nothing to be an agent OF.
//
// ── WHAT CALLERS GET, AND WHY IT MATTERS ────────────────────────────────────────────────────
// connectionIds and ownerUserIds are derived ENTIRELY from the session. Every agent route scopes
// its queries to these values and must never accept a connection id, owner id or agent id from the
// request body or query string — that is the difference between an authorization boundary and a
// suggestion. A body-supplied id is how one agent reads another's queue.
//
// The returned client is the RLS-enforced one, so the policies added in
// 20261010000001_social_agent_beta_foundation are a second, independent line of defence: a route
// that forgot to scope still cannot read another agent's rows.
export type SocialAgentGuardOk = {
  ok: true
  userId: string
  /** Connections this user holds as the agent. Never empty. */
  connectionIds: string[]
  /** The owners whose libraries this agent may see — derived from those connections. */
  ownerUserIds: string[]
  supabase: Awaited<ReturnType<typeof createClient>>
}
export type SocialAgentGuardFail = { ok: false; response: NextResponse }

export async function requireSocialAgent(): Promise<SocialAgentGuardOk | SocialAgentGuardFail> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { ok: false, response: NextResponse.json({ error: "unauthorized" }, { status: 401 }) }
  }

  // The beta gate sits BEFORE any database read. A user outside the allowlist produces no query at
  // all, so there is no scoping mistake available to make for them.
  if (!isAgentBetaUser(user.id)) {
    return { ok: false, response: NextResponse.json({ error: "forbidden" }, { status: 403 }) }
  }

  const { data: conns, error } = await supabase
    .from("social_connections")
    .select("id, owner_user_id")
    .eq("agent_user_id", user.id)

  // A failed read is NOT "no connections". Treating an error as an empty list would turn a
  // transient database problem into a silent, total loss of access that looks like a design
  // decision — so it fails loudly instead.
  if (error) {
    return { ok: false, response: NextResponse.json({ error: "agent_lookup_failed" }, { status: 500 }) }
  }
  const rows = (conns ?? []) as { id: string; owner_user_id: string }[]
  if (rows.length === 0) {
    return { ok: false, response: NextResponse.json({ error: "no_connected_accounts" }, { status: 403 }) }
  }

  return {
    ok: true,
    userId: user.id,
    connectionIds: rows.map((r) => r.id),
    ownerUserIds: [...new Set(rows.map((r) => r.owner_user_id))],
    supabase,
  }
}
