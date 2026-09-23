/**
 * Budget V1 — client working budget vs the external site's property-wide rent range. Pure, no DB/DOM:
 *   npx tsx scripts/tests/budget.test.ts
 *
 * Row contract: Budget: Within budget | Options within budget | $125 over budget
 * Rules under test: range parsing (both sides), the ClientContext budget precedence
 * (structured baseline → confirmed Locator Notes/AI Insights override; Client Notes
 * never auto-override), all three outcomes, and unknown-stays-unknown.
 */
import { parseMoneyRange, resolveClientBudget, evaluateBudget, resolveClientContext, budgetTolerance, BUDGET_TOLERANCE } from "@bc/companion-shared"

let pass = 0,
  fail = 0
const eq = (a: unknown, b: unknown, name: string) => {
  if (a === b) pass++
  else {
    fail++
    console.error("✗", `${name} — got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`)
  }
}
const eqRange = (a: { min: number; max: number } | null, b: { min: number; max: number } | null, name: string) => {
  const okAll = a === b || (!!a && !!b && a.min === b.min && a.max === b.max)
  if (okAll) pass++
  else {
    fail++
    console.error("✗", `${name} — got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`)
  }
}

// ── Range parsing — the external site's confirmed price-chip text ──────────────────────────
eqRange(parseMoneyRange("$925 - $1,199"), { min: 925, max: 1199 }, "live the external site chip → structured range")
eqRange(parseMoneyRange("$1,600–$1,700"), { min: 1600, max: 1700 }, "en-dash range (Smart Form format)")
eqRange(parseMoneyRange("1600 to 1700"), { min: 1600, max: 1700 }, "bare 'to' range")
eqRange(parseMoneyRange("$1,200"), { min: 1200, max: 1200 }, "single amount → zero-width range")
eqRange(parseMoneyRange("$1,199 - $925"), { min: 925, max: 1199 }, "reversed bounds are ordered defensively")

// ── Unparseable / missing rent is UNKNOWN, never $0 ──────────────────────────
eq(parseMoneyRange("Call for pricing"), null, "'Call for pricing' → null")
eq(parseMoneyRange(""), null, "empty → null")
eq(parseMoneyRange(null), null, "null → null")
eq(parseMoneyRange("$0"), null, "zero is not a usable figure")
eq(parseMoneyRange("no digits here"), null, "no figures → null")

// ── Client budget precedence ─────────────────────────────────────────────────
const ctx = (i: Parameters<typeof resolveClientContext>[0]) => resolveClientContext(i)

eqRange(resolveClientBudget(ctx({ budgetText: "$1,600 – $1,800" })), { min: 1600, max: 1800 }, "structured Smart Form budget = baseline")
eqRange(
  resolveClientBudget(ctx({ budgetText: "$1,600 – $1,800", locatorNotes: "Budget is now $2,100 max." })),
  { min: 2100, max: 2100 },
  "confirmed Locator Note OVERRIDES the baseline",
)
eqRange(
  resolveClientBudget(ctx({ budgetText: "$1,600 – $1,800", aiInsights: ["Raised her budget to $2,000."] })),
  { min: 2000, max: 2000 },
  "AI Insight overrides the baseline",
)
eqRange(
  resolveClientBudget(ctx({ budgetText: "$1,600 – $1,800", locatorNotes: "Budget dropped to $1,400." })),
  { min: 1400, max: 1400 },
  "an override may LOWER the budget too",
)
eqRange(
  resolveClientBudget(ctx({ budgetText: "$1,600 – $1,800", clientNotes: "I could maybe stretch to $2,500." })),
  { min: 1600, max: 1800 },
  "Client Notes NEVER auto-override the structured budget",
)
eqRange(
  resolveClientBudget(ctx({ locatorNotes: "Max budget $1,900." })),
  { min: 1900, max: 1900 },
  "an override alone works when there is no structured budget",
)
eqRange(
  resolveClientBudget(ctx({ budgetText: "$1,600 – $1,800", locatorNotes: "Paid $500 in fees last year." })),
  { min: 1600, max: 1800 },
  "a bare dollar amount is NOT mistaken for a budget",
)
eqRange(
  resolveClientBudget(ctx({ locatorNotes: "Budget was $1,500. Budget is now $1,750." })),
  { min: 1750, max: 1750 },
  "the LAST stated budget wins within the confirmed layer",
)
eqRange(resolveClientBudget(ctx({ locatorNotes: "Budget $1,600-$1,800." })), { min: 1600, max: 1800 }, "an override may state a range")
eq(resolveClientBudget(ctx({})), null, "no budget anywhere → null")

// ── The three outcomes ───────────────────────────────────────────────────────
const client = (budgetText: string) => ctx({ budgetText })

eq(evaluateBudget(client("$1,600 – $1,800"), { min: 925, max: 1199 }), "Within budget", "entire range at/below max → Within budget")
eq(evaluateBudget(client("$1,600 – $1,800"), { min: 1700, max: 1800 }), "Within budget", "range ending exactly at the max is within")
eq(
  evaluateBudget(client("$1,400 – $1,600"), { min: 1400, max: 1800 }),
  "Options within budget",
  "range straddles the max → Options within budget",
)
eq(
  evaluateBudget(client("$1,400 – $1,600"), { min: 1725, max: 2100 }),
  "$125 over budget",
  "property minimum − client maximum → $125 over budget",
)
eq(evaluateBudget(client("$1,600"), { min: 2600, max: 3000 }), "$1,000 over budget", "thousands are comma-formatted")

// ── Never claims "$X under budget" from a property-wide range ────────────────
{
  const r = evaluateBudget(client("$1,600 – $1,800"), { min: 1575, max: 1600 })
  eq(r, "Within budget", "a cheap range says Within budget — never '$25 under budget'")
  eq(/under budget/.test(String(r)), false, "the phrase 'under budget' is never produced")
}

// ── Unknowns hide the row; nothing is invented ───────────────────────────────
eq(evaluateBudget(client("$1,600 – $1,800"), null), null, "property rent missing → hidden")
eq(evaluateBudget(client("$1,600 – $1,800"), parseMoneyRange("Call for pricing")), null, "unparseable rent → hidden")
eq(evaluateBudget(ctx({}), { min: 925, max: 1199 }), null, "client budget missing → hidden")
eq(evaluateBudget(ctx({}), null), null, "both missing → hidden")
eq(evaluateBudget(ctx({ clientNotes: "Not sure yet." }), { min: 925, max: 1199 }), null, "context with no budget → hidden")

// ── The override drives the outcome, not just the value ──────────────────────
{
  const raised = ctx({ budgetText: "$1,400 – $1,600", locatorNotes: "Budget is now $2,000." })
  eq(evaluateBudget(raised, { min: 1725, max: 1900 }), "Within budget", "raised budget flips over-budget → Within budget")
}


// ── Matching TOLERANCE — a locator does not apply a hard cutoff ──────────────
// Tiers come from the EXISTING Specials intelligence (selectRentConcession), never a
// second parser, and never a net-effective-rent calculation.
eq(BUDGET_TOLERANCE.none, 100, "base tolerance is a named constant")
eq(BUDGET_TOLERANCE.meaningful, 200, "meaningful-concession tolerance")
eq(BUDGET_TOLERANCE.strong, 300, "strong-concession tolerance")

eq(budgetTolerance(null), 100, "no specials → base tolerance")
eq(budgetTolerance([]), 100, "empty specials → base tolerance")
eq(budgetTolerance(["App Fee Waived", "Gift Card: $500"]), 100, "non-rent offers earn no extra tolerance")
eq(budgetTolerance(["$1000 off first month rent"]), 100, "a dollar-off offer states no free PERIOD → base")
eq(budgetTolerance(["2 weeks free"]), 100, "2 weeks is below the meaningful threshold")
eq(budgetTolerance(["4 weeks free"]), 200, "4 weeks free → meaningful")
eq(budgetTolerance(["1 month free"]), 200, "1 month free → meaningful")
eq(budgetTolerance(["6 weeks free"]), 300, "6 weeks free → strong")
eq(budgetTolerance(["8 weeks free"]), 300, "8 weeks free → strong")
eq(budgetTolerance(["2 months free"]), 300, "2 months free → strong")
eq(budgetTolerance(["Up to 8 weeks free"]), 300, "a qualified offer still earns tolerance (leniency, not a rent claim)")

// ── The approved worked examples, client max $1,500 ──────────────────────────
const max1500 = client("$1,500")
eq(evaluateBudget(max1500, { min: 1575, max: 1900 }, null), "Near budget", "$1,575 min, no special → Near budget ($75 ≤ $100)")
eq(evaluateBudget(max1500, { min: 1675, max: 1900 }, null), "$175 over budget", "$1,675 min, no special → $175 over budget")
eq(
  evaluateBudget(max1500, { min: 1675, max: 1900 }, ["1 month free"]),
  "Near budget",
  "$1,675 min with 1 month free → Near budget ($175 ≤ $200)",
)
eq(
  evaluateBudget(max1500, { min: 1775, max: 2000 }, ["2 months free"]),
  "Near budget",
  "$1,775 min with 2 months free → Near budget ($275 ≤ $300)",
)
eq(
  evaluateBudget(max1500, { min: 1850, max: 2100 }, ["2 months free"]),
  "$350 over budget",
  "$1,850 min with 2 months free → $350 over budget (beyond tolerance)",
)

// ── Boundaries + the reported gap is the TRUE gap ────────────────────────────
eq(evaluateBudget(max1500, { min: 1600, max: 1900 }, null), "Near budget", "exactly at the base tolerance is Near budget")
eq(evaluateBudget(max1500, { min: 1601, max: 1900 }, null), "$101 over budget", "one dollar beyond tolerance reports the FULL gap")
eq(evaluateBudget(max1500, { min: 1800, max: 2000 }, ["2 months free"]), "Near budget", "exactly at the strong tolerance")
eq(
  evaluateBudget(max1500, { min: 1801, max: 2000 }, ["2 months free"]),
  "$301 over budget",
  "the gap is never reduced by the tolerance",
)

// ── Tolerance never overrides the other verdicts ─────────────────────────────
eq(evaluateBudget(max1500, { min: 900, max: 1400 }, ["2 months free"]), "Within budget", "a concession cannot change Within budget")
eq(
  evaluateBudget(max1500, { min: 1400, max: 1900 }, ["2 months free"]),
  "Options within budget",
  "a straddling range stays Options within budget",
)
eq(evaluateBudget(ctx({}), { min: 1675, max: 1900 }, ["2 months free"]), null, "no client budget → still hidden")
eq(evaluateBudget(max1500, null, ["2 months free"]), null, "no property rent → still hidden")


// ── The client's LOWER bound must never act as a threshold ──────────────────
// Live case: Emily's range is $2,500–$3,000 and an AI insight reads "Budget is flexible
// above $2,500". That phrase states the BOTTOM of her range; treating it as a cap
// collapsed her max from 3,000 to 2,500.
const EMILY = ctx({
  budgetText: "$2,500 – $3,000",
  aiInsights: ["Luxury renter — wants a high-end downtown community.", "Budget is flexible above $2,500 for the right finishes."],
})
eqRange(resolveClientBudget(EMILY), { min: 2500, max: 3000 }, "'flexible above $2,500' does NOT cap the budget — full range kept")
eq(evaluateBudget(EMILY, { min: 1850, max: 2600 }), "Within budget", "$1,850–$2,600 is within a $3,000 max")

// A property BELOW the client's lower number is fully within budget, never penalised
eq(evaluateBudget(EMILY, { min: 1900, max: 2000 }), "Within budget", "$2,000 property is within budget, not penalised for being under $2,500")
eq(evaluateBudget(ctx({ budgetText: "$2,500 – $3,000" }), { min: 900, max: 1100 }), "Within budget", "far below the lower bound is still Within budget")

// Other floor phrasings behave the same
eqRange(resolveClientBudget(ctx({ budgetText: "$1,600 – $1,800", locatorNotes: "Budget at least $1,600." })), { min: 1600, max: 1800 }, "'at least' is a floor, not a cap")
eqRange(resolveClientBudget(ctx({ budgetText: "$1,600 – $1,800", locatorNotes: "Can go above $1,700." })), { min: 1600, max: 1800 }, "'above' is a floor, not a cap")

// A genuine override still works in BOTH directions
eqRange(resolveClientBudget(ctx({ budgetText: "$1,600 – $1,800", locatorNotes: "Budget dropped to $1,400." })), { min: 1400, max: 1400 }, "a real downward override still applies")
eqRange(resolveClientBudget(ctx({ budgetText: "$1,600 – $1,800", locatorNotes: "Budget is now $2,100 max." })), { min: 2100, max: 2100 }, "a real upward override still applies")
eqRange(resolveClientBudget(ctx({ budgetText: "$1,600 – $1,800", locatorNotes: "Budget above $2,000-$2,400." })), { min: 2000, max: 2400 }, "a stated RANGE is still used even with floor wording")

// Above the max, the EXISTING tolerance/specials rules still govern
eq(evaluateBudget(EMILY, { min: 3050, max: 3400 }, null), "Near budget", "$50 over a $3,000 max → Near budget (base $100 tolerance)")
eq(evaluateBudget(EMILY, { min: 3250, max: 3600 }, ["2 months free"]), "Near budget", "$250 over with a strong concession → Near budget ($300 tolerance)")
eq(evaluateBudget(EMILY, { min: 3400, max: 3800 }, null), "$400 over budget", "beyond tolerance still reports the true gap")

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
