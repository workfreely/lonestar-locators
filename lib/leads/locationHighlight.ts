// Quick Match — the client-facing LOCATION line. Slot one of "Why I chose this for you".
//
// ZERO IMPORTS, deliberately, exactly like lib/leads/bedroomPricing.ts. Three callers read this:
// the Quick Match write path (server), the commute pass (server) and — through the reasons array
// — a "use client" component. A dependency here would drag the screening engine into all three.
//
// ── NO MILES AND NO MINUTES, EVER ───────────────────────────────────────────────────────────
// Quick Match measures straight-line distance from a neighbourhood CENTROID. That is a ranking
// signal, not a journey. "about 0.9 miles" invites a renter to read it as 0.9 miles of road, and
// minutes would be a drive time nobody computed. So the band becomes a preposition and the
// mileage is dropped on the way out. A real drive time reaches slot one only from the commute
// pass, which calls Google Routes against an anchored destination.
//
// The three prepositions are the engine's own words (lib/quickMatch/geography.ts assessGeography),
// kept identical so the agent-facing sentence and the client-facing line can never disagree about
// whether a property is IN an area or merely near it.

/** Location owns slot one. Pricing is slot two (bedroomPricing.PRICING_SLOT_INDEX). */
export const LOCATION_SLOT_INDEX = 0

/** The bands that have approved client-facing wording. `destination_zip` deliberately has none —
 *  see areaHighlightText. */
export type LocationBand = "in_area" | "adjacent" | "nearby"

/**
 * "Located in" is the only phrasing that claims the property is INSIDE the area the client named.
 * The other two are explicitly non-committal, because the band they describe is not a claim of
 * membership: a property 5 miles from the Medical Center centroid is not in the Medical Center,
 * and saying so to a renter who then drives out there is the kind of small lie that costs a tour.
 */
const PREPOSITION: Record<LocationBand, string> = {
  in_area: "Located in",
  adjacent: "Next to",
  nearby: "Near",
}

/** The editor's per-reason cap (components/crm/ReasonsControl.tsx maxLength). A line longer than
 *  this could be stored but not re-typed, so it is not written at all. */
const MAX_LEN = 40

/**
 * The client-facing location line, or null when there is nothing supportable to say.
 *
 * Null — not a vaguer sentence — is the answer for an unresolved band, a missing label, or a
 * label so long the editor could not round-trip it. The slot then stays open for manual entry,
 * which is the behaviour every other half of this feature already has.
 */
export function areaHighlightText(
  band: LocationBand | string | null | undefined,
  label: string | null | undefined,
): string | null {
  const area = (label ?? "").trim()
  if (!area) return null
  // A ZIP anchor ("ZIP 78229") is a real band in the engine, but it has no approved client
  // wording, so it says nothing rather than inventing a sentence about a postal code.
  if (area.toUpperCase().startsWith("ZIP ")) return null
  const preposition = PREPOSITION[band as LocationBand]
  if (!preposition) return null
  const text = `${preposition} ${area}`
  return text.length <= MAX_LEN ? text : null
}

/**
 * Is this EXACTLY a line we generated, and therefore safe to replace?
 *
 * ANCHORED END TO END on purpose. This is the whole provenance mechanism: an unedited generated
 * line matches, and any edit a locator makes — appended words, a comma, different punctuation —
 * stops it matching, after which the commute pass leaves the line alone and reports that it
 * withheld a drive time. There is no stored "this was generated" flag, and this is why one is not
 * needed.
 *
 * The character class is what a place label holds and nothing more. No comma: "Located in
 * Medical Center, by the Rim" is a locator's sentence, not ours.
 *
 * It can return true for a line a locator TYPED character-for-character as we would have. In that
 * one case the commute pass replaces it with a real drive time, which is the approved precedence
 * for an anchored client anyway — an anchored commute owns slot one.
 */
const AREA_HIGHLIGHT_RE = /^(?:Located in|Next to|Near) [A-Za-z0-9][A-Za-z0-9 .'&/-]*$/

export function isAreaHighlight(text: string | null | undefined): boolean {
  return AREA_HIGHLIGHT_RE.test((text ?? "").trim())
}
