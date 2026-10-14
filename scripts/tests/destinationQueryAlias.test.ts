// DESTINATION QUERY ALIASES — the rewrite applied before the Places lookup.
//
// Pure and offline. Run: `npx tsx scripts/tests/destinationQueryAlias.test.ts`
// (The live-API behaviour is exercised separately by scripts/tests/resolveDestination.live.ts.)
//
// The rule this protects: we did NOT loosen the resolver's ambiguity refusal to make a military
// base resolve. COHESION_RADIUS_KM is untouched; we ask Google a better question instead. So the
// tests below are mostly about the rewrite staying narrow — anything not in the map must reach
// Places exactly as the renter said it.

import { aliasDestinationQuery, hasDestinationAlias, normalizeDestinationQuery } from "@/lib/criteria/destinationQueryAliases"
import { narrowCommutePatch, hasExplicitDestination } from "@/lib/criteria/notesPatchRules"

let pass = 0
let fail = 0
const ok = (l: string, c: boolean) => { if (c) { pass++; console.log(`  ✓ ${l}`) } else { fail++; console.log(`  ✗ ${l}`) } }

const CANON = "Joint Base San Antonio-Randolph"

console.log("\nThe approved alias and its variants")
for (const v of [
  "Randolph AFB", "randolph afb", "RANDOLPH AFB", "  Randolph AFB  ",
  "Randolph A.F.B.", "Randolph Air Force Base", "randolph air force base",
  "JBSA Randolph", "JBSA-Randolph", "Joint Base San Antonio Randolph",
]) ok(`"${v}" → canonical`, aliasDestinationQuery(v) === CANON)

console.log("\nNormalisation")
ok("case folded", normalizeDestinationQuery("Randolph AFB") === "randolph afb")
ok("periods dropped", normalizeDestinationQuery("Randolph A.F.B.") === "randolph afb")
ok("hyphens become spaces", normalizeDestinationQuery("JBSA-Randolph") === "jbsa randolph")
ok("runs of whitespace collapse", normalizeDestinationQuery("Randolph   AFB") === "randolph afb")

console.log("\nEverything else is passed through UNCHANGED")
for (const v of ["Lackland AFB", "Methodist Hospital", "UTSA", "Six Flags", "1604 and Bandera", "my office"]) {
  ok(`"${v}" is not rewritten`, aliasDestinationQuery(v) === v)
  ok(`"${v}" reports no alias`, !hasDestinationAlias(v))
}
ok("an empty query stays empty", aliasDestinationQuery("") === "")
ok("whitespace only stays empty", aliasDestinationQuery("   ") === "")
// A near-miss must NOT be coerced — "Randolph" alone is a county, a street and a town.
ok('"Randolph" alone is NOT aliased', aliasDestinationQuery("Randolph") === "Randolph")
ok('"Randolph Street" is NOT aliased', aliasDestinationQuery("Randolph Street") === "Randolph Street")

console.log("\nNo place ids are baked in")
const src = require("fs").readFileSync("lib/criteria/destinationQueryAliases.ts", "utf8")
ok("the alias map contains no Google place id", !/ChIJ[A-Za-z0-9_-]{10,}/.test(src))
// The whole point of the alias is that we did NOT relax the ambiguity rule to make a base
// resolve. Assert the constant itself, not the absence of the word (the file explains the
// reasoning and names it in a comment).
const resolverSrc = require("fs").readFileSync("lib/criteria/resolveDestination.ts", "utf8")
ok("COHESION_RADIUS_KM is still 1", /export const COHESION_RADIUS_KM = 1\b/.test(resolverSrc))
ok("ambiguity still returns a refusal", /status: "ambiguous"/.test(resolverSrc))

// ── WHAT A FORM NOTE MAY WRITE ──────────────────────────────────────────────────────────────
console.log("\nA form note may only fill blanks, and only commute columns")
const EMPTY = { neighborhoods: null, submarkets: null, commute_anchor_label: null, commute_anchor_place_id: null, commute_max_minutes: null }
const SET = { neighborhoods: "Alamo Heights", submarkets: null, commute_anchor_label: "Six Flags", commute_anchor_place_id: "ChIJexisting", commute_max_minutes: 20 }
const FULL_PATCH = { commute_anchor_label: "JBSA Randolph", commute_anchor_place_id: "ChIJnew", commute_max_minutes: 20, neighborhoods: "Converse", submarkets: "Northeast" }

const onEmpty = narrowCommutePatch(EMPTY, FULL_PATCH)
ok("writes the destination into an empty lead", onEmpty.commute_anchor_place_id === "ChIJnew")
ok("carries a STATED maximum alongside it", onEmpty.commute_max_minutes === 20)
// A DESTINATION IS NEVER AN AREA — reconciliation says so, and this makes it structural.
ok("never writes neighborhoods", !("neighborhoods" in onEmpty))
ok("never writes submarkets", !("submarkets" in onEmpty))

// NEVER OVERWRITE A PERSON.
ok("an already-set destination is detected", hasExplicitDestination(SET))
ok("an empty lead is not", !hasExplicitDestination(EMPTY))
const onSet = narrowCommutePatch(SET, FULL_PATCH)
ok("does not overwrite an existing anchor", !("commute_anchor_place_id" in onSet))
ok("does not overwrite an existing label", !("commute_anchor_label" in onSet))
ok("does not overwrite an existing maximum", !("commute_max_minutes" in onSet))
ok("does not touch the renter's chosen areas", !("neighborhoods" in onSet))

// NO INVENTED MAXIMUM, and no orphaned one.
const noMax = narrowCommutePatch(EMPTY, { commute_anchor_label: "JBSA Randolph", commute_anchor_place_id: "ChIJnew" })
ok("no maximum is invented when none was stated", !("commute_max_minutes" in noMax))
const orphanMax = narrowCommutePatch(EMPTY, { commute_max_minutes: 20 })
ok("a maximum without an anchor is dropped, not left dangling", !("commute_max_minutes" in orphanMax))

// IDEMPOTENT: applying the same patch to the now-populated lead changes nothing.
const after = { ...EMPTY, ...onEmpty }
ok("re-running writes nothing", Object.keys(narrowCommutePatch(after, FULL_PATCH)).length === 0)

console.log(`\n${pass} passed, ${fail} failed\n`)
process.exit(fail === 0 ? 0 : 1)
