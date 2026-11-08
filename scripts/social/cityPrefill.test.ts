// CITY / MARKET PREFILL — the bug, and the precedence that fixes it.
//
// Run: npx tsx scripts/social/cityPrefill.test.ts
//
// THE BUG. Uploading "Ashton on West Dallas Apartments" prefilled City / Market as Dallas. The
// property is in Houston. Nothing was wrong with the property matching — the match was correct
// and the form said so — but the city was read by scanning the whole address as free text, and
// the street is W Dallas St. detectMarket returns the first phrase in table order, and Dallas is
// tested before Houston.
//
// It was order-dependent luck rather than a one-off: "E Houston St, San Antonio" resolved
// correctly only because San Antonio is tested first, and "Dallas St, Austin" fails exactly as
// the Houston case did. Both are pinned below.
import { readFileSync } from "node:fs"
import path from "node:path"
import {
  marketFromAddress, marketAfterMatch, detectMarket, localityFromAddress, inferFromFilename, suggestArea,
} from "@/lib/social/filenameInference"
import { SOCIAL_MARKETS } from "@/lib/social/markets"

let pass = 0, fail = 0
const ok = (l: string, c: boolean, d = "") => { if (c) { pass++; console.log(`  ✓ ${l}`) } else { fail++; console.log(`  ✗ ${l}${d ? ` — ${d}` : ""}`) } }
const read = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8")

const ASHTON = "2900 W Dallas St, Houston, TX 77019, USA"

console.log("THE REPORTED FAILURE:")
ok("the matched property's city is Houston, not Dallas", marketFromAddress(ASHTON) === "Houston",
  String(marketFromAddress(ASHTON)))
ok("…and the free-text scan it replaces still gets it wrong, so the fix is load-bearing",
  detectMarket(ASHTON) === "Dallas")
ok("the locality is read from the address, not guessed", localityFromAddress(ASHTON) === "Houston")
ok("end to end, after a match, the form would now say Houston",
  marketAfterMatch({ current: "Dallas", address: ASHTON }) === "Houston")

console.log("\nSTREET NAMES THAT CARRY ANOTHER MARKET'S NAME:")
const streets: [string, string][] = [
  ["2900 W Dallas St, Houston, TX 77019, USA", "Houston"],
  ["123 Dallas St, Austin, TX 78701, USA", "Austin"],
  ["100 E Houston St, San Antonio, TX 78205, USA", "San Antonio"],
  ["500 W Houston St, Fort Worth, TX 76102, USA", "DFW"],
  ["7 Austin Hwy, San Antonio, TX 78218, USA", "San Antonio"],
  ["1 San Antonio St, Austin, TX 78701, USA", "Austin"],
]
for (const [addr, want] of streets) {
  ok(`${addr.split(",")[0].padEnd(24)} → ${want}`, marketFromAddress(addr) === want, String(marketFromAddress(addr)))
}
ok("the previously-lucky ones did not regress",
  marketFromAddress("100 E Houston St, San Antonio, TX 78205, USA") === detectMarket("100 E Houston St, San Antonio, TX 78205, USA"))

console.log("\nORDINARY ADDRESSES IN EACH MARKET:")
const plain: [string, string][] = [
  ["1600 Main St, Houston, TX 77002, USA", "Houston"],
  ["1600 Main St, Dallas, TX 75201, USA", "Dallas"],
  ["1600 Congress Ave, Austin, TX 78701, USA", "Austin"],
  ["1600 Broadway, San Antonio, TX 78215, USA", "San Antonio"],
  ["1600 Main St, Fort Worth, TX 76102, USA", "DFW"],
]
for (const [addr, want] of plain) ok(`${addr} → ${want}`, marketFromAddress(addr) === want, String(marketFromAddress(addr)))
ok("Dallas and DFW are still distinct, never merged",
  marketFromAddress("1 Main St, Dallas, TX 75201, USA") === "Dallas"
  && marketFromAddress("1 Main St, Fort Worth, TX 76102, USA") === "DFW")
ok("every market it can return is in the taxonomy",
  plain.concat(streets).every(([a]) => { const m = marketFromAddress(a); return m === null || SOCIAL_MARKETS.includes(m) }))

console.log("\nSUBURBS — no market of their own, so the existing fallback must still run:")
for (const addr of [
  "4000 Schertz Pkwy, Schertz, TX 78154, USA",
  "100 Main St, Katy, TX 77493, USA",
  "100 Main St, Plano, TX 75074, USA",
  "100 Main St, Universal City, TX 78148, USA",
]) {
  ok(`${addr.split(",")[1].trim()} yields no market of its own`, marketFromAddress(addr) === null)
}
ok("…so a suburb keeps the filename's market", marketAfterMatch({ current: "San Antonio", address: "4000 Schertz Pkwy, Schertz, TX 78154, USA" }) === "San Antonio")
ok("…and with no filename market either, the old address scan still answers",
  marketAfterMatch({ current: "", address: "4000 Schertz Pkwy, Schertz, TX 78154 (San Antonio area), USA" }) === "San Antonio")

console.log("\nNO ADDRESS, NO MATCH — nothing changes:")
ok("a null address yields nothing", marketFromAddress(null) === null && marketFromAddress(undefined) === null)
ok("an empty address yields nothing", marketFromAddress("") === null)
ok("an address with no state code yields nothing", marketFromAddress("Somewhere in Texas") === null)
ok("an unmatched property keeps the filename's market",
  marketAfterMatch({ current: "Dallas", address: null }) === "Dallas")
ok("with nothing at all the field stays empty", marketAfterMatch({}) === "")

console.log("\nFILENAME-ONLY INFERENCE IS UNTOUCHED:")
const inf = inferFromFilename("Ashton on West Dallas Apartments.mp4")
ok("the filename still infers Dallas on its own — this fix does not change inference",
  inf.market === "Dallas")
ok("…and still strips the market phrase from the name", inf.propertyName === "Ashton on West Apartments")
ok("a San Antonio filename is unchanged",
  inferFromFilename("collection-at-schertz-townhomes-san-antonio.MP4").market === "San Antonio")
ok("a hash filename still infers no market", inferFromFilename("d6c96b0072e74107b53b11d5133fe9a6.MOV").market === null)
ok("a camera filename still infers nothing", inferFromFilename("IMG_3847.mp4").confidence === "missing")

console.log("\nA MARKET THE OPERATOR CHOSE IS NEVER OVERWRITTEN:")
ok("a chosen market survives a match whose city disagrees",
  marketAfterMatch({ current: "Dallas", locked: true, address: ASHTON }) === "Dallas")
ok("…in every market", ["Austin", "Dallas", "DFW", "Houston", "San Antonio"].every(
  (m) => marketAfterMatch({ current: m, locked: true, address: ASHTON }) === m))
ok("a chosen market survives a suburb too",
  marketAfterMatch({ current: "Houston", locked: true, address: "4000 Schertz Pkwy, Schertz, TX 78154, USA" }) === "Houston")
ok("but an UNCHOSEN one is refined", marketAfterMatch({ current: "Dallas", locked: false, address: ASHTON }) === "Houston")
ok("clearing the field and locking it keeps it clear",
  marketAfterMatch({ current: "", locked: true, address: ASHTON }) === "")

console.log("\nPRECEDENCE, IN ORDER:")
ok("1. the operator's pick beats everything",
  marketAfterMatch({ current: "Austin", locked: true, address: ASHTON, propertyName: "Dallas Tower" }) === "Austin")
ok("2. the verified city beats the filename",
  marketAfterMatch({ current: "Dallas", address: ASHTON }) === "Houston")
ok("3. the filename beats the old address scan",
  marketAfterMatch({ current: "Houston", address: "4000 Schertz Pkwy, Schertz, TX 78154 (Dallas area)" }) === "Houston")
ok("4. the property-name scan is the last resort, and only when asked for",
  marketAfterMatch({ current: "", address: "Unknown", propertyName: "The Houston Tower" }) === "Houston"
  && marketAfterMatch({ current: "", address: "Unknown" }) === "")

console.log("\nAREA / NEIGHBORHOOD FOLLOWS THE CORRECTED MARKET:")
ok("with the wrong market the locality was shown as the area — the second half of the bug",
  suggestArea(ASHTON, "Dallas") === "Houston")
ok("with the right market it is suppressed as a duplicate, leaving the field for a real area",
  suggestArea(ASHTON, "Houston") === "")
ok("a genuine suburb is still offered as the area",
  suggestArea("4000 Schertz Pkwy, Schertz, TX 78154, USA", "San Antonio") === "Schertz")

console.log("\nEVERY CALL SITE USES THE ONE RULE, AND MATCHING IS UNTOUCHED:")
{
  const files = [
    "components/crm/social/SocialAutopilotClient.tsx",
    "components/crm/social/BulkReview.tsx",
    "components/crm/social/PostEditor.tsx",
  ]
  const bodies = files.map(read)
  ok("no component scans an address for a market any more",
    bodies.every((b) => !/detectMarket\(\s*(m|r|res)[^)]*address/.test(b)))
  ok("…and none scans a property NAME directly either",
    bodies.every((b) => !/detectMarket\(\s*m\.name/.test(b)))
  const sites = bodies.join("\n").match(/marketAfterMatch\(/g) ?? []
  ok(`all six prefill sites go through marketAfterMatch (found ${sites.length})`, sites.length === 6, String(sites.length))
  ok("the upload dialog and bulk review record an explicit market override",
    /marketTouched: true/.test(bodies[0]) && /marketTouched: true/.test(bodies[1])
    && /next\.marketTouched = true/.test(bodies[1]))
  ok("the post editor treats any stored market as the operator's",
    /marketAfterMatch\(\{ current: mk, locked: !!mk/.test(bodies[2]))

  // THE MATCHING FILTER IS DELIBERATELY UNCHANGED. Its leniency — keep a candidate whose market
  // cannot be read — is what let the Houston property match under a Dallas filename at all.
  // Tightening it would have discarded the right answer instead of correcting it afterwards.
  const auto = read("lib/social/propertyAutoMatch.ts")
  ok("propertyAutoMatch still filters on detectMarket, untouched", /const am = detectMarket\(c\.address \?\? ""\)/.test(auto))
  ok("…and still keeps a candidate whose market cannot be read", /return !am \|\| am === mkt/.test(auto))
  ok("the resolver itself is untouched", !/marketFromAddress|marketAfterMatch/.test(read("lib/social/resolveProperty.ts")))
  ok("upload and metadata saving are untouched",
    !/marketFromAddress|marketAfterMatch/.test(read("app/api/admin/social-autopilot/content/route.ts")))
}

console.log(`\nCity prefill: ${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
