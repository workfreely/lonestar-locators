import { MUST_HAVE_AMENITIES } from "@bc/companion-shared"

/**
 * THE AMENITY CHOICES IN "WHY I CHOSE THIS FOR YOU".
 *
 * ── THIS IS NOT A THIRD VOCABULARY ──────────────────────────────────────────────────────────
 * Two sources already exist and this composes them rather than inventing a parallel list:
 *
 *   MUST_HAVE_AMENITIES (companion-shared)  the client-facing option list, already the single
 *                                           source of truth for the Smart Form, the CRM edit
 *                                           surface and the Companion row
 *   property_attribute_keys (138 keys)      the canonical per-property attribute registry
 *
 * Every entry below reuses the stable VALUE of whichever source owns it, so a selection here
 * reads as the same thing a Smart Form must-have or a Property Intelligence attribute does. The
 * handful with neither (`washer_dryer_connections` is a property_catalog COLUMN, `balcony` has no
 * canonical home at all) are marked, because "we made this value up for this dropdown" is worth
 * knowing when someone later tries to join on it.
 *
 * ── A CHOICE HERE IS NOT A VERIFICATION ─────────────────────────────────────────────────────
 * An amenity in this dropdown says nothing about whether THIS property has it. Selecting one is
 * the locator confirming a highlight for ONE client's recommendation, stored as text on
 * lead_property_reasons. It never writes property_attributes, never marks anything verified, and
 * never flows back into Property Intelligence. The two directions are deliberately separate: the
 * registry records what a property HAS, this records what a locator chose to SAY.
 */

export type RecommendationAmenity = {
  /** Stable key. Matches the canonical source's own value wherever one exists. */
  value: string
  /** What the locator picks and the client reads. */
  label: string
  /** Where the value comes from — so a future join knows what it can trust. */
  source: "must_have" | "attribute_key" | "catalog_column" | "editor_only"
}

/** Pulled from the shared list by value, so a label change there flows here untouched. */
function fromMustHave(value: string, label?: string): RecommendationAmenity {
  const m = MUST_HAVE_AMENITIES.find((a) => a.value === value)
  return { value, label: label ?? m?.label ?? value, source: "must_have" }
}

/**
 * The options, in the order they appear. Ordered by how often a locator reaches for them rather
 * than alphabetically — the dropdown is searchable, so the order serves the common case.
 */
export const RECOMMENDATION_AMENITIES: readonly RecommendationAmenity[] = [
  // "W/D Included" rather than the shared list's "Washer/Dryer": this line sits next to
  // "W/D Connections" in the same menu, where the distinction is the entire point.
  fromMustHave("washer_dryer", "W/D Included"),
  { value: "washer_dryer_connections", label: "W/D Connections", source: "catalog_column" },
  fromMustHave("private_yard"),
  fromMustHave("attached_garage"),
  fromMustHave("detached_garage"),
  // GENERIC, AND DELIBERATELY NOT detached_garage. It was mapped there, which is the exact
  // conflation companion-shared's own amenity rules forbid: "Garage available ≠ Attached Garage",
  // and a detached garage is a specific fact a generic label cannot assert. A locator who means
  // one of the two picks it by name above; this is for "there is garage parking" and claims
  // neither attribute, so it gets its own editor-only value rather than borrowing one.
  { value: "garage_parking", label: "Garage Parking", source: "editor_only" },
  fromMustHave("floor_to_ceiling_windows"),
  { value: "walk_in_closet", label: "Walk-in Closets", source: "attribute_key" },
  { value: "kitchen_island", label: "Kitchen Island", source: "attribute_key" },
  { value: "balcony", label: "Balcony", source: "editor_only" },
  fromMustHave("pool"),
  fromMustHave("fitness_center"),
  fromMustHave("high_ceilings"),
  fromMustHave("garden_tub"),
  fromMustHave("walk_in_shower"),
  fromMustHave("gated_access"),
  fromMustHave("dog_park"),
  fromMustHave("ev_charging"),
] as const

/** At most two, by requirement — the reason is one line, not a feature dump. */
export const MAX_RECOMMENDATION_AMENITIES = 2

const BY_LABEL = new Map(RECOMMENDATION_AMENITIES.map((a) => [a.label.toLowerCase(), a]))

/** Case-insensitive label lookup, so a saved line re-opens with its chips selected. */
export function amenityByLabel(label: string): RecommendationAmenity | null {
  return BY_LABEL.get((label ?? "").trim().toLowerCase()) ?? null
}

/** Substring search over labels, for the dropdown's filter box. */
export function searchAmenities(query: string): RecommendationAmenity[] {
  const q = (query ?? "").trim().toLowerCase()
  if (!q) return [...RECOMMENDATION_AMENITIES]
  return RECOMMENDATION_AMENITIES.filter((a) => a.label.toLowerCase().includes(q))
}

/** The searchable options, as the shared AmenitySelect wants them. */
export const RECOMMENDATION_AMENITY_LABELS: readonly string[] =
  RECOMMENDATION_AMENITIES.map((a) => a.label)

/**
 * A value being ENTERED now → what gets stored.
 *
 * A known label lands on its canonical spelling, so picking "Walk-in Closets" always stores the
 * same string. Anything else is the locator's own wording and is kept EXACTLY as typed — this is
 * deliberately not Social Beast's resolveAmenityForEntry, which would canonicalize a phrase
 * against a different vocabulary and rewrite words a locator chose on purpose.
 */
export function resolveRecommendationAmenity(raw: string, sanitize: (s: string) => string): string {
  const hit = amenityByLabel(raw)
  return hit ? hit.label : sanitize(raw)
}

/**
 * Comparison only. Two spellings of the same standardized amenity share a key, so "Walk-In
 * Closets" cannot be added alongside "Walk-in Closets"; custom wording falls back to its own
 * lowercased text. Never used to rewrite a stored value.
 */
export function recommendationAmenityKey(raw: string): string {
  return amenityByLabel(raw)?.value ?? (raw ?? "").trim().toLowerCase()
}
