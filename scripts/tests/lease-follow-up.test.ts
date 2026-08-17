/**
 * Future Lease Follow-Up — canonical action + date derivation + label round-trips.
 * Pure, no DB:
 *   npx tsx scripts/tests/lease-follow-up.test.ts
 *
 * Covers: lease_follow_up is a canonical key; "Renewal Follow-Up" open label /
 * "Lease Followed Up" completed label (both mirrors, via the CRM mirror here); the
 * numeric-months Lease Term rule; Lease End = Start + Term; Follow-Up due = End −
 * 90 days at 9:00 AM local (timezone-safe, incl. year-boundary + DST crossings);
 * and null (no fabricated date) for legacy/unparseable terms. Also re-asserts the
 * preserved display renames (Mark as Applied, Confirm Invoice Paid).
 */
import { parseLeaseTermMonths, isValidLeaseTerm, estimateLeaseEndDate, leaseFollowUpDueAt } from "@/lib/leads/leaseFollowUp"
import { formatWorkflowActionLabel, formatLastActionLabel } from "@/lib/leads/workflowActionLabels"
import { WORKFLOW_ACTION_KEYS } from "@bc/companion-shared"

let pass = 0,
  fail = 0
function ok(cond: boolean, name: string, extra = "") {
  cond ? pass++ : fail++
  console.log(`${cond ? "✓" : "✗"} ${name}${cond ? "" : `  ${extra}`}`)
}

const TZ = "America/Chicago"
// Calendar Y-M-D and 24h hour of an ISO instant, as seen in a zone.
const zoneYMD = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" })
const zoneHour = (iso: string) => new Date(iso).toLocaleString("en-US", { timeZone: TZ, hour: "2-digit", hour12: false }).replace(/[^0-9]/g, "")

// ── Canonical key + label round-trips ──
ok((WORKFLOW_ACTION_KEYS as readonly string[]).includes("lease_follow_up"), "lease_follow_up is a canonical action key")
ok(formatWorkflowActionLabel("lease_follow_up") === "Renewal Follow-Up", "open lease_follow_up → 'Renewal Follow-Up'")
ok(formatWorkflowActionLabel("Renewal Follow-Up") === "Renewal Follow-Up", "title round-trips → 'Renewal Follow-Up'")
ok(formatWorkflowActionLabel("Future Lease Follow-Up") === "Renewal Follow-Up", "legacy 'Future Lease Follow-Up' row title still resolves → 'Renewal Follow-Up'")
ok(formatLastActionLabel("Renewal Follow-Up") === "Lease Followed Up", "completed → 'Lease Followed Up'")
// Preserved renames from the prior pass.
ok(formatWorkflowActionLabel("start_application") === "Mark as Applied", "preserved: start_application → 'Mark as Applied'")
ok(formatWorkflowActionLabel("commission_paid") === "Confirm Invoice Paid", "preserved: commission_paid → 'Confirm Invoice Paid'")

// ── Lease Term: numeric whole months only ──
for (const t of ["6", "9", "12", "13", "15", "18", "24"]) ok(isValidLeaseTerm(t) && parseLeaseTermMonths(t) === Number(t), `accept "${t}" months`)
for (const t of ["", " ", "0", "-3", "12.5", "12 months", "one year", "6-mo", "abc"]) ok(!isValidLeaseTerm(t) && parseLeaseTermMonths(t) === null, `reject "${t}"`)

// ── Lease End = Start + Term (UTC-anchored calendar date) ──
const endYMD = (start: string, term: number) => {
  const e = estimateLeaseEndDate(start, term)!
  return `${e.getUTCFullYear()}-${String(e.getUTCMonth() + 1).padStart(2, "0")}-${String(e.getUTCDate()).padStart(2, "0")}`
}
ok(endYMD("2026-08-28", 12) === "2027-08-28", "2026-08-28 + 12mo → 2027-08-28")
ok(endYMD("2026-08-28", 6) === "2027-02-28", "2026-08-28 + 6mo → 2027-02-28")
ok(endYMD("2027-01-31", 1) === "2027-02-28", "Jan 31 + 1mo clamps → Feb 28 (add-months semantics)")

// ── Future Lease Follow-Up due = End − 90 days @ 9:00 AM local ──
// (dates hand-verified: End − 90 calendar days.)
const cases: [string, number, string][] = [
  ["2026-08-28", 12, "2027-05-30"], // the spec example
  ["2026-08-28", 6, "2026-11-30"],  // crosses the year boundary backwards
  ["2026-08-28", 15, "2027-08-30"],
  ["2026-08-28", 18, "2027-11-30"],
  ["2027-01-15", 12, "2027-10-17"], // start CST, due CDT (DST crossing) — hour must stay 9
]
for (const [start, term, expectDate] of cases) {
  const iso = leaseFollowUpDueAt(start, term, TZ)!
  ok(zoneYMD(iso) === expectDate, `${start} + ${term}mo → Follow-Up due ${expectDate}`, `got ${iso ? zoneYMD(iso) : "null"}`)
  ok(zoneHour(iso) === "09", `${start} + ${term}mo → due at 9:00 AM local (DST-safe)`, `got hour ${iso ? zoneHour(iso) : "null"}`)
}

// ── Legacy / unparseable → NEVER a fabricated date ──
ok(estimateLeaseEndDate("2026-08-28", "12 months") === null, "unparseable term → no estimated end date")
ok(leaseFollowUpDueAt("2026-08-28", "one year", TZ) === null, "unparseable term → null due (caller surfaces now instead)")
ok(leaseFollowUpDueAt("", "12", TZ) === null, "missing start date → null due")

console.log(`\n${fail === 0 ? "ALL PASS ✅" : "FAILURES ❌"}  (${pass} passed, ${fail} failed)`)
if (fail > 0) process.exit(1)
