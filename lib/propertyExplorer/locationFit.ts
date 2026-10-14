import type { ExplorerProperty } from "./types"
import { isAreaAlias } from "./areaAliases"
import { isCommuteMode, meetsCommute, commuteMatchReason } from "./commuteMode"

/**
 * Simple, honest location intelligence.
 *
 * TWO MODES, and which one applies is decided by the client's own data.
 *
 * AREA MODE (the default, and byte-identical to its long-standing behaviour). What we
 * have is a lead's `city` (a market display name) and `neighborhoods` (free text the
 * client picked, e.g. "Downtown Miami"), plus the property's formatted address. No
 * client coordinates and no Geocoding — so the only defensible comparison is TEXTUAL.
 * Accordingly the area path does no geospatial scoring, no polygons, no landmark or
 * street proximity, no radius maths and no match percentage. It reports only what the
 * strings support and returns null whenever they are ambiguous — showing nothing is
 * better than implying certainty we do not have.
 *
 * COMMUTE MODE, when the client has stated BOTH a destination and a maximum drive
 * time. Then their geographic requirement is not a neighbourhood name at all, and a
 * drive time VERIFIED by Google Routes is the primary qualification — see the branch
 * at the top of assessLocationFit. This is still not a score: the only question asked
 * is whether a measured number is at or under the maximum the client themselves gave.
 * Every line of the area logic is untouched, and runs unchanged whenever
 * commuteMaxMinutes is null.
 */
export type LocationFit = {
  label:
    | "Preferred Neighborhood Match"
    | "Location Keyword Match"
    | "Preferred Location Match"
    | "Preferred Area Match"
    | "Commute Match"
    | "Within Preferred Area"
    | "Outside Preferred Area"
  /** Short factual reason, never a score. */
  reason: string
  /**
   * The client's OWN words that this property matched — the neighborhood, keyword,
   * location or area text that produced the hit, carried raw rather than wrapped in a
   * display sentence.
   *
   * Exists so a client-facing surface can say "In Alamo Heights, one of your preferred
   * areas" instead of the generic "In your preferred area", WITHOUT parsing `reason`
   * back apart. Present only on a match tone; nothing here changes any verdict, score
   * or rank.
   */
  match?: string
  tone: "match" | "neutral" | "outside"
  /** Lower is stronger, for ordering when several match. A VERIFIED COMMUTE IS 0:
   *  in Commute Mode the client's stated maximum drive time IS their geographic
   *  requirement, so satisfying it is the primary qualification, not a fallback
   *  beneath the area tiers. Then neighborhood 1, keyword 2, location 3,
   *  address-text 4. Absent for non-match results. */
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
  // ── Commute Mode (all optional; absent = the existing Area Mode, unchanged) ──
  /** leads.commute_anchor_place_id — the place the client must be near. */
  commuteAnchorPlaceId?: string | null
  /** leads.commute_anchor_label — display only, for the reason line. */
  commuteAnchorLabel?: string | null
  /** leads.commute_max_minutes. Null/absent ⇒ NOT Commute Mode, and every line of
   *  the area logic below behaves exactly as it did before this existed. */
  commuteMaxMinutes?: number | null
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
    "propertyAddress" | "neighborhood" | "location" | "locationKeywords" | "commuteMinutes"
  >,
  client: ClientLocationContext | null,
): LocationFit | null {
  // No client, or nothing to compare against — show no label at all.
  if (!client) return null

  // ── COMMUTE MODE — the PRIMARY geographic qualification ────────────────────
  // When the client has stated both a destination and a maximum drive time, that
  // maximum IS their location requirement. A property Routes has verified inside it
  // has satisfied it, and needs no Desired Area text to do so: Altitude at Brooks is
  // 19 minutes from Fort Sam and 9.1 km from the Southtown centroid, so the area
  // text could never have found it. Hence rank 0 — ahead of the four area tiers, not
  // beneath them.
  //
  // `commuteMinutes` is a VERIFIED Routes result (lib/commute/routes.ts, place_id on
  // both ends), never a straight-line estimate. The prefilter radius that narrowed
  // the catalog qualifies nothing; only this number does.
  if (isCommuteMode(client.commuteAnchorPlaceId, client.commuteMaxMinutes)) {
    const max = Number(client.commuteMaxMinutes)
    if (meetsCommute(property.commuteMinutes, max)) {
      return {
        label: "Commute Match",
        reason: commuteMatchReason(Number(property.commuteMinutes), client.commuteAnchorLabel),
        tone: "match",
        rank: 0,
      }
    }
    // Over the maximum, or no drivable route → earns NO commute match. It falls
    // through to the area logic below, so nothing a property qualified for before
    // Commute Mode existed is taken away; commute simply grants it nothing.
  }

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
      return { label: "Preferred Neighborhood Match", reason: `Neighborhood: ${nbhdHit}`, match: nbhdHit, tone: "match", rank: 1 }
    }
    // Location Keyword (OR). Accepts the client's label verbatim, or one of the
    // CURATED spellings for that label in this market (lib/propertyExplorer/areaAliases)
    // — the catalog says "uptown dallas" where the client chose "Uptown", and that is
    // the same place. Still exact equality against an allowlist, never a substring:
    // "minutes from southtown" is not a spelling of Southtown and cannot qualify.
    // Tier, order and reason text are unchanged.
    const kwHit = (property.locationKeywords ?? []).map(norm).find(
      (k) => clientAreas.includes(k) || clientAreas.some((a) => isAreaAlias(k, a, client.city)),
    )
    if (kwHit) {
      return { label: "Location Keyword Match", reason: `Keyword: ${kwHit}`, match: kwHit, tone: "match", rank: 2 }
    }
    // Broad Location.
    const loc = norm(property.location ?? "")
    if (loc && clientAreas.includes(loc)) {
      return { label: "Preferred Location Match", reason: `Location: ${loc}`, match: loc, tone: "match", rank: 3 }
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
    return { label: "Preferred Area Match", reason: `Address matches ${hit}`, match: hit, tone: "match", rank: 4 }
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
