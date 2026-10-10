// WHAT HAS ALREADY BEEN POSTED — the input the 21-day cooldown needs to exist.
//
// ── WHY THE COOLDOWN WAS INERT ──────────────────────────────────────────────────────────────
// planAutopilot computes the cooldown correctly, but only in its RECYCLE branch — the path taken
// once every property has been posted at least once. It decides that from `lastPosted`, which is
// seeded entirely from `input.history`. No caller ever supplied history, so `lastPosted` was
// always empty, every property looked FRESH on every run, the recycle branch never executed, and
// the 21-day rule never ran. Plan on Monday and again on Wednesday and the same building was
// "fresh" both times.
//
// This loads the real thing.
//
// ── KEYED ON PROPERTY, NOT ON POST OR SOURCE ────────────────────────────────────────────────
// propertyKeyOf prefers place_id, because production proved two uploads of one building are two
// content rows sharing one Google Places id. Keying on the source would let the same building post
// twice inside the window from two different uploads — which is exactly the thing the cooldown
// exists to prevent.
import { propertyKeyOf } from "./autopilotPlanner"
import type { PostingHistory } from "./autopilotPlanner"

type Row = Record<string, unknown>
type Q = {
  select: (c: string) => Q
  eq: (c: string, v: unknown) => Q
  not: (c: string, op: string, v: unknown) => Q
  gte: (c: string, v: unknown) => Q
  order: (c: string, o: { ascending: boolean }) => Promise<{ data: Row[] | null; error: { message?: string } | null }>
}
export type HistoryClient = { from: (t: string) => Q }

/** How far back to look. The cooldown only cares about the window, and reading the whole archive
 *  would grow unbounded. Padded so a cooldown measured at a future slot still sees the edge. */
export const HISTORY_LOOKBACK_DAYS = 45

/**
 * Last publish time per (connection, property), for every published Instagram post in the window.
 *
 * Keyed by connection because the cooldown is per-account: two agents may legitimately each post
 * the same building. Within one account it is per-property, which is the whole point.
 */
export async function loadPostingHistory(
  client: HistoryClient,
  opts: { lookbackDays?: number; now?: Date } = {},
): Promise<PostingHistory> {
  const since = new Date((opts.now ?? new Date()).getTime() - (opts.lookbackDays ?? HISTORY_LOOKBACK_DAYS) * 86_400_000)
  const { data, error } = await client.from("social_posts")
    .select("id, connection_id, published_at, source_content_id, source:source_content_id(place_id, property_name, market)")
    .not("published_at", "is", null)
    .gte("published_at", since.toISOString())
    .order("published_at", { ascending: true })   // ascending so later rows overwrite earlier ones
  if (error || !data) return new Map()

  const out = new Map<string, Map<string, string>>()
  for (const r of data) {
    const connectionId = r.connection_id
    const publishedAt = r.published_at
    if (typeof connectionId !== "string" || typeof publishedAt !== "string") continue
    // PostgREST returns an embedded relation as an object or a single-element array.
    const srcRaw = (r as { source?: unknown }).source
    const src = (Array.isArray(srcRaw) ? srcRaw[0] : srcRaw) as Row | null | undefined
    const key = propertyKeyOf({
      placeId: (src?.place_id as string | null) ?? null,
      propertyName: (src?.property_name as string | null) ?? null,
      market: (src?.market as string | null) ?? null,
      sourceContentId: (r.source_content_id as string | null) ?? "",
    })
    let perConn = out.get(connectionId)
    if (!perConn) { perConn = new Map(); out.set(connectionId, perConn) }
    // Ascending order means the last write wins, i.e. the MOST RECENT publish — which is what a
    // cooldown measures from.
    perConn.set(key, publishedAt)
  }
  return out
}

/**
 * Is this property inside its cooldown at the given moment?
 *
 * Exported so the answer can be shown in the UI and asserted in tests without reconstructing the
 * planner's internals — the planner applies the same arithmetic inline.
 */
export function inCooldown(
  history: PostingHistory, connectionId: string, propertyKey: string, at: Date, cooldownDays: number,
): boolean {
  const iso = history.get(connectionId)?.get(propertyKey)
  if (!iso) return false
  const last = Date.parse(iso)
  if (Number.isNaN(last)) return false
  return at.getTime() - last < cooldownDays * 86_400_000
}
