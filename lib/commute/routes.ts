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
// One computeRouteMatrix call covers every property for a client (measured: 7
// origins → 1 destination in 126ms), so a whole client costs a single request
// rather than one per property.

/** Routes caps a matrix at 625 elements; with one destination that is 625 origins. */
const MAX_ORIGINS = 100

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
