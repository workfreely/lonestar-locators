/**
 * THE ORDER OF RECOMMENDED PROPERTIES — one rule, stated once.
 *
 *     sort_order ASC NULLS LAST, created_at ASC, id ASC
 *
 * It is applied in three places that must never disagree:
 *   1. the workspace loader        — app/admin/leads/page.tsx (getRecommendations)
 *   2. the reuse FINGERPRINT       — lb_prepare_client_share
 *   3. the snapshot's row_number() — lb_create_client_share
 * If (1) and (3) drift, the locator arranges one order and the client is sent another. If (2)
 * drifts, a reorder fails to invalidate an unsent list and the client is sent the stale one.
 * scripts/leads/recommendationOrderDrift.test.ts runs this comparator and the real SQL over the
 * same rows and requires an identical sequence.
 *
 * NULLS LAST is what makes this additive: a row that has never been arranged keeps sort_order
 * NULL and therefore its exact present position in created_at order, so an untouched list renders
 * exactly as it did before the column existed. `id` is the final tiebreaker, so the order is
 * total — two rows written in the same millisecond still have one defined sequence, which a
 * fingerprint depends on.
 */

/** The minimum a row needs to be ordered. Extra fields are ignored. */
export type OrderableRecommendation = {
  id?: number | string | null
  sort_order?: number | null
  created_at?: string | null
}

/** NULL / undefined / NaN all mean "never arranged" and sort after every arranged row. */
function rank(v: unknown): number {
  if (v === null || v === undefined) return Number.POSITIVE_INFINITY
  const n = Number(v)
  return Number.isFinite(n) ? n : Number.POSITIVE_INFINITY
}

function ms(v: unknown): number {
  const t = Date.parse(String(v ?? ""))
  return Number.isNaN(t) ? 0 : t
}

/** Numeric when both ids are numeric (Postgres bigint), lexicographic otherwise. */
function byId(a: unknown, b: unknown): number {
  const an = Number(a)
  const bn = Number(b)
  if (Number.isFinite(an) && Number.isFinite(bn)) return an - bn
  return String(a ?? "").localeCompare(String(b ?? ""))
}

export function compareRecommendations(a: OrderableRecommendation, b: OrderableRecommendation): number {
  const ra = rank(a.sort_order)
  const rb = rank(b.sort_order)
  if (ra !== rb) return ra < rb ? -1 : 1
  const ta = ms(a.created_at)
  const tb = ms(b.created_at)
  if (ta !== tb) return ta - tb
  return byId(a.id, b.id)
}

/** A NEW array in canonical order; the input is never mutated. */
export function sortRecommendations<T extends OrderableRecommendation>(rows: readonly T[]): T[] {
  return [...(rows ?? [])].sort(compareRecommendations)
}

/**
 * The positions to persist after a drag: 1..N over the rows the locator actually arranged.
 *
 * Every visible row is given an explicit position, not just the one that moved — a list is then
 * either wholly arranged or wholly unarranged, never a mix whose order depends on which rows
 * happen to still be NULL. Rows the locator cannot see (a property that is also a Favorite, and
 * so filtered out of this section) are deliberately left alone: they were not part of the
 * arrangement, and if one returns to Recommendations it joins the end rather than displacing
 * something the locator placed on purpose.
 */
export function positionsFor(orderedIds: readonly (number | string)[]): { id: number | string; sort_order: number }[] {
  return orderedIds.map((id, i) => ({ id, sort_order: i + 1 }))
}

/** Move one item within an array, returning a new array. No dependency on @dnd-kit's arrayMove. */
export function moveItem<T>(rows: readonly T[], from: number, to: number): T[] {
  const out = [...rows]
  if (from < 0 || to < 0 || from >= out.length || to >= out.length || from === to) return out
  const [moved] = out.splice(from, 1)
  out.splice(to, 0, moved)
  return out
}
