// Recommended Properties — the DERIVED bedroom-pricing reason.
//
// Pure. No I/O, no React, no database. Everything here is a function of (saved reasons,
// catalog pricing, the client's requested bedroom count), which is what makes the three
// hardest requirements true by construction rather than by discipline:
//
//   • "Preserve all existing manually entered text" — the saved array is NEVER mutated and
//     NEVER written back. This module returns a DISPLAY list; the canonical
//     lead_property_reasons row is untouched, so there is no code path that can overwrite a
//     reason the locator typed.
//   • "If the saved price changes, the displayed pricing should update automatically" —
//     the price is resolved at render time from property_catalog. Nothing is cached onto the
//     client-property pair, so a corrected price is correct everywhere on the next read.
//   • "Never display a different bedroom type's pricing as a substitute" — the lookup is an
//     EXACT map from the requested count to one column. There is deliberately no fallback,
//     no nearest-match, and no range widening.
//
// ── WHY A SEPARATE LAYER AT ALL ─────────────────────────────────────────────────────────
// "Why I chose this" is a 3-slot array owned by the locator. Pricing is owner-entered
// property data. Writing the price INTO that array would conflate the two: a later price
// correction would leave a stale bullet behind, and clearing the price could not be undone
// without guessing which bullet was ours. Deriving it keeps one writer per piece of data.

/** The only bedroom counts we price. Studio and 4+ deliberately have no mapping — see below. */
export type BedroomCount = 1 | 2 | 3

/** The three catalog columns this module reads. Null = not entered, never zero-as-unknown. */
export type CatalogPricing = {
  onebrStartingRent: number | null
  twobrStartingRent: number | null
  threebrStartingRent: number | null
}

/** Slot 2 of 3 — location first, price second, amenity third. */
export const PRICING_SLOT_INDEX = 1

/**
 * The client's requested bedroom count, from `leads.beds`.
 *
 * `leads.beds` is free text. Production currently holds exactly three values — "1", "2" and
 * "3+" — but the column has never been constrained, so this must stay total and must FAIL
 * CLOSED: anything it cannot read with certainty returns null and no price is shown.
 *
 * "3+" maps to 3. That is not a substitution: the client asked for three bedrooms or more,
 * and the 3BR starting rent is the starting rent for the bedroom count they asked about.
 *
 * Deliberately UNMAPPED, each returning null:
 *   • "Studio" / "0"   — there is a studio_starting_rent column, but the client did not ask
 *                        for a bedroom count and the approved copy is "NBR from …".
 *   • "4", "5+"        — columns exist; showing them is a later decision, not an omission.
 *   • "1-2", "2 to 3"  — a RANGE. Picking either end would be inventing a request the client
 *                        did not make, and showing the cheaper one would flatter the listing.
 */
export function requestedBedrooms(beds: string | null | undefined): BedroomCount | null {
  const raw = (beds ?? "").trim().toLowerCase()
  if (!raw) return null

  // A range ("1-2", "2 to 3", "1–2") is ambiguous by construction. Refuse before any digit
  // is read, so a range can never be mistaken for its first number.
  if (/\d\s*(?:-|–|—|to|\/|,)\s*\d/.test(raw)) return null

  // One leading integer, optionally followed by "+" and/or a unit word. Anything else — a
  // second number, a word we do not know — falls through to null.
  const m = /^(\d+)\s*\+?\s*(?:br|bed|beds|bedroom|bedrooms)?\+?$/.exec(raw)
  if (!m) return null

  const n = Number(m[1])
  return n === 1 || n === 2 || n === 3 ? (n as BedroomCount) : null
}

/**
 * The starting rent for EXACTLY this bedroom count, or null.
 *
 * One column per count, no fallback. A non-finite or non-positive value is treated as "not
 * entered" rather than displayed: a stored 0 is far more likely to be a bad import than a
 * free apartment, and "1BR from $0" is worse than showing nothing.
 */
export function startingRentFor(pricing: CatalogPricing, bedrooms: BedroomCount): number | null {
  const raw =
    bedrooms === 1 ? pricing.onebrStartingRent
    : bedrooms === 2 ? pricing.twobrStartingRent
    : pricing.threebrStartingRent
  if (raw === null || raw === undefined) return null
  const n = typeof raw === "number" ? raw : Number(raw)
  return Number.isFinite(n) && n > 0 ? n : null
}

/**
 * The approved reason text: "2BR from $1,400".
 *
 * "from" is load-bearing — it is what makes this a STARTING rent rather than a quote for the
 * client's move-in date. Whole dollars only; a cent on a rent reads as a system artefact.
 *
 * It deliberately says nothing about bathrooms. The catalog's starting rent is per bedroom
 * count, so attaching a bathroom count the client asked for would assert a configuration
 * this number does not evidence.
 */
export function pricingReasonText(bedrooms: BedroomCount, rent: number): string {
  return `${bedrooms}BR from $${Math.round(rent).toLocaleString("en-US")}`
}

/**
 * Does this reason already state a bedroom starting rent?
 *
 * Duplicate prevention has to cover the locator TYPING one by hand, not just our own derived
 * string — otherwise a manual "2BR from $1,400" and a derived one would both render. Matches
 * the shape, not our exact formatting, so "2 BR from $1400" is also recognised as a price.
 */
export function isPricingReason(text: string): boolean {
  return /\d\s*br\b[\s\S]*\$\s*[\d,]+/i.test(text ?? "")
}

/**
 * The reasons to DISPLAY — saved reasons with the bedroom price inserted at slot 2.
 *
 * Returns the saved array UNCHANGED (same contents, by value) in every case where a price
 * must not appear, so a caller can render the result unconditionally:
 *
 *   • the client's requested bedroom count is unknown or unmapped
 *   • that bedroom type has no saved price
 *   • a pricing reason is already present — typed by the locator or derived earlier
 *   • all `maxReasons` slots are occupied → preserve them; never force a fourth, and never
 *     evict a reason the locator wrote to make room for a number
 *
 * THE SAVED ARRAY IS NEVER MUTATED. The result is a new array; callers must not write it
 * back through saveReasons.
 */
export function displayReasons(
  savedReasons: readonly string[],
  pricing: CatalogPricing,
  beds: string | null | undefined,
  maxReasons: number,
): string[] {
  const saved = (savedReasons ?? []).filter((r) => typeof r === "string" && r.trim() !== "")

  const bedrooms = requestedBedrooms(beds)
  if (bedrooms === null) return [...saved]

  const rent = startingRentFor(pricing, bedrooms)
  if (rent === null) return [...saved]

  // Already stated — by us on a previous render, or by the locator by hand.
  if (saved.some(isPricingReason)) return [...saved]

  // Full. Preserving what the locator wrote outranks adding what we derived.
  if (saved.length >= maxReasons) return [...saved]

  const out = [...saved]
  // Location first, price second. With fewer saved reasons than the slot index, the price
  // simply lands at the end rather than leaving a gap.
  out.splice(Math.min(PRICING_SLOT_INDEX, out.length), 0, pricingReasonText(bedrooms, rent))
  return out
}
