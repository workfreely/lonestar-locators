// Beast Social — canonical amenity/feature bank for the Post Editor's searchable multi-select.
//
// SCOPE: this is Beast-Social-specific (there is no shared apartment-amenity taxonomy to reuse —
// the lead form stores property preferences, not a curated selling-point bank). Values are ordered
// display strings. Selection ORDER is meaningful: the first selected amenity is the primary
// {feature} for the future overlay Template 3, and the Instagram caption uses the first up to 3.
//
// STORAGE: amenities stay in the existing social_content.amenities TEXT column (no migration).
// Ordered selections serialize to a newline-joined string; legacy comma/newline free-text still
// parses. Unknown values are preserved verbatim as custom selections (never dropped, never rewritten).

/** Curated, de-duplicated selling points. Clean, consistent display capitalization.
 *
 *  NINE ADDED, each inserted BESIDE its nearest relative rather than appended, because this array
 *  is the picker's display order. The pairs that look like duplicates and are not:
 *
 *    Roof Deck        vs Sky Lounge      — the OUTDOOR community rooftop vs the indoor lounge.
 *                                          A building can have either, both, or one on the other.
 *    Private Terraces vs Private Balcony — a terrace is a RESIDENT's own outdoor room; the point of
 *                                          keeping it apart from Roof Deck is that one is private
 *                                          and one is shared, which is the whole claim.
 *    Indoor Pool      vs Rooftop/Resort-Style/Infinity Pool — four different pools, not four
 *                                          words for one.
 *    Oversized Windows vs Floor-to-Ceiling Windows — oversized is not floor-to-ceiling, and a
 *                                          property that says one must not be credited with the other.
 *    Wine Storage Lockers vs Wine Fridges — a shared cellar locker vs an appliance in the home.
 *
 *  NOT ADDED: a plain "Lake Views" — it was already here. Note that The Mustang's hand-typed
 *  "Lake View" (singular) therefore stays a CUSTOM chip, because normalizeKey keeps the trailing
 *  "s"; the same is true of its "Private Yard" and "Wine Refrigerators". That is the documented
 *  behaviour and nothing rewrites them.
 *
 *  PLURAL IS THE CONVENTION for countable unit features (Balconies, Patios, Walk-In Closets,
 *  Kitchen Islands, Attached Garages, Built-In Desks, Mudrooms, Wine Fridges). "Walk-In Closet"
 *  and "Kitchen Island" were proposed as additions and deliberately NOT added: normalizeKey below
 *  keeps the trailing "s", so a singular form does NOT collapse into its plural — it would appear
 *  as a SECOND, separately selectable chip meaning the same thing. The plurals already cover them.
 *  ("Private Balcony" is different: a private balcony is a distinct claim from a building having
 *  balconies, so it earns its own entry alongside "Balconies".) */
export const AMENITY_BANK: readonly string[] = [
  "Private Yards",
  "Attached Garages",
  "Detached Garages",
  "Garage Parking",
  "Floor-to-Ceiling Windows",
  "Oversized Windows",
  "High Ceilings",
  "Exposed Concrete Ceilings",
  "Concrete Flooring",
  "Rooftop Pool",
  "Resort-Style Pool",
  "Infinity Pool",
  "Indoor Pool",
  "Stainless Steel Appliances",
  "Quartz Countertops",
  "Granite Countertops",
  "Kitchen Islands",
  "Walk-In Closets",
  "Private Balcony",
  "Balconies",
  "Patios",
  "Private Terraces",
  "EV Charging",
  "Dog Park",
  "Putting Green",
  "Pet Spa",
  "Fitness Center",
  "Basketball Court",
  "Yoga Studio",
  "Coworking Space",
  "Business Center",
  "Clubroom",
  "Coffee Bar",
  "Sky Lounge",
  "Roof Deck",
  "Concierge",
  "Guest Suite",
  "Package Lockers",
  "Controlled Access",
  "Gated Community",
  "Downtown Views",
  "City Views",
  "Skyline Views",
  "Lake Views",
  "Pool Views",
  "Washer & Dryer Included",
  "Smart Home Features",
  "Built-In Desks",
  "Mudrooms",
  "Wine Fridges",
  "Wine Storage Lockers",
  // ── FLOORING ──────────────────────────────────────────────────────────────────────────────
  // Singular "Flooring", matching the existing "Concrete Flooring" and Property Intelligence's
  // own `hardwood_flooring` label — a mass noun, so the plural convention below does not apply.
  // REAL hardwood only. PI separately carries wood_style_plank, luxury_vinyl_plank and
  // engineered_wood, and this must never absorb them: a property that publishes wood-look plank
  // is not a property with hardwood floors. There is deliberately no wood-look entry here; that
  // claim belongs in research, where it carries a source.
  "Hardwood Flooring",
  // ── INTERIOR ARCHITECTURE ─────────────────────────────────────────────────────────────────
  // PLURAL, per the convention documented above: a countable in-unit feature.
  "Spiral Staircases",
  // ── UNIT LAYOUT ───────────────────────────────────────────────────────────────────────────
  // Renters ask for these by name, so they are searchable here as well as recorded in research.
  //
  // "Layout" is in the label ON PURPOSE. "Split-Level" alone is already a property-type QUALIFIER
  // (lib/social/propertyTypes COMPOUND_TYPE_QUALIFIERS → "Split-Level Loft" and friends), and a
  // bare "Split-Level" chip would read as a second, competing way to state the type. The suffix
  // keeps the two readable as what they are: one describes the unit's layout, the other names the
  // property type. composePost additionally DROPS this chip from the caption when the type
  // already carries the qualifier, so no caption says split-level twice.
  //
  // TRI-LEVEL IS NOT "MULTI-LEVEL". Three levels specifically. PI's multi_level_layout says more
  // than one floor and nothing about how many, so tri-level implies multi-level and not the
  // reverse. They are separate chips because a renter asking for three levels is not served by a
  // two-storey unit.
  "Split-Level Layout",
  "Tri-Level Layout",
  // MULTIPLE LEVELS, COUNT NOT ASSERTED — the weakest of the three layout claims, and the one PI
  // already carries most often (multi_level_layout, 105 properties). Distinct from both of its
  // neighbours: a tri-level unit IS multi-level and a split-level unit IS multi-level, but neither
  // implication runs backwards, so a renter who asked for three levels is not served by this.
  // composePost encodes exactly that asymmetry — in a caption this chip is withheld when a
  // stronger claim is also selected, so the caption never says the layout twice.
  "Multi-Level Layout",
] as const

// A loose key so trivial punctuation/spacing/case variants collapse to one canonical display value
// ("floor to ceiling windows" / "Floor-To-Ceiling Windows" → "Floor-to-Ceiling Windows"). Only
// alphanumerics survive, so hyphens, spaces, "&", etc. never create duplicate variants.
const normalizeKey = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "")

const CANON_BY_KEY = new Map<string, string>(AMENITY_BANK.map((a) => [normalizeKey(a), a]))

// ── EQUIVALENT WORDINGS ─────────────────────────────────────────────────────────────────────
//
// normalizeKey collapses punctuation, spacing and case, but NOT a different noun or a trailing
// "s" — that is deliberate (see the convention note above). So "Hardwood Floors" and "Hardwood
// Flooring" are two different keys, and once "Hardwood Flooring" joined the bank an operator who
// had already typed "Hardwood Floors" as a custom chip would be offered BOTH: two selectable
// options meaning one thing. Exactly one such chip exists in the library today.
//
// ── WHY THIS IS NOT PART OF canonicalizeAmenity ─────────────────────────────────────────────
// parseAmenities() canonicalizes EVERY STORED VALUE on read. Teaching canonicalizeAmenity this
// alias would therefore rewrite that saved chip to "Hardwood Flooring" the moment the record was
// loaded, and persist the rewrite on the next save — silently editing a historical record that an
// operator typed by hand. So the alias is a SEPARATE layer with two narrow uses:
//
//   amenityEquivalenceKey()    for DE-DUPLICATING THE SELECTOR, so an equivalent bank option is
//                              not offered alongside an already-selected chip. Display only.
//   resolveAmenityForEntry()   for a value being entered NOW, so a fresh "Hardwood Floors" lands
//                              on the canonical spelling instead of creating a second variant.
//
// Neither touches what is already stored. Keys only — values are never compared raw.
const EQUIVALENT_KEYS: Readonly<Record<string, string>> = Object.freeze({
  [normalizeKey("Hardwood Floors")]: normalizeKey("Hardwood Flooring"),
  [normalizeKey("Hardwood Floor")]: normalizeKey("Hardwood Flooring"),
  [normalizeKey("Wood Flooring")]: normalizeKey("Hardwood Flooring"),
  [normalizeKey("Spiral Staircase")]: normalizeKey("Spiral Staircases"),
  [normalizeKey("Spiral Stairs")]: normalizeKey("Spiral Staircases"),
  [normalizeKey("Split Level")]: normalizeKey("Split-Level Layout"),
  [normalizeKey("Split-Level")]: normalizeKey("Split-Level Layout"),
  [normalizeKey("Tri Level")]: normalizeKey("Tri-Level Layout"),
  [normalizeKey("Tri-Level")]: normalizeKey("Tri-Level Layout"),
  [normalizeKey("Multi Level")]: normalizeKey("Multi-Level Layout"),
  [normalizeKey("Multi-Level")]: normalizeKey("Multi-Level Layout"),
  [normalizeKey("Multi Level Layout")]: normalizeKey("Multi-Level Layout"),
})

// ── IMPLICATION, FOR CAPTIONS ONLY ──────────────────────────────────────────────────────────
//
// Some features are not equivalent but one ENTAILS the other: a tri-level unit is multi-level, and
// so is a split-level unit. Both relations run one way. Equivalence cannot express that — treating
// them as equivalent would make "Multi-Level Layout" and "Tri-Level Layout" the same chip, and a
// renter asking for three levels would be shown two-storey units.
//
// So this is a SEPARATE, DIRECTED relation, and it is consulted ONLY when composing a caption: if a
// stronger claim is selected, the weaker one it entails is withheld from the public copy. Both
// chips stay selected, stored and in research — the property really is both, and research should
// say so with its own applicability and provenance.
//
// Keyed on equivalence keys, so any alias spelling on either side is caught.
const IMPLIED_BY: Readonly<Record<string, readonly string[]>> = Object.freeze({
  [normalizeKey("Multi-Level Layout")]: Object.freeze([
    normalizeKey("Tri-Level Layout"),
    normalizeKey("Split-Level Layout"),
  ]),
})

/**
 * Is `weaker` already entailed by something in `selected`?
 *
 * Directed: tri-level implies multi-level, never the reverse. Comparison is by equivalence key, so
 * "Multi Level" and "Multi-Level Layout" are both recognised. Caption use only — this must never
 * decide what is stored or deselected.
 */
export function amenityImpliedBySelection(weaker: string | null | undefined, selected: readonly string[]): boolean {
  const stronger = IMPLIED_BY[amenityEquivalenceKey(weaker)]
  if (!stronger) return false
  const keys = new Set(selected.map(amenityEquivalenceKey))
  return stronger.some((k) => keys.has(k))
}

/**
 * The key two amenity values share when they mean the same thing.
 *
 * Use it to compare — never to display, and never to decide what to store. Values with no alias
 * return their own normalizeKey, so this is a safe drop-in wherever normalizeKey was used for
 * equality.
 */
export function amenityEquivalenceKey(raw: string | null | undefined): string {
  const k = normalizeKey((raw ?? "").replace(/\s+/g, " ").trim())
  return EQUIVALENT_KEYS[k] ?? k
}

/** Do these two amenity values mean the same thing, however they are worded? */
export function amenitiesEquivalent(a: string | null | undefined, b: string | null | undefined): boolean {
  const ka = amenityEquivalenceKey(a)
  return !!ka && ka === amenityEquivalenceKey(b)
}

/**
 * Resolve a value the operator is entering RIGHT NOW to its canonical bank spelling, following
 * aliases. For new input only — this is what stops a freshly typed "Hardwood Floors" becoming a
 * second chip beside the canonical one. Unknown input falls through to canonicalizeAmenity, so a
 * genuine custom feature keeps its wording.
 */
export function resolveAmenityForEntry(raw: string | null | undefined): string {
  const t = (raw ?? "").replace(/\s+/g, " ").trim()
  if (!t) return ""
  return CANON_BY_KEY.get(amenityEquivalenceKey(t)) ?? canonicalizeAmenity(t)
}

/** Map a raw amenity to its canonical bank display value when it matches one (variant-insensitive);
 *  otherwise return the trimmed original (a CUSTOM feature — wording preserved, never rewritten).
 *  Inner whitespace is collapsed. Empty input → "".
 *
 *  ALIAS-BLIND ON PURPOSE — see EQUIVALENT_KEYS above. parseAmenities runs this over every stored
 *  value, so making it alias-aware would rewrite saved chips on read. */
export function canonicalizeAmenity(raw: string | null | undefined): string {
  const t = (raw ?? "").replace(/\s+/g, " ").trim()
  if (!t) return ""
  return CANON_BY_KEY.get(normalizeKey(t)) ?? t
}

/** Is this value one of the canonical bank amenities (variant-insensitive)? */
export function isCanonicalAmenity(raw: string | null | undefined): boolean {
  return !!raw && CANON_BY_KEY.has(normalizeKey(raw))
}

/** Parse the stored amenities value into an ORDERED, de-duplicated list of display strings.
 *  Current storage is newline-joined; legacy free-text is comma-separated — so we split on
 *  newlines when present, else on commas. Each item is canonicalized (known variants → canonical
 *  display; unknown → preserved as custom). Exact duplicates (case-insensitive) are dropped, first
 *  occurrence wins, order preserved. */
export function parseAmenities(raw: string | null | undefined): string[] {
  const s = (raw ?? "").trim()
  if (!s) return []
  const parts = s.includes("\n") ? s.split(/\r?\n/) : s.split(",")
  const out: string[] = []
  const seen = new Set<string>()
  for (const p of parts) {
    const v = canonicalizeAmenity(p)
    if (!v) continue
    const key = v.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(v)
  }
  return out
}

/** Serialize an ordered amenity list back to the stored TEXT form (newline-joined). Newlines are a
 *  safe delimiter because canonical values contain none and custom entries are sanitized to remove
 *  delimiter characters before they are added. */
export function serializeAmenities(list: string[]): string {
  return list.join("\n")
}

/** Sanitize a user-typed custom feature so it can be a single, delimiter-safe chip: collapse
 *  whitespace, and replace the characters used as separators (newline, comma, semicolon, slash,
 *  bullet, pipe) with a space so the value round-trips as ONE item. Wording is otherwise preserved;
 *  never AI-rewritten. Returns "" for empty. */
export function sanitizeCustomAmenity(raw: string | null | undefined): string {
  return (raw ?? "").replace(/[\n\r,;/•|]+/g, " ").replace(/\s+/g, " ").trim()
}
