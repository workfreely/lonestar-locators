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
import { selectInMarketMatch, normalizeName, decideNameSearch, normalizePlace, shouldFetchSuggestions, computeVisible } from "@/lib/propertyExplorer/nameSearch"
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
// The AREA / Unleash fan-out must never programmatically pan or zoom to results —
// that regression is what this guards. NAME search is a separate, deliberate path
// that DOES center on the specific property the agent asked for ("surface that
// exact property on the map"), so the camera-move calls are asserted to live ONLY
// in searchByName — never in searchThisArea. We still assert no fitBounds anywhere,
// and that setCenter stays at the three known market-resolve/guard sites.
{
  const here = dirname(fileURLToPath(import.meta.url))
  const src = readFileSync(
    resolve(here, "../../components/crm/explorer/BeastPropertyExplorer.tsx"),
    "utf8",
  )
  const count = (re: RegExp) => (src.match(re) ?? []).length
  eq(count(/\.fitBounds\s*\(/g), 0, "no fitBounds anywhere in the explorer")

  // The area-search fan-out span (searchThisArea up to the first name-search helper,
  // applyNameDecision) must contain no camera move toward results.
  const areaStart = src.indexOf("const searchThisArea =")
  const applyStart = src.indexOf("const applyNameDecision =")
  ok(areaStart >= 0 && applyStart > areaStart, "located searchThisArea before applyNameDecision")
  const areaFn = src.slice(areaStart, applyStart)
  eq((areaFn.match(/\.panTo\s*\(/g) ?? []).length, 0, "no panTo in the area-search path")
  eq((areaFn.match(/\.setZoom\s*\(/g) ?? []).length, 0, "no setZoom in the area-search path")
  eq((areaFn.match(/\.fitBounds\s*\(/g) ?? []).length, 0, "no fitBounds in the area-search path")

  // Name search intentionally frames the found property: exactly one panTo + one
  // setZoom in the whole file, both inside the name-search apply path
  // (applyNameDecision) — reused by the Enter path AND a picker-row click.
  eq(count(/\.panTo\s*\(/g), 1, "exactly one panTo (name-search focus)")
  eq(count(/\.setZoom\s*\(/g), 1, "exactly one setZoom (name-search focus)")
  const nameRegion = src.slice(applyStart)
  ok(/\.panTo\s*\(/.test(nameRegion), "the panTo lives in the name-search apply path")
  ok(/\.setZoom\s*\(/.test(nameRegion), "the setZoom lives in the name-search apply path")

  // setCenter exists only for: market re-apply effect, market-change re-center,
  // and the out-of-market map-center guard snap-back — three known, camera-safe
  // sites. None sits in the area-search fan-out toward results.
  // Two setCenter sites remain: the guarded market-restriction re-center, and the
  // out-of-market map-center guard snap-back inside searchThisArea. The old UNGUARDED
  // effect keyed on `center` by reference was removed — a fresh {lat,lng} object on
  // re-render must never re-center and clobber a name-search panTo (the ALARO bug).
  eq(count(/\.setCenter\s*\(/g), 2, "setCenter only at the guarded re-center + the out-of-market guard")
  // Regression: the market-restriction effect keeps `status` in its deps (to
  // re-apply the restriction once the map is ready), so its setCenter(center) MUST
  // be guarded by a center-CHANGED check (value, not reference) — otherwise a
  // name-search status flip, or a fresh center object on re-render, would
  // setCenter(market center) and snap the camera off the found property.
  ok(/appliedCenterRef/.test(src), "market re-center is guarded (appliedCenterRef, by value) so a status flip / new center object can't clobber the name-search panTo")
  ok(/await searchAreas\(/.test(src), "search fans out through searchAreas()")
  ok(/setRadarOrigins\(/.test(src), "radar uses per-area origins")
}

// ── Individual property (name) search: market restriction + selection ─────────
// selectInMarketMatch treats the returned coordinates as authoritative: only
// candidates inside the selected market's envelope survive, and the strongest is
// chosen from those (exact normalized name, else top relevance). Coordinates use
// the real market boxes from lib/markets/catalog (SA/Austin own boxes; Dallas &
// Fort Worth share the DFW box).
{
  // A candidate with real coordinates (name search always has a location). Defaults
  // to an apartment_complex type so it QUALIFIES as an apartment/community; the
  // qualification tests pass explicit non-apartment types (brokerage, lodging, …).
  const at = (
    placeId: string,
    name: string,
    lat: number,
    lng: number,
    types: string[] = ["apartment_complex"],
  ): ExplorerProperty => ({
    ...prop(placeId, name),
    lat,
    lng,
    googleTypes: types,
  })
  // Real reference points inside each market box.
  const SA = { lat: 29.4241, lng: -98.4936 } // San Antonio downtown
  const AUSTIN = { lat: 30.2672, lng: -97.7431 } // Austin downtown (OUTSIDE the SA box)
  const DALLAS = { lat: 32.7767, lng: -96.797 }
  const FORT_WORTH = { lat: 32.7555, lng: -97.3308 } // shares the DFW box with Dallas

  // normalizeName: case + whitespace only, no fuzzy stripping.
  eq(normalizeName("  The   Standard  "), "the standard", "normalizeName collapses case/space")
  eq(normalizeName("Résidences 6G") === "the standard", false, "normalizeName is not fuzzy")

  // 1) Exact normalized in-market name → that exact result (over relevance order).
  {
    const cands = [
      at("a", "Sonterra Blue", SA.lat, SA.lng),
      at("b", "The Standard at Legacy", SA.lat, SA.lng),
    ]
    const { selected } = selectInMarketMatch(cands, "san-antonio", "the standard at legacy")
    eq(selected?.placeId, "b", "exact normalized in-market name selects the exact result")
  }

  // 2) No exact match → the top relevance-ranked in-market candidate (index 0).
  {
    const cands = [
      at("a", "Villages of Briggs Ranch Apartments", SA.lat, SA.lng),
      at("b", "Park at Briggs Ranch Apartments", SA.lat, SA.lng),
    ]
    const { selected } = selectInMarketMatch(cands, "san-antonio", "briggs ranch luxury")
    eq(selected?.placeId, "a", "no exact match → top relevance in-market result")
  }

  // 3) Partial-name in-market property → still selectable (top in-market hit).
  {
    const cands = [at("a", "Villages of Briggs Ranch Apartments", SA.lat, SA.lng)]
    const { selected } = selectInMarketMatch(cands, "san-antonio", "Briggs Ranch")
    eq(selected?.placeId, "a", "partial in-market name can be selected")
  }

  // 4) Exact-name property OUTSIDE the market → rejected (no fallback).
  {
    const cands = [at("x", "Residences at 6G", AUSTIN.lat, AUSTIN.lng)]
    const { inMarket, selected } = selectInMarketMatch(cands, "san-antonio", "residences at 6g")
    eq(inMarket.length, 0, "out-of-market exact-name candidate is discarded")
    eq(selected, null, "no in-market candidate → no property selected (no fallback)")
  }

  // 5) Mixed in + out of market → the strongest IN-MARKET candidate only, even when
  //    the out-of-market one is the exact name match.
  {
    const cands = [
      at("out", "Residences at 6G", AUSTIN.lat, AUSTIN.lng), // exact match, but Austin
      at("in", "Sonterra Blue", SA.lat, SA.lng), // in SA, not an exact match
    ]
    const { selected } = selectInMarketMatch(cands, "san-antonio", "residences at 6g")
    eq(selected?.placeId, "in", "mixed results → strongest in-market candidate, not the out-of-market exact")
  }

  // 6) DFW SHARED envelope: Dallas and Fort Worth search the SAME box.
  //    • Dallas-selected finds an in-bounds Fort Worth property
  //    • Fort-Worth-selected finds an in-bounds Dallas property
  //    • neither returns an out-of-DFW (Austin/Houston) property
  {
    const HOUSTON = { lat: 29.7604, lng: -95.3698 } // outside the DFW box

    const fw = [at("fw", "Left Bank Apartments", FORT_WORTH.lat, FORT_WORTH.lng)]
    eq(selectInMarketMatch(fw, "dallas", "left bank").selected?.placeId, "fw", "Dallas-selected finds an in-bounds Fort Worth property (shared DFW box)")
    const dal = [at("dal", "Gables McKinney Ave", DALLAS.lat, DALLAS.lng)]
    eq(selectInMarketMatch(dal, "fort-worth", "gables mckinney ave").selected?.placeId, "dal", "Fort-Worth-selected finds an in-bounds Dallas property (shared DFW box)")

    // Out-of-DFW rejection under BOTH DFW markets — Austin, Houston, San Antonio,
    // i.e. anywhere outside the shared DFW envelope.
    const austin = [at("au", "Residences at 6G", AUSTIN.lat, AUSTIN.lng)]
    const houston = [at("ho", "The Southmore", HOUSTON.lat, HOUSTON.lng)]
    const sanant = [at("sa", "Sonterra Blue", SA.lat, SA.lng)]
    for (const dfw of ["dallas", "fort-worth"] as const) {
      eq(selectInMarketMatch(austin, dfw, "residences at 6g").selected, null, `${dfw} rejects an Austin property (out of DFW)`)
      eq(selectInMarketMatch(houston, dfw, "the southmore").selected, null, `${dfw} rejects a Houston property (out of DFW)`)
      eq(selectInMarketMatch(sanant, dfw, "sonterra blue").selected, null, `${dfw} rejects a San Antonio property (out of DFW)`)
    }
  }

  // Austin property is NOT in the SA box (guards the cross-metro rejection above).
  {
    const a = [at("au", "The Domain Apartments", AUSTIN.lat, AUSTIN.lng)]
    eq(selectInMarketMatch(a, "austin", "the domain apartments").selected?.placeId, "au", "Austin property selectable under Austin")
    eq(selectInMarketMatch(a, "san-antonio", "the domain apartments").selected, null, "Austin property rejected under San Antonio")
  }

  // ── decideNameSearch: failed search must not leave a stale selection ─────────
  {
    const A = at("A", "Sonterra Blue", SA.lat, SA.lng)

    // Successful search selects Property A: focus A, adds it, no prior to clear.
    const ok1 = decideNameSearch(
      { selected: A },
      { selectedPlaceId: null, nameMatchIds: new Set() },
    )
    eq(ok1.focus?.placeId, "A", "successful name search focuses Property A")
    eq(ok1.addResults.length, 1, "successful search adds the in-market property")
    eq(ok1.nameMatchIds.has("A"), true, "successful search records A as a name match")
    eq(ok1.clearPriorSelection, false, "successful search clears no prior selection")

    // Next submitted search has NO in-market result, while A (a prior name-search
    // result) is still selected → A must be cleared, pins untouched, no camera move.
    const fail = decideNameSearch(
      { selected: null },
      { selectedPlaceId: "A", nameMatchIds: new Set(["A"]) },
    )
    eq(fail.focus, null, "failed search moves NO camera (focus null)")
    eq(fail.addResults.length, 0, "failed search adds nothing — existing/area pins remain intact")
    eq(fail.nameMatchIds.size, 0, "failed search clears prior nameMatchIds")
    eq(fail.clearPriorSelection, true, "failed search clears the stale name-search selection (Property A)")

    // A card opened by clicking a NORMAL/area pin (not a name-search result) is left
    // alone on a failed search.
    const failArea = decideNameSearch(
      { selected: null },
      { selectedPlaceId: "areaPin", nameMatchIds: new Set(["A"]) },
    )
    eq(failArea.clearPriorSelection, false, "failed search does NOT close a non-name-search (area) card")

    // No prior selection at all → nothing to clear.
    const failNone = decideNameSearch(
      { selected: null },
      { selectedPlaceId: null, nameMatchIds: new Set() },
    )
    eq(failNone.clearPriorSelection, false, "failed search with no prior selection clears nothing")
  }

  // ── normalizePlace: exact coordinate preservation through selection ──────────
  // A Places (New) result exposes `location.lat()/lng()` as METHODS (verified live).
  // These use the REAL San Antonio coordinates Google returned for Vecina/ALARO/
  // Caliza, and lock that they survive normalization → selection byte-for-byte —
  // never rounded, defaulted, or replaced with a market-center point.
  {
    const mockPlace = (id: string, name: string, lat: number, lng: number) => ({
      id,
      displayName: name,
      formattedAddress: `${name}, San Antonio, TX`,
      location: { lat: () => lat, lng: () => lng },
      types: ["apartment_complex"],
    })
    const VECINA = { lat: 29.6366373, lng: -98.5133438 }
    const ALARO = { lat: 29.5039261, lng: -98.6963962 }
    const CALIZA = { lat: 29.6002945, lng: -98.4021287 }

    // Exact preservation through normalization.
    const nv = normalizePlace(mockPlace("v", "Vecina Apartment Villas", VECINA.lat, VECINA.lng), "san-antonio")!
    eq(nv.lat, VECINA.lat, "normalizePlace preserves latitude exactly")
    eq(nv.lng, VECINA.lng, "normalizePlace preserves longitude exactly")
    eq(nv.placeId, "v", "normalizePlace carries the Place ID")
    eq(nv.propertyName, "Vecina Apartment Villas", "normalizePlace carries the display name")

    // Exact preservation through selection (the coordinates used for pin + panTo).
    const candidates = [
      normalizePlace(mockPlace("v", "Vecina Apartment Villas", VECINA.lat, VECINA.lng), "san-antonio")!,
      normalizePlace(mockPlace("a", "ALARO", ALARO.lat, ALARO.lng), "san-antonio")!,
      normalizePlace(mockPlace("c", "Caliza at The Loop", CALIZA.lat, CALIZA.lng), "san-antonio")!,
    ]
    const picked = selectInMarketMatch(candidates, "san-antonio", "caliza at the loop")
    eq(picked.selected?.placeId, "c", "exact name picks Caliza")
    eq(picked.selected?.lat, CALIZA.lat, "selected latitude is Caliza's exact coordinate (not downtown)")
    eq(picked.selected?.lng, CALIZA.lng, "selected longitude is Caliza's exact coordinate (not downtown)")

    const decision = decideNameSearch(picked, { selectedPlaceId: null, nameMatchIds: new Set() })
    eq(decision.focus?.lat, CALIZA.lat, "decision.focus latitude is exact (drives panTo + marker)")
    eq(decision.focus?.lng, CALIZA.lng, "decision.focus longitude is exact (drives panTo + marker)")
    eq(decision.addResults.find((p) => p.placeId === "c")?.lat, CALIZA.lat, "merged result keeps Caliza's exact latitude")

    // A place that cannot be mapped is dropped — never a fake/center pin.
    eq(normalizePlace({ id: "x", displayName: "No Loc", location: null }, "san-antonio"), null, "place with no location → null (unmappable, dropped)")
    eq(normalizePlace(mockPlace("n", "NaN Place", NaN, NaN), "san-antonio"), null, "place with non-finite coords → null (unmappable, dropped)")
    eq(normalizePlace({ displayName: "No Id", location: { lat: () => 29.4, lng: () => -98.5 } }, "san-antonio"), null, "place with no id → null")
  }

  // ── Bug 1: candidate qualification — one valid apartment result, no noise ─────
  // Real production noise: a bare name search returns brokerages, furnished/vacation
  // overlays, restaurants and home builders alongside the real community. Only the
  // single strongest valid apartment/community candidate may win and be rendered.
  {
    // "vecina" — the real community (catalogued + apartment type) among the exact
    // noise seen in production. Only "vecina" is catalogued.
    const vecinaCands = [
      at("vecina", "Vecina Apartment Villas", SA.lat, SA.lng, ["apartment_complex", "real_estate_agency"]),
      at("kw", "Vecina Real Estate Group - Keller Williams Legacy", SA.lat, SA.lng, ["real_estate_agency", "point_of_interest"]),
      at("landing", "Landing Furnished Apartments at Vecina", SA.lat, SA.lng, ["apartment_complex"]),
      at("beauty", "La Vecina Beauty Bead", SA.lat, SA.lng, ["point_of_interest"]),
      at("food", "Vecina Arcadia", SA.lat, SA.lng, ["latin_american_restaurant", "restaurant"]),
    ]
    const catV = new Set(["vecina"])
    const rV = selectInMarketMatch(vecinaCands, "san-antonio", "vecina", catV)
    eq(rV.selected?.placeId, "vecina", "'vecina' selects the catalogued community, not the brokerage/furnished/restaurant")
    eq(rV.qualified.some((p) => p.placeId === "kw"), false, "real-estate brokerage cannot qualify")
    eq(rV.qualified.some((p) => p.placeId === "beauty"), false, "beauty business cannot qualify")
    eq(rV.qualified.some((p) => p.placeId === "food"), false, "restaurant cannot qualify")

    // Only the SELECTED property is added as the name-search result — never every survivor.
    const dV = decideNameSearch(rV, { selectedPlaceId: null, nameMatchIds: new Set() })
    eq(dV.addResults.length, 1, "several Text Search candidates → only ONE (the selected) is added as the name-search result")
    eq(dV.addResults[0]?.placeId, "vecina", "the single added result is the selected community")
    eq(dV.nameMatchIds.size, 1, "nameMatchIds holds exactly the selected Place ID")
    // Place-ID consistency: card (selected) === marker/added === focus/panTo.
    eq(rV.selected?.placeId, dV.focus?.placeId, "selected (card) Place ID === focus (marker/panTo) Place ID")
    eq(dV.focus?.placeId, dV.addResults[0]?.placeId, "focus Place ID === added result Place ID")

    // Exact catalogued apartment beats a similarly-named real-estate/business candidate.
    const rExact = selectInMarketMatch(vecinaCands, "san-antonio", "vecina apartment villas", catV)
    eq(rExact.selected?.placeId, "vecina", "exact catalogued apartment (Vecina Apartment Villas) beats the Keller Williams brokerage")

    // Oasis Stone Oak — catalogued, NO apartment type (real_estate_agency) — beats
    // lodging/vacation-rental namesakes.
    const oasisCands = [
      at("oasis", "Oasis Stone Oak", SA.lat, SA.lng, ["real_estate_agency", "point_of_interest"]),
      at("vac1", "Stone Oak Oasis with Private Pool and Grill!", SA.lat, SA.lng, ["lodging"]),
      at("vac2", "Stone Oak Oasis with Pool, Patio and Grill!", SA.lat, SA.lng, ["lodging"]),
    ]
    const rO = selectInMarketMatch(oasisCands, "san-antonio", "oasis stone oak", new Set(["oasis"]))
    eq(rO.selected?.placeId, "oasis", "catalogued Oasis (no apartment type) beats vacation-rental namesakes")
    eq(rO.qualified.some((p) => p.placeId === "vac1" || p.placeId === "vac2"), false, "lodging/vacation rentals cannot qualify")

    // Uncatalogued legitimate apartment (apartment-typed, NOT catalogued) can still win.
    const rU = selectInMarketMatch(
      [at("newapt", "Brand New Lofts", SA.lat, SA.lng, ["apartment_complex"])],
      "san-antonio",
      "brand new lofts",
      new Set(),
    )
    eq(rU.selected?.placeId, "newapt", "uncatalogued apartment-typed community still qualifies and wins (catalog not required)")

    // All-noise candidate set → no property surfaced (never a noise fallback).
    const rN = selectInMarketMatch(
      [
        at("b1", "Something Realty", SA.lat, SA.lng, ["real_estate_agency"]),
        at("b2", "Cabin Getaway", SA.lat, SA.lng, ["lodging"]),
      ],
      "san-antonio",
      "something",
      new Set(),
    )
    eq(rN.selected, null, "all-noise candidate set → no property surfaced")

    // ALARO-style: exact lat/lng preserved through selection AND focus/panTo, and the
    // card/marker/focus/added-result all share ONE Place ID (Bug 2 identity check).
    const ALARO = { lat: 29.5039261, lng: -98.6963962 }
    const rA = selectInMarketMatch(
      [at("alaro", "ALARO", ALARO.lat, ALARO.lng, ["apartment_complex"])],
      "san-antonio",
      "alaro",
      new Set(["alaro"]),
    )
    eq(rA.selected?.placeId, "alaro", "ALARO selected")
    eq(rA.selected?.lat, ALARO.lat, "ALARO exact latitude preserved through selection (far-west, not central-north)")
    eq(rA.selected?.lng, ALARO.lng, "ALARO exact longitude preserved through selection")
    const dA = decideNameSearch(rA, { selectedPlaceId: null, nameMatchIds: new Set() })
    eq(dA.focus?.lat, ALARO.lat, "ALARO exact latitude drives focus/panTo")
    eq(dA.focus?.lng, ALARO.lng, "ALARO exact longitude drives focus/panTo")
    eq(dA.addResults.length, 1, "ALARO adds exactly one result")
    eq(dA.focus?.placeId, dA.addResults[0]?.placeId, "ALARO focus Place ID === added result Place ID === card")
  }
}

// ── Name-search path has NO apartment-type hard gate ──────────────────────────
// The area search intentionally uses includedPrimaryTypes; the NAME search must
// not — a community whose Google primary type isn't apartment_* must still be
// findable by name. Assert includedType / includedPrimaryTypes appear only in the
// area path (searchThisArea), never in searchByName.
{
  const here = dirname(fileURLToPath(import.meta.url))
  const src = readFileSync(
    resolve(here, "../../components/crm/explorer/BeastPropertyExplorer.tsx"),
    "utf8",
  )
  // The Places call + market-restriction now live in the shared fetch helper
  // runNameSearch (used by both the picker and the Enter path).
  const runStart = src.indexOf("const runNameSearch =")
  const runEnd = src.indexOf("const searchByName =", runStart)
  ok(runStart >= 0 && runEnd > runStart, "located the runNameSearch body")
  // Check CODE only — strip line comments so a comment that merely names the field
  // (e.g. "no apartment-type gate") never trips the assertion.
  const runFn = src
    .slice(runStart, runEnd)
    .split("\n")
    .map((l) => l.replace(/\/\/.*$/, ""))
    .join("\n")
  ok(/Place\.searchByText\s*\(/.test(runFn), "name search calls Place.searchByText")
  eq((runFn.match(/includedType\b/g) ?? []).length, 0, "no includedType in the name-search request")
  eq((runFn.match(/includedPrimaryTypes\b/g) ?? []).length, 0, "no includedPrimaryTypes in the name-search request")
  ok(/selectInMarketMatch\s*\(/.test(runFn), "name search restricts to in-market via selectInMarketMatch")
}

// ── Autocomplete refinements: trigger, picker-click identity, marker visibility ─
{
  const mk = (id: string, name: string, lat = 32.78, lng = -96.8): ExplorerProperty => ({
    ...prop(id, name),
    lat,
    lng,
    googleTypes: ["apartment_complex"],
  })

  // (Bug 3) 2-char query triggers suggestion-search eligibility.
  eq(shouldFetchSuggestions("a", ""), false, "1 char → no suggestion fetch")
  eq(shouldFetchSuggestions("am", ""), true, "2 chars → eligible for suggestion fetch")
  eq(shouldFetchSuggestions("amli", ""), true, "4 chars → eligible")
  eq(shouldFetchSuggestions("  a ", ""), false, "trimmed 1 char → not eligible")
  // Suppressed when the input equals a just-resolved canonical name (post-click).
  eq(shouldFetchSuggestions("AMLI Fountain Place", "AMLI Fountain Place"), false, "canonical name just filled in → suppressed")
  eq(shouldFetchSuggestions("AMLI Fountain", "AMLI Fountain Place"), true, "editing after a resolve → eligible again")

  // (Bug 2) Picker click adds/selects EXACTLY the clicked Place ID — one pin.
  const clicked = mk("amli-fountain", "AMLI Fountain Place")
  const other = mk("amli-ballpark", "AMLI at the Ballpark")
  const decision = decideNameSearch(
    { selected: clicked },
    { selectedPlaceId: null, nameMatchIds: new Set() },
  )
  eq(decision.addResults.length, 1, "picker click adds exactly one property")
  eq(decision.addResults[0]?.placeId, "amli-fountain", "the added property is the clicked Place ID")
  eq(decision.focus?.placeId, "amli-fountain", "focus (card + panTo) is the clicked Place ID")
  eq(decision.nameMatchIds.has("amli-fountain"), true, "nameMatchIds holds the clicked Place ID")
  eq(decision.nameMatchIds.size, 1, "only the clicked Place ID is a name match (not every picker row)")
  eq(decision.addResults.some((p) => p.placeId === "amli-ballpark"), false, "an un-clicked picker row is NOT added")

  // (Bug 2) The clicked property is marker-VISIBLE even when the live filter text
  // (the canonical name just filled in) isn't a substring match issue — and even if
  // the substring filter would otherwise exclude it.
  const results = [clicked, other] // both loaded
  // Simulate post-click state: query = canonical name, nameMatchIds = {clicked}.
  const vis = computeVisible(results, "AMLI Fountain Place", decision.nameMatchIds, clicked.placeId)
  eq(vis.some((p) => p.placeId === "amli-fountain"), true, "clicked property is marker-visible after selection")
  // A filter fragment that does NOT substring-match the clicked name still keeps it
  // visible via the forced (nameMatchIds + selected) union.
  const vis2 = computeVisible(results, "zzz-no-match", decision.nameMatchIds, clicked.placeId)
  eq(vis2.some((p) => p.placeId === "amli-fountain"), true, "selected/name-match property stays visible under a non-matching filter")
  eq(vis2.some((p) => p.placeId === "amli-ballpark"), false, "an unrelated loaded property is filtered out")

  // (Bug 1) The market-switch effect resets the Beast/Unleash match state so the old
  // count can't show in the new market. Source-level check on the explorer.
  const here = dirname(fileURLToPath(import.meta.url))
  const src = readFileSync(resolve(here, "../../components/crm/explorer/BeastPropertyExplorer.tsx"), "utf8")
  const mkStart = src.indexOf("Switching markets discards")
  const mkEnd = src.indexOf("}, [marketSlug, onResolveName])", mkStart)
  ok(mkStart >= 0 && mkEnd > mkStart, "located the market-switch effect")
  const mkFn = src.slice(mkStart, mkEnd)
  ok(/setBeastPhase\(\s*["']idle["']\s*\)/.test(mkFn), "market switch resets beastPhase to idle")
  ok(/setBeastMatchCount\(\s*0\s*\)/.test(mkFn), "market switch resets beastMatchCount to 0")
  ok(/beastHalosRef\.current\s*=\s*\[\]/.test(mkFn), "market switch clears Beast halos")
}

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
