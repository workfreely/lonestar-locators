import { MAX_REASONS } from "@bc/companion-shared"
import { displayDestinationLabel } from "@/lib/commute/destinationAliases"

// How a drive time becomes a client-facing reason, and the rules that protect the
// locator's own words while doing it.
//
// Pure functions, no I/O — the API route owns the database and Google; this owns the
// decisions. That split is what makes the rules testable without a network.

/**
 * "12 min to Fort Sam".
 *
 * The label is the locator's own client-facing wording (leads.commute_anchor_label),
 * used verbatim: they shortened "Joint Base San Antonio: Fort Sam Houston" to
 * "Fort Sam" precisely so this sentence would read like a person wrote it.
 */
export function commuteReasonText(minutes: number, anchorLabel: string): string {
  return `${minutes} min to ${anchorLabel.trim()}`
}

/**
 * "Within 20 min of Six Flags" — the client's REQUIREMENT.
 *
 * Deliberately adjacent to commuteReasonText, because the two are the easiest pair
 * in this codebase to confuse and the contrast is the whole point:
 *
 *   commuteReasonText(19, "Six Flags")            "19 min to Six Flags"
 *     a MEASURED RESULT for ONE property — what Routes actually returned.
 *
 *   clientCommuteCriterion("Six Flags", 20)       "Within 20 min of Six Flags"
 *     the client's STATED LIMIT — true of the client, not of any property.
 *
 * The wordings are kept structurally different ("within … of" vs "… to") so neither
 * can be misread as the other at a glance. Never substitute one for the other.
 *
 * ONE formatter, because this string renders on two independent surfaces — the CRM's
 * Search Criteria card and Beast Companion's, which receives it pre-formatted as
 * `commuteDestination`. They were already duplicating the label-only version, with a
 * comment on each asserting they agreed; the moment one gained the maximum they
 * silently disagreed, and nothing failed. Shared code is what makes that impossible.
 *
 * Returns "" when there is no destination, letting each caller keep its own existing
 * empty behaviour (the CRM gates the row on the label; the DTO maps "" to null).
 * A null/0/absent maximum yields the bare label — i.e. Area Mode reads exactly as it
 * always did.
 */
export function clientCommuteCriterion(
  storedLabel: string | null | undefined,
  maxMinutes: number | null | undefined,
): string {
  // The alias bank still owns the label, so both surfaces shorten identically.
  const label = displayDestinationLabel(storedLabel)
  if (!label) return ""
  return maxMinutes ? `Within ${maxMinutes} min of ${label}` : label
}

/**
 * Does this string look like a commute reason THIS system wrote?
 *
 * Anchored and shape-specific ("<digits> min to …") rather than a search for the
 * label, so it still recognises its own earlier output after the locator renames the
 * anchor — which is exactly when the old text must be replaced instead of
 * accumulating beside the new one. A locator's hand-typed reason would have to begin
 * with a number and the literal words "min to" to collide.
 */
const COMMUTE_REASON_PATTERN = /^\s*\d+\s*min(?:ute)?s?\s+to\s+\S/i

export function isCommuteReason(reason: string): boolean {
  return COMMUTE_REASON_PATTERN.test(reason)
}

export type ApplyOutcome = "updated" | "added" | "unchanged" | "skipped_at_limit"

/**
 * Put the commute reason into an existing reasons array.
 *
 * The four rules, in the order they apply:
 *
 *   1. REPLACE, never duplicate. An existing commute reason is rewritten in place,
 *      keeping its position, so recomputing after a new anchor or a changed drive
 *      time can never grow the array or leave two commute lines.
 *   2. HIGHEST PRIORITY. A new one goes at index 0 — it is the most concrete thing
 *      the list can say about a property.
 *   3. NEVER DISPLACE. It is only ever INSERTED, so no existing reason — least of
 *      all one the locator typed — is dropped to make room.
 *   4. HARD CAP 3. At the cap with no commute reason present, the commute is
 *      SKIPPED rather than shoving a manual reason out. The database check
 *      constraint enforces the same 3, so breaking this rule would fail the write
 *      outright rather than silently truncate.
 */
export function applyCommuteReason(
  existing: readonly string[],
  minutes: number,
  anchorLabel: string,
): { reasons: string[]; outcome: ApplyOutcome } {
  const text = commuteReasonText(minutes, anchorLabel)
  const reasons = [...existing]
  const at = reasons.findIndex(isCommuteReason)

  if (at >= 0) {
    if (reasons[at] === text) return { reasons, outcome: "unchanged" }
    reasons[at] = text
    return { reasons, outcome: "updated" }
  }
  if (reasons.length >= MAX_REASONS) {
    return { reasons, outcome: "skipped_at_limit" }
  }
  reasons.unshift(text)
  return { reasons, outcome: "added" }
}

/**
 * Is this pair's cached commute still valid for the client's CURRENT anchor?
 *
 * Staleness is a mismatch of anchor, not age: a drive time does not expire, but the
 * moment the locator points the client at a different destination every cached
 * minute is answering the wrong question. Recomputation is therefore driven by this,
 * never by a TTL — which is also what keeps this off the render path.
 */
export function needsCommute(
  row:
    | {
        commute_minutes?: number | null
        commute_anchor_place_id?: string | null
        commute_computed_at?: string | null
      }
    | undefined,
  currentAnchorPlaceId: string,
): boolean {
  if (!row) return true
  // A different anchor invalidates the answer whatever it was.
  if (row.commute_anchor_place_id !== currentAnchorPlaceId) return true
  // Attempted against THIS anchor and Routes found no drivable route: minutes stay
  // null and commute_computed_at records that we asked. Without this clause a
  // property with no route would be re-sent to Google on every single call forever.
  if (row.commute_minutes == null) return !row.commute_computed_at
  return false
}
