// Location Filter — simple, auditable, location-FIRST candidate filter.
//
// Replaces (temporarily, alongside — not deleting) the cluster-based
// location system for production use. Deliberately does NOT use:
// location_clusters, nearby_clusters, aliases, landmarks, corridor
// keywords, fuzzy/squash matching, score bonuses, score penalties,
// calculateMatchScore, or locationIntelligence.ts.
//
// Area definitions below are plain hardcoded literals — not pulled from
// any database table. Add new areas directly to AREA_DEFINITIONS.
//
// A property matches an area if ANY of the following are true:
//   - property.neighborhood contains an area keyword
//   - property.postal_code is one of the area's ZIPs
//   - property.name contains an area keyword
//   - property.street_address contains an area keyword

export type AreaDefinition = {
  name: string
  keywords: string[]
  zips: string[]
}

export const AREA_DEFINITIONS: AreaDefinition[] = [
  { name: "La Cantera / The Rim", keywords: ["La Cantera", "The Rim"], zips: ["78256", "78257"] },
  { name: "Stone Oak", keywords: ["Stone Oak"], zips: ["78258", "78259", "78260"] },
  { name: "Medical Center", keywords: ["Medical Center"], zips: ["78229", "78240"] },
  { name: "Alamo Heights", keywords: ["Alamo Heights"], zips: ["78209"] },
  { name: "Westover Hills", keywords: ["Westover Hills"], zips: ["78251", "78253"] },
  { name: "Alamo Ranch", keywords: ["Alamo Ranch"], zips: ["78253", "78250"] },
  { name: "UTSA", keywords: ["UTSA"], zips: ["78249"] },
  { name: "Helotes", keywords: ["Helotes"], zips: ["78023"] },
  { name: "Boerne", keywords: ["Boerne"], zips: ["78006", "78015"] },
  { name: "Converse / Live Oak / Universal City", keywords: ["Converse", "Live Oak", "Universal City"], zips: ["78109", "78148", "78233"] },
  { name: "Schertz / Cibolo", keywords: ["Schertz", "Cibolo"], zips: ["78108", "78154"] },
  { name: "New Braunfels", keywords: ["New Braunfels"], zips: ["78130", "78132"] },
  { name: "San Marcos", keywords: ["San Marcos"], zips: ["78666"] },
  { name: "Downtown / Pearl", keywords: ["Downtown", "Pearl"], zips: ["78205", "78215"] },
  { name: "Southtown", keywords: ["Southtown"], zips: ["78204"] },
  { name: "Southside / Brooks City Base", keywords: ["Southside", "Brooks"], zips: ["78211", "78223", "78214"] },
  { name: "North Central / Airport", keywords: ["North Central", "Airport"], zips: ["78216"] },
]

function norm(s: any): string {
  return String(s || "").toLowerCase().trim()
}

// Resolves a requested area from free text (e.g. lead.neighborhoods) by
// plain substring matching against each area's keywords. Returns the
// FIRST matching area, or null if nothing matches.
export function resolveAreaFromLeadText(leadText: string): AreaDefinition | null {
  const text = norm(leadText)
  if (!text) return null

  return (
    AREA_DEFINITIONS.find((area) => area.keywords.some((k) => text.includes(norm(k)))) ?? null
  )
}

export type LocationFilterMatch = {
  property: any
  included: boolean
  matchedBy: ("neighborhood" | "postal_code" | "property_name" | "street_address")[]
}

export function matchesArea(property: any, area: AreaDefinition): LocationFilterMatch {
  const matchedBy: LocationFilterMatch["matchedBy"] = []

  const name = norm(property?.name)
  const neighborhood = norm(property?.neighborhood)
  const streetAddress = norm(property?.street_address || property?.address || property?.full_address)
  const postalCode = String(property?.zip || property?.zip_code || property?.postal_code || "")

  if (area.keywords.some((k) => neighborhood.includes(norm(k)))) matchedBy.push("neighborhood")
  if (area.zips.includes(postalCode)) matchedBy.push("postal_code")
  if (area.keywords.some((k) => name.includes(norm(k)))) matchedBy.push("property_name")
  if (area.keywords.some((k) => streetAddress.includes(norm(k)))) matchedBy.push("street_address")

  return { property, included: matchedBy.length > 0, matchedBy }
}

// Filters a property list down to only those matching the given area.
export function filterPropertiesByLocation(properties: any[], area: AreaDefinition): any[] {
  return properties.filter((p) => matchesArea(p, area).included)
}
