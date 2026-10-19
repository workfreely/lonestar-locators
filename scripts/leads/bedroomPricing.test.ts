// Recommended Properties — derived bedroom pricing. Pure unit tests.
//
// Run: npx tsx scripts/leads/bedroomPricing.test.ts
//
// Every rule the owner stated is asserted here, and the ones that protect the locator's own
// text are asserted with a NEGATIVE CONTROL as well — a test that cannot fail is not evidence.

import {
  requestedBedrooms,
  startingRentFor,
  pricingReasonText,
  isPricingReason,
  displayReasons,
  PRICING_SLOT_INDEX,
  type CatalogPricing,
} from "@/lib/leads/bedroomPricing"

let pass = 0
let fail = 0
const ok = (label: string, cond: boolean, detail = "") => {
  if (cond) { pass++; console.log(`  ✓ ${label}`) }
  else { fail++; console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`) }
}
const eq = (label: string, actual: unknown, expected: unknown) =>
  ok(label, JSON.stringify(actual) === JSON.stringify(expected), `got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`)

const FULL: CatalogPricing = { onebrStartingRent: 1350, twobrStartingRent: 1400, threebrStartingRent: 1850 }
const NONE: CatalogPricing = { onebrStartingRent: null, twobrStartingRent: null, threebrStartingRent: null }
const MAX = 3

console.log("\n=== requestedBedrooms — the three values production actually holds ===")
eq('"1" → 1', requestedBedrooms("1"), 1)
eq('"2" → 2', requestedBedrooms("2"), 2)
eq('"3+" → 3 (asked for three or more; 3BR is the count they asked about)', requestedBedrooms("3+"), 3)

console.log("\n=== requestedBedrooms — tolerated spellings ===")
for (const s of ["3", " 2 ", "1BR", "1 bed", "2 Bedrooms", "3+ ", "1br"]) {
  ok(`${JSON.stringify(s)} resolves`, requestedBedrooms(s) !== null, "returned null")
}

console.log("\n=== requestedBedrooms — FAILS CLOSED (null ⇒ no price is ever shown) ===")
for (const s of [null, undefined, "", "   ", "Studio", "studio", "0", "4", "5+", "any", "n/a"]) {
  eq(`${JSON.stringify(s)} → null`, requestedBedrooms(s as string | null | undefined), null)
}
console.log("  ranges are ambiguous and must NOT resolve to either end:")
for (const s of ["1-2", "2-3", "1–2", "2 to 3", "1/2", "1,2"]) {
  eq(`${JSON.stringify(s)} → null`, requestedBedrooms(s), null)
}

console.log("\n=== startingRentFor — EXACT match only, never a substitute ===")
eq("1BR reads the 1BR column", startingRentFor(FULL, 1), 1350)
eq("2BR reads the 2BR column", startingRentFor(FULL, 2), 1400)
eq("3BR reads the 3BR column", startingRentFor(FULL, 3), 1850)
const ONLY_2BR: CatalogPricing = { onebrStartingRent: null, twobrStartingRent: 1400, threebrStartingRent: null }
eq("1BR with only a 2BR price → null (NO substitution)", startingRentFor(ONLY_2BR, 1), null)
eq("3BR with only a 2BR price → null (NO substitution)", startingRentFor(ONLY_2BR, 3), null)

console.log("\n=== startingRentFor — junk values are 'not entered', not displayed ===")
eq("0 → null (a stored zero is a bad import, not a free apartment)", startingRentFor({ ...NONE, onebrStartingRent: 0 }, 1), null)
eq("negative → null", startingRentFor({ ...NONE, onebrStartingRent: -5 }, 1), null)
eq("NaN → null", startingRentFor({ ...NONE, onebrStartingRent: Number.NaN }, 1), null)
eq("numeric string still reads", startingRentFor({ ...NONE, onebrStartingRent: "1350" as unknown as number }, 1), 1350)

console.log("\n=== pricingReasonText — the approved copy ===")
eq("1BR", pricingReasonText(1, 1350), "1BR from $1,350")
eq("2BR (the owner's example)", pricingReasonText(2, 1400), "2BR from $1,400")
eq("3BR", pricingReasonText(3, 1850), "3BR from $1,850")
ok('says "from" — a STARTING rent, not a move-in quote', pricingReasonText(2, 1400).includes("from"))
ok("no cents", !/\.\d/.test(pricingReasonText(2, 1400.49)))
ok("never mentions bathrooms", !/bath|ba\b/i.test(pricingReasonText(2, 1400)))

console.log("\n=== displayReasons — the owner's worked example ===")
eq(
  "location · price · amenity, in that order",
  displayReasons(["1 min to Uptown", "Washer and Dryer"], FULL, "2", MAX),
  ["1 min to Uptown", "2BR from $1,400", "Washer and Dryer"],
)
ok("price lands in slot 2", displayReasons(["1 min to Uptown", "Washer and Dryer"], FULL, "2", MAX)[PRICING_SLOT_INDEX] === "2BR from $1,400")

console.log("\n=== displayReasons — the saved array is NEVER mutated ===")
{
  const saved = ["1 min to Uptown", "Washer and Dryer"]
  const snapshot = JSON.stringify(saved)
  const out = displayReasons(saved, FULL, "2", MAX)
  ok("input array unchanged after the call", JSON.stringify(saved) === snapshot, JSON.stringify(saved))
  ok("a NEW array is returned (not the same reference)", out !== (saved as unknown as string[]))
  // NEGATIVE CONTROL: prove the assertion above can fail.
  const mutated = [...saved]; mutated.push("x")
  ok("(control) a mutated copy IS detected as different", JSON.stringify(mutated) !== snapshot)
}

console.log("\n=== displayReasons — no price ⇒ reasons preserved exactly, no placeholder ===")
eq("no catalog pricing at all", displayReasons(["1 min to Uptown"], NONE, "2", MAX), ["1 min to Uptown"])
eq("requested 1BR, only a 2BR price exists", displayReasons(["1 min to Uptown"], ONLY_2BR, "1", MAX), ["1 min to Uptown"])
eq("bedroom count unknown (Studio)", displayReasons(["1 min to Uptown"], FULL, "Studio", MAX), ["1 min to Uptown"])
eq("bedroom count a range", displayReasons(["1 min to Uptown"], FULL, "1-2", MAX), ["1 min to Uptown"])
eq("no beds recorded", displayReasons(["1 min to Uptown"], FULL, null, MAX), ["1 min to Uptown"])
ok("no output anywhere contains a placeholder", !displayReasons(["1 min to Uptown"], NONE, "2", MAX).some((r) => /from \$\s*$|TBD|—/.test(r)))

console.log("\n=== displayReasons — THREE-SLOT LIMIT: never evict, never a fourth ===")
{
  const three = ["1 min to Uptown", "Washer and Dryer", "Rooftop pool"]
  const out = displayReasons(three, FULL, "2", MAX)
  eq("all three manual reasons preserved verbatim", out, three)
  ok("no fourth reason forced", out.length === MAX, `length ${out.length}`)
  ok("no price inserted", !out.some(isPricingReason))
  // NEGATIVE CONTROL: with a slot free, the price DOES appear — so the test above is
  // detecting the limit, not a broken insert.
  ok("(control) with 2 saved, the price IS inserted", displayReasons(three.slice(0, 2), FULL, "2", MAX).length === 3)
}

console.log("\n=== displayReasons — duplicate prevention ===")
eq(
  "our own derived text is not added twice",
  displayReasons(["1 min to Uptown", "2BR from $1,400"], FULL, "2", MAX),
  ["1 min to Uptown", "2BR from $1,400"],
)
eq(
  "a HAND-TYPED price in a different format also blocks it",
  displayReasons(["2 BR from $1400"], FULL, "2", MAX),
  ["2 BR from $1400"],
)
ok("isPricingReason recognises loose formatting", isPricingReason("2 BR from $1400") && isPricingReason("1BR from $1,350"))
ok("isPricingReason does NOT fire on ordinary reasons", !isPricingReason("1 min to Uptown") && !isPricingReason("Washer and Dryer") && !isPricingReason("Within your budget"))

console.log("\n=== displayReasons — a price change is reflected on the next render ===")
{
  const saved = ["1 min to Uptown", "Washer and Dryer"]
  const before = displayReasons(saved, { ...FULL, twobrStartingRent: 1400 }, "2", MAX)
  const after = displayReasons(saved, { ...FULL, twobrStartingRent: 1525 }, "2", MAX)
  ok("old price rendered before", before[1] === "2BR from $1,400")
  ok("new price rendered after, with no write anywhere", after[1] === "2BR from $1,525")
  eq("the saved reasons are identical across both renders", saved, ["1 min to Uptown", "Washer and Dryer"])
}

console.log("\n=== displayReasons — degenerate inputs stay safe ===")
eq("no saved reasons at all → price alone", displayReasons([], FULL, "2", MAX), ["2BR from $1,400"])
eq("blank strings are dropped, not counted toward the limit", displayReasons(["", "  ", "1 min to Uptown"], FULL, "2", MAX), ["1 min to Uptown", "2BR from $1,400"])

console.log(fail === 0 ? `\nALL ${pass} CHECKS PASSED.\n` : `\n${fail} of ${pass + fail} FAILED.\n`)
process.exit(fail === 0 ? 0 : 1)
