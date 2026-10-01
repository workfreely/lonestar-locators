// Google Routes — drive time from properties to a client's commute anchor.
//
// SERVER ONLY. NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is referer-restricted (browser use
// only) and would be rejected here; GOOGLE_PLACES_API_KEY is the unrestricted server
// key the offline intel scripts already use. Keeping this module server-side also
// keeps the key out of the bundle.
//
// PLACE IDs ON BOTH ENDS, never coordinates. A large destination has no single
// point: a guessed lat/lng for Fort Sam Houston returned 12 minutes where the
// locator's own Google Maps said 10. The place_id is what reproduces the figure a
// locator would quote to a client, which is the only figure worth showing them.
//
// One computeRouteMatrix call covers up to MAX_ORIGINS properties (measured: 7
// origins → 1 destination in 126ms), so the Favorites/Recommendations case costs a
// single request rather than one per property. Commute Mode passes a whole metro's
// prefiltered inventory and therefore batches — see MAX_ORIGINS for why the batch is
// 49 and not 625.

/**
 * Routes caps a matrix at 625 ELEMENTS, but separately caps "Addresses and Place IDs"
 * at 50 — and this module deliberately uses place_ids on both ends, so the binding
 * limit is 50, not 625: 49 origins plus the one destination.
 *
 * This was previously 100, which had never been reached because the only caller passed
 * a client's Favorites and Recommendations (a handful of properties). Commute Mode
 * passes hundreds, and 100 place_ids returns
 * "The total number of Addresses and Place IDs in the request must be <= 50".
 *
 * WHY NOT SWITCH THE ORIGINS TO COORDINATES, which would lift the cap to 625 in one
 * call? Because the figure changes. Measured for Altitude at Brooks → Fort Sam:
 * place_id origin 20 min, coordinate origin 21 min. Against a client's stated 20-minute
 * maximum that is the difference between qualifying and not — and the number used to
 * QUALIFY a property must be the same number shown in its "20 min to Fort Sam" reason,
 * or a property could be starred on one figure and explained with another.
 */
const MAX_ORIGINS = 49

export type CommuteResult = {
  /** 'pid:<place id>' — the canonical key the caller passed in, echoed back. */
  propertyKey: string
  /** Whole minutes, or null when Routes found no drivable route. */
  minutes: number | null
}

export class RoutesConfigError extends Error {}

/**
 * Drive time from each property to one destination.
 *
 * Never throws for a single unroutable property — that row comes back with
 * `minutes: null` and the caller simply stores no commute for it. Throws only when
 * the whole request fails (misconfigured key, Routes outage), so a caller can tell
 * "this property has no route" apart from "nothing was computed at all".
 */
export async function driveTimesToAnchor(
  propertyKeys: string[],
  anchorPlaceId: string,
): Promise<CommuteResult[]> {
  const key = process.env.GOOGLE_PLACES_API_KEY
  if (!key) throw new RoutesConfigError("GOOGLE_PLACES_API_KEY is not set")
  if (!anchorPlaceId || propertyKeys.length === 0) return []

  const out: CommuteResult[] = []
  for (let i = 0; i < propertyKeys.length; i += MAX_ORIGINS) {
    const batch = propertyKeys.slice(i, i + MAX_ORIGINS)
    const res = await fetch("https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": "originIndex,duration,condition",
      },
      body: JSON.stringify({
        origins: batch.map((k) => ({ waypoint: { placeId: placeIdFromKey(k) } })),
        destinations: [{ waypoint: { placeId: anchorPlaceId } }],
        travelMode: "DRIVE",
        // TRAFFIC_UNAWARE deliberately: the figure is cached and shown for days, so
        // a live-traffic number would be wrong within the hour and would also make
        // the same property's time change every time it was recomputed.
        routingPreference: "TRAFFIC_UNAWARE",
      }),
    })
    if (!res.ok) {
      throw new Error(`Routes computeRouteMatrix failed: ${res.status} ${(await res.text()).slice(0, 300)}`)
    }
    const rows = (await res.json()) as Array<{ originIndex?: number; duration?: string; condition?: string }>
    const byIndex = new Map<number, { duration?: string; condition?: string }>()
    for (const r of rows ?? []) if (typeof r.originIndex === "number") byIndex.set(r.originIndex, r)
    batch.forEach((propertyKey, idx) => {
      const row = byIndex.get(idx)
      out.push({ propertyKey, minutes: row?.condition === "ROUTE_EXISTS" ? parseMinutes(row.duration) : null })
    })
  }
  return out
}

/** 'pid:ChIJ…' → 'ChIJ…'. Both collections store the prefixed form. */
export function placeIdFromKey(canonicalPropertyKey: string): string {
  return String(canonicalPropertyKey).replace(/^pid:/, "")
}

/** Routes returns seconds as a string like "1234s". */
function parseMinutes(duration: string | undefined): number | null {
  if (!duration) return null
  const secs = parseInt(String(duration), 10)
  if (!Number.isFinite(secs) || secs <= 0) return null
  return Math.round(secs / 60)
}
