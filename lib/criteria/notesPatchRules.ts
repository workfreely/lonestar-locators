// WHAT A FORM NOTE MAY WRITE — the pure rules, separated from the I/O so they can be tested.
//
// Reconciliation already decides what a STATEMENT means. These rules decide, additionally, what a
// note typed into a form is allowed to change about a lead — a narrower question, because the
// renter filled in the form's own location fields too, and those are an explicit choice that a
// passing sentence must never override.

/** The only columns a form note may ever write. */
export const NOTE_WRITABLE_COLUMNS = ["commute_anchor_label", "commute_anchor_place_id", "commute_max_minutes"] as const

export type LeadLocationState = {
  neighborhoods?: string | null
  submarkets?: string | null
  commute_anchor_label?: string | null
  commute_anchor_place_id?: string | null
  commute_max_minutes?: number | null
}

const blank = (v: unknown): boolean => v === null || v === undefined || String(v).trim() === ""

/**
 * Does this lead already have a destination somebody chose?
 *
 * The PLACE ID is the test, not the label: it is what Commute Mode actually routes from, and a
 * label without one is not a usable destination. A lead that already has one was configured by
 * the renter in the form's own fields or by the agent in the CRM, and a sentence in the notes does
 * not get to replace either.
 */
export function hasExplicitDestination(lead: LeadLocationState): boolean {
  return !blank(lead.commute_anchor_place_id)
}

/**
 * Reduce reconciliation's proposed patch to what a form note may actually apply.
 *
 * TWO NARROWINGS, both deliberate:
 *
 *  1. COMMUTE COLUMNS ONLY. Reconciliation can also propose desired areas. From a note we take
 *     only the destination, so "near Randolph AFB" can never rewrite the areas the renter picked
 *     from the form's own dropdown — and a destination is never recorded as a neighbourhood.
 *
 *  2. FILL BLANKS ONLY. Anything already set stays. Combined with (1) this makes the write
 *     idempotent: running it again proposes the same values into columns that are no longer empty,
 *     so nothing changes.
 *
 * A maximum is never invented here — it is only carried through when reconciliation produced one
 * from an explicit statement ("within 20 minutes").
 */
export function narrowCommutePatch(
  lead: LeadLocationState,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const key of NOTE_WRITABLE_COLUMNS) {
    if (!(key in patch)) continue
    if (!blank((lead as Record<string, unknown>)[key])) continue
    out[key] = patch[key]
  }
  // A maximum without an anchor is meaningless — "within 20 minutes" of nothing. If the anchor is
  // not being written (already set, or never resolved), drop the maximum too rather than leaving a
  // number attached to a destination this note did not establish.
  if ("commute_max_minutes" in out && !("commute_anchor_place_id" in out) && blank(lead.commute_anchor_place_id)) {
    delete out.commute_max_minutes
  }
  return out
}
