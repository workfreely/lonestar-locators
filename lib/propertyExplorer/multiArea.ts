import { centerForDesiredArea } from "@/lib/markets/catalog"
import type { ExplorerProperty } from "./types"

/**
 * Multi-area Unleash — the pure, provider-agnostic core of searching 1–3 desired
 * areas at once. Split out of BeastPropertyExplorer so the geographic resolution,
 * the per-area fan-out and the dedupe are unit-testable WITHOUT Google Maps.
 *
 * Design constraints carried from the single-area path:
 *   • the form allows a MINIMUM of 1 and a MAXIMUM of 3 total geographic
 *     preferences (Preferred Neighborhoods + Nearby Areas combined), so at most
 *     3 areas are ever searched;
 *   • Nearby Areas (e.g. Boerne, Schertz) count EXACTLY like Preferred
 *     Neighborhoods — resolution is by label, not by which list it came from;
 *   • an area that does not resolve to a catalogued centroid is DROPPED, never
 *     substituted with the market/downtown center — a missing centroid must fail
 *     safely rather than silently search the wrong place;
 *   • resolution is market-aware, so a label shared across metros ("Medical
 *     Center", "Midtown") pins to the active market's centroid.
 */

export type AreaCenter = { lat: number; lng: number }

/** The form's combined cap across Preferred Neighborhoods + Nearby Areas. */
export const MAX_UNLEASH_AREAS = 3

/**
 * Resolve the client's comma-joined desired areas to deterministic search
 * centers, market-aware, capped at `max`. Unresolved labels are DROPPED (not
 * replaced by the market center), so the caller searches only real centroids —
 * an unrecognised area causes no search for that area rather than a downtown one.
 */
export function resolveDesiredAreaCenters(
  desiredAreas: string | null | undefined,
  marketSlug: string | null | undefined,
  max: number = MAX_UNLEASH_AREAS,
): AreaCenter[] {
  const labels = (desiredAreas ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)

  // RESOLVE FIRST, THEN CAP. The cap used to be applied to the raw label list, so
  // an unresolvable label in the first positions consumed a search slot and the
  // better areas behind it were discarded by position rather than by quality.
  //
  // This is also what handles "All of {City}": the form generates that catch-all
  // itself and it is deliberately absent from DESIRED_AREA_CENTERS, so it resolves
  // to null like any other unknown label and now costs nothing. Three production
  // leads store it FIRST, which is why a 12-area Houston client searched two
  // centroids instead of three while nine resolvable areas sat unused behind it.
  // No special case for it: a label is skipped because it has no centroid, and if
  // a real "all of {city}" centroid is ever catalogued it starts working for free.
  const out: AreaCenter[] = []
  for (const label of labels) {
    if (out.length >= max) break
    const c = centerForDesiredArea(label, marketSlug)
    // null → unresolved → skipped WITHOUT consuming a slot. Never fall back to the
    // market center here: an unrecognised area should cause no search for that
    // area, not a downtown one.
    if (c) out.push({ lat: c.lat, lng: c.lng })
  }
  return out
}

/**
 * The client's area preferences as ONE list.
 *
 * Preferred Neighborhoods and Nearby Areas are two columns but one idea: places
 * the client wants to live. Every call site used `neighborhoods ?? submarkets`,
 * and `??` only falls through on null/undefined — so a lead with one neighborhood
 * and two Nearby Areas searched ONE centroid, not three, and the Nearby Areas
 * reached matching only when neighborhoods happened to be null.
 *
 * Neighborhoods lead, because they are the client's primary choice and the cap is
 * applied in order. De-duplicated case-insensitively: the same place can legitimately
 * appear in both columns and must not consume two search slots.
 */
export function composeDesiredAreas(
  neighborhoods: string | null | undefined,
  submarkets: string | null | undefined,
): string {
  const seen = new Set<string>()
  const out: string[] = []
  for (const csv of [neighborhoods, submarkets]) {
    for (const raw of (csv ?? "").split(",")) {
      const label = raw.trim()
      if (!label) continue
      const key = label.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      out.push(label)
    }
  }
  return out.join(", ")
}


/**
 * Merge property pools from several area searches into one, deduped by Google
 * Place ID. Overlapping search radii return the same complex more than once; the
 * FIRST occurrence wins so a property appears exactly once in the combined pool.
 * Input order carries no ranking meaning — dedupe only decides identity, not
 * position; ranking runs later over the whole merged set.
 */
export function mergeDedupeByPlaceId(pools: ExplorerProperty[][]): ExplorerProperty[] {
  const seen = new Set<string>()
  const out: ExplorerProperty[] = []
  for (const pool of pools) {
    for (const p of pool) {
      if (!p.placeId || seen.has(p.placeId)) continue
      seen.add(p.placeId)
      out.push(p)
    }
  }
  return out
}

/**
 * Run one property search per center and return the merged, deduped pool. The
 * actual Places call is injected (`searchOne`) so this stays provider-agnostic
 * and testable: N centers ⇒ exactly N searches, results combined and deduped by
 * Place ID. Searches run concurrently; a center that resolves to no properties
 * simply contributes an empty pool.
 */
export async function searchAreas(
  centers: AreaCenter[],
  searchOne: (center: AreaCenter) => Promise<ExplorerProperty[]>,
): Promise<ExplorerProperty[]> {
  const pools = await Promise.all(centers.map((c) => searchOne(c)))
  return mergeDedupeByPlaceId(pools)
}
