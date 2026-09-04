import type { ExplorerProperty } from "./types"

/**
 * Simple, honest location intelligence for V1.
 *
 * WHAT WE ACTUALLY HAVE: a lead's `city` (a market display name) and
 * `neighborhoods` (free text the client picked, e.g. "Downtown Miami"), plus the
 * property's formatted address. No client coordinates, and V1 does not use
 * Geocoding — so the only defensible comparison is TEXTUAL.
 *
 * Accordingly this does no geospatial scoring, no polygons, no landmark or street
 * proximity, no commute time, no radius maths and no match percentage. It reports
 * only what the strings support, and returns null whenever they are ambiguous —
 * showing nothing is better than implying certainty we do not have.
 */
export type LocationFit = {
  label:
    | "Preferred Neighborhood Match"
    | "Location Keyword Match"
    | "Preferred Location Match"
    | "Preferred Area Match"
    | "Within Preferred Area"
    | "Outside Preferred Area"
  /** Short factual reason, never a score. */
  reason: string
  tone: "match" | "neutral" | "outside"
  /** Lower is stronger, for ordering when several match: neighborhood 1,
   *  keyword 2, location 3, address-text 4. Absent for non-match results. */
  rank?: number
}

export type ClientLocationContext = {
  /** Lead identity. Used ONLY to tell one client from another when deciding
   *  whether a map-session market override still belongs to them — never for
   *  location logic, which reads city/desiredAreas below. Optional so existing
   *  callers that pass only location remain valid. */
  id?: string | number | null
  /** The lead's market — stored as the catalog DISPLAY NAME (e.g. "Miami"). */
  city: string | null
  /** Comma-joined free text the client chose (neighborhoods, or submarkets). */
  desiredAreas: string | null
}

const norm = (v: string) => v.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim()

/** Split the stored comma-joined areas, dropping the generated "All of {city}". */
function areaList(desiredAreas: string | null, city: string | null): string[] {
  if (!desiredAreas) return []
  const allOf = city ? norm(`all of ${city}`) : null
  return desiredAreas
    .split(",")
    .map((a) => a.trim())
    .filter(Boolean)
    .filter((a) => !allOf || norm(a) !== allOf)
}

export function assessLocationFit(
  property: Pick<
    ExplorerProperty,
    "propertyAddress" | "neighborhood" | "location" | "locationKeywords"
  >,
  client: ClientLocationContext | null,
): LocationFit | null {
  // No client, or nothing to compare against — show no label at all.
  if (!client) return null

  // ── Structured intelligence path (Property Intelligence catalog) ───────────
  // When a property carries catalogued geography, match the client's chosen
  // areas against it, strongest tier first: exact Neighborhood, then a Location
  // Keyword, then the broad Location. A mismatch here NEVER disqualifies — it
  // simply falls through to the address-text logic below (Unknown stays
  // neutral). A property with no catalogued fields skips this block entirely.
  const clientAreas = areaList(client.desiredAreas, client.city).map(norm).filter((a) => a.length >= 3)
  const hasStructured =
    !!property.neighborhood || !!property.location ||
    (property.locationKeywords?.length ?? 0) > 0
  if (hasStructured && clientAreas.length > 0) {
    // Exact Neighborhood — combined values like "The Rim / La Cantera" match on
    // either individual part.
    const nbhdParts = (property.neighborhood ?? "").split("/").map(norm).filter(Boolean)
    const nbhdHit = nbhdParts.find((part) => clientAreas.includes(part))
    if (nbhdHit) {
      return { label: "Preferred Neighborhood Match", reason: `Neighborhood: ${nbhdHit}`, tone: "match", rank: 1 }
    }
    // Location Keyword (OR).
    const kwHit = (property.locationKeywords ?? []).map(norm).find((k) => clientAreas.includes(k))
    if (kwHit) {
      return { label: "Location Keyword Match", reason: `Keyword: ${kwHit}`, tone: "match", rank: 2 }
    }
    // Broad Location.
    const loc = norm(property.location ?? "")
    if (loc && clientAreas.includes(loc)) {
      return { label: "Preferred Location Match", reason: `Location: ${loc}`, tone: "match", rank: 3 }
    }
    // No structured match — fall through to the address-text fallback below.
  }

  const address = norm(property.propertyAddress ?? "")
  if (!address) return null

  const city = client.city?.trim() || null
  const areas = areaList(client.desiredAreas, city)

  // STRONGEST honest signal: the address names one of the client's own saved areas.
  const hit = areas.find((a) => {
    const n = norm(a)
    return n.length >= 4 && address.includes(n)
  })
  if (hit) {
    return { label: "Preferred Area Match", reason: `Address matches ${hit}`, tone: "match", rank: 4 }
  }

  // Without a market we cannot say anything further.
  if (!city) return null

  if (address.includes(norm(city))) {
    return {
      label: "Within Preferred Area",
      reason: `Inside ${city}, the client's market`,
      tone: "neutral",
    }
  }

  // "Outside" is only claimed when the address CLEARLY names a different market in
  // the same state-sized string — i.e. it carries a city token and that token is
  // not the client's. A missing or unparseable locality stays ambiguous → null,
  // because an address we cannot read is not evidence of being outside anything.
  const locality = (property.propertyAddress ?? "").split(",")[1]?.trim()
  if (locality && norm(locality).length >= 3 && !norm(locality).includes(norm(city))) {
    return {
      label: "Outside Preferred Area",
      reason: `Outside ${city}, the client's market`,
      tone: "outside",
    }
  }

  return null
}
