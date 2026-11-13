import type { SupabaseClient } from "@supabase/supabase-js"

// THE AGENT ROSTER — the one source for the Social Beast agent selector.
//
// It answers a single question: which agents does this admin have Social Beast work for, and what
// state is that work in? Built from relationships that already exist — social_connections.
// agent_user_id and social_destination_invitations.agent_user_id — so it introduces no new concept
// of "agent" and no second place where that relationship is recorded.
//
// ── READ-ONLY, AND STRUCTURALLY SO ──────────────────────────────────────────────────────────
// Two selects and one RPC, through the CALLER's RLS-scoped client. Nothing here writes, and the
// selector built on top of it only ever changes a query string. Choosing an agent cannot alter a
// connection, a schedule, a token or an ownership field, because no code path from the selector
// reaches a write.
//
// ── WHY "UNASSIGNED" IS A BUCKET AND NOT A HIDDEN CASE ──────────────────────────────────────
// A connection may have agent_user_id NULL — the live TikTok destination does. If the roster
// listed only named agents, filtering would make those rows unreachable: present in the database,
// absent from every view, and silently excluded from the health picture the All Accounts view is
// for. They get their own entry instead.

export const ALL_AGENTS = "all"
export const UNASSIGNED = "unassigned"

export type RosterAgent = {
  /** profiles.id, or UNASSIGNED for the no-agent bucket. */
  id: string
  name: string
  photoUrl: string | null
  /** Connection ids this agent holds. Empty when the agent only has a pending invitation. */
  connectionIds: string[]
  instagram: number
  tiktok: number
  /** Destinations with posting paused — the first thing the All Accounts view is scanned for. */
  paused: number
  /** Destinations whose stored token expiry is in the past, or whose status is not 'connected'. */
  problems: number
  /** Live, unused, unrevoked invitations naming this agent — an account part-way through setup. */
  pendingInvites: number
}

type ConnRow = {
  id: string
  provider: string | null
  status: string | null
  posting_paused: boolean | null
  token_expires_at: string | null
  agent_user_id: string | null
}
type InviteRow = { agent_user_id: string | null; used_at: string | null; revoked_at: string | null; expires_at: string }
type AgentRow = {
  id: string
  first_name: string | null
  last_name: string | null
  preferred_name: string | null
  profile_photo_url: string | null
}

/**
 * Build the roster.
 *
 * `ownerFallbackName` is used for the UNASSIGNED bucket's label so it reads as something an
 * operator recognises rather than a database state.
 */
export async function loadAgentRoster(
  supabase: SupabaseClient,
  ownerFallbackName?: string | null,
): Promise<RosterAgent[]> {
  const [{ data: connData }, { data: inviteData }] = await Promise.all([
    supabase
      .from("social_connections")
      .select("id, provider, status, posting_paused, token_expires_at, agent_user_id")
      .order("created_at", { ascending: true }),
    supabase
      .from("social_destination_invitations")
      .select("agent_user_id, used_at, revoked_at, expires_at"),
  ])
  const conns = (connData ?? []) as ConnRow[]
  const invites = (inviteData ?? []) as InviteRow[]

  const now = Date.now()
  const liveInvites = invites.filter(
    (i) => !i.used_at && !i.revoked_at && new Date(i.expires_at).getTime() > now,
  )

  // Every agent referenced by a connection OR a live invitation. An agent with only an invitation
  // is how an account part-way through setup stays visible instead of appearing out of nowhere
  // once it connects.
  const ids = Array.from(
    new Set(
      [...conns, ...liveInvites]
        .map((r) => r.agent_user_id)
        .filter((x): x is string => !!x),
    ),
  )

  const names = new Map<string, { name: string; photoUrl: string | null }>()
  if (ids.length > 0) {
    // The SAME resolver the Accounts page uses, so a name cannot differ between the selector and
    // the row it filters to. It is SECURITY DEFINER and refuses a caller that is not a platform
    // admin, so it only resolves under a real admin session; a service-role caller gets an error
    // and every agent falls back to "Agent". That is a harness artefact, not a page state — but
    // the fallback is deliberate, because a selector that cannot name an agent must still render
    // the agent rather than drop them from the list and hide their accounts.
    const { data } = await supabase.rpc("sa_agents_by_ids", { p_ids: ids })
    for (const a of (data ?? []) as AgentRow[]) {
      const name = (a.preferred_name || [a.first_name, a.last_name].filter(Boolean).join(" ") || "Agent").trim()
      names.set(a.id, { name, photoUrl: a.profile_photo_url })
    }
  }

  const blank = (id: string, name: string, photoUrl: string | null): RosterAgent => ({
    id, name, photoUrl, connectionIds: [], instagram: 0, tiktok: 0, paused: 0, problems: 0, pendingInvites: 0,
  })

  const byId = new Map<string, RosterAgent>()
  const keyOf = (agentId: string | null) => agentId ?? UNASSIGNED
  const ensure = (agentId: string | null): RosterAgent => {
    const key = keyOf(agentId)
    const got = byId.get(key)
    if (got) return got
    const resolved = agentId ? names.get(agentId) : null
    const made = blank(
      key,
      resolved?.name ?? (agentId ? "Agent" : ownerFallbackName ? `${ownerFallbackName} (unassigned)` : "Unassigned"),
      resolved?.photoUrl ?? null,
    )
    byId.set(key, made)
    return made
  }

  for (const c of conns) {
    const a = ensure(c.agent_user_id)
    a.connectionIds.push(c.id)
    if ((c.provider ?? "") === "tiktok") a.tiktok++
    else a.instagram++
    if (c.posting_paused) a.paused++
    const expired = !!c.token_expires_at && new Date(c.token_expires_at).getTime() < now
    if (expired || (c.status ?? "") !== "connected") a.problems++
  }
  for (const i of liveInvites) ensure(i.agent_user_id).pendingInvites++

  // Named agents first, alphabetically; the unassigned bucket last so it never leads the list.
  return [...byId.values()].sort((x, y) => {
    if (x.id === UNASSIGNED) return 1
    if (y.id === UNASSIGNED) return -1
    return x.name.localeCompare(y.name)
  })
}

/**
 * The connection ids the given selection resolves to, or null for "everything".
 *
 * null and an EMPTY ARRAY mean different things and must not be conflated: null is no filter,
 * [] is a real selection that happens to hold nothing (an agent with only a pending invitation),
 * and showing every destination in that case would be the opposite of what was asked for.
 */
export function connectionIdsFor(roster: RosterAgent[], selected: string | null | undefined): string[] | null {
  if (!selected || selected === ALL_AGENTS) return null
  const hit = roster.find((a) => a.id === selected)
  // An id that names nobody — a hand-edited URL, or an agent whose last connection was removed —
  // resolves to NO FILTER rather than to an empty one. Showing everything is the recoverable
  // outcome; showing nothing looks like data loss. Callers must pair this with resolveSelection
  // so the page does not then claim to be filtered when it is not.
  return hit ? hit.connectionIds : null
}

/**
 * The selection a page should actually act on: the id only when it names someone in the roster.
 *
 * Without this, an unrecognised ?agent= left the Accounts banner saying "Showing one agent only"
 * over an unfiltered list — the page contradicting itself. One helper, so the filter and the
 * sentence describing it can never disagree.
 */
export function resolveSelection(
  roster: RosterAgent[],
  selected: string | null | undefined,
): { id: string | null; name: string | null } {
  if (!selected || selected === ALL_AGENTS) return { id: null, name: null }
  const hit = roster.find((a) => a.id === selected)
  return hit ? { id: hit.id, name: hit.name } : { id: null, name: null }
}
