/**
 * Multi-area Unleash — pure-logic coverage for searching 1–3 desired areas at
 * once. No Google Maps, no DB:
 *   npx tsx scripts/tests/unleash-multi-area.test.ts
 *
 * Covers: market-aware area resolution (1/2/3, cap, unresolved dropped, Nearby
 * Areas count like Neighborhoods, cross-metro disambiguation), Place-ID dedupe,
 * the fan-out count (N areas → N searches), every area reaching ranking, the
 * unresolved-area-fails-safely guarantee, representative market combinations, and
 * a source-level camera-unchanged check on BeastPropertyExplorer.
 */
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"
import {
  resolveDesiredAreaCenters,
  mergeDedupeByPlaceId,
  searchAreas,
  type AreaCenter,
} from "@/lib/propertyExplorer/multiArea"
import { computeSuggestions } from "@/lib/propertyExplorer/suggestions"
import { centerForMarket, centerForDesiredArea } from "@/lib/markets/catalog"
import type { ExplorerProperty } from "@/lib/propertyExplorer/types"

let pass = 0,
  fail = 0
function ok(cond: boolean, name: string) {
  if (cond) pass++
  else {
    fail++
    console.error("✗", name)
  }
}
const eq = (a: unknown, b: unknown, name: string) => ok(a === b, `${name} (got ${JSON.stringify(a)})`)
const near = (a: number, b: number) => Math.abs(a - b) < 1e-9

async function main() {

/** A resolved center matches the catalog centroid for that label+market. */
function isCentroid(c: AreaCenter, label: string, slug: string): boolean {
  const want = centerForDesiredArea(label, slug)
  return !!want && near(c.lat, want.lat) && near(c.lng, want.lng)
}

/** Minimal Places-shaped property for merge/ranking tests. */
const prop = (placeId: string, name: string, address: string | null = null): ExplorerProperty => ({
  placeId,
  propertyId: placeId,
  propertyName: name,
  propertyAddress: address,
  propertyUrl: `https://maps.google/${placeId}`,
  lat: 0,
  lng: 0,
  source: "google_places",
  marketSlug: null,
  searchCenter: null,
})

// ── resolveDesiredAreaCenters: count, cap, empties ────────────────────────────
{
  eq(resolveDesiredAreaCenters("Stone Oak", "san-antonio").length, 1, "1 label → 1 center")
  eq(resolveDesiredAreaCenters("Stone Oak, Alamo Heights", "san-antonio").length, 2, "2 labels → 2 centers")
  eq(
    resolveDesiredAreaCenters("Stone Oak, Alamo Heights, Medical Center", "san-antonio").length,
    3,
    "3 labels → 3 centers",
  )
  // Defensive cap even if more than 3 arrive.
  eq(
    resolveDesiredAreaCenters("Stone Oak, Alamo Heights, Medical Center, Southtown", "san-antonio").length,
    3,
    "more than 3 labels capped to 3",
  )
  eq(resolveDesiredAreaCenters("", "san-antonio").length, 0, "empty string → 0 centers")
  eq(resolveDesiredAreaCenters(null, "san-antonio").length, 0, "null → 0 centers")
  eq(resolveDesiredAreaCenters("Stone Oak", null).length, 0, "no market slug → 0 centers")
}

// ── Nearby Areas count exactly like Preferred Neighborhoods ───────────────────
{
  const r = resolveDesiredAreaCenters("Medical Center, Boerne, Schertz", "san-antonio")
  eq(r.length, 3, "Neighborhood + two Nearby Areas → 3 centers")
  ok(isCentroid(r[1], "Boerne", "san-antonio"), "Boerne (Nearby Area) resolves to its centroid")
  ok(isCentroid(r[2], "Schertz", "san-antonio"), "Schertz (Nearby Area) resolves to its centroid")
}

// ── Unresolved area fails safely: dropped, never the market center ────────────
{
  const r = resolveDesiredAreaCenters("Stone Oak, This Area Does Not Exist", "san-antonio")
  eq(r.length, 1, "unresolved label dropped → only the resolved area remains")
  ok(isCentroid(r[0], "Stone Oak", "san-antonio"), "surviving center is Stone Oak's centroid")
  const mc = centerForMarket("san-antonio")!
  ok(!(near(r[0].lat, mc.lat) && near(r[0].lng, mc.lng)), "unresolved area did NOT fall back to the market/downtown center")
  // A fully-unresolved selection produces no centers at all (no downtown search).
  eq(resolveDesiredAreaCenters("Nowhere, Nonexistent", "san-antonio").length, 0, "all-unresolved → 0 centers (no downtown search)")
}

// ── Market-aware: a label shared across metros resolves per market ────────────
{
  const sa = resolveDesiredAreaCenters("Medical Center", "san-antonio")[0]
  const hou = resolveDesiredAreaCenters("Medical Center", "houston")[0]
  ok(isCentroid(sa, "Medical Center", "san-antonio"), "SA Medical Center → SA centroid")
  ok(isCentroid(hou, "Medical Center", "houston"), "Houston Medical Center → Houston centroid")
  ok(!(near(sa.lat, hou.lat) && near(sa.lng, hou.lng)), "the two Medical Centers are different cities")
}

// ── mergeDedupeByPlaceId ──────────────────────────────────────────────────────
{
  eq(mergeDedupeByPlaceId([]).length, 0, "no pools → empty")
  eq(mergeDedupeByPlaceId([[], []]).length, 0, "empty pools → empty")
  const merged = mergeDedupeByPlaceId([
    [prop("A", "A1"), prop("B", "B1")],
    [prop("B", "B2"), prop("C", "C1")],
  ])
  eq(merged.length, 3, "A,B,C after dedupe → 3")
  eq(merged.filter((p) => p.placeId === "B").length, 1, "duplicate B collapses to one")
  eq(merged.find((p) => p.placeId === "B")!.propertyName, "B1", "first occurrence wins")
}

// ── searchAreas: N areas → exactly N searches, pools merged + deduped ─────────
{
  for (const n of [1, 2, 3]) {
    let calls = 0
    const centers: AreaCenter[] = Array.from({ length: n }, (_, i) => ({ lat: i + 1, lng: 0 }))
    const merged = await searchAreas(centers, async () => {
      calls++
      return [prop(`p${calls}`, `P${calls}`)]
    })
    eq(calls, n, `${n} areas → ${n} searches`)
    eq(merged.length, n, `${n} areas → ${n} unique properties reach the pool`)
  }
  // Zero centers → no search issued at all.
  let zeroCalls = 0
  const none = await searchAreas([], async () => {
    zeroCalls++
    return []
  })
  eq(zeroCalls, 0, "0 areas → 0 searches")
  eq(none.length, 0, "0 areas → empty pool")

  // Overlapping searches returning the same Place ID → one property.
  let n2 = 0
  const overlap = await searchAreas([{ lat: 1, lng: 0 }, { lat: 2, lng: 0 }], async () => {
    n2++
    return n2 === 1 ? [prop("X", "X"), prop("SHARED", "Shared-1")] : [prop("SHARED", "Shared-2"), prop("Y", "Y")]
  })
  eq(overlap.length, 3, "overlapping duplicate Place ID across two searches → 3 unique")
  eq(overlap.filter((p) => p.placeId === "SHARED").length, 1, "shared property deduped to one")
}

// ── Every selected area reaches ranking (fan-out → merge → computeSuggestions) ─
{
  const client = { id: 1, city: "San Antonio", desiredAreas: "Stone Oak, Alamo Heights, Medical Center" }
  const byArea: Record<number, ExplorerProperty> = {
    1: prop("sa1", "Stone Oak Villas", "123 Stone Oak Pkwy, San Antonio, TX 78258"),
    2: prop("ah1", "Alamo Heights Flats", "200 Alamo Heights Blvd, San Antonio, TX 78209"),
    3: prop("mc1", "Medical Center Lofts", "1 Medical Center Dr, San Antonio, TX 78229"),
  }
  const merged = await searchAreas([{ lat: 1, lng: 0 }, { lat: 2, lng: 0 }, { lat: 3, lng: 0 }], async (c) => [
    byArea[c.lat],
  ])
  eq(merged.length, 3, "three areas' properties merged")
  const sugg = computeSuggestions(merged, client)
  ok(sugg.has("sa1"), "Stone Oak property reaches ranking")
  ok(sugg.has("ah1"), "Alamo Heights property reaches ranking")
  ok(sugg.has("mc1"), "Medical Center property reaches ranking")
}

// ── Representative market combinations (real catalog coordinates) ─────────────
{
  // San Antonio: Stone Oak + Alamo Heights
  const sa2 = resolveDesiredAreaCenters("Stone Oak, Alamo Heights", "san-antonio")
  eq(sa2.length, 2, "SA Stone Oak + Alamo Heights → 2")
  ok(isCentroid(sa2[0], "Stone Oak", "san-antonio") && isCentroid(sa2[1], "Alamo Heights", "san-antonio"), "SA combo maps to both centroids")

  // San Antonio: The Dominion + Boerne + Medical Center (Neighborhood + Nearby + Neighborhood)
  const sa3 = resolveDesiredAreaCenters("The Dominion, Boerne, Medical Center", "san-antonio")
  eq(sa3.length, 3, "SA Dominion + Boerne + Medical Center → 3")
  ok(isCentroid(sa3[2], "Medical Center", "san-antonio"), "SA Medical Center in 3-combo is the SA centroid")

  // Austin 2-area
  const atx = resolveDesiredAreaCenters("Domain, Zilker", "austin")
  eq(atx.length, 2, "Austin Domain + Zilker → 2")
  ok(isCentroid(atx[0], "Domain", "austin") && isCentroid(atx[1], "Zilker", "austin"), "Austin combo maps to both centroids")

  // DFW: Dallas combo + Fort Worth combo
  const dal = resolveDesiredAreaCenters("Uptown, Deep Ellum", "dallas")
  eq(dal.length, 2, "Dallas Uptown + Deep Ellum → 2")
  ok(isCentroid(dal[0], "Uptown", "dallas") && isCentroid(dal[1], "Deep Ellum", "dallas"), "Dallas combo maps to both centroids")
  const fw = resolveDesiredAreaCenters("West 7th, TCU / Westcliff", "fort-worth")
  eq(fw.length, 2, "Fort Worth West 7th + TCU/Westcliff → 2")
  ok(isCentroid(fw[1], "TCU / Westcliff", "fort-worth"), "Fort Worth TCU/Westcliff resolves (punctuated label)")

  // Houston combo — Midtown must be the HOUSTON Midtown, not Dallas's
  const hou = resolveDesiredAreaCenters("Midtown, Montrose", "houston")
  eq(hou.length, 2, "Houston Midtown + Montrose → 2")
  ok(isCentroid(hou[0], "Midtown", "houston"), "Houston Midtown → Houston centroid (not Dallas)")
  const dalMid = centerForDesiredArea("Midtown", "dallas")!
  ok(!(near(hou[0].lat, dalMid.lat) && near(hou[0].lng, dalMid.lng)), "Houston Midtown ≠ Dallas Midtown")
}

// ── Camera-unchanged: source-level guarantee on BeastPropertyExplorer ─────────
// The Unleash/search path must never programmatically pan or zoom. We assert the
// component contains no fitBounds/panTo/setZoom at all, and that the ONLY
// setCenter calls are the market re-center/guard paths (never the area-search
// fan-out). This catches a regression that would move the camera on Unleash.
{
  const here = dirname(fileURLToPath(import.meta.url))
  const src = readFileSync(
    resolve(here, "../../components/crm/explorer/BeastPropertyExplorer.tsx"),
    "utf8",
  )
  const count = (re: RegExp) => (src.match(re) ?? []).length
  eq(count(/\.fitBounds\s*\(/g), 0, "no fitBounds anywhere in the explorer")
  eq(count(/\.panTo\s*\(/g), 0, "no panTo anywhere in the explorer")
  eq(count(/\.setZoom\s*\(/g), 0, "no setZoom anywhere in the explorer")
  // setCenter exists only for: market re-apply effect, market-change re-center,
  // and the out-of-market map-center guard snap-back — three known, camera-safe
  // sites. None sits in the area-search fan-out.
  eq(count(/\.setCenter\s*\(/g), 3, "setCenter only at the 3 known market-resolve/guard sites")
  ok(/await searchAreas\(/.test(src), "search fans out through searchAreas()")
  ok(/setRadarOrigins\(/.test(src), "radar uses per-area origins")
}

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
