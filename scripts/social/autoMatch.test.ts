// Unit tests for Social Autopilot filename → canonical property AUTO-RESOLUTION confidence gate.
// Pure logic only — no Google SDK. Run: npx tsx scripts/social/autoMatch.test.ts
import { decideAutoMatch, coreTokens, type AutoMatchCandidate } from "@/lib/social/propertyAutoMatch"

let pass = 0, fail = 0
const ok = (l: string, c: boolean) => { if (c) { pass++; console.log(`  ✓ ${l}`) } else { fail++; console.log(`  ✗ ${l}`) } }

const c = (name: string, address: string | null = null, placeId = name.toLowerCase().replace(/\W+/g, "-")): AutoMatchCandidate => ({ placeId, name, address })

console.log("coreTokens (brand tokens; generic + geo stripped):")
ok("strips townhomes + market", JSON.stringify(coreTokens("Botanica Hills Townhomes San Antonio")) === JSON.stringify(["botanica", "hills"]))
ok("strips leading number + generic 'apartments'", JSON.stringify(coreTokens("01 Alta Apartments")) === JSON.stringify(["alta"]))
ok("all-generic → empty", coreTokens("Luxury Apartments").length === 0)
ok("high-rise stripped", JSON.stringify(coreTokens("The Maple High-Rise")) === JSON.stringify(["maple"]))

console.log("auto-match (clear single winner):")
const botanica = decideAutoMatch("Botanica Hills Townhomes Medical Center", "San Antonio", [
  c("Botanica Oak Hills", "1 Med Dr, San Antonio, TX 78229, USA"),
  c("The Reserve Apartments", "500 Loop, San Antonio, TX 78240, USA"),
])
ok("fuzzy brand match resolves (Botanica Hills → Botanica Oak Hills)", botanica.match?.name === "Botanica Oak Hills")
ok("not flagged ambiguous", botanica.ambiguous === false)

const exact = decideAutoMatch("Alta Westover Hills", "San Antonio", [c("Alta Westover Hills", "SA, TX, USA"), c("Westover Park", "SA, TX, USA")])
ok("exact-name single winner resolves", exact.match?.name === "Alta Westover Hills")

const mueller = decideAutoMatch("Mueller Flats", "Austin", [c("Mueller Flats", "Austin, TX, USA")])
ok("generic suffix (flats) doesn't block exact brand", mueller.match?.name === "Mueller Flats")

console.log("auto-match declines (ambiguous / weak / generic):")
const standard = decideAutoMatch("The Standard", "Dallas", [
  c("The Standard at Legacy", "Plano, TX, USA"),
  c("The Standard Apartments", "Dallas, TX, USA"),
])
ok("two brand-sharers → no auto-match", standard.match === null)
ok("two brand-sharers → ambiguous flagged", standard.ambiguous === true)

const generic = decideAutoMatch("Luxury Apartments", "Houston", [c("Luxury Living Houston", "Houston, TX, USA")])
ok("all-generic inferred name → no match", generic.match === null && generic.ambiguous === false)

const weak = decideAutoMatch("Willow Creek", "Austin", [c("Oak Ridge Apartments", "Austin, TX, USA")])
ok("no brand overlap → no match", weak.match === null)

const loneCommon = decideAutoMatch("Park Place Residences", "Dallas", [c("Lincoln Park", "Dallas, TX, USA")])
ok("single shared common word only → no match (needs ≥2 or containment)", loneCommon.match === null)

console.log("auto-match respects market:")
const outOfMarket = decideAutoMatch("Botanica Hills", "Houston", [c("Botanica Oak Hills", "San Antonio, TX 78229, USA")])
ok("clear match in WRONG market → declined", outOfMarket.match === null)
const unknownAddrMarket = decideAutoMatch("Botanica Hills", "San Antonio", [c("Botanica Oak Hills", null)])
ok("undetectable address market → still allowed", unknownAddrMarket.match?.name === "Botanica Oak Hills")

console.log(`\nAuto-match unit: ${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
