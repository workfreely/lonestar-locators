// BUILDING / COMMUNITY CLASSIFICATION — what kind of building or community a property IS.
//
// ── WHY THIS IS A SEPARATE FILE FROM propertyTypes.ts ───────────────────────────────────────
// These two vocabularies answer different questions about different rows, and conflating them is
// the mistake this file exists to prevent:
//
//   lib/social/propertyTypes.ts  → UNIT TYPE, per VIDEO   (social_content.property_type)
//                                  "what residence am I showing?"  — 14 values
//   this file                    → BUILDING TYPE, per PROPERTY (research stable.buildingType)
//                                  "what kind of building is this?" — 6 values
//
// A high-rise contains apartments, lofts AND penthouses; an apartment community can offer
// townhome-style homes. So BUILDING TYPE NEVER OVERRIDES UNIT TYPE. A video of a penthouse inside
// an "Apartment Community" is correctly labelled Penthouse, and nothing here may be used to
// "correct" it. Keeping the lists in separate modules with separate type guards means a future
// edit cannot quietly let one list stand in for the other.
//
// ── WHY "Mid-Rise" IS HERE, WHEN THE PROPOSED LIST HAD FIVE ────────────────────────────────
// The library audit found 13 properties with a verified height of four to eight storeys, or
// described as mid-rise in their own research: Montrose at Buffalo Bayou (8), Forth at Navigation
// (8), Moda (6), CO/OP Heights (4), City View Lofts (4), The Davy (4), The Mark at Midtown (4),
// Us 1604 (4), Ashton on West Dallas (4), plus Infinity at the Rim, Eighteen25 Downtown, Peregrine
// and Jefferson Railhead. Without Mid-Rise each one has to be called a High-Rise, which is false,
// or an Apartment Community, which silently discards the verified height. Six values is still a
// small list, and this is the one addition the audit actually justified.
//
// NOT ADDED, deliberately: an "Adaptive Reuse" or "Historic Conversion" value. Dallas Power and
// Light Flats, The National and Maple Terrace are all conversions, but they are conversions OF
// high-rises — the fact belongs in stable.architecture, which already records it, not in a height
// classification.

export const BUILDING_TYPES = [
  "Apartment Community",
  "Mid-Rise",
  "High-Rise",
  "Townhome Community",
  "Rental Home Community",
  "Mixed Community",
] as const

export type BuildingType = (typeof BUILDING_TYPES)[number]

/** The jsonb key inside social_property_research.stable. Declared once so the route, the editor
 *  and the tests cannot drift onto different spellings. */
export const BUILDING_TYPE_KEY = "buildingType" as const

/**
 * Is this one of the six values?
 *
 * BLANK IS A VALID STATE, not a missing one. A property whose classification cannot be reliably
 * verified is left empty — six of the library's 125 researched properties have no usable signal at
 * all — so emptiness has to be representable and must not be coerced to a default. Callers that
 * accept clearing test for null/"" separately; this guard answers only "is this a real value?".
 */
export function isBuildingType(v: string | null | undefined): v is BuildingType {
  return !!v && (BUILDING_TYPES as readonly string[]).includes(v)
}

/**
 * Normalise an incoming value to something storable: one of the six, or null to clear.
 *
 * Anything else is REJECTED rather than coerced. A near-miss ("High Rise", "apartment community")
 * is a caller bug, and storing it would put a seventh value in the vocabulary by accident — the
 * column is free-form jsonb, so nothing downstream would stop it.
 */
export function normalizeBuildingType(v: unknown): { ok: true; value: BuildingType | null } | { ok: false; reason: string } {
  if (v === null || v === undefined || v === "") return { ok: true, value: null }
  if (typeof v !== "string") return { ok: false, reason: "not_a_string" }
  const t = v.trim()
  if (t === "") return { ok: true, value: null }
  if (!isBuildingType(t)) return { ok: false, reason: "not_a_building_type" }
  return { ok: true, value: t }
}
