// AI LEAD SUMMARY — what the agent's new-lead email says about a submission.
//
// Pure and offline. Run: `npx tsx scripts/tests/leadSummary.test.ts`
//
// The defect this guards: the summary used to append "…though income was not listed." to every
// lead, although the Smart Lead Form never asks for income. That turned a field the renter was
// never offered into a qualification concern. The rule now is simply: ABSENCE IS NOT A SIGNAL.

import { buildLeadSummary } from "@/lib/notifications/leadSummary"

let pass = 0
let fail = 0
function ok(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`) }
  else { fail++; console.log(`  ✗ ${label}`) }
}

// ── the reported case: the exact shape of the live test lead ────────────────────────────────
console.log("\nThe test lead")
const testLead = { property_type: "High-Rise", city: "San Antonio", credit_score: "750" }
const summary = buildLeadSummary(testLead, "30 days")
ok(
  "reads as approved",
  summary === "This lead is looking for a high-rise in San Antonio, with a move-in date within 30 days. Their reported credit score of 750 suggests strong credit.",
)
ok("never mentions income", !/income/i.test(summary))
ok("never says 'not listed'", !/not listed/i.test(summary))

// ── INCOME: present, absent, never requested ────────────────────────────────────────────────
console.log("\nIncome")
const withIncome = buildLeadSummary({ ...testLead, income: "$6,000–$8,000" }, "30 days")
ok("present ⇒ reported, and only then", withIncome.includes("They reported income of $6,000–$8,000."))
for (const [label, v] of [["absent (undefined)", undefined], ["absent (null)", null], ["absent (empty)", ""], ["absent (whitespace)", "   "]] as const) {
  const s = buildLeadSummary({ ...testLead, income: v }, "30 days")
  ok(`${label} ⇒ income is not mentioned at all`, !/income/i.test(s))
}
ok(
  "NOT REQUESTED — the field the form never asks for produces no clause",
  !/income|not listed|not provided|unknown/i.test(buildLeadSummary(testLead, "30 days")),
)

// ── CREDIT: self-reported, and only when a score exists ─────────────────────────────────────
console.log("\nCredit")
ok("a strong score is described as REPORTED", buildLeadSummary({ credit_score: "750" }, null).includes("Their reported credit score of 750 suggests strong credit."))
ok("never implies verification", !/verified|confirmed|checked/i.test(buildLeadSummary({ credit_score: "750" }, null)))
ok("a weak score is flagged, because the value supports it", buildLeadSummary({ credit_score: "580" }, null).includes("may need additional review"))
ok("680 is the boundary and counts as strong", buildLeadSummary({ credit_score: "680" }, null).includes("suggests strong credit"))
ok("679 does not", buildLeadSummary({ credit_score: "679" }, null).includes("may need additional review"))
// NO SCORE ⇒ NO CONCERN. The old copy said "Credit may require additional review" for a lead that
// simply had not reported one.
for (const [label, v] of [["missing", undefined], ["empty", ""], ["zero", "0"], ["non-numeric", "n/a"]] as const) {
  const s = buildLeadSummary({ ...testLead, credit_score: v }, "30 days")
  ok(`${label} score ⇒ no credit sentence, no concern raised`, !/credit/i.test(s))
}

// ── the submitted details, in priority order ────────────────────────────────────────────────
console.log("\nSubmitted details")
ok("city appears", buildLeadSummary({ property_type: "Apartment", city: "Austin" }, null).includes("in Austin"))
ok("an article is chosen by sound", buildLeadSummary({ property_type: "Apartment" }, null).includes("an apartment"))
ok("consonant takes 'a'", buildLeadSummary({ property_type: "Townhome" }, null).includes("a townhome"))
ok("beds appear when given", buildLeadSummary({ property_type: "Apartment", beds: "2" }, null).includes("2 beds"))
ok("one bed is singular", buildLeadSummary({ property_type: "Apartment", beds: "1" }, null).includes("1 bed)"))
ok("budget appears when given", buildLeadSummary({ property_type: "Apartment", desired_rent: "$1,800" }, null).includes("around $1,800"))
ok("move window appears when given", buildLeadSummary({ property_type: "Apartment" }, "60 days").includes("within 60 days"))
ok("no move window ⇒ no dangling clause", !buildLeadSummary({ property_type: "Apartment" }, null).includes("move-in"))
ok("no property type falls back to housing", buildLeadSummary({ city: "Dallas" }, null).includes("looking for housing in Dallas"))

// ── nothing is invented from an empty submission ────────────────────────────────────────────
console.log("\nAn almost-empty submission")
const bare = buildLeadSummary({}, null)
ok("still a sentence, not a crash", bare.length > 0 && bare.endsWith("."))
ok("no credit claim", !/credit/i.test(bare))
ok("no income claim", !/income/i.test(bare))
ok("no city invented", !/in the area|in undefined|in null/i.test(bare))

console.log(`\n${pass} passed, ${fail} failed\n`)
process.exit(fail === 0 ? 0 : 1)
