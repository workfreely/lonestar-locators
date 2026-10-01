// COMMUTE MODE — a verified drive time is the primary geographic qualification.
//
// THE PRODUCT RULE: if the property satisfies the client's explicitly stated maximum
// commute, it has satisfied their location requirement — no Desired Area text needed,
// and not buried beneath the four area tiers.
//
// THE OTHER HALF OF THE RULE, asserted just as hard: whenever commute_max_minutes is
// null, every line of Area Mode behaves exactly as it did before Commute Mode existed.
//
// Run: npx tsx scripts/matching/commuteMode.test.ts
import { readFileSync } from "node:fs"
import path from "node:path"
import {
  isCommuteMode,
  prefilterRadiusMeters,
  meetsCommute,
  commuteMatchReason,
  boundingBox,
  metresBetween,
  COMMUTE_MINUTE_OPTIONS,
  KM_PER_MINUTE,
  MAX_PREFILTER_METERS,
} from "@/lib/propertyExplorer/commuteMode"
import { assessLocationFit } from "@/lib/propertyExplorer/locationFit"
import { computeSuggestions } from "@/lib/propertyExplorer/suggestions"
import type { ExplorerProperty } from "@/lib/propertyExplorer/types"

let pass = 0, fail = 0
const ok = (l: string, c: boolean, d = "") => {
  if (c) { pass++; console.log(`  ✓ ${l}${d ? ` — ${d}` : ""}`) } else { fail++; console.log(`  ✗ ${l}${d ? ` — ${d}` : ""}`) }
}
const read = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8")
const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1")

/** A property with no area signal whatsoever — only a verified drive time. */
const prop = (name: string, minutes: number | null, address = "8223 Inner Circle Rd, San Antonio, TX 78235, USA"): ExplorerProperty => ({
  placeId: `pid-${name}`, propertyId: `pid-${name}`, propertyName: name,
  propertyAddress: address, propertyUrl: "", lat: 29.34, lng: -98.44,
  source: "google_places", marketSlug: "san-antonio",
  neighborhood: null, location: null, locationKeywords: [],
  commuteMinutes: minutes,
} as ExplorerProperty)

const KALEAH = {
  city: "San Antonio",
  desiredAreas: "Southtown",
  commuteAnchorPlaceId: "ChIJVVVVVbH1XIYRWGJNMlLVyoc",
  commuteAnchorLabel: "Fort Sam",
  commuteMaxMinutes: 20,
}
/** Her profile as it is TODAY — anchor set, no maximum. Must stay in Area Mode. */
const KALEAH_AREA_MODE = { ...KALEAH, commuteMaxMinutes: null }

console.log("THE MODE SWITCH — both fields, or nothing happens:")
ok("anchor + maximum → Commute Mode", isCommuteMode("ChIJabc", 20))
ok("anchor alone → NOT Commute Mode (today's Ka'Leah)", !isCommuteMode("ChIJabc", null))
ok("maximum alone → NOT Commute Mode", !isCommuteMode(null, 20))
ok("neither → NOT Commute Mode", !isCommuteMode(null, null))
ok("undefined maximum (column not yet migrated) → NOT Commute Mode", !isCommuteMode("ChIJabc", undefined))
ok("empty anchor string → NOT Commute Mode", !isCommuteMode("   ", 20))
ok("zero maximum → NOT Commute Mode", !isCommuteMode("ChIJabc", 0))
ok("negative maximum → NOT Commute Mode", !isCommuteMode("ChIJabc", -5))

console.log("\nTHE BENCHMARK — Ka'Leah / Altitude at Brooks (verified 19 min, max 20):")
{
  const alt = prop("Altitude at Brooks", 19)
  const fit = assessLocationFit(alt, KALEAH)
  ok("it is a MATCH", fit?.tone === "match", `tone ${fit?.tone}`)
  ok("labelled Commute Match", fit?.label === "Commute Match")
  ok("RANK 0 — ahead of the four area tiers, not beneath them", fit?.rank === 0, `rank ${fit?.rank}`)
  ok("the reason is the measured fact", fit?.reason === "19 min to Fort Sam", fit?.reason)
  ok("and computeSuggestions STARS it", computeSuggestions([alt], KALEAH).has(alt.placeId))
  // The whole point: its address names no desired area and it carries no keywords.
  ok("it qualified with NO Desired Area text", !/southtown/i.test(alt.propertyAddress ?? "")
    && (alt.locationKeywords?.length ?? 0) === 0)
}
{
  // Today's behaviour, for contrast: without a maximum it is not even neutral-matched.
  const alt = prop("Altitude at Brooks", 19)
  const fit = assessLocationFit(alt, KALEAH_AREA_MODE)
  ok("WITHOUT a maximum it is still only 'Within Preferred Area'", fit?.label === "Within Preferred Area")
  ok("…and is NOT starred", !computeSuggestions([alt], KALEAH_AREA_MODE).has(alt.placeId))
}

console.log("\nTHE BOUNDARY IS THE CLIENT'S OWN NUMBER:")
ok("19 min against a 20 max → match", assessLocationFit(prop("a", 19), KALEAH)?.tone === "match")
ok("exactly 20 against a 20 max → match (at or under)", assessLocationFit(prop("b", 20), KALEAH)?.tone === "match")
ok("21 min against a 20 max → NO commute match", assessLocationFit(prop("c", 21), KALEAH)?.label !== "Commute Match")
ok("no drivable route (null) → NO commute match", assessLocationFit(prop("d", null), KALEAH)?.label !== "Commute Match")
ok("a property with no commuteMinutes at all → NO commute match", (() => {
  const p = prop("e", null); delete (p as Record<string, unknown>).commuteMinutes
  return assessLocationFit(p, KALEAH)?.label !== "Commute Match"
})())
ok("meetsCommute is inclusive at the boundary", meetsCommute(20, 20) && !meetsCommute(21, 20))
ok("meetsCommute rejects null / 0 / NaN",
  !meetsCommute(null, 20) && !meetsCommute(0, 20) && !meetsCommute(Number.NaN, 20))

console.log("\nOVER THE MAXIMUM FALLS THROUGH — it never TAKES anything away:")
{
  // A property that exceeds the commute but DOES name the client's area keeps the
  // area match it would have had before Commute Mode existed.
  const p = prop("Southtown Flats", 45, "111 Probandt St, San Antonio, TX 78204, USA")
  ;(p as ExplorerProperty).locationKeywords = ["Southtown"]
  const fit = assessLocationFit(p, KALEAH)
  ok("a 45-min property that matches the area still gets its area match",
    fit?.tone === "match" && fit.label === "Location Keyword Match" && fit.rank === 2)
}
{
  const p = prop("Nowhere", 45, "1 Example St, Nowhereville, TX 70000, USA")
  ok("a 45-min property with no area signal gets no match at all",
    assessLocationFit(p, KALEAH)?.tone !== "match")
}

console.log("\nCOMMUTE OUTRANKS THE AREA TIERS (rank 0 < 1):")
{
  const p = prop("Both", 10, "111 Probandt St, San Antonio, TX 78204, USA")
  ;(p as ExplorerProperty).neighborhood = "Southtown"
  const fit = assessLocationFit(p, KALEAH)
  ok("a property matching BOTH reports the commute", fit?.label === "Commute Match" && fit.rank === 0)
}
{
  // Ordering: a commute match sorts ahead of a neighborhood match.
  const commute = prop("CommuteOnly", 12)
  const area = prop("AreaOnly", null, "111 Probandt St, San Antonio, TX 78204, USA")
  ;(area as ExplorerProperty).neighborhood = "Southtown"
  const starred = [...computeSuggestions([area, commute], KALEAH).keys()]
  ok("the commute match is starred FIRST", starred[0] === commute.placeId, starred.join(" · "))
}

console.log("\nAREA MODE IS UNTOUCHED WHEN commute_max_minutes IS NULL:")
{
  // The exact shapes the existing suites assert, run through the new code path.
  const kw = prop("K", null, "1 Example St, Nowhereville, TX 70000, USA")
  ;(kw as ExplorerProperty).locationKeywords = ["uptown dallas"]
  const dallas = { city: "Dallas", desiredAreas: "Uptown" }
  const f = assessLocationFit(kw, dallas)
  ok("the alias keyword tier still works (rank 2)", f?.rank === 2 && f.label === "Location Keyword Match")
}
{
  const nb = prop("N", null, "1 Example St, Nowhereville, TX 70000, USA")
  ;(nb as ExplorerProperty).neighborhood = "Stone Oak"
  ok("the neighborhood tier is still rank 1",
    assessLocationFit(nb, { city: "San Antonio", desiredAreas: "Stone Oak" })?.rank === 1)
}
{
  const ad = prop("A", null, "100 Main St, Boerne, TX 78006, USA")
  ok("the address-text fallback is still rank 4",
    assessLocationFit(ad, { city: "San Antonio", desiredAreas: "Boerne" })?.rank === 4)
}
ok("a client with no commute fields at all behaves as before",
  assessLocationFit(prop("x", 5), { city: "San Antonio", desiredAreas: "Southtown" })?.label !== "Commute Match")
ok("even a property carrying commuteMinutes is ignored outside Commute Mode",
  assessLocationFit(prop("y", 1), { city: "San Antonio", desiredAreas: "Southtown" })?.label !== "Commute Match")

console.log("\nTHE PREFILTER RADIUS IS MEASURED AND WIDER THAN THE WORST CASE:")
// Measured 2026-10-01: the furthest property within 20 real minutes of Fort Sam sat
// at 16.58 km straight-line, i.e. 0.83 km/min.
ok("KM_PER_MINUTE exceeds the worst measured 0.83", KM_PER_MINUTE > 0.83, String(KM_PER_MINUTE))
ok("20 min → 18 km, which captured 173/173 with zero false negatives",
  prefilterRadiusMeters(20) === 18_000, `${prefilterRadiusMeters(20)} m`)
ok("10 min → 9 km", prefilterRadiusMeters(10) === 9_000)
ok("45 min → 40.5 km", prefilterRadiusMeters(45) === 40_500)
ok("a huge maximum is capped", prefilterRadiusMeters(500) === MAX_PREFILTER_METERS)
ok("an invalid maximum yields no radius", prefilterRadiusMeters(0) === 0 && prefilterRadiusMeters(-1) === 0)
ok("the radius grows with the maximum", prefilterRadiusMeters(15) < prefilterRadiusMeters(30))

console.log("\nTHE BOUNDING BOX CONTAINS ITS CIRCLE (it may over-fetch, never exclude):")
{
  const c = { lat: 29.457, lng: -98.4458 }
  const r = prefilterRadiusMeters(20)
  const box = boundingBox(c, r)
  // The four cardinal points at exactly the radius must lie inside the box.
  const latDeg = r / 111_320
  const lngDeg = r / (111_320 * Math.cos((c.lat * Math.PI) / 180))
  ok("north edge inside", c.lat + latDeg <= box.maxLat + 1e-9)
  ok("south edge inside", c.lat - latDeg >= box.minLat - 1e-9)
  ok("east edge inside", c.lng + lngDeg <= box.maxLng + 1e-9)
  ok("west edge inside", c.lng - lngDeg >= box.minLng - 1e-9)
  ok("the box is strictly larger than the circle", (box.maxLat - box.minLat) * 111_320 >= 2 * r - 1)
}
{
  // Known distance: Fort Sam to Altitude at Brooks, measured at 13.0 km.
  const d = metresBetween({ lat: 29.457, lng: -98.4458 }, { lat: 29.3414, lng: -98.4414 })
  ok("metresBetween reproduces the measured 13.0 km", Math.abs(d - 13_000) < 400, `${Math.round(d)} m`)
}

console.log("\nTHE REASON LINE IS A FACT, NEVER A SCORE:")
ok("named destination", commuteMatchReason(19, "Fort Sam") === "19 min to Fort Sam")
ok("unnamed destination still factual", commuteMatchReason(12, null) === "12 min to your destination")
ok("blank label falls back", commuteMatchReason(12, "  ") === "12 min to your destination")
ok("no percentage or score anywhere in the module",
  !/score|percent|weight|rating/i.test(strip(read("lib/propertyExplorer/commuteMode.ts"))))

console.log("\nTHE UI OPTIONS AND THE COLUMN AGREE:")
ok("options are 10/15/20/30/45", JSON.stringify(COMMUTE_MINUTE_OPTIONS) === "[10,15,20,30,45]")
ok("every option is inside the column's CHECK range (1-180)",
  COMMUTE_MINUTE_OPTIONS.every((m) => m > 0 && m <= 180))
{
  const sql = read("supabase/manual/20261010_commute_max_minutes.sql")
  // Check the DDL line itself — the verification queries legitimately contain
  // "commute_max_minutes is not null", which a looser pattern mistook for a column
  // constraint.
  const ddl = /add column if not exists\s+commute_max_minutes\s+([^;]*);/i.exec(sql)?.[1] ?? ""
  ok("the column is nullable (no NOT NULL on the DDL)", ddl.trim() === "integer", JSON.stringify(ddl.trim()))
  ok("the migration adds no default, so every existing lead stays in Area Mode",
    !/add column if not exists commute_max_minutes integer\s+default/i.test(sql))
  ok("the CHECK range matches the route's validation", /commute_max_minutes <= 180/.test(sql))
  ok("it writes no lead data", !/^\s*update\s+public\.leads/im.test(sql.split("-- ─── VERIFICATION")[0]))
}

console.log("\nWIRING — the mode reaches the places that need it:")
{
  const fit = strip(read("lib/propertyExplorer/locationFit.ts"))
  ok("the commute branch is FIRST, before the structured area path",
    fit.indexOf("isCommuteMode(") < fit.indexOf("hasStructured"))
  ok("rank 0 is only ever used by the commute branch",
    (fit.match(/rank: 0/g) ?? []).length === 1)
  const explorer = strip(read("components/crm/explorer/BeastPropertyExplorer.tsx"))
  ok("the explorer dispatches on commuteMode", /if \(commuteMode && activeClient\?\.id != null\)/.test(explorer))
  ok("…and falls back to the area path when the route says not Commute Mode",
    /if \(!ok\) void searchThisArea/.test(explorer))
  ok("Area Mode's own call is unchanged",
    /void searchThisArea\(hasAreas \? desiredAreaCenters : undefined\)/.test(explorer))
  const route = strip(read("app/api/admin/leads/commute-candidates/route.ts"))
  ok("the route verifies with the EXISTING Routes module", /driveTimesToAnchor\(/.test(route))
  ok("…and qualifies on the verified minutes, not the radius", /meetsCommute\(x\.minutes, max\)/.test(route))
  ok("the route uses the caller's session, never the service role",
    /createClient\(\)/.test(route) && !/service_role|SERVICE_ROLE/.test(route))
  ok("it selects leads with * so a pending migration cannot 500 it",
    /\.from\("leads"\)\s*\n?\s*\.select\("\*"\)/.test(route))
  ok("Places searchNearby is NOT used for the commute pool", !/searchNearby/.test(route))
}
{
  const field = strip(read("components/crm/CommuteDestinationField.tsx"))
  ok("the Max Drive selector offers the shared options", /COMMUTE_MINUTE_OPTIONS\.map/.test(field))
  ok("'No limit' writes null, returning the client to Area Mode",
    /e\.target\.value === "" \? null : Number\(e\.target\.value\)/.test(field))
  const lf = strip(read("components/LeadFields.tsx"))
  ok("clearing the destination clears the maximum too",
    /if \(!placeId\) updateField\("commute_max_minutes", ""\)/.test(lf))
  ok("blank persists as NULL, not \"\"",
    /"commute_max_minutes",/.test(strip(read("lib/leads/leadFormValues.ts"))))
  const submit = strip(read("app/api/leads/submit/route.ts"))
  ok("the submit route validates it as an integer, not a string",
    /NULLABLE_INTEGER_FIELDS = \["commute_max_minutes"\]/.test(submit))
  ok("…and it is absent from SCALAR_LABELS so a resubmission cannot blank it",
    !/commute_max_minutes: "/.test(submit))
}

console.log("\nNOT INFERRED FROM NOTES:")
for (const f of [
  "lib/propertyExplorer/commuteMode.ts",
  "app/api/admin/leads/commute-candidates/route.ts",
  "lib/propertyExplorer/locationFit.ts",
]) {
  const src = strip(read(f))
  ok(`${f.split("/").pop()} never reads notes`, !/locator_notes|\bnotes\b/.test(src))
}

console.log("\nTHE OTHER GUARDRAILS STILL HOLD:")
ok("MAX_SUGGESTIONS is still 8", /MAX_SUGGESTIONS = 8/.test(read("lib/propertyExplorer/suggestions.ts")))
ok("MAX_UNLEASH_AREAS is still 3", /MAX_UNLEASH_AREAS = 3/.test(read("lib/propertyExplorer/multiArea.ts")))
ok("the intake limit is still 2", /MAX_LOCATIONS = 2/.test(read("lib/formOptions.ts")))
ok("the area aliases are untouched",
  /Uptown: \["uptown dallas"\]/.test(read("lib/propertyExplorer/areaAliases.ts")))

console.log(`\nCommute Mode: ${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
