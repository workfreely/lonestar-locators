// PREPARED, NOT RUN. Durable non-traffic drive-time baseline.
// Property (lat/lng) → RESOLVED curated landmark (Place ID) → Google Routes
// Compute Route Matrix (TRAFFIC_UNAWARE) → public.property_landmark_metrics (traffic_mode='none').
// Batched ≤625 elements/request. Default prints element count + cost and REFUSES to run if the
// estimate exceeds --budget; pass --confirm to spend. Traffic-aware ('best_guess') is a SEPARATE
// on-demand path, not this durable baseline.
// Run: npx tsx scripts/locationIntel/routes_matrix_job.ts --market=San\ Antonio [--maxLandmarks=8] [--budget=50] [--confirm]
import fs from "node:fs"; import path from "node:path"
;(() => { const p = path.join(process.cwd(), ".env.local"); for (const l of fs.readFileSync(p, "utf8").split("\n")) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "") } })()
const CONFIRM = process.argv.includes("--confirm")
const MARKET = process.argv.find((a) => a.startsWith("--market="))?.split("=")[1] ?? null
const MAX_LM = Number(process.argv.find((a) => a.startsWith("--maxLandmarks="))?.split("=")[1] ?? 0)
const BUDGET = Number(process.argv.find((a) => a.startsWith("--budget="))?.split("=")[1] ?? 50)
// Compute Route Matrix, Basic (TRAFFIC_UNAWARE) ≈ $5 / 1,000 elements. (Traffic-aware ≈ $10/1k.)
const PER_ELEMENT_USD = 0.005
const MAX_ELEMENTS = 625 // Routes hard cap per request (origins × destinations)

async function main() {
  if (!MARKET) { console.error("--market required (one market at a time)"); process.exit(1) }
  const { supabaseAdmin } = await import("@/lib/supabase/admin")
  const key = process.env.GOOGLE_PLACES_API_KEY
  let lq = supabaseAdmin.from("location_landmarks").select("id, name, google_place_id").eq("market", MARKET).eq("is_active", true).not("google_place_id", "is", null)
  const { data: lms } = await lq
  let landmarks = lms ?? []
  if (MAX_LM && landmarks.length > MAX_LM) landmarks = landmarks.slice(0, MAX_LM)
  // Paginate past the 1000-row cap (Dallas/Houston exceed it).
  const props: { place_id: string; latitude: number | null; longitude: number | null }[] = []
  for (let from = 0; ; from += 1000) {
    const { data } = await supabaseAdmin.from("property_catalog").select("place_id, latitude, longitude").eq("market", MARKET).not("latitude", "is", null).order("place_id").range(from, from + 999)
    if (!data || !data.length) break
    props.push(...(data as { place_id: string; latitude: number | null; longitude: number | null }[]))
    if (data.length < 1000) break
  }
  const properties = props.filter((p) => p.latitude != null && p.longitude != null)

  const elements = properties.length * landmarks.length
  const est = elements * PER_ELEMENT_USD
  console.log(`Market ${MARKET}: ${properties.length} properties × ${landmarks.length} RESOLVED landmarks = ${elements} elements`)
  console.log(`Est. Compute Route Matrix (non-traffic) cost ≈ $${est.toFixed(2)}  (budget $${BUDGET})`)
  if (landmarks.length === 0) { console.log("No RESOLVED landmarks for this market yet — run resolve_landmarks first."); return }
  if (!CONFIRM) { console.log("DRY (no --confirm): no Routes calls made."); return }
  if (est > BUDGET) { console.error(`REFUSING: estimate $${est.toFixed(2)} exceeds budget $${BUDGET}. Lower --maxLandmarks or raise --budget.`); process.exit(1) }
  if (!key) { console.error("GOOGLE_PLACES_API_KEY missing"); process.exit(1) }

  const now = new Date().toISOString()
  const destWaypoints = landmarks.map((l) => ({ waypoint: { placeId: l.google_place_id } }))
  const perReqOrigins = Math.max(1, Math.floor(MAX_ELEMENTS / Math.max(1, landmarks.length)))
  let written = 0
  for (let i = 0; i < properties.length; i += perReqOrigins) {
    const batch = properties.slice(i, i + perReqOrigins)
    const body = JSON.stringify({
      origins: batch.map((p) => ({ waypoint: { location: { latLng: { latitude: p.latitude, longitude: p.longitude } } } })),
      destinations: destWaypoints,
      travelMode: "DRIVE", routingPreference: "TRAFFIC_UNAWARE",
    })
    let matrix: { originIndex: number; destinationIndex: number; distanceMeters?: number; duration?: string; condition?: string }[] = []
    try {
      const r = await fetch("https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key, "X-Goog-FieldMask": "originIndex,destinationIndex,distanceMeters,duration,condition" },
        body,
      })
      if (r.ok) matrix = await r.json()
    } catch { /* skip batch */ }
    const upserts = matrix.filter((m) => m.condition === "ROUTE_EXISTS").map((m) => ({
      place_id: batch[m.originIndex].place_id, landmark_id: landmarks[m.destinationIndex].id,
      drive_meters: m.distanceMeters ?? null, drive_seconds: m.duration ? parseInt(m.duration) : null,
      traffic_mode: "none", computed_at: now,
    }))
    if (upserts.length) { await supabaseAdmin.from("property_landmark_metrics").upsert(upserts, { onConflict: "place_id,landmark_id,traffic_mode" }); written += upserts.length }
  }
  console.log(JSON.stringify({ market: MARKET, elements, written }, null, 1))
}
main().catch((e) => { console.error(e); process.exit(1) })
