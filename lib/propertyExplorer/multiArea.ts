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
    .slice(0, max)
  const out: AreaCenter[] = []
  for (const label of labels) {
    const c = centerForDesiredArea(label, marketSlug)
    // null → unresolved → dropped. Never fall back to the market center here.
    if (c) out.push({ lat: c.lat, lng: c.lng })
  }
  return out
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
