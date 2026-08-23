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
  label: "Preferred Area Match" | "Within Preferred Market" | "Outside Preferred Market"
  /** Short factual reason, never a score. */
  reason: string
  tone: "match" | "neutral" | "outside"
}

export type ClientLocationContext = {
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
  property: Pick<ExplorerProperty, "propertyAddress">,
  client: ClientLocationContext | null,
): LocationFit | null {
  // No client, or nothing to compare against — show no label at all.
  if (!client) return null
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
    return { label: "Preferred Area Match", reason: `Address matches ${hit}`, tone: "match" }
  }

  // Without a market we cannot say anything further.
  if (!city) return null

  if (address.includes(norm(city))) {
    return {
      label: "Within Preferred Market",
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
      label: "Outside Preferred Market",
      reason: `Outside ${city}, the client's market`,
      tone: "outside",
    }
  }

  return null
}
