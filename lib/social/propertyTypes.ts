// Social Autopilot property types — REUSES the canonical Locator Beast taxonomy (read-only)
// from lib/formOptions.ts (the same list the Smart Lead Form + CRM lead panel use). SA does
// NOT maintain a second taxonomy and never modifies the canonical list.
import { PROPERTY_TYPES as CANONICAL_PROPERTY_TYPES } from "@/lib/formOptions"

// SA describes an actual property/content asset, not a renter preference, so it filters the
// renter-preference value "Open to All" OUT of the canonical list — a Social-Autopilot-only
// view. The canonical taxonomy in lib/formOptions.ts is NOT modified; "Open to All" remains
// everywhere else in Locator Beast.
export const PROPERTY_TYPES = CANONICAL_PROPERTY_TYPES.filter((t) => t !== "Open to All") // Studio | Apartment | High-Rise | Townhome | Rental Home | Penthouse | Loft
export type PropertyType = (typeof PROPERTY_TYPES)[number]

export function isPropertyType(v: string | null | undefined): v is PropertyType {
  return !!v && (PROPERTY_TYPES as readonly string[]).includes(v)
}

// Filename keyword variants → a CANONICAL value (order: more specific first). Only maps to
// values that exist in the canonical list — an unrecognized/non-canonical hint yields null.
const KEYWORDS: [RegExp, PropertyType][] = [
  [/\b(studio)\b/i, "Studio"],
  [/\b(pent\s?house)\b/i, "Penthouse"],
  [/\b(high[\s-]?rise)\b/i, "High-Rise"],
  [/\b(town\s?homes?|town\s?houses?)\b/i, "Townhome"],
  [/\b(rental\s?homes?|single[\s-]?family)\b/i, "Rental Home"],
  [/\b(lofts?)\b/i, "Loft"],
  [/\b(apartments?|apts?)\b/i, "Apartment"],
]

export function detectPropertyType(text: string): PropertyType | null {
  for (const [re, type] of KEYWORDS) if (re.test(text)) return type
  return null
}

/** Lowercase noun for copy ("townhome tour", "apartment tour"). */
export function propertyNoun(type: string | null | undefined): string {
  switch (type) {
    case "Studio":
      return "studio"
    case "High-Rise":
      return "high-rise"
    case "Townhome":
      return "townhome"
    case "Rental Home":
      return "rental home"
    case "Penthouse":
      return "penthouse"
    case "Loft":
      return "loft"
    default:
      return "apartment" // Apartment / Open to All / unknown
  }
}

/** Plural noun for headlines/captions ("San Antonio townhomes"). Falls back to "apartments"
 *  for unknown/absent types — a generic, public-safe leasing term (never the property name). */
export function propertyNounPlural(type: string | null | undefined): string {
  switch (type) {
    case "Studio":
      return "studios"
    case "High-Rise":
      return "high-rises"
    case "Townhome":
      return "townhomes"
    case "Rental Home":
      return "rental homes"
    case "Penthouse":
      return "penthouses"
    case "Loft":
      return "lofts"
    default:
      return "apartments"
  }
}

// Normalize a legacy Social-Autopilot-only value (from a pre-canonical build) to the canonical
// list. SCOPED TO SA DATA ONLY — never applied to lead/CRM/property records. Returns null when
// there is no sensible canonical equivalent.
const LEGACY_MAP: Record<string, PropertyType | ""> = {
  "Mid-Rise": "High-Rise",
  "Garden-Style": "Apartment",
  "Student Housing": "Apartment",
  "Build-to-Rent": "Rental Home",
  Other: "",
}
export function normalizeToCanonical(v: string | null | undefined): PropertyType | null {
  if (isPropertyType(v)) return v
  const mapped = LEGACY_MAP[(v ?? "").trim()] ?? ""
  return isPropertyType(mapped) ? mapped : null
}
