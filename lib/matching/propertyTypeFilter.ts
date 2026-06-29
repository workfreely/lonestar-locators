// Property Type Filter — simple, auditable, EXACT-MATCH ONLY.
//
// Uses property.property_types as the source of truth — NOT
// property.property_type (the legacy singular field calculateMatchScore
// fuzzy-matches against), not synonym/keyword matching, no scoring. Just
// a boolean inclusion test with a reason string.
//
// Not wired into production. See
// app/api/admin/debug/property-type-filter for the verification route.

export type PropertyTypeMatchResult = {
  included: boolean
  reason: string
}

function normalizeType(s: any): string {
  return String(s || "").toLowerCase().trim()
}

// property_types may be stored as a jsonb array, a comma-separated
// string, or a single plain string — normalize every shape into a flat
// array of lowercase, trimmed type strings.
function toTypeArray(raw: any): string[] {
  if (Array.isArray(raw)) {
    return raw.map(normalizeType).filter(Boolean)
  }
  if (typeof raw === "string") {
    return raw.split(",").map(normalizeType).filter(Boolean)
  }
  return []
}

// Exact match only: the lead's desired type must appear, verbatim
// (case/whitespace-insensitive), in the property's property_types list.
export function matchesPropertyType(leadDesiredType: any, property: any): PropertyTypeMatchResult {
  const desired = normalizeType(leadDesiredType)

  if (!desired || desired === "any" || desired === "no preference") {
    return { included: false, reason: "No specific property type requested by lead" }
  }

  const propertyTypes = toTypeArray(property?.property_types)

  if (propertyTypes.length === 0) {
    return { included: false, reason: "Property has no property_types on record" }
  }

  if (propertyTypes.includes(desired)) {
    return { included: true, reason: "Exact property type match" }
  }

  return {
    included: false,
    reason: `No exact match — lead wants "${leadDesiredType}", property_types are [${propertyTypes.join(", ")}]`,
  }
}
