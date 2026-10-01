// CURATED AREA ALIASES — the rank-2 keyword comparison accepts reviewed spellings.
//
// THE CRITICAL GUARDRAIL, asserted first and from several angles:
//     "minutes from Southtown"     must NOT satisfy  Southtown
//     "near Texas Medical Center"  must NOT satisfy  Medical Center
// Proximity language describes a property that is NOT in the area. The design reason
// this holds is that matching is exact equality against an allowlist, so a proximity
// phrase cannot qualify by construction — there is no filter that could be got wrong.
//
// Run: npx tsx scripts/matching/areaAliases.test.ts
import { readFileSync } from "node:fs"
import path from "node:path"
import { AREA_ALIASES, isAreaAlias, acceptedSpellings } from "@/lib/propertyExplorer/areaAliases"
import { assessLocationFit } from "@/lib/propertyExplorer/locationFit"
import { computeSuggestions } from "@/lib/propertyExplorer/suggestions"
import type { ExplorerProperty } from "@/lib/propertyExplorer/types"

let pass = 0, fail = 0
const ok = (l: string, c: boolean, d = "") => {
  if (c) { pass++; console.log(`  ✓ ${l}${d ? ` — ${d}` : ""}`) } else { fail++; console.log(`  ✗ ${l}${d ? ` — ${d}` : ""}`) }
}
const read = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8")
const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1")

/** A catalogued property carrying `keywords`, with an address that names nothing. */
const kw = (name: string, keywords: string[]): ExplorerProperty => ({
  placeId: `pid-${name}`, propertyId: `pid-${name}`, propertyName: name,
  // Deliberately a bare street + city so the rank-4 address path can never fire and
  // every match below is attributable to the keyword tier alone.
  propertyAddress: `1 Example St, Nowhereville, TX 70000`,
  propertyUrl: "", lat: 29.4, lng: -98.5, source: "google_places", marketSlug: null,
  locationKeywords: keywords, neighborhood: null, location: null,
} as ExplorerProperty)

const fit = (keywords: string[], area: string, city: string) =>
  assessLocationFit(kw("P", keywords), { city, desiredAreas: area })

console.log("THE CRITICAL GUARDRAIL — proximity is NEVER membership:")
ok('"minutes from southtown" does NOT satisfy Southtown',
  !isAreaAlias("minutes from southtown", "Southtown", "San Antonio"))
ok('…and does not qualify through assessLocationFit either',
  fit(["minutes from southtown"], "Southtown", "San Antonio")?.tone !== "match")
ok('"near texas medical center" does NOT satisfy Medical Center',
  !isAreaAlias("near texas medical center", "Medical Center", "Houston"))
ok('…and does not qualify through assessLocationFit either',
  fit(["near texas medical center"], "Medical Center", "Houston")?.tone !== "match")
// The membership form of that same place DOES qualify — that is the whole point.
ok('"texas medical center" (no proximity word) DOES satisfy Medical Center',
  isAreaAlias("texas medical center", "Medical Center", "Houston"))

console.log("\nEVERY proximity phrasing measured in the live catalog is refused:")
for (const [keyword, area, city] of [
  ["minutes from the domain", "Domain", "Austin"],
  ["minutes from the domain shopping and dining", "Domain", "Austin"],
  ["direct access to the domain", "Domain", "Austin"],
  ["between downtown austin and the domain", "Domain", "Austin"],
  ["near uptown dallas", "Uptown", "Dallas"],
  ["15 minutes to uptown dallas", "Uptown", "Dallas"],
  ["walking distance to uptown dallas shops and restaurants", "Uptown", "Dallas"],
  ["2 miles to uptown and highland park village", "Uptown", "Dallas"],
  ["near texas medical center", "Medical Center", "Houston"],
  ["3 miles from texas medical center", "Medical Center", "Houston"],
  ["walking distance to texas medical center", "Medical Center", "Houston"],
  ["texas medical center proximity", "Medical Center", "Houston"],
  ["texas medical center access", "Medical Center", "Houston"],
  ["near utsa", "UTSA", "San Antonio"],
  ["close to utsa", "UTSA", "San Antonio"],
  ["walking distance to utsa", "UTSA", "San Antonio"],
  ["minutes from utsa and major highways", "UTSA", "San Antonio"],
  ["near houston zoo and midtown", "Midtown", "Houston"],
  ["minutes from downtown midtown galleria memorial park", "Midtown", "Houston"],
] as const) {
  ok(`refused: "${keyword}" ↛ ${area}`, !isAreaAlias(keyword, area, city))
}

console.log("\nNO alias in the table contains proximity language:")
{
  // The table is the only way a spelling gets accepted, so this is the invariant that
  // keeps the guardrail true as entries are added later.
  const PROXIMITY = /\b(near|close to|minutes?|mins?|miles?|walking distance|short (walk|drive)|from|access|proximity|adjacent|between|around|convenient)\b/
  const offenders: string[] = []
  for (const [city, labels] of Object.entries(AREA_ALIASES))
    for (const [label, spellings] of Object.entries(labels))
      for (const s of spellings)
        if (PROXIMITY.test(s.toLowerCase())) offenders.push(`${city}/${label}: "${s}"`)
  ok("every curated spelling is a place name, not a distance", offenders.length === 0,
    offenders.join(" · ") || "0 offenders")
  // "Near Southside" was deliberately left out for exactly this reason.
  ok('"near southside" is deliberately absent',
    !AREA_ALIASES["Fort Worth"]["Near Southside (Magnolia)"].includes("near southside"))
  ok("…while its unambiguous half is present",
    AREA_ALIASES["Fort Worth"]["Near Southside (Magnolia)"].includes("magnolia"))
}

console.log("\nMATCHING IS EXACT EQUALITY, never substring:")
ok("a keyword that merely CONTAINS the label is refused",
  !isAreaAlias("uptown dallas extra words", "Uptown", "Dallas"))
ok("a label that merely contains the keyword is refused",
  !isAreaAlias("town", "Uptown", "Dallas"))
ok("no substring call exists in the module",
  !/\.includes\(|\.indexOf\(|RegExp|match\(/.test(
    strip(read("lib/propertyExplorer/areaAliases.ts")).split("export function isAreaAlias")[1] ?? ""))

console.log("\nMARKET SCOPING — a spelling never leaks between markets:")
ok('"midtown houston" satisfies Houston/Midtown', isAreaAlias("midtown houston", "Midtown", "Houston"))
ok('"midtown houston" does NOT satisfy Dallas/Midtown', !isAreaAlias("midtown houston", "Midtown", "Dallas"))
ok('"midtown dallas" satisfies Dallas/Midtown', isAreaAlias("midtown dallas", "Midtown", "Dallas"))
ok('"midtown dallas" does NOT satisfy Houston/Midtown', !isAreaAlias("midtown dallas", "Midtown", "Houston"))
ok('"uptown dallas" does NOT satisfy a San Antonio client', !isAreaAlias("uptown dallas", "Uptown", "San Antonio"))
ok("a null city matches nothing", !isAreaAlias("uptown dallas", "Uptown", null))
ok("an unknown market matches nothing", !isAreaAlias("uptown dallas", "Uptown", "Atlanta"))

console.log("\nTHE REVIEWED RULE-A MAPPINGS all work end to end:")
for (const [keyword, area, city] of [
  ["the domain", "Domain", "Austin"],
  ["uptown dallas", "Uptown", "Dallas"],
  ["midtown dallas", "Midtown", "Dallas"],
  ["medical district dallas", "Medical District", "Dallas"],
  ["dallas medical district", "Medical District", "Dallas"],
  ["oak lawn dallas", "Oak Lawn", "Dallas"],
  ["dallas design district", "Design District", "Dallas"],
  ["victory park dallas", "Victory Park", "Dallas"],
  ["fort worth cultural district", "Cultural District", "Fort Worth"],
  ["midtown houston", "Midtown", "Houston"],
  ["houston medical center", "Medical Center", "Houston"],
  ["river oaks houston", "River Oaks", "Houston"],
  ["the galleria", "Galleria", "Houston"],
  ["east downtown eado houston", "East Downtown (EaDo)", "Houston"],
  ["stone oak san antonio", "Stone Oak", "San Antonio"],
  ["san antonio medical center", "Medical Center", "San Antonio"],
] as const) {
  const f = fit([keyword], area, city)
  ok(`${city}: "${keyword}" → ${area}`, f?.tone === "match" && f.rank === 2, f ? `rank ${f.rank}` : "no fit")
}

console.log("\nTHE RULE-B label-derived aliases:")
for (const [keyword, area, city] of [
  ["south congress", "South Congress (SoCo)", "Austin"],
  ["soco", "South Congress (SoCo)", "Austin"],
  ["east downtown", "East Downtown (EaDo)", "Houston"],
  ["eado", "East Downtown (EaDo)", "Houston"],
  ["greenway", "Greenway / Upper Kirby", "Houston"],
  ["upper kirby", "Greenway / Upper Kirby", "Houston"],
  ["la cantera", "La Cantera/The Rim", "San Antonio"],
  ["the rim", "La Cantera/The Rim", "San Antonio"],
  ["universal city", "Universal City/Converse", "San Antonio"],
  ["converse", "Universal City/Converse", "San Antonio"],
  ["magnolia", "Near Southside (Magnolia)", "Fort Worth"],
  ["tcu", "TCU / Westcliff", "Fort Worth"],
  ["westcliff", "TCU / Westcliff", "Fort Worth"],
  ["stockyards", "Stockyards / North Side", "Fort Worth"],
  ["north side", "Stockyards / North Side", "Fort Worth"],
] as const) {
  ok(`${city}: "${keyword}" → ${area}`, isAreaAlias(keyword, area, city))
}

console.log("\nTHE RULE-C mappings — only the three individually reviewed:")
ok('"east riverside" → Austin/Riverside', isAreaAlias("east riverside", "Riverside", "Austin"))
ok('"east riverside austin" → Austin/Riverside', isAreaAlias("east riverside austin", "Riverside", "Austin"))
ok('"texas medical center" → Houston/Medical Center', isAreaAlias("texas medical center", "Medical Center", "Houston"))
// EXPLICITLY EXCLUDED on review: ambiguous between the two areas it names.
ok('"downtown midtown" is EXCLUDED as requested', !isAreaAlias("downtown midtown", "Midtown", "Houston"))
ok("no generic directional-prefix rule exists", (() => {
  const src = strip(read("lib/propertyExplorer/areaAliases.ts"))
  return !/\^\(east\|west\|north\|south/.test(src) && !/LOCAL_PREFIX/.test(src)
})())

console.log("\nTHE TIER, ORDER AND REASON TEXT ARE UNCHANGED:")
{
  const f = fit(["uptown dallas"], "Uptown", "Dallas")
  ok("an aliased hit is still rank 2", f?.rank === 2)
  ok("still labelled Location Keyword Match", f?.label === "Location Keyword Match")
  ok("the reason quotes the CATALOG's own wording, honestly",
    f?.reason === "Keyword: uptown dallas")
}
{
  // Rank 1 beats an aliased rank 2, exactly as before.
  const p = kw("P", ["uptown dallas"]) as ExplorerProperty & { neighborhood: string | null }
  p.neighborhood = "Uptown"
  const f = assessLocationFit(p, { city: "Dallas", desiredAreas: "Uptown" })
  ok("neighborhood (rank 1) still outranks an aliased keyword", f?.rank === 1)
}
{
  const src = strip(read("lib/propertyExplorer/locationFit.ts"))
  ok("the four tiers are unchanged",
    /rank: 1/.test(src) && /rank: 2/.test(src) && /rank: 3/.test(src) && /rank: 4/.test(src))
  // Exactly ONE call site, in the keyword tier. (The import line is excluded.)
  ok("aliases feed the KEYWORD tier only",
    (src.split("\n").filter((l) => !l.startsWith("import")).join("\n").match(/isAreaAlias\(/g) ?? []).length === 1)
  ok("ranks 1 and 3 are not aliased",
    /nbhdParts\.find\(\(part\) => clientAreas\.includes\(part\)\)/.test(src)
      && /loc && clientAreas\.includes\(loc\)/.test(src))
  ok("the address-text fallback is untouched",
    /n\.length >= 4 && address\.includes\(n\)/.test(src))
}

console.log("\nNOTHING QUALIFIES THAT DID NOT BEFORE, EXCEPT VIA THE TABLE:")
ok("a property with no keywords still does not qualify",
  fit([], "Uptown", "Dallas")?.tone !== "match")
ok("an unrelated keyword still does not qualify",
  fit(["gated community", "pet friendly community"], "Uptown", "Dallas")?.tone !== "match")
ok("a client with no areas still gets nothing",
  computeSuggestions([kw("P", ["uptown dallas"])], { city: "Dallas", desiredAreas: "" }).size === 0)
ok("the exact label still matches without any alias",
  fit(["downtown dallas"], "Downtown Dallas", "Dallas")?.tone === "match")

console.log("\nTABLE HYGIENE:")
{
  let entries = 0, spellings = 0
  const dupes: string[] = []
  for (const [city, labels] of Object.entries(AREA_ALIASES))
    for (const [label, list] of Object.entries(labels)) {
      entries++
      spellings += list.length
      if (new Set(list).size !== list.length) dupes.push(`${city}/${label}`)
      if (list.some((s) => s.toLowerCase() === label.toLowerCase())) dupes.push(`${city}/${label} repeats its own label`)
    }
  ok("no duplicate or self-referential spellings", dupes.length === 0, dupes.join(" · ") || "clean")
  ok("the table stays small enough to review by hand", entries <= 30, `${entries} labels, ${spellings} spellings`)
  ok("acceptedSpellings lists the label first",
    acceptedSpellings("Uptown", "Dallas")[0] === "uptown")
  ok("only searchable markets are covered (the other 11 have no centroids)",
    Object.keys(AREA_ALIASES).every((c) => ["Austin", "Dallas", "Fort Worth", "Houston", "San Antonio"].includes(c)))
}

console.log(`\nArea aliases: ${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
