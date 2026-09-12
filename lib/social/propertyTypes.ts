// Social Autopilot — property types for a source video. Used by upload/edit UI, filename
// inference, and post auto-compose (so copy/hashtags use townhome vs apartment terminology).
export const PROPERTY_TYPES = [
  "Apartment",
  "Townhome",
  "High-Rise",
  "Mid-Rise",
  "Garden-Style",
  "Student Housing",
  "Build-to-Rent",
  "Other",
] as const
export type PropertyType = (typeof PROPERTY_TYPES)[number]

export function isPropertyType(v: string | null | undefined): v is PropertyType {
  return !!v && (PROPERTY_TYPES as readonly string[]).includes(v)
}

// Filename keyword variants → canonical property type. Order matters (more specific first).
const KEYWORDS: [RegExp, PropertyType][] = [
  [/\b(town\s?homes?|town\s?houses?)\b/i, "Townhome"],
  [/\b(high[\s-]?rise)\b/i, "High-Rise"],
  [/\b(mid[\s-]?rise)\b/i, "Mid-Rise"],
  [/\b(garden[\s-]?style|garden\s?apartments?)\b/i, "Garden-Style"],
  [/\b(student\s?(housing|living|apartments?)?)\b/i, "Student Housing"],
  [/\b(build[\s-]?to[\s-]?rent|btr)\b/i, "Build-to-Rent"],
  [/\b(apartments?|apts?)\b/i, "Apartment"],
]

/** Detect a property type from normalized filename text, or null when none is present. */
export function detectPropertyType(text: string): PropertyType | null {
  for (const [re, type] of KEYWORDS) if (re.test(text)) return type
  return null
}

/** Lowercase, singular-ish noun used in copy ("townhome tour", "apartment tour"). */
export function propertyNoun(type: string | null | undefined): string {
  switch (type) {
    case "Townhome":
      return "townhome"
    case "High-Rise":
      return "high-rise"
    case "Mid-Rise":
      return "mid-rise"
    case "Garden-Style":
      return "garden-style apartment"
    case "Student Housing":
      return "student apartment"
    case "Build-to-Rent":
      return "home"
    default:
      return "apartment"
  }
}
