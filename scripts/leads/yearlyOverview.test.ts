// THE YEARLY OVERVIEW ROW — the goal link, the calendar boundary, and what must not have moved.
//
// Two things make this safe to ship, and both are asserted rather than assumed:
//
//   ONE STORED GOAL. Only profiles.monthly_commission_goal exists. The yearly field and the yearly
//   progress bar are both derived x12 from it, so they cannot drift from each other or from the
//   monthly row. A second stored column would have been a second source of truth.
//
//   A SEPARATE YEAR SCOPE. The monthly row reads the newest-100 window and is untouched. The
//   yearly row reads its own query — created this year OR closed this year — because a year total
//   taken from a newest-N window silently under-counts once the workspace outgrows it, and misses
//   a lead created last year that closed this year, which belongs in the year's revenue.
//
// Run: npx tsx scripts/leads/yearlyOverview.test.ts
import { readFileSync } from "node:fs"
import path from "node:path"
import { MONTHS_PER_YEAR, monthlyToYearly, yearlyToMonthly } from "../../lib/leads/goalPeriods"

let pass = 0, fail = 0
const ok = (l: string, c: boolean) => { if (c) { pass++; console.log(`  ✓ ${l}`) } else { fail++; console.log(`  ✗ ${l}`) } }
const read = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8")
const stats = read("components/crm/DashboardStats.tsx")
const settings = read("components/crm/settings/SettingsClient.tsx")
const page = read("app/admin/analytics/page.tsx")

// ── 1. THE GOAL LINK, INCLUDING THE OPERATOR'S OWN EXAMPLES ─────────────────
console.log("1. monthly and yearly goals are two views of one number:")
ok("12 months to a year", MONTHS_PER_YEAR === 12)
for (const [m, y] of [[2_000, 24_000], [10_000, 120_000], [300_000, 3_600_000]] as const) {
  ok(`$${m.toLocaleString()}/month = $${y.toLocaleString()}/year`, monthlyToYearly(m) === y)
  ok(`...and back again`, yearlyToMonthly(y) === m)
}
ok("zero stays zero", monthlyToYearly(0) === 0 && yearlyToMonthly(0) === 0)
ok("a round trip from any monthly value is lossless",
  [1, 7, 999, 1_234, 83_333, 1_000_000].every((m) => yearlyToMonthly(monthlyToYearly(m)) === m))
ok("a yearly value that is NOT a multiple of 12 settles on the nearest whole month",
  yearlyToMonthly(100_000) === 8_333 && monthlyToYearly(8_333) === 99_996)
ok("...and settling is idempotent — it does not drift further on re-entry",
  yearlyToMonthly(monthlyToYearly(yearlyToMonthly(100_000))) === yearlyToMonthly(100_000))

// ── 2. ONE SOURCE OF TRUTH ──────────────────────────────────────────────────
console.log("\n2. nothing stores a second goal:")
ok("Settings still writes only the monthly column", /monthly_commission_goal: toNumber\(goal\)/.test(settings))
ok("...and writes no annual column", !/annual_commission_goal|yearly_commission_goal/.test(settings))
ok("the analytics page reads no annual column", !/annual_commission_goal|yearly_commission_goal/.test(page))
ok("the yearly dashboard goal is DERIVED from the monthly one", /const goal = monthlyToYearly\(monthlyGoal\)/.test(stats))
ok("the yearly settings field is derived too", /monthlyToYearly\(toNumber\(goal\) \?\? 0\)/.test(settings))
ok("editing the yearly field writes back through the monthly value", /setGoal\(yearly === null \? "" : yearlyToMonthly\(yearly\)/.test(settings))
ok("both surfaces import the SAME conversion, so neither can restate it",
  /from "@\/lib\/leads\/goalPeriods"/.test(stats) && /from "@\/lib\/leads\/goalPeriods"/.test(settings))

// ── 3. THE YEAR SCOPE ───────────────────────────────────────────────────────
console.log("\n3. the yearly row has its own query, and the monthly scope is untouched:")
ok("a year-scoped fetch exists", /async function getYearLeads\(\)/.test(page))
ok("it matches created-this-year OR closed-this-year",
  /\.or\(`created_at\.gte\.\$\{yearStart\},closed_at\.gte\.\$\{yearStart\}`\)/.test(page))
ok("...so a lead created LAST year that closed THIS year is included", /closed_at\.gte/.test(page))
ok("the yearStart is the local calendar year boundary", /new Date\(new Date\(\)\.getFullYear\(\), 0, 1\)/.test(page))
ok("it is deduped like every other scope", /getYearLeads[\s\S]{0,900}?return dedupeLeads/.test(page))
ok("Business Overview still fetches its own 100-lead window, unchanged",
  /async function getDashboardLeads\(\)[\s\S]{0,400}?\.limit\(100\)/.test(page))
ok("the 500-lead analytics window is unchanged", /async function getLeads\(\)[\s\S]{0,300}?\.limit\(500\)/.test(page))
ok("the yearly row reads yearLeads, never the monthly window",
  /const closedThisYear = yearLeads\.filter/.test(stats) && /const generatedThisYear = yearLeads\.filter/.test(stats))

// ── 4. THE CALCULATIONS ─────────────────────────────────────────────────────
console.log("\n4. the five yearly figures are defined as agreed:")
ok("Yearly Goal uses the FROZEN closed snapshot, like the monthly card",
  /const revenueThisYear = sumClosedEstimatedCommission\(closedThisYear, projectionMethod, avgCommission\)/.test(stats))
ok("Active Pipeline reuses the existing value verbatim (same figure in both rows)",
  (stats.match(/<CountNum value=\{activePipelineValue\}/g) ?? []).length === 2)
ok("Leads This Year counts created_at in the calendar year", /generatedThisYear = yearLeads\.filter\(\(l\) => isThisYear\(l\.created_at\)\)/.test(stats))
ok("...against 300 x 12", /const YEARLY_LEAD_GOAL\s*= MONTHLY_LEAD_GOAL \* MONTHS_PER_YEAR/.test(stats))
ok("Projected = YTD closed + applied, a SUM of two disjoint sets",
  /const projectedThisYear = revenueThisYear \+ estimate\(appliedNow\)/.test(stats))
ok("...and the card says so, including that applied leads may close later",
  /YTD closed \+ \{yearly\.appliedCount\} applied/.test(stats) && /may close later/.test(stats))
ok("Closed This Year counts closed_at in the calendar year", /closedCount: closedThisYear\.length/.test(stats))
ok("the year boundary is a single shared helper", /function isThisYear\(dateStr: string \| null \| undefined\): boolean/.test(stats))

// ── 5. THE MONTHLY ROW AND EVERYTHING BELOW IT ──────────────────────────────
console.log("\n5. nothing else moved:")
ok("isThisMonth is unchanged", /return d\.getFullYear\(\) === now\.getFullYear\(\) && d\.getMonth\(\) === now\.getMonth\(\)/.test(stats))
ok("the monthly revenue, goal percentage and lead count are untouched",
  /const revenueThisMonth = sumClosedEstimatedCommission\(closedThisMonth, projectionMethod, avgCommission\)/.test(stats)
  && /const progressPct\s+= Math\.min\(Math\.round\(\(revenueThisMonth \/ monthlyGoal\) \* 100\), 100\)/.test(stats)
  && /const generatedThisMonth = leads\.filter\(\(l\) => isThisMonth\(l\.created_at\)\)/.test(stats))
ok("the monthly Projected Commission is still Applied-only", /const projectedCommission = estimate\(appliedLeads\)/.test(stats))
ok("the yearly row renders only when a year scope was supplied", /\{yearly && \(/.test(stats))
ok("...and yearly is null without it", /if \(!yearLeads\) return null/.test(stats))
ok("both rows use the identical five-column grid", (stats.match(/grid grid-cols-5 gap-3/g) ?? []).length === 2)
ok("ten cards share one card class — no second style was introduced",
  (stats.match(/bg-\[var\(--crm-panel\)\] rounded-xl border border-\[var\(--crm-border\)\] shadow-sm px-4 py-2/g) ?? []).length === 10)
ok("Projection Method and Save Goals are untouched in Settings",
  /name="projection-method"/.test(settings) && /projection_method: method/.test(settings))
ok("the Settings fields are three-up on desktop and stacked on mobile", /grid grid-cols-1 gap-4 md:grid-cols-3/.test(settings))

console.log(`\nYearly Overview: ${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
