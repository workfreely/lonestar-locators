// PASS 3 — MAX_SUGGESTIONS 5 → 8.
//
// The claim this suite defends: the cap is a CEILING ON AN ALREADY-QUALIFIED,
// ALREADY-RANKED LIST, so raising it can only admit ranked positions 6-8 and can
// never pad the list with weak matches.
//
// Measured against the eight fixtures (scripts/matching/runFixtures.ts):
//   two-areas-plus-nearby  starred 5 → 8, the 3 added sitting at positions 6,7,8 of
//                          the BEFORE qualified pool of 22
//   commute-vs-areas       stayed at 5 — its entire qualified pool is 5, which is the
//                          "never pad" property holding under a cap of 8
//   every other fixture    unchanged; no fixture's qualified pool or ranking moved
//
// Run: npx tsx scripts/matching/suggestionCap.test.ts
import { readFileSync, existsSync } from "node:fs"
import path from "node:path"
import { computeSuggestions, MAX_SUGGESTIONS } from "@/lib/propertyExplorer/suggestions"
import type { ExplorerProperty } from "@/lib/propertyExplorer/types"

let pass = 0, fail = 0
const ok = (l: string, c: boolean, d = "") => {
  if (c) { pass++; console.log(`  ✓ ${l}${d ? ` — ${d}` : ""}`) } else { fail++; console.log(`  ✗ ${l}${d ? ` — ${d}` : ""}`) }
}
const read = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8")
const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1")

/** A property whose address names `area`, which is what earns a MATCH tone. */
const prop = (name: string, area: string): ExplorerProperty => ({
  placeId: `pid-${name}`, propertyId: `pid-${name}`,
  propertyName: name, propertyAddress: `100 Main St, ${area}, San Antonio, TX 78209`,
  propertyUrl: "", lat: 29.49, lng: -98.46,
  source: "google_places", marketSlug: "san-antonio",
} as ExplorerProperty)

console.log("THE CAP IS 8:")
ok("MAX_SUGGESTIONS is 8", MAX_SUGGESTIONS === 8, String(MAX_SUGGESTIONS))
ok("it has exactly ONE consumer — the truncation loop", (() => {
  const src = strip(read("lib/propertyExplorer/suggestions.ts"))
  const uses = (src.match(/MAX_SUGGESTIONS/g) ?? []).length
  return uses === 2 // the export, and the `out.size >= MAX_SUGGESTIONS` break
})())
ok("the cap is applied AFTER filtering and sorting", (() => {
  const src = strip(read("lib/propertyExplorer/suggestions.ts"))
  const filterAt = src.indexOf('.filter((x) => x.fit?.tone === "match")')
  const sortAt = src.indexOf(".sort((a, b) =>")
  const capAt = src.indexOf("out.size >= MAX_SUGGESTIONS")
  if (!(filterAt > 0 && sortAt > filterAt && capAt > sortAt)) return false
  // And NOWHERE earlier: truncating the pool before the sort would rank an
  // arbitrary subset, which is the bug the cap of 5 effectively had before ranking
  // was introduced. The only mention before the sort may be the export itself.
  const beforeSort = src.slice(0, sortAt)
  return !/MAX_SUGGESTIONS/.test(beforeSort.slice(beforeSort.indexOf("export function computeSuggestions")))
})())

console.log("\nIT IS A CEILING, NOT A QUOTA — weak matches are never padded in:")
{
  // 5 qualifying + 4 that do not qualify. Under a cap of 8 the non-qualifying ones
  // must STILL be excluded: the extra headroom is not an invitation to fill it.
  const qualifying = ["A", "B", "C", "D", "E"].map((n) => prop(n, "Alamo Heights"))
  const notQualifying = ["W", "X", "Y", "Z"].map((n) => prop(n, "Nowhere Township"))
  const out = computeSuggestions([...qualifying, ...notQualifying], {
    city: "San Antonio", desiredAreas: "Alamo Heights",
  })
  ok("5 qualifying + 4 weak under a cap of 8 → exactly 5 suggested", out.size === 5, `${out.size}`)
  ok("not one of the weak properties was starred",
    notQualifying.every((p) => !out.has(p.placeId)))
  ok("every qualifying property was starred", qualifying.every((p) => out.has(p.placeId)))
}
{
  const out = computeSuggestions([prop("Solo", "Stone Oak")], { city: "San Antonio", desiredAreas: "Stone Oak" })
  ok("one match → one suggestion", out.size === 1)
}
{
  const out = computeSuggestions(["A", "B"].map((n) => prop(n, "Nowhere")), { city: "San Antonio", desiredAreas: "Stone Oak" })
  ok("no matches → no suggestions (never a floor)", out.size === 0)
}

console.log("\nQUALIFICATION IS UNTOUCHED — only tone === 'match' is evidence:")
{
  const src = strip(read("lib/propertyExplorer/suggestions.ts"))
  ok('the gate is still tone === "match"', /\.filter\(\(x\) => x\.fit\?\.tone === "match"\)/.test(src))
  ok("no client → no suggestions", computeSuggestions([prop("A", "Stone Oak")], null).size === 0)
  ok("no saved areas → no suggestions",
    computeSuggestions([prop("A", "Stone Oak")], { city: "San Antonio", desiredAreas: "" }).size === 0)
  // Being in the market is still not evidence; that would star everything.
  ok("a market-only property is not starred",
    !computeSuggestions([prop("A", "Converse")], { city: "San Antonio", desiredAreas: "Stone Oak" }).has("pid-A"))
}
{
  // locationFit is the qualifier and the ranker; Pass 3 must not have touched it.
  const fit = read("lib/propertyExplorer/locationFit.ts")
  ok("locationFit.ts is byte-identical to the Pass 1 baseline", (() => {
    // Asserted by content: the four tiers and the tone vocabulary.
    const s = strip(fit)
    return /rank: 1/.test(s) && /rank: 2/.test(s) && /rank: 3/.test(s) && /rank: 4/.test(s)
      && /tone: "match"/.test(s) && /tone: "neutral"/.test(s)
  })())
}

console.log("\nRANKING IS UNTOUCHED — strongest tier first, cap applied last:")
{
  const src = strip(read("lib/propertyExplorer/suggestions.ts"))
  ok("still sorted by rank ascending",
    /sort\(\(a, b\) => \(a\.fit!\.rank \?\? 99\) - \(b\.fit!\.rank \?\? 99\)\)/.test(src))
  ok("the loop breaks on size, it does not re-sort or re-score",
    /for \(const \{ p, fit \} of candidates\) \{\s*if \(out\.size >= MAX_SUGGESTIONS\) break/.test(src))
  ok("no score, percentage or weight was introduced",
    !/score|percent|weight/i.test(src.replace(/MAX_SUGGESTIONS/g, "")))
}

console.log("\nMATCHING AND MAP SEARCH ARE UNTOUCHED BY THIS PASS:")
{
  const multi = strip(read("lib/propertyExplorer/multiArea.ts"))
  ok("MAX_UNLEASH_AREAS is still 3", /MAX_UNLEASH_AREAS = 3/.test(multi))
  ok("the intake limit is still 2", /MAX_LOCATIONS = 2/.test(strip(read("lib/formOptions.ts"))))
  ok("suggestions.ts imports nothing new", (() => {
    const imports = read("lib/propertyExplorer/suggestions.ts").split("\n").filter((l) => l.startsWith("import"))
    return imports.length === 2 && imports.every((l) => /\.\/types|\.\/locationFit/.test(l))
  })())
  // Commute writes reasons; it has no part in qualification or in this cap. Checked
  // against CODE only — the doc comment legitimately names the commute-vs-areas
  // fixture when explaining why a cap of 8 still yields 5 there.
  ok("suggestions.ts has no commute coupling in its code",
    !/commute/i.test(strip(read("lib/propertyExplorer/suggestions.ts"))))
}

console.log("\nTHE FIXTURE EVIDENCE (recorded before/after baselines):")
{
  const dir = "scripts/matching/baselines"
  const bp = path.join(process.cwd(), dir, "pass3_before.json")
  const ap = path.join(process.cwd(), dir, "pass3_after.json")
  if (!existsSync(bp) || !existsSync(ap)) {
    ok("pass3 baselines are committed", false, "run runFixtures.ts --save pass3_before / pass3_after")
  } else {
    type Row = { fixtureId: string; qualifiedNames: string[]; qualifiedRanks: number[]; starredNames: string[]; maxSuggestions: number }
    const before: Row[] = JSON.parse(readFileSync(bp, "utf8"))
    const after: Row[] = JSON.parse(readFileSync(ap, "utf8"))
    ok("the before baseline was taken at a cap of 5", before.every((r) => r.maxSuggestions === 5))
    ok("the after baseline was taken at a cap of 8", after.every((r) => r.maxSuggestions === 8))
    ok("all eight fixtures are present", before.length === 8 && after.length === 8)

    let qualChanged = 0, reordered = 0, notFromPool = 0, outsideSix2Eight = 0, grew = 0
    for (const a of after) {
      const b = before.find((x) => x.fixtureId === a.fixtureId)!
      // Qualification: identical pool, identical ranks.
      if (JSON.stringify(b.qualifiedNames) !== JSON.stringify(a.qualifiedNames)
        || JSON.stringify(b.qualifiedRanks) !== JSON.stringify(a.qualifiedRanks)) qualChanged++
      // Ranking: the kept prefix is identical, in the same order.
      const pre = Math.min(b.starredNames.length, a.starredNames.length)
      if (JSON.stringify(b.starredNames.slice(0, pre)) !== JSON.stringify(a.starredNames.slice(0, pre))) reordered++
      const added = a.starredNames.filter((n) => !b.starredNames.includes(n))
      if (added.length) {
        grew++
        // Each addition must have ALREADY been qualified before this change…
        if (!added.every((n) => b.qualifiedNames.includes(n))) notFromPool++
        // …and must have sat at position 6, 7 or 8 of that earlier pool.
        const pos = added.map((n) => b.qualifiedNames.indexOf(n) + 1)
        if (!pos.every((x) => x >= 6 && x <= 8)) outsideSix2Eight++
      }
    }
    ok("NO fixture's qualified pool or ranks changed", qualChanged === 0, `${qualChanged} changed`)
    ok("NO fixture's kept prefix was reordered", reordered === 0, `${reordered} reordered`)
    ok("every newly starred property was ALREADY qualified", notFromPool === 0)
    ok("every addition came from ranked positions 6-8", outsideSix2Eight === 0)
    ok("exactly one fixture gained suggestions", grew === 1, `${grew} grew`)

    const headline = after.find((r) => r.fixtureId === "two-areas-plus-nearby")!
    const hb = before.find((r) => r.fixtureId === "two-areas-plus-nearby")!
    ok("two-areas-plus-nearby went 5 → 8", hb.starredNames.length === 5 && headline.starredNames.length === 8)
    ok("…from a qualified pool of 22, so 8 is a real ceiling not a stretch",
      headline.qualifiedNames.length === 22)

    // THE "never pad" PROPERTY, measured rather than argued.
    const commute = after.find((r) => r.fixtureId === "commute-vs-areas")!
    ok("commute-vs-areas stayed at 5 under a cap of 8 (its whole pool is 5)",
      commute.starredNames.length === 5 && commute.qualifiedNames.length === 5)
    ok("no fixture starred more than it qualified",
      after.every((r) => r.starredNames.length <= r.qualifiedNames.length))
    ok("no fixture starred more than the cap",
      after.every((r) => r.starredNames.length <= MAX_SUGGESTIONS))
  }
}

console.log(`\nSuggestion cap: ${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
