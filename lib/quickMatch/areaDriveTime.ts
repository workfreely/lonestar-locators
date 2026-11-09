// Quick Match — a real driving time from a property to the area the client asked for.
//
// SERVER ONLY. It reaches Google through the EXISTING Routes caller and caches into the EXISTING
// durable landmark cache. There is no second routing system here and no second cache:
//
//     lib/commute/routes.ts  driveTimesToAnchor()   the one computeRouteMatrix caller in the app
//     property_landmark_metrics                     the table built for property → landmark times
//
// ── THE CACHE IS CHECKED FIRST, ALWAYS ──────────────────────────────────────────────────────
// Every pair is looked up before anything is computed, and Google is asked ONLY about the pairs
// with no cached figure. A client whose drive times are already cached costs zero requests, so
// this is safe to call on every backfill without it becoming a per-click Google bill. The cache
// key is (property place_id, landmark_id, traffic_mode) — the reference point is part of the key,
// so changing a requested area's approved reference invalidates only that area's rows.
//
// ── ONE REQUEST PER DESTINATION, NOT PER PROPERTY ───────────────────────────────────────────
// driveTimesToAnchor takes many origins and one destination, so the pairs are grouped by
// reference point and each group costs a single request (up to 49 origins). A client with six
// properties across two requested areas costs two requests, not six.
//
// ── WHY MINUTES ARE STORED AS minutes * 60 ──────────────────────────────────────────────────
// `drive_seconds` is the column; the shared Routes module returns WHOLE MINUTES, already rounded,
// and widening its return type would mean editing a module Unleash Beast's Commute Mode depends
// on. So the figure stored is the figure displayed, re-expressed in seconds. It is NOT sub-minute
// precision and must not be read as if it were. The offline routes_matrix_job writes true seconds
// into the same column; the two are distinguishable by `source` nowhere, so treat any value here
// as accurate to the minute.
//
// ── WRITES ARE AN OPTIMISATION, NEVER A REQUIREMENT ─────────────────────────────────────────
// A failed cache read or a failed cache write never fails the caller: the drive time is still
// returned and used. The worst outcome of a cache failure is paying Google again next time.
import type { SupabaseClient } from "@supabase/supabase-js"
import { driveTimesToAnchor, RoutesConfigError } from "@/lib/commute/routes"
import { referenceForArea, type AreaReference } from "./areaReference"

/** One property and the requested area we want its drive time to. */
export type DriveTimeRequest = {
  /** The property's own Google place_id, WITHOUT the 'pid:' prefix. */
  propertyPlaceId: string
  /** The client's own label for the area, e.g. "Medical Center". */
  areaLabel: string
}

export type DriveTimeMiss = {
  propertyPlaceId: string
  areaLabel: string
  /** no_reference — nobody has approved a reference point for this area.
   *  landmark_missing — the approved reference is not in the landmark bank.
   *  no_route — Routes found no drivable route.
   *  routes_failed — the whole request failed; nothing was learned. */
  why: "no_reference" | "landmark_missing" | "no_route" | "routes_failed"
}

export type DriveTimeAnswer = {
  minutes: number
  areaLabel: string
  reference: AreaReference
}

export type DriveTimeOutcome = {
  /** property place_id → the answer, for pairs that have one. */
  byProperty: Map<string, DriveTimeAnswer>
  /** Pairs with no usable figure, each with the reason. */
  misses: DriveTimeMiss[]
  fromCache: number
  computed: number
  /** How many computeRouteMatrix requests were actually issued. */
  routesRequests: number
}

type LandmarkRow = { id: string; google_place_id: string | null }
type MetricRow = { place_id: string; landmark_id: string; drive_seconds: number | null }

/**
 * Driving times from each property to the approved reference point for its requested area.
 *
 * ── THE SERVICE ROLE LIVES HERE, AND ONLY HERE ──────────────────────────────────────────────
 * `property_landmark_metrics` and `location_landmarks` have RLS enabled with NO POLICIES, so
 * they are unreadable under a user session and the service role is the only way to reach them.
 * Confining it to this module is deliberate: these two are GLOBAL property tables holding no
 * client-scoped data, so no authorization boundary moves — and the route that calls this still
 * authenticates its caller and reads and writes every client-scoped row through that caller's
 * OWN session. `scripts/tests/quickMatch.test.ts` asserts the route itself never reaches for the
 * service role, and that assertion stays true because of this arrangement.
 *
 * The import is LAZY, the same pattern scripts/locationIntel/routes_matrix_job.ts uses, so
 * merely importing this module does not construct a privileged client — which is also what lets
 * a test inject a fake one through `admin` and never touch the real credentials.
 */
export async function resolveAreaDriveTimes(
  market: string | null | undefined,
  requests: DriveTimeRequest[],
  injectedAdmin?: SupabaseClient,
): Promise<DriveTimeOutcome> {
  const byProperty = new Map<string, DriveTimeAnswer>()
  const misses: DriveTimeMiss[] = []
  let fromCache = 0
  let computed = 0
  let routesRequests = 0
  if (requests.length === 0) return { byProperty, misses, fromCache, computed, routesRequests }

  const admin = injectedAdmin ?? (await import("@/lib/supabase/admin")).supabaseAdmin

  // ── Group by the reference point, so each destination costs one request ──────────────
  const groups = new Map<string, { reference: AreaReference; areaLabel: string; placeIds: string[] }>()
  for (const req of requests) {
    const reference = referenceForArea(market, req.areaLabel)
    if (!reference) {
      misses.push({ propertyPlaceId: req.propertyPlaceId, areaLabel: req.areaLabel, why: "no_reference" })
      continue
    }
    const g = groups.get(reference.placeId)
    if (g) g.placeIds.push(req.propertyPlaceId)
    else groups.set(reference.placeId, { reference, areaLabel: req.areaLabel, placeIds: [req.propertyPlaceId] })
  }
  if (groups.size === 0) return { byProperty, misses, fromCache, computed, routesRequests }

  // ── The landmark rows behind those reference points ──────────────────────────────────
  const { data: landmarks, error: lmErr } = await admin
    .from("location_landmarks")
    .select("id, google_place_id")
    .in("google_place_id", [...groups.keys()])
  if (lmErr) {
    console.error("[quick-match] area drive time: landmark read failed:", lmErr.message)
    for (const g of groups.values()) {
      for (const propertyPlaceId of g.placeIds) {
        misses.push({ propertyPlaceId, areaLabel: g.areaLabel, why: "landmark_missing" })
      }
    }
    return { byProperty, misses, fromCache, computed, routesRequests }
  }
  const landmarkIdByPlace = new Map<string, string>()
  for (const row of (landmarks ?? []) as LandmarkRow[]) {
    if (row.google_place_id) landmarkIdByPlace.set(row.google_place_id, row.id)
  }

  for (const [referencePlaceId, group] of groups) {
    const landmarkId = landmarkIdByPlace.get(referencePlaceId)
    if (!landmarkId) {
      // The approved reference is not in the bank. Nothing is invented and nothing is inserted
      // on the fly — a reference point is curated data, added deliberately.
      for (const propertyPlaceId of group.placeIds) {
        misses.push({ propertyPlaceId, areaLabel: group.areaLabel, why: "landmark_missing" })
      }
      continue
    }

    // ── What is already cached ─────────────────────────────────────────────────────────
    const cached = new Map<string, number>()
    const { data: metrics, error: mErr } = await admin
      .from("property_landmark_metrics")
      .select("place_id, landmark_id, drive_seconds")
      .eq("landmark_id", landmarkId)
      .eq("traffic_mode", "none")
      .in("place_id", group.placeIds)
    if (mErr) {
      // Not fatal: we simply do not know what is cached, so everything is recomputed.
      console.warn("[quick-match] area drive time: cache read failed:", mErr.message)
    }
    for (const row of (metrics ?? []) as MetricRow[]) {
      if (typeof row.drive_seconds === "number" && row.drive_seconds > 0) {
        cached.set(row.place_id, Math.round(row.drive_seconds / 60))
      }
    }

    for (const propertyPlaceId of group.placeIds) {
      const hit = cached.get(propertyPlaceId)
      if (hit != null && hit > 0) {
        byProperty.set(propertyPlaceId, { minutes: hit, areaLabel: group.areaLabel, reference: group.reference })
        fromCache += 1
      }
    }

    const stale = group.placeIds.filter((id) => !byProperty.has(id))
    if (stale.length === 0) continue

    // ── Google, only for the pairs with no cached figure ───────────────────────────────
    let results: Awaited<ReturnType<typeof driveTimesToAnchor>> = []
    try {
      results = await driveTimesToAnchor(stale.map((id) => `pid:${id}`), referencePlaceId)
      routesRequests += 1
    } catch (err) {
      if (err instanceof RoutesConfigError) {
        console.error("[quick-match] area drive time: Routes not configured")
      } else {
        console.error("[quick-match] area drive time: Routes failed:", err)
      }
      for (const propertyPlaceId of stale) {
        misses.push({ propertyPlaceId, areaLabel: group.areaLabel, why: "routes_failed" })
      }
      continue
    }

    const insert: Array<Record<string, unknown>> = []
    const now = new Date().toISOString()
    for (const { propertyKey, minutes } of results) {
      const propertyPlaceId = propertyKey.replace(/^pid:/, "")
      if (minutes == null || minutes <= 0) {
        misses.push({ propertyPlaceId, areaLabel: group.areaLabel, why: "no_route" })
        continue
      }
      byProperty.set(propertyPlaceId, { minutes, areaLabel: group.areaLabel, reference: group.reference })
      computed += 1
      insert.push({
        place_id: propertyPlaceId,
        landmark_id: landmarkId,
        drive_seconds: minutes * 60,
        traffic_mode: "none",
        computed_at: now,
      })
    }

    // ── Cache the new figures ──────────────────────────────────────────────────────────
    //
    // A plain INSERT of the MISSES only, never an upsert. The unique index
    // `plm_landmark_uniq` is PARTIAL (`where landmark_id is not null`), and Postgres will not
    // infer a partial index as an ON CONFLICT arbiter without the matching predicate, which
    // PostgREST cannot send. Since every row here is one the cache read just proved absent,
    // there is nothing to conflict with — and if a concurrent run inserted it first, the
    // duplicate-key error is logged and ignored, because the figure is already returned above.
    if (insert.length > 0) {
      const { error: insErr } = await admin.from("property_landmark_metrics").insert(insert)
      if (insErr) console.warn("[quick-match] area drive time: cache write skipped:", insErr.message)
    }
  }

  return { byProperty, misses, fromCache, computed, routesRequests }
}
