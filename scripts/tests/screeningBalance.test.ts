// BROKEN LEASE / EVICTION BALANCE — the number that decides whether a property will consider
// a renter at all, and which the Credit Screening card never showed.
//
// Run: npx tsx scripts/tests/screeningBalance.test.ts   (pure — reads source)
//
// The value was never lost. Both lead forms ask "Approximate balance owed", the submit route
// whitelists broken_lease_amount, and Paul Villarreal's row holds "$500-$1,000". The Credit
// Screening card simply built its row out of the AGE alone.
import { readFileSync } from "node:fs"

let pass = 0, fail = 0
const ok = (l: string, c: boolean, d = "") => { if (c) { pass++; console.log(`  ✓ ${l}`) } else { fail++; console.log(`  ✗ ${l}${d ? `\n      ${d}` : ""}`) } }
const panel = readFileSync("components/crm/LeadPanel.tsx", "utf8")
const submit = readFileSync("app/api/leads/submit/route.ts", "utf8")
const beastForm = readFileSync("components/LeadFields.tsx", "utf8")
const siteForm = readFileSync("app/components/LandingForm.tsx", "utf8")

// The panel's own rule, reproduced exactly so the expectations below are the real ones.
const hasValue = (v: unknown) => v !== null && v !== undefined && (typeof v !== "string" || v.trim().length > 0)
const historyDetail = (age: unknown, balance: unknown): string =>
  [hasValue(age) ? `${age} ago` : null, hasValue(balance) ? `balance ${balance}` : null]
    .filter(Boolean).join(" · ") || "Yes"

console.log("\nwhat the row says")
ok('Paul: age AND balance', historyDetail("3 years", "$500-$1,000") === "3 years ago · balance $500-$1,000",
  historyDetail("3 years", "$500-$1,000"))
ok('age only still reads as it always did', historyDetail("3 years", null) === "3 years ago")
ok('balance only, no age', historyDetail(null, "$500-$1,000") === "balance $500-$1,000")
ok('neither still falls back to "Yes"', historyDetail(null, null) === "Yes")
// THE ONE THAT MATTERS FOR HONESTY: an explicit zero is an ANSWER, not an empty field.
ok('"$0" survives — a renter who owes nothing is not the same as one who was never asked',
  historyDetail("2 years", "$0") === "2 years ago · balance $0")
ok('"None" survives as a balance answer', historyDetail("1 year", "None").includes("None"))

console.log("\nthe panel actually uses it")
ok("the broken-lease row reads the amount", /historyDetail\(lead\.broken_lease_age, lead\.broken_lease_amount\)/.test(panel))
ok("the eviction row reads its balance too — the same omission", /historyDetail\(lead\.eviction_age, lead\.eviction_balance\)/.test(panel))
ok("the age-only expression is gone", !/lead\.broken_lease_age \? `\$\{lead\.broken_lease_age\} ago` : "Yes"/.test(panel))
ok("the Credit Screening layout is unchanged — same five rows, same labels",
  ["Credit Score", "Credit History", "Broken Lease", "Eviction", "Criminal Background"]
    .every((l) => panel.includes(`label="${l}"`)))
ok("Criminal Background still shows an explicit None", /if \(cb === "None"\) return "None"/.test(panel))

console.log("\nthe value was never lost in transit")
ok("the submit route whitelists the column", /"broken_lease_amount"/.test(submit))
ok("…and labels it Broken Lease Balance", /broken_lease_amount: "Broken Lease Balance"/.test(submit))
ok("the Lone Star site form collects it", /broken_lease_amount: formData\.brokenLeaseAmount/.test(siteForm))
ok("the Locator Beast native form collects it", /updateField\("broken_lease_amount"/.test(beastForm))
ok("both forms gate it on the same answer", /credit_history === "Broken Lease"/.test(beastForm))

console.log(`\n${pass} passed, ${fail} failed\n`)
process.exit(fail === 0 ? 0 : 1)
