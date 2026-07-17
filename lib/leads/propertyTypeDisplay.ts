// Single source of truth for turning a lead's stored property_type value
// into natural, lowercase phrasing for outbound messages (First Text, AI
// Voice Script, etc.) — the raw stored label reads oddly in a sentence
// (e.g. "your Open to All move"), so every place that builds a sentence
// around property type should go through this instead of formatting it
// inline.

const PROPERTY_TYPE_DISPLAY: Record<string, string> = {
  "Open to All": "apartment search",
  "Studio": "studio",
  "Apartment": "apartment",
  "High-Rise": "high-rise",
  "Townhome": "townhome",
  "Rental Home": "rental home",
  "Penthouse": "penthouse",
}

// Returns the natural-language display text for a stored property_type
// value, or "" when it's missing/unrecognized — callers should gracefully
// omit the phrase in that case rather than show a blank.
export function formatPropertyTypeDisplay(propertyType: string | null | undefined): string {
  if (!propertyType) return ""
  return PROPERTY_TYPE_DISPLAY[propertyType] ?? ""
}
