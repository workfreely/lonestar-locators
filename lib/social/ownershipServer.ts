import "server-only"
// READING WHOSE VIDEO IT IS, AND WHETHER THE FIRST ONE HAS LANDED.
//
// The pure rules live in personalOwnership.ts and debutGate.ts. This is the only thing that reads
// rows for them, and it exists as its own module for one structural reason: both columns arrive
// with a PREPARED migration that is not applied yet.
//
// ── WHY NOT JUST ADD THE COLUMNS TO THE WORKER'S DUE SELECT ─────────────────────────────────
// PostgREST fails the WHOLE query when a select names a column that does not exist. The sibling
// TikTok worker already demonstrates what that costs: it selects three tiktok_* columns that are
// absent from production, so the moment it is armed its due query returns HTTP 500 `query_failed`
// and it publishes nothing — a fault that is invisible until the day someone arms it.
//
// Reading these columns in a SEPARATE, narrow query turns that class of failure into a value the
// caller can act on. An unreadable answer is reported as unreadable, and every caller's
// established response to "unreadable" is to LEAVE THE POST ALONE — still scheduled, still due,
// nothing claimed. So a deploy that lands before the migration holds the queue instead of
// emptying it or failing rows, and says why.
//
// ── UNREADABLE IS NOT "NO RESTRICTION" ──────────────────────────────────────────────────────
// That is the whole discipline here. Both features RESTRICT: one says a video may only reach one
// person's accounts, the other says nothing may publish before a particular video. Reading a
// failure as "no restriction" would release exactly the protections being added, on exactly the
// run that could not see them. Every result is therefore a discriminated union and there is no
// nullable fallback anywhere in this file.
import { supabaseAdmin } from "@/lib/supabase/admin"
import { debutStateFor, type DebutState } from "@/lib/social/debutGate"
import { type ContentOwnership } from "@/lib/social/personalOwnership"

type Client = typeof supabaseAdmin

export type OwnershipResult =
  | { ok: true; ownership: ContentOwnership & { debutForAgentUserId: string | null } }
  | { ok: false; kind: "unreadable"; reason: string }

export type DebutResult =
  | { ok: true; state: DebutState }
  | { ok: false; kind: "unreadable"; reason: string }

const str = (v: unknown): string | null => {
  const s = typeof v === "string" ? v.trim() : ""
  return s ? s : null
}

/**
 * One source row's ownership, read fresh.
 *
 * Returns the EXISTING available_to_agents alongside the two new columns, so a caller passes one
 * object to renderRefusalFor rather than assembling the source's sharing state from two reads that
 * could disagree about a row someone edited in between.
 */
export async function readContentOwnership(
  contentId: string | null | undefined,
  client: Client = supabaseAdmin,
): Promise<OwnershipResult> {
  const id = str(contentId)
  // A post with no source content has no ownership to read. Not a failure: nothing is restricted
  // by a row that does not exist, and the identity rules already handle a post with no source.
  if (!id) return { ok: true, ownership: { availableToAgents: null, personalAgentUserId: null, debutForAgentUserId: null } }

  const { data, error } = await client
    .from("social_content")
    .select("available_to_agents, personal_agent_user_id, debut_for_agent_user_id")
    .eq("id", id)
    .maybeSingle()
  if (error) return { ok: false, kind: "unreadable", reason: `could not read video ownership: ${error.message.slice(0, 160)}` }
  // A MISSING ROW IS UNREADABLE, not unrestricted. A post whose source content has been deleted is
  // not a post we can reason about, and publishing it on the grounds that nothing objected would
  // be the wrong direction.
  if (!data) return { ok: false, kind: "unreadable", reason: "the source video row for this post is missing" }

  const row = data as Record<string, unknown>
  return {
    ok: true,
    ownership: {
      availableToAgents: row.available_to_agents === true,
      personalAgentUserId: str(row.personal_agent_user_id),
      debutForAgentUserId: str(row.debut_for_agent_user_id),
    },
  }
}

/**
 * Where this agent's first-video requirement stands, read fresh.
 *
 * Three reads, in this order, because each narrows the next: the agent's debut content, the
 * agent's destinations, and where that content has published. Any of them failing yields
 * `unreadable`, and the caller holds.
 *
 * `destinationConnectionIds` deliberately counts EVERY destination of the agent, paused included
 * — debutStateFor's own header says why.
 */
export async function readDebutState(
  agentUserId: string | null | undefined,
  client: Client = supabaseAdmin,
): Promise<DebutResult> {
  const agent = str(agentUserId)
  if (!agent) return { ok: true, state: { required: false } }

  const { data: contentRows, error: contentErr } = await client
    .from("social_content")
    .select("id")
    .eq("debut_for_agent_user_id", agent)
    .order("created_at", { ascending: true })
  if (contentErr) return { ok: false, kind: "unreadable", reason: `could not read the first-video designation: ${contentErr.message.slice(0, 160)}` }
  const contentId = str((contentRows ?? [])[0]?.id)
  // No designation ⇒ no requirement. This is the ordinary case and the only one in which this
  // function reports "nothing to wait for".
  if (!contentId) return { ok: true, state: { required: false } }

  const { data: connRows, error: connErr } = await client
    .from("social_connections")
    .select("id, agent_user_id, owner_user_id")
  if (connErr) return { ok: false, kind: "unreadable", reason: `could not read this account's destinations: ${connErr.message.slice(0, 160)}` }
  const destinationConnectionIds = (connRows ?? [])
    .filter((c) => (str((c as { agent_user_id?: unknown }).agent_user_id) ?? str((c as { owner_user_id?: unknown }).owner_user_id)) === agent)
    .map((c) => String((c as { id?: unknown }).id))

  const { data: pubRows, error: pubErr } = await client
    .from("social_posts")
    .select("connection_id")
    .eq("source_content_id", contentId)
    .eq("status", "published")
    .not("connection_id", "is", null)
  if (pubErr) return { ok: false, kind: "unreadable", reason: `could not read where the first video has published: ${pubErr.message.slice(0, 160)}` }

  return {
    ok: true,
    state: debutStateFor({
      contentId,
      destinationConnectionIds,
      publishedConnectionIds: (pubRows ?? []).map((r) => String((r as { connection_id?: unknown }).connection_id ?? "")),
    }),
  }
}

/**
 * Per-RUN memos, never module state.
 *
 * Same discipline as bufferDestinationCache: a worker run resolves each content row and each agent
 * at most once, and the next run starts clean — so un-assigning a video or clearing a debut takes
 * effect on the next run rather than whenever a process happens to recycle.
 *
 * An UNREADABLE result is deliberately not cached, so one hiccup does not hold the whole run.
 */
export function contentOwnershipCache(client: Client = supabaseAdmin) {
  const hits = new Map<string, OwnershipResult>()
  return {
    async get(contentId: string | null | undefined): Promise<OwnershipResult> {
      const key = str(contentId) ?? ""
      const seen = hits.get(key)
      if (seen) return seen
      const fresh = await readContentOwnership(contentId, client)
      if (fresh.ok) hits.set(key, fresh)
      return fresh
    },
  }
}

export function debutStateCache(client: Client = supabaseAdmin) {
  const hits = new Map<string, DebutResult>()
  return {
    async get(agentUserId: string | null | undefined): Promise<DebutResult> {
      const key = str(agentUserId) ?? ""
      const seen = hits.get(key)
      if (seen) return seen
      const fresh = await readDebutState(agentUserId, client)
      if (fresh.ok) hits.set(key, fresh)
      return fresh
    },
  }
}
