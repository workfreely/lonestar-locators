// BEAST MATCHES / ALL PROPERTIES — the map-view filter.
//
// Pure and offline. Run: `npx tsx scripts/tests/beastShortlist.test.ts`
// No map, no Google, no network.
//
// THE REPORTED DEFECT. Unleash returns eight matches; adding one as a recommendation re-renders
// the Dashboard, which rebuilds every marker at full opacity, and the surrounding inventory that
// had merely been dimmed to 0.22 reappears around the eight. The shortlist lived in marker
// opacity, so it did not survive a rebuild. These functions move it into identity.

import { readFileSync } from "node:fs"
import {
  resolveShortlistIds,
  applyShortlist,
  shortlistStillValid,
  BEAST_SHORTLIST_FALLBACK_CAP,
} from "@/lib/propertyExplorer/beastShortlist"
import { MAX_SUGGESTIONS } from "@/lib/propertyExplorer/suggestions"

let pass = 0
let fail = 0
function ok(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`) }
  else { fail++; console.log(`  ✗ ${label}`) }
}

const prop = (id: string) => ({ placeId: id, propertyName: `P${id}`, lat: 29.4, lng: -98.5 }) as never
// Eight matches inside a loaded area of thirty — the reported scenario.
const EIGHT = ["m1", "m2", "m3", "m4", "m5", "m6", "m7", "m8"]
const PLOTTED = [...EIGHT, ...Array.from({ length: 22 }, (_, i) => `x${i + 1}`)]
const VISIBLE = PLOTTED.map(prop) as { placeId: string }[] as never[]

// ── which ids form the shortlist ────────────────────────────────────────────────────────────
console.log("\nResolving one run's shortlist")
const eight = resolveShortlistIds(EIGHT, PLOTTED)
ok("eight ranked matches produce exactly eight", eight.length === 8)
ok("rank order is preserved exactly", eight.join(",") === EIGHT.join(","))
ok("the surrounding inventory is not in it", !eight.some((id) => id.startsWith("x")))
// A suggestion with no coordinates was never plotted and never had a halo.
ok("an unplotted suggestion is dropped", resolveShortlistIds([...EIGHT, "noCoords"], PLOTTED).length === 8)
ok("a repeated id cannot inflate the count", resolveShortlistIds(["m1", "m1", "m2"], PLOTTED).length === 2)

console.log("\nThe fallback, unchanged")
ok("no ranked evidence ⇒ the first ten plotted", resolveShortlistIds([], PLOTTED).join(",") === PLOTTED.slice(0, 10).join(","))
ok(`the maximum of ${BEAST_SHORTLIST_FALLBACK_CAP} is preserved`, resolveShortlistIds([], PLOTTED).length === 10 && BEAST_SHORTLIST_FALLBACK_CAP === 10)
ok("a short pool returns what exists, never padded", resolveShortlistIds([], ["a", "b"]).length === 2)
ok("nothing plotted ⇒ an empty shortlist, not a crash", resolveShortlistIds([], []).length === 0)
// The ranked path is capped upstream and must NOT be re-capped down here.
ok("the ranked cap stays MAX_SUGGESTIONS, not the fallback cap", MAX_SUGGESTIONS === 8 && resolveShortlistIds(EIGHT, PLOTTED).length === MAX_SUGGESTIONS)

// ── what the map plots ──────────────────────────────────────────────────────────────────────
console.log("\nBeast Matches mode")
const beast = applyShortlist(VISIBLE, eight, "beast", null)
ok("only the eight are plotted", beast.length === 8)
ok("result order is untouched", beast.map((p: { placeId: string }) => p.placeId).join(",") === EIGHT.join(","))
ok("the surrounding inventory is not plotted", !beast.some((p: { placeId: string }) => p.placeId.startsWith("x")))

console.log("\nAll Properties mode")
const all = applyShortlist(VISIBLE, eight, "all", null)
ok("the full inventory is plotted", all.length === 30)
// IDENTITY MATTERS: a new array here would rebuild every marker for nothing.
ok("the array is returned by reference, so no needless marker rebuild", all === (VISIBLE as unknown as typeof all))
ok("before any run, the filter is inert", applyShortlist(VISIBLE, null, "beast", null) === (VISIBLE as unknown as typeof all))

// ── THE REPORTED SEQUENCE ───────────────────────────────────────────────────────────────────
console.log("\nThe reported sequence")
// 2. add one as a recommendation → the Dashboard re-renders → markers rebuild. The shortlist is
//    state, so the SAME ids are applied to the SAME results.
const afterOneRecommendation = applyShortlist(VISIBLE, eight, "beast", null)
ok("3. the same eight remain after adding a recommendation", afterOneRecommendation.length === 8 && afterOneRecommendation.map((p: { placeId: string }) => p.placeId).join(",") === EIGHT.join(","))
const afterTwo = applyShortlist(VISIBLE, eight, "beast", null)
ok("4. still eight after a second one", afterTwo.length === 8)
ok("5. All Properties shows the broader inventory", applyShortlist(VISIBLE, eight, "all", null).length === 30)
ok("6. back to Beast Matches returns the original eight, with no new run", applyShortlist(VISIBLE, eight, "beast", null).map((p: { placeId: string }) => p.placeId).join(",") === EIGHT.join(","))

console.log("\nSelection survives the filter")
const withSelection = applyShortlist(VISIBLE, eight, "beast", "x7")
ok("7. a selected non-match keeps its marker and its detail panel", withSelection.length === 9 && withSelection.some((p: { placeId: string }) => p.placeId === "x7"))
ok("a selected match is not duplicated", applyShortlist(VISIBLE, eight, "beast", "m3").length === 8)

// ── one client's shortlist never reaches another ────────────────────────────────────────────
console.log("\nContext")
const held = { clientId: 91, marketSlug: "san-antonio" }
ok("same client, same market ⇒ the shortlist stands", shortlistStillValid(held, { clientId: 91, marketSlug: "san-antonio" }))
ok("string and number ids are the same client", shortlistStillValid(held, { clientId: "91", marketSlug: "san-antonio" }))
ok("ANOTHER CLIENT invalidates it", !shortlistStillValid(held, { clientId: 92, marketSlug: "san-antonio" }))
ok("losing the client invalidates it", !shortlistStillValid(held, { clientId: null, marketSlug: "san-antonio" }))
ok("a market switch invalidates it", !shortlistStillValid(held, { clientId: 91, marketSlug: "austin" }))

// ── missing coordinates, handled as the map already handles them ────────────────────────────
console.log("\nMissing coordinates")
// The marker effect plots `visible.filter(hasCoordinates)`, so an uncoordinated property is
// simply never plotted — before this change and after it. The filter must not invent a marker
// for one, and must not drop it from the result list either.
const withBlind = [...VISIBLE, { placeId: "blind", propertyName: "No point", lat: null, lng: null } as never]
ok("an uncoordinated property is never in the shortlist", !resolveShortlistIds(["blind"], PLOTTED).includes("blind"))
ok("All Properties still carries it in the result list", applyShortlist(withBlind as never[], eight, "all", null).length === 31)


// ── WIRING: the pure functions only help if the Explorer actually uses them ─────────────────
// The defect was never in a pure function — it was that the shortlist had no representation
// outside marker opacity. These assert the component holds it as state, applies it to what it
// plots, and drops it on each of the three invalidating events.
console.log("\nWired into the Explorer")
const src = readFileSync("components/crm/explorer/BeastPropertyExplorer.tsx", "utf8")
ok("the shortlist is React state, not marker opacity", /const \[beastShortlist, setBeastShortlist\] = useState<string\[\] \| null>\(null\)/.test(src))
ok("the view mode is state too", /const \[mapFilter, setMapFilter\] = useState<MapFilterMode>\("all"\)/.test(src))
ok("it filters what the map plots", /applyShortlist\(baseVisible, beastShortlist, mapFilter/.test(src))
ok("the shortlist is captured from the SAME choice the halos made", /resolveShortlistIds\(suggestedIdsRef\.current, plottedIdsRef\.current\)/.test(src))
ok("a completed run selects Beast Matches automatically", /setBeastShortlist\(shortlist\)[\s\S]{0,400}setMapFilter\("beast"\)/.test(src))
ok("the match COUNT comes from the shortlist, so label and filter agree", /setBeastMatchCount\(shortlist\.length\)/.test(src))
ok("a new Unleash run clears the previous shortlist", /beastReset\(\)\n\s*setBeastShortlist\(null\)\n\s*setMapFilter\("all"\)/.test(src))
ok("a market switch clears it", /setRadarOrigins\(\[\]\)[\s\S]{0,200}setBeastShortlist\(null\)/.test(src))
ok("a client change is checked against the held context", /shortlistStillValid\(shortlistContextRef\.current/.test(src))
ok("the toggle offers both modes", /"Beast Matches"/.test(src) && /"All Properties"/.test(src))
ok("the toggle is hidden until a run produces a shortlist", /beastShortlist !== null \? \(/.test(src))
ok("switching modes runs NO search — it only sets state", /onClick=\{\(\) => setMapFilter\(mode\)\}/.test(src))
// NEGATIVE CONTROL on the wiring: the old unfiltered expression must be gone, or the filter
// would be computed and then ignored.
ok("the map no longer plots the unfiltered set", !/for \(const p of baseVisible\.filter\(hasCoordinates\)\)/.test(src) && /for \(const p of visible\.filter\(hasCoordinates\)\)/.test(src))
ok("matching, ranking and commute scoring are untouched here", !/computeSuggestions\s*=/.test(src) && !/MAX_SUGGESTIONS\s*=/.test(src))

console.log(`\n${pass} passed, ${fail} failed\n`)
process.exit(fail === 0 ? 0 : 1)
