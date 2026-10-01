// PASS 1 — area plumbing. Three bugs upstream of the matching algorithm, none of
// which touch ranking or scoring.
//
// Measured against the eight fixtures (scripts/matching/runFixtures.ts):
//   two-areas-plus-nearby   centroids 2→3 · candidates 40→60 · qualified 2→22
//   broad-many-areas        centroids 2→3 · candidates 28→34 · qualified 2
//   every other fixture     unchanged, and NO fixture lost a qualified property
//
// Run: npx tsx scripts/matching/areaPlumbing.test.ts
import { readFileSync } from "node:fs"
import path from "node:path"
import { resolveDesiredAreaCenters, composeDesiredAreas, MAX_UNLEASH_AREAS } from "@/lib/propertyExplorer/multiArea"

let pass = 0, fail = 0
const ok = (l: string, c: boolean, d = "") => {
  if (c) { pass++; console.log(`  ✓ ${l}${d ? ` — ${d}` : ""}`) } else { fail++; console.log(`  ✗ ${l}${d ? ` — ${d}` : ""}`) }
}
const read = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8")
const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1")

console.log("1. RESOLVE BEFORE CAPPING — an unresolvable label must not consume a slot:")
{
  // The real production shape: three Houston leads store "All of Houston" FIRST,
  // and it has no centroid. Under the old cap-then-resolve order slice(0,3) took
  // [All of Houston, Downtown, Midtown] and only TWO of the three resolved.
  const csv = "All of Houston, Downtown Houston, Midtown, Montrose, The Heights"
  const centers = resolveDesiredAreaCenters(csv, "houston")
  ok("a 12-area client reaches the full cap of 3", centers.length === 3, `${centers.length} centroids`)
  ok("the three centroids are distinct places",
    new Set(centers.map((c) => `${c.lat},${c.lng}`)).size === 3)
  // The slot the catch-all used to eat went to the NEXT resolvable area, not nowhere.
  const solo = resolveDesiredAreaCenters("Downtown Houston, Midtown, Montrose", "houston")
  ok("the recovered slot holds the third real area",
    JSON.stringify(centers) === JSON.stringify(solo))
}
{
  const centers = resolveDesiredAreaCenters("Nowhere Place, Also Fake, Downtown San Antonio, Stone Oak", "san-antonio")
  ok("two junk labels at the front no longer hide the real ones", centers.length === 2, `${centers.length}`)
}
ok("the cap itself is unchanged at 3", MAX_UNLEASH_AREAS === 3)
ok("an all-unresolvable list still yields nothing (no downtown fallback)",
  resolveDesiredAreaCenters("Fake A, Fake B", "san-antonio").length === 0)

console.log("\n2. 'All of {City}' costs nothing — via the SAME mechanism, no special case:")
// The form generates this catch-all itself and the catalog deliberately omits it
// ("do not list it in neighborhoods"), so it is just an unresolvable label. There
// is no regex for it anywhere: an explicit filter would be dead code today AND
// would silently suppress a real "all of {city}" centroid if one were catalogued.
ok("it has no centroid, like any unknown label",
  resolveDesiredAreaCenters("All of Houston", "houston").length === 0)
ok("and it no longer costs the real areas behind it a slot",
  resolveDesiredAreaCenters("All of Houston, Downtown Houston", "houston").length === 1)
ok("no 'all of' special case exists in the resolver",
  !/all of/i.test(strip(read("lib/propertyExplorer/multiArea.ts"))
    .slice(strip(read("lib/propertyExplorer/multiArea.ts")).indexOf("export function resolveDesiredAreaCenters"))
    .split("\n").filter((l) => !l.trim().startsWith("*")).join("\n")))
// A real place that merely starts with "all" must still resolve.
ok("a genuine label is unaffected", resolveDesiredAreaCenters("Alamo Ranch", "san-antonio").length === 1)

console.log("\n3. BOTH columns reach matching — `??` discarded Nearby Areas:")
ok("neighborhoods and submarkets are unioned",
  composeDesiredAreas("Alamo Heights, Stone Oak", "Boerne") === "Alamo Heights, Stone Oak, Boerne")
// THE bug: `??` only falls through on null/undefined, so a non-null empty string won.
ok("an EMPTY neighborhoods string no longer hides Nearby Areas",
  composeDesiredAreas("", "Boerne") === "Boerne")
ok("null neighborhoods still yields the Nearby Areas", composeDesiredAreas(null, "Boerne") === "Boerne")
ok("neighborhoods lead, since the cap applies in order",
  composeDesiredAreas("Stone Oak", "Boerne").startsWith("Stone Oak"))
ok("the same place in both columns takes ONE slot, not two",
  composeDesiredAreas("Boerne", "Boerne") === "Boerne")
ok("de-duplication is case-insensitive", composeDesiredAreas("boerne", "Boerne") === "boerne")
ok("no areas at all yields an empty string", composeDesiredAreas(null, null) === "")
{
  // End to end: the fixture that was losing a real area.
  const csv = composeDesiredAreas("Alamo Heights, Stone Oak", "Boerne")
  ok("the two-areas-plus-nearby fixture now resolves 3 centroids",
    resolveDesiredAreaCenters(csv, "san-antonio").length === 3)
}

console.log("\n4. RANKING AND SCORING ARE UNTOUCHED:")
{
  const fit = strip(read("lib/propertyExplorer/locationFit.ts"))
  const sug = strip(read("lib/propertyExplorer/suggestions.ts"))
  ok("the four location tiers are unchanged",
    /rank: 1/.test(fit) && /rank: 2/.test(fit) && /rank: 3/.test(fit) && /rank: 4/.test(fit))
  ok("suggestions still rank ascending then truncate",
    /sort\(\(a, b\) => \(a\.fit!\.rank \?\? 99\) - \(b\.fit!\.rank \?\? 99\)\)/.test(sug))
  // Pass 3 changes this number; Pass 1 must not.
  ok("MAX_SUGGESTIONS is still 5 in this pass", /MAX_SUGGESTIONS = 5/.test(sug))
  ok("only tone === 'match' qualifies", /tone === "match"/.test(sug))
}

console.log("\n5. EVERY MATCHING CALL SITE uses the union:")
{
  const dash = strip(read("components/crm/DashboardClient.tsx"))
  ok("no `neighborhoods ?? submarkets` remains in the CRM", !/neighborhoods \?\? /.test(dash))
  ok("all three matching call sites compose", (dash.match(/composeDesiredAreas\(/g) ?? []).length === 3)
}

console.log("\n6. THE MAP ITSELF IS UNCHANGED:")
{
  const explorer = strip(read("components/crm/explorer/BeastPropertyExplorer.tsx"))
  ok("it still calls resolveDesiredAreaCenters with the default cap",
    /resolveDesiredAreaCenters\(activeClient\?\.desiredAreas, marketSlug\)/.test(explorer))
  ok("the 3 km restriction is unchanged", /radius: 3000/.test(explorer))
  ok("the property-type gate is unchanged", /includedPrimaryTypes/.test(explorer))
  ok("the camera still never moves in the area path", !/panTo/.test(explorer.slice(explorer.indexOf("const searchThisArea"), explorer.indexOf("const applyNameDecision"))))
}

console.log(`\nPass 1 — area plumbing: ${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
