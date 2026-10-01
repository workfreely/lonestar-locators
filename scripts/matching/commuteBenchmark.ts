// THE KA'LEAH BENCHMARK — end-to-end, against live data. READ-ONLY.
//
// Runs the real Commute Mode pipeline for lead 84 and reports whether Altitude at
// Brooks enters the candidate pool and earns a location match:
//
//   anchor place_id → prefilter radius → property_catalog → Routes verification
//     → assessLocationFit → computeSuggestions
//
// It calls the same modules the API route calls (lib/commute/routes.ts for the
// verification, lib/propertyExplorer/commuteMode.ts for the geometry), so a pass here
// means the pipeline works on real data — not that a mock agreed with itself.
//
// WORKS BEFORE THE MIGRATION. `commute_max_minutes` is read from the lead when the
// column exists, and otherwise supplied by --max so the benchmark can be run before
// the column is applied. It writes nothing either way.
//
// Usage:
//   npx tsx scripts/matching/commuteBenchmark.ts            uses the stored max, else 20
//   npx tsx scripts/matching/commuteBenchmark.ts --max 20   force a maximum
import { readFileSync } from "node:fs"
import { createClient } from "@supabase/supabase-js"
import { driveTimesToAnchor } from "@/lib/commute/routes"
import {
  isCommuteMode,
  prefilterRadiusMeters,
  boundingBox,
  metresBetween,
  meetsCommute,
} from "@/lib/propertyExplorer/commuteMode"
import { assessLocationFit } from "@/lib/propertyExplorer/locationFit"
import { computeSuggestions, MAX_SUGGESTIONS } from "@/lib/propertyExplorer/suggestions"
import { composeDesiredAreas } from "@/lib/propertyExplorer/multiArea"
import type { ExplorerProperty } from "@/lib/propertyExplorer/types"

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  if (!line.includes("=") || line.trimStart().startsWith("#")) continue
  const k = line.slice(0, line.indexOf("=")).trim()
  if (!process.env[k]) process.env[k] = line.slice(line.indexOf("=") + 1).trim()
}
const KEY = process.env.GOOGLE_PLACES_API_KEY!
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

const LEAD_ID = 84
const ALTITUDE = "ChIJt50tPlT3XIYRpEb54VDa9eg"

async function main() {
  const { data: lead, error } = await db.from("leads").select("*").eq("id", LEAD_ID).maybeSingle()
  if (error) throw new Error(error.message)
  if (!lead) throw new Error(`lead ${LEAD_ID} not found`)
  const l = lead as Record<string, unknown>

  const argMax = process.argv.indexOf("--max")
  const storedMax = l.commute_max_minutes as number | null | undefined
  const max = argMax > 0 ? Number(process.argv[argMax + 1]) : (storedMax ?? 20)
  const anchorPlaceId = l.commute_anchor_place_id as string | null
  const anchorLabel = l.commute_anchor_label as string | null

  console.log("═".repeat(88))
  console.log(`KA'LEAH BENCHMARK — lead ${LEAD_ID} ${l.first_name}`)
  console.log("═".repeat(88))
  console.log(`  city                    ${l.city}`)
  console.log(`  desired areas           ${JSON.stringify(composeDesiredAreas(l.neighborhoods as string, l.submarkets as string))}`)
  console.log(`  commute anchor          ${anchorLabel} (${anchorPlaceId})`)
  console.log(`  commute_max_minutes     ${storedMax === undefined ? "column not yet applied" : JSON.stringify(storedMax)}`)
  console.log(`  maximum used here       ${max} min${argMax > 0 ? "  (--max)" : storedMax == null ? "  (default for the benchmark)" : "  (stored)"}`)
  console.log(`  Commute Mode would be   ${isCommuteMode(anchorPlaceId, storedMax) ? "ON" : "OFF — set commute_max_minutes to turn it on"}`)

  if (!anchorPlaceId) throw new Error("this lead has no commute anchor")

  // ── 1. Anchor coordinates — prefilter only, never qualification ───────────
  const pr = await fetch(`https://places.googleapis.com/v1/places/${anchorPlaceId}`, {
    headers: { "X-Goog-Api-Key": KEY, "X-Goog-FieldMask": "id,displayName,formattedAddress,location" },
  })
  const place = (await pr.json()) as { displayName?: { text?: string }; formattedAddress?: string; location: { latitude: number; longitude: number } }
  const anchor = { lat: place.location.latitude, lng: place.location.longitude }
  console.log(`\n  anchor resolves to      ${place.displayName?.text} — ${place.formattedAddress}`)

  // ── 2. Prefilter ──────────────────────────────────────────────────────────
  const radius = prefilterRadiusMeters(max)
  const box = boundingBox(anchor, radius)
  const rows: Array<Record<string, unknown>> = []
  let from = 0
  for (;;) {
    const { data } = await db
      .from("property_catalog")
      .select("place_id,property_name,city,address,latitude,longitude,neighborhood,location,location_keywords")
      .gte("latitude", box.minLat).lte("latitude", box.maxLat)
      .gte("longitude", box.minLng).lte("longitude", box.maxLng)
      .range(from, from + 999)
    const b = data ?? []
    rows.push(...b)
    if (b.length < 1000) break
    from += 1000
  }
  const prefiltered = rows
    .filter((r) => r.place_id && r.latitude != null && r.longitude != null)
    .map((r) => ({ r, m: Math.round(metresBetween(anchor, { lat: r.latitude as number, lng: r.longitude as number })) }))
    .filter((x) => x.m <= radius)
    .sort((a, b2) => a.m - b2.m)

  console.log(`\n  STAGE 1 — prefilter`)
  console.log(`     radius            ${(radius / 1000).toFixed(1)} km  (${max} min × 0.9 km/min)`)
  console.log(`     bounding box      ${rows.length} catalog rows`)
  console.log(`     inside the circle ${prefiltered.length}`)
  const altPre = prefiltered.find((x) => x.r.place_id === ALTITUDE)
  console.log(`     Altitude at Brooks ${altPre ? `IN, at ${(altPre.m / 1000).toFixed(2)} km` : "NOT in the prefilter"}`)

  // ── 3. Routes verification — the only qualifying step ─────────────────────
  const t0 = Date.now()
  const verified = await driveTimesToAnchor(prefiltered.map((x) => `pid:${x.r.place_id}`), anchorPlaceId)
  const ms = Date.now() - t0
  const minutesByKey = new Map(verified.map((v) => [v.propertyKey, v.minutes]))
  const qualified = prefiltered
    .map((x) => ({ ...x, minutes: minutesByKey.get(`pid:${x.r.place_id}`) ?? null }))
    .filter((x) => meetsCommute(x.minutes, max))
    .sort((a, b2) => (a.minutes ?? 9999) - (b2.minutes ?? 9999))

  console.log(`\n  STAGE 2 — Routes verification (the only step that qualifies)`)
  // 49, not 100: place_id waypoints are capped at 50 total per request (see
  // lib/commute/routes.ts MAX_ORIGINS).
  console.log(`     elements          ${prefiltered.length} in ${Math.ceil(prefiltered.length / 49)} call(s), ${ms} ms`)
  console.log(`     routed            ${verified.filter((v) => v.minutes != null).length}`)
  console.log(`     within ${max} min      ${qualified.length}`)
  console.log(`     discarded as too far ${prefiltered.length - qualified.length}`)

  // ── 4. Qualification through the REAL matcher ─────────────────────────────
  const client = {
    id: LEAD_ID,
    city: l.city as string,
    desiredAreas: composeDesiredAreas(l.neighborhoods as string, l.submarkets as string) || null,
    commuteAnchorPlaceId: anchorPlaceId,
    commuteAnchorLabel: anchorLabel,
    commuteMaxMinutes: max,
  }
  const properties = qualified.map((x) => ({
    placeId: x.r.place_id as string, propertyId: x.r.place_id as string,
    propertyName: (x.r.property_name as string) ?? "",
    propertyAddress: (x.r.address as string) ?? null,
    propertyUrl: "", lat: x.r.latitude as number, lng: x.r.longitude as number,
    source: "google_places", marketSlug: "san-antonio",
    neighborhood: (x.r.neighborhood as string) ?? null,
    location: (x.r.location as string) ?? null,
    locationKeywords: (x.r.location_keywords as string[]) ?? [],
    commuteMinutes: x.minutes as number,
  })) as ExplorerProperty[]

  const fits = properties.map((p) => ({ p, fit: assessLocationFit(p, client) }))
  const matches = fits.filter((f) => f.fit?.tone === "match")
  const starred = computeSuggestions(properties, client)

  console.log(`\n  STAGE 3 — assessLocationFit + computeSuggestions (unchanged modules)`)
  console.log(`     candidate pool    ${properties.length}`)
  console.log(`     location matches  ${matches.length}`)
  console.log(`     BEAST MATCHES     ${starred.size}  (cap ${MAX_SUGGESTIONS})`)

  console.log(`\n  STARRED:`)
  for (const [pid, s] of starred) {
    const p = properties.find((x) => x.placeId === pid)!
    const flag = pid === ALTITUDE ? " ◀ ALTITUDE AT BROOKS" : ""
    console.log(`     ${String(p.propertyName).slice(0, 44).padEnd(44)} ${s.reason}${flag}`)
  }

  const alt = fits.find((f) => f.p.placeId === ALTITUDE)
  console.log(`\n${"═".repeat(88)}`)
  console.log("THE BENCHMARK")
  console.log("═".repeat(88))
  if (!alt) {
    console.log(`  ✗ Altitude at Brooks did NOT enter the candidate pool`)
    process.exit(1)
  }
  console.log(`  Altitude at Brooks`)
  console.log(`     straight-line     ${(altPre!.m / 1000).toFixed(2)} km`)
  console.log(`     VERIFIED drive    ${alt.p.commuteMinutes} min  (max ${max})`)
  console.log(`     fit               ${alt.fit?.label} · tone ${alt.fit?.tone} · rank ${alt.fit?.rank}`)
  console.log(`     reason            ${alt.fit?.reason}`)
  const rank = qualified.findIndex((x) => x.r.place_id === ALTITUDE) + 1
  console.log(`     position          ${rank} of ${qualified.length} qualified, ordered by drive time`)
  console.log(`     starred           ${starred.has(ALTITUDE) ? "YES" : `no — ${qualified.length} properties qualify and the cap is ${MAX_SUGGESTIONS}`}`)

  // THE BENCHMARK AS SET: does candidate generation let Beast CONSIDER it, and does it
  // earn the location match? Ranking #1 was explicitly not required in this pass, and
  // ordering among equally-qualified commute matches is a weighting question that has
  // not been designed — so starring is REPORTED, never asserted.
  const ok = alt.fit?.tone === "match" && alt.fit.label === "Commute Match"
  console.log(`\n  ${ok ? "✓ PASS — it is in the pool and has earned a location match" : "✗ FAIL — it did not earn a location match"}`)
  if (ok && !starred.has(ALTITUDE)) {
    console.log(`\n  NOTE — not in the top ${MAX_SUGGESTIONS}. Every one of the ${qualified.length} qualified properties is rank 0,`)
    console.log(`  so computeSuggestions keeps the first ${MAX_SUGGESTIONS} in the order the pool arrived — which this`)
    console.log(`  route sorts by drive time, making the nearest win. That ordering is an emergent`)
    console.log(`  consequence of the pool's sort order, NOT a designed preference. Deciding how`)
    console.log(`  commute matches should order among themselves (and against Desired Areas as a`)
    console.log(`  secondary signal) is the weighting question deferred out of this pass.`)
  }
  process.exit(ok ? 0 : 1)
}

main().catch((e) => { console.error("FATAL:", e.message); process.exit(1) })
