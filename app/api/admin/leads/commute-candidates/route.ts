import { NextResponse, type NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { driveTimesToAnchor, RoutesConfigError } from "@/lib/commute/routes"
import {
  isCommuteMode,
  prefilterRadiusMeters,
  boundingBox,
  metresBetween,
  meetsCommute,
} from "@/lib/propertyExplorer/commuteMode"

// POST /api/admin/leads/commute-candidates  { leadId }
//
// The candidate pool for a client in COMMUTE MODE: every catalogued property whose
// Google Routes drive time to their anchor is at or under their stated maximum.
//
// WHY THIS EXISTS. Unleash decides where to search from Desired Areas, which for some
// clients is the wrong representation of the requirement. Ka'Leah's areas said
// "Southtown"; her requirement was "within ~20 minutes of Fort Sam". Altitude at
// Brooks — a real fit, verified at 19 minutes — is 9.1 km from the Southtown centroid,
// so no 3 km area search could reach it.
//
// THREE STAGES, and only the last one qualifies anything:
//   1. prefilter   straight-line radius = minutes × 0.9 km, as a bounding box then an
//                  exact circle. Cheap, no API, and deliberately WIDER than the worst
//                  measured case so it cannot exclude a property Routes would accept.
//   2. verify      ONE computeRouteMatrix per 100 properties (lib/commute/routes.ts),
//                  place_id on both ends — the same module and the same figures the
//                  "12 min to Fort Sam" reason already uses.
//   3. qualify     keep drive time <= the client's maximum. This is the only test
//                  that grants anything; the radius grants nothing.
//
// WHY PLACES IS NOT USED HERE. searchNearby caps at 20 results per call at ANY radius,
// so widening it is useless: swept 3 → 50 km around Fort Sam under both POPULARITY and
// DISTANCE and Altitude at Brooks appeared at none of them. property_catalog has
// latitude/longitude on 4,200 of 4,202 rows, so the pool comes from there at zero API
// cost. The trade-off is honest and worth stating: this pool can only contain
// properties already in the catalog.
//
// AUTH: the caller's OWN Supabase session, never the service role — same model as
// /api/admin/leads/commute. The leads read is RLS-scoped, so another workspace's
// client cannot be read.
//
// READ-ONLY. Computes and returns; writes nothing. No cache yet — deliberately, so
// there is one obvious place to add one once the shape has settled.

export const runtime = "nodejs"

/** Routes is cheap but not free; refuse absurd pools rather than fan out silently. */
const MAX_PREFILTERED = 600

type CatalogRow = {
  place_id: string | null
  property_name: string | null
  city: string | null
  address: string | null
  latitude: number | null
  longitude: number | null
  neighborhood: string | null
  location: string | null
  location_keywords: string[] | null
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

  let body: unknown
  try {
    body = await req.json()
  } catch {
    body = {}
  }
  const leadId = Number((body as { leadId?: unknown } | null)?.leadId)
  if (!Number.isInteger(leadId) || leadId <= 0) {
    return NextResponse.json({ error: "valid leadId required" }, { status: 400 })
  }

  // `select("*")` on purpose: commute_max_minutes may not exist yet in a given
  // environment, and naming it would turn a pending migration into a 500. Absent
  // column ⇒ undefined ⇒ not Commute Mode ⇒ the caller falls back to Area Mode.
  const { data: lead, error: leadErr } = await supabase
    .from("leads")
    .select("*")
    .eq("id", leadId)
    .maybeSingle()
  if (leadErr) return NextResponse.json({ error: leadErr.message }, { status: 400 })
  if (!lead) return NextResponse.json({ error: "lead not found" }, { status: 404 })

  const anchorPlaceId = (lead as Record<string, unknown>).commute_anchor_place_id as string | null
  const anchorLabel = (lead as Record<string, unknown>).commute_anchor_label as string | null
  const maxMinutes = (lead as Record<string, unknown>).commute_max_minutes as number | null | undefined

  if (!isCommuteMode(anchorPlaceId, maxMinutes)) {
    // Not an error — the overwhelmingly common case. The caller uses Area Mode.
    return NextResponse.json({ commuteMode: false, candidates: [] })
  }
  const max = Number(maxMinutes)

  // ── 1. Anchor coordinates, for the prefilter only ─────────────────────────
  // The anchor's place_id is what Routes uses; these coordinates are used ONLY to
  // narrow the catalog. A large destination has no single point (the reason
  // lib/commute/routes.ts insists on place_ids), which is exactly why they never
  // qualify anything here.
  const key = process.env.GOOGLE_PLACES_API_KEY
  if (!key) return NextResponse.json({ error: "commute lookup is not configured" }, { status: 503 })
  let anchor: { lat: number; lng: number }
  try {
    const r = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(anchorPlaceId!)}`, {
      headers: { "X-Goog-Api-Key": key, "X-Goog-FieldMask": "location" },
    })
    if (!r.ok) throw new Error(`place lookup ${r.status}`)
    const j = (await r.json()) as { location?: { latitude?: number; longitude?: number } }
    if (typeof j.location?.latitude !== "number" || typeof j.location?.longitude !== "number") {
      throw new Error("anchor has no coordinates")
    }
    anchor = { lat: j.location.latitude, lng: j.location.longitude }
  } catch (e) {
    return NextResponse.json(
      { error: `could not locate the commute destination: ${(e as Error).message}` },
      { status: 502 },
    )
  }

  // ── 2. Prefilter the catalog: bounding box in SQL, exact circle in memory ──
  const radius = prefilterRadiusMeters(max)
  const box = boundingBox(anchor, radius)
  const { data: rows, error: catErr } = await supabase
    .from("property_catalog")
    .select("place_id,property_name,city,address,latitude,longitude,neighborhood,location,location_keywords")
    .gte("latitude", box.minLat)
    .lte("latitude", box.maxLat)
    .gte("longitude", box.minLng)
    .lte("longitude", box.maxLng)
    .limit(2000)
  if (catErr) return NextResponse.json({ error: catErr.message }, { status: 400 })

  const prefiltered = ((rows ?? []) as CatalogRow[])
    .filter((r) => r.place_id && r.latitude != null && r.longitude != null)
    .map((r) => ({ row: r, straightLineM: Math.round(metresBetween(anchor, { lat: r.latitude!, lng: r.longitude! })) }))
    .filter((x) => x.straightLineM <= radius)
    .sort((a, b) => a.straightLineM - b.straightLineM)

  if (prefiltered.length > MAX_PREFILTERED) {
    return NextResponse.json(
      {
        error: `${prefiltered.length} properties within ${Math.round(radius / 1000)} km exceeds the ${MAX_PREFILTERED} this route will verify in one request`,
        commuteMode: true,
        prefiltered: prefiltered.length,
      },
      { status: 413 },
    )
  }

  // ── 3. Verify with Routes — the only step that qualifies ──────────────────
  let verified: Array<{ propertyKey: string; minutes: number | null }>
  try {
    verified = await driveTimesToAnchor(
      prefiltered.map((x) => `pid:${x.row.place_id}`),
      anchorPlaceId!,
    )
  } catch (e) {
    if (e instanceof RoutesConfigError) {
      return NextResponse.json({ error: "commute lookup is not configured" }, { status: 503 })
    }
    return NextResponse.json({ error: `Routes failed: ${(e as Error).message}` }, { status: 502 })
  }
  const minutesByKey = new Map(verified.map((v) => [v.propertyKey, v.minutes]))

  const candidates = prefiltered
    .map((x) => {
      const minutes = minutesByKey.get(`pid:${x.row.place_id}`) ?? null
      return { ...x, minutes }
    })
    .filter((x) => meetsCommute(x.minutes, max))
    .sort((a, b) => (a.minutes ?? 9999) - (b.minutes ?? 9999))
    .map((x) => ({
      placeId: x.row.place_id!,
      propertyName: x.row.property_name ?? "",
      propertyAddress: x.row.address ?? null,
      city: x.row.city ?? null,
      lat: x.row.latitude!,
      lng: x.row.longitude!,
      neighborhood: x.row.neighborhood ?? null,
      location: x.row.location ?? null,
      locationKeywords: x.row.location_keywords ?? [],
      commuteMinutes: x.minutes!,
      straightLineM: x.straightLineM,
    }))

  return NextResponse.json({
    commuteMode: true,
    anchorLabel: anchorLabel ?? null,
    maxMinutes: max,
    prefilterRadiusM: radius,
    prefiltered: prefiltered.length,
    verified: verified.length,
    qualified: candidates.length,
    candidates,
  })
}
