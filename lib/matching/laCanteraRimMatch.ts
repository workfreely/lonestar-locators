// La Cantera / The Rim matcher — hardcoded, zero-dependency, LOCATION ONLY.
//
// Deliberately does NOT use: clusters, nearby clusters, corridor keywords,
// landmarks, aliases, fuzzy/squash matching, location scores, weighted
// scoring, or calculateMatchScore. No location_clusters table lookup at
// all — the matching terms below are hardcoded literals, not resolved
// from any database row.
//
// A property is a match if ANY of the following are true:
//   - neighborhood contains "La Cantera" or "The Rim"
//   - postal_code is 78256 or 78257
//   - street_address contains "La Cantera"
//   - property name contains "La Cantera" or "The Rim"
//
// Not wired into production. See
// app/api/admin/debug/la-cantera-rim-match for the verification route.

export type LaCanteraRimMatchedBy = "neighborhood" | "postal_code" | "street_address" | "property_name"

export type LaCanteraRimMatchResult = {
  property: string
  included: boolean
  matchedBy: LaCanteraRimMatchedBy[]
}

const NAME_OR_NEIGHBORHOOD_TERMS = ["la cantera", "the rim"]
const MATCHING_POSTAL_CODES = ["78256", "78257"]

function norm(s: any): string {
  return String(s || "").toLowerCase().trim()
}

export function isLaCanteraRimMatch(property: any): LaCanteraRimMatchResult {
  const matchedBy: LaCanteraRimMatchedBy[] = []

  const name = norm(property?.name)
  const neighborhood = norm(property?.neighborhood)
  const streetAddress = norm(property?.street_address || property?.address || property?.full_address)
  const postalCode = String(property?.zip || property?.zip_code || property?.postal_code || "")

  if (NAME_OR_NEIGHBORHOOD_TERMS.some((t) => neighborhood.includes(t))) matchedBy.push("neighborhood")
  if (MATCHING_POSTAL_CODES.includes(postalCode)) matchedBy.push("postal_code")
  if (streetAddress.includes("la cantera")) matchedBy.push("street_address")
  if (NAME_OR_NEIGHBORHOOD_TERMS.some((t) => name.includes(t))) matchedBy.push("property_name")

  return {
    property: property?.name,
    included: matchedBy.length > 0,
    matchedBy,
  }
}
