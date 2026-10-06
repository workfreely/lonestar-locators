// Social Autopilot property types — REUSES the canonical Locator Beast taxonomy (read-only)
// from lib/formOptions.ts (the same list the Smart Lead Form + CRM lead panel use). SA does
// NOT maintain a second taxonomy and never modifies the canonical list.
import { PROPERTY_TYPES as CANONICAL_PROPERTY_TYPES } from "@/lib/formOptions"

// SA describes an actual property/content asset, not a renter preference, so it filters the
// renter-preference value "Open to All" OUT of the canonical list — a Social-Autopilot-only
// view. The canonical taxonomy in lib/formOptions.ts is NOT modified; "Open to All" remains
// everywhere else in Locator Beast.
// SOCIAL-BEAST-ONLY content/display types. These describe what a VIDEO shows, not a renter
// preference and not a Property Intelligence classification — so they live HERE and are deliberately
// NOT added to lib/formOptions (the CRM/lead taxonomy) or to any PI schema/record. Appended after the
// canonical values so existing saved posts keep their exact stored strings and dropdown ordering.
export const SOCIAL_ONLY_PROPERTY_TYPES = [
  "Split-Level Townhome", "Split-Level Penthouse", "Split-Level Loft",
  "Industrial-Style Apartment", "Industrial-Style Townhome", "Industrial-Style Penthouse", "Industrial-Style Loft",
] as const

/** The qualifier prefixes that make a Social-only type COMPOUND ("{QUALIFIER} {HEAD NOUN}"). Declared
 *  here, beside the types themselves, so the overlay spec can recognise a compound HERO headline
 *  without hard-coding city×type strings — adding another qualified family only touches this file. */
export const COMPOUND_TYPE_QUALIFIERS = ["Split-Level", "Industrial-Style"] as const

// ORDER IS PINNED HERE, membership is still derived.
//
// The lead-form dropdown was reordered (Loft moved up beside the apartment-style types) as a
// display change for CLIENTS. Social Beast's selector is an internal admin control that was not
// part of that request, and inheriting the array order would have silently reordered it too. So
// this keeps Social Beast's existing order while still taking its MEMBERSHIP from the canonical
// list — a value added to or removed from lib/formOptions still flows through, and the assertion
// below fails loudly if one ever does, rather than letting the two drift apart unnoticed.
const SOCIAL_CANONICAL_ORDER = ["Studio", "Apartment", "High-Rise", "Townhome", "Rental Home", "Penthouse", "Loft"] as const
{
  const derived = [...CANONICAL_PROPERTY_TYPES].filter((t) => t !== "Open to All").sort()
  const pinned = [...SOCIAL_CANONICAL_ORDER].sort()
  if (derived.join("|") !== pinned.join("|")) {
    throw new Error(
      `social propertyTypes: canonical membership changed (${derived.join(", ")}) — update SOCIAL_CANONICAL_ORDER to match`,
    )
  }
}

export const PROPERTY_TYPES = [
  ...SOCIAL_CANONICAL_ORDER, // Studio | Apartment | High-Rise | Townhome | Rental Home | Penthouse | Loft
  ...SOCIAL_ONLY_PROPERTY_TYPES,
] as const
export type PropertyType = (typeof PROPERTY_TYPES)[number]

export function isPropertyType(v: string | null | undefined): v is PropertyType {
  return !!v && (PROPERTY_TYPES as readonly string[]).includes(v)
}

// Filename keyword variants → a CANONICAL value (order: more specific first). Only maps to
// values that exist in the canonical list — an unrecognized/non-canonical hint yields null.
const KEYWORDS: [RegExp, PropertyType][] = [
  // Qualified variants come FIRST: each contains a plain noun ("townhome", "penthouse", "loft",
  // "apartment") that would otherwise match the more general rule below and lose the qualifier.
  [/\bsplit[\s-]?level[\s-]?(town\s?homes?|town\s?houses?)\b/i, "Split-Level Townhome"],
  [/\bsplit[\s-]?level[\s-]?(pent\s?houses?)\b/i, "Split-Level Penthouse"],
  [/\bsplit[\s-]?level[\s-]?(lofts?)\b/i, "Split-Level Loft"],
  [/\bindustrial[\s-]?style[\s-]?(apartments?|apts?)\b/i, "Industrial-Style Apartment"],
  [/\bindustrial[\s-]?style[\s-]?(town\s?homes?|town\s?houses?)\b/i, "Industrial-Style Townhome"],
  [/\bindustrial[\s-]?style[\s-]?(pent\s?houses?)\b/i, "Industrial-Style Penthouse"],
  [/\bindustrial[\s-]?style[\s-]?(lofts?)\b/i, "Industrial-Style Loft"],
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
    case "Split-Level Townhome":
      return "split-level townhome"
    case "Split-Level Penthouse":
      return "split-level penthouse"
    case "Split-Level Loft":
      return "split-level loft"
    case "Industrial-Style Apartment":
      return "industrial-style apartment"
    case "Industrial-Style Townhome":
      return "industrial-style townhome"
    case "Industrial-Style Penthouse":
      return "industrial-style penthouse"
    case "Industrial-Style Loft":
      return "industrial-style loft"
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
    // Only the HEAD NOUN pluralizes — never "Split-Levels ..." and never "... TownhomeS".
    case "Split-Level Townhome":
      return "split-level townhomes"
    case "Split-Level Penthouse":
      return "split-level penthouses"
    case "Split-Level Loft":
      return "split-level lofts"
    case "Industrial-Style Apartment":
      return "industrial-style apartments"
    case "Industrial-Style Townhome":
      return "industrial-style townhomes"
    case "Industrial-Style Penthouse":
      return "industrial-style penthouses"
    case "Industrial-Style Loft":
      return "industrial-style lofts"
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
