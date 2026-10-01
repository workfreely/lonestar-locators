/**
 * COMMUTE MODE — when the client's real geographic requirement is a drive time.
 *
 * Some clients do not have a neighbourhood requirement at all. They have a place they
 * must be near. Ka'Leah's stored area was "Southtown", but her actual requirement was
 * "within about 20 minutes of Fort Sam / BAMC" — Southtown was a proxy she reached for
 * because the form only asked for areas. The property that genuinely fitted her,
 * Altitude at Brooks, is 9.1 km from the Southtown centroid and 13.0 km from Fort Sam,
 * so a 3 km search around either point could never find it.
 *
 * THE MODE SWITCH IS ONE NULLABLE COLUMN. `leads.commute_max_minutes` null (or no
 * anchor) means the existing Desired Areas workflow runs completely unchanged. Both
 * present means commute determines the candidate geography. There is no flag, no enum
 * and no weighting — see `isCommuteMode`.
 *
 * WHY A PREFILTER AT ALL. Routes is the authority on drive time, but asking it about
 * every property in a metro would be 4,200 elements. So a cheap straight-line radius
 * narrows the catalog first, and Routes then decides. The radius exists only to keep
 * the Routes call small; it never qualifies anything.
 *
 * THE RADIUS CONSTANT IS MEASURED, NOT GUESSED. Against Fort Sam with a 20-minute
 * requirement (2026-10-01, 327 catalog properties, one computeRouteMatrix call):
 *
 *   straight-line   properties   drive-time range   within 20 min
 *     0-5 km            39          7-13 min           39 / 39
 *     5-8 km            51         10-18 min           51 / 51
 *     8-10 km           25         13-20 min           25 / 25
 *    10-13 km           52         15-25 min           30 / 52
 *    13-15 km           50         17-25 min           17 / 50
 *    15-18 km          110         19-28 min           11 / 110
 *
 * The true ≤20-minute set was 173 properties and the FURTHEST of them sat at 16.58 km
 * straight-line — i.e. 0.83 km per minute in the worst case. KM_PER_MINUTE is set to
 * 0.9 so the prefilter is strictly wider than the worst observed case: at 18 km it
 * captured 173/173 with zero false negatives, over-fetching 154 rows that Routes then
 * discarded. Over-fetching costs one cheap element each; under-fetching would silently
 * lose a property the client would have wanted, so the bias is deliberate.
 */

/** The options offered in the UI. Minutes, ascending. */
export const COMMUTE_MINUTE_OPTIONS = [10, 15, 20, 30, 45] as const

/**
 * Worst-case kilometres of straight-line distance per minute of driving, measured
 * (see the table above). Deliberately above the observed 0.83 so the prefilter never
 * excludes a property Routes would have accepted.
 */
export const KM_PER_MINUTE = 0.9

/** Hard ceiling on the prefilter, so a 45-minute requirement cannot scan a whole state. */
export const MAX_PREFILTER_METERS = 60_000

export type LatLng = { lat: number; lng: number }

/**
 * Is this client in Commute Mode?
 *
 * BOTH a destination and a maximum are required. An anchor alone is the pre-existing
 * situation — it produces a "12 min to Fort Sam" reason and nothing else — and a
 * maximum alone has no destination to measure against. Either way the answer is false
 * and Desired Areas behaviour is untouched.
 */
export function isCommuteMode(
  anchorPlaceId: string | null | undefined,
  maxMinutes: number | null | undefined,
): boolean {
  if (!anchorPlaceId || !String(anchorPlaceId).trim()) return false
  if (maxMinutes === null || maxMinutes === undefined) return false
  const n = Number(maxMinutes)
  return Number.isFinite(n) && n > 0
}

/** Straight-line prefilter radius for a drive-time requirement, in metres. */
export function prefilterRadiusMeters(maxMinutes: number): number {
  const n = Number(maxMinutes)
  if (!Number.isFinite(n) || n <= 0) return 0
  return Math.min(Math.round(n * KM_PER_MINUTE * 1000), MAX_PREFILTER_METERS)
}

/** Great-circle metres between two points. */
export function metresBetween(a: LatLng, b: LatLng): number {
  const R = 6_371_000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

/**
 * A latitude/longitude box that CONTAINS the prefilter circle.
 *
 * Used to narrow the catalog query in SQL (an indexable range scan) before the exact
 * circle is applied in memory. A box is strictly larger than its circle, so this can
 * only over-fetch — never exclude a property inside the radius.
 */
export function boundingBox(center: LatLng, radiusMeters: number) {
  const latDelta = radiusMeters / 111_320
  // Longitude degrees shrink with latitude; guard the pole case so cos never hits 0.
  const cos = Math.max(Math.cos((center.lat * Math.PI) / 180), 0.01)
  const lngDelta = radiusMeters / (111_320 * cos)
  return {
    minLat: center.lat - latDelta,
    maxLat: center.lat + latDelta,
    minLng: center.lng - lngDelta,
    maxLng: center.lng + lngDelta,
  }
}

/** Does this verified drive time satisfy the client's maximum? */
export function meetsCommute(minutes: number | null | undefined, maxMinutes: number): boolean {
  if (minutes === null || minutes === undefined) return false
  const n = Number(minutes)
  if (!Number.isFinite(n) || n <= 0) return false
  return n <= Number(maxMinutes)
}

/** The reason line shown on a commute-qualified property. Factual, never a score. */
export function commuteMatchReason(minutes: number, anchorLabel: string | null | undefined): string {
  const place = (anchorLabel ?? "").trim()
  return place ? `${minutes} min to ${place}` : `${minutes} min to your destination`
}
