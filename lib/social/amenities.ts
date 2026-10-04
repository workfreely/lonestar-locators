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
  "High Ceilings",
  "Exposed Concrete Ceilings",
  "Concrete Flooring",
  "Rooftop Pool",
  "Resort-Style Pool",
  "Infinity Pool",
  "Stainless Steel Appliances",
  "Quartz Countertops",
  "Granite Countertops",
  "Kitchen Islands",
  "Walk-In Closets",
  "Private Balcony",
  "Balconies",
  "Patios",
  "EV Charging",
  "Dog Park",
  "Pet Spa",
  "Fitness Center",
  "Yoga Studio",
  "Coworking Space",
  "Business Center",
  "Clubroom",
  "Sky Lounge",
  "Concierge",
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
] as const

// A loose key so trivial punctuation/spacing/case variants collapse to one canonical display value
// ("floor to ceiling windows" / "Floor-To-Ceiling Windows" → "Floor-to-Ceiling Windows"). Only
// alphanumerics survive, so hyphens, spaces, "&", etc. never create duplicate variants.
const normalizeKey = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "")

const CANON_BY_KEY = new Map<string, string>(AMENITY_BANK.map((a) => [normalizeKey(a), a]))

/** Map a raw amenity to its canonical bank display value when it matches one (variant-insensitive);
 *  otherwise return the trimmed original (a CUSTOM feature — wording preserved, never rewritten).
 *  Inner whitespace is collapsed. Empty input → "". */
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
