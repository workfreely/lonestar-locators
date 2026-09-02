/**
 * Regression: Edit Client must open safely on an EXISTING lead's stored values,
 * including the shapes the blank Add Lead form never renders. The production
 * crash ("Application error: a client-side exception has occurred") was
 * LeadFields seeding react-datepicker with `new Date(move_date + "T12:00:00")`
 * for a lead whose `move_date` was a full ISO timestamp (demo leads use
 * `.toISOString()`, e.g. Sarah Kim / Carlos Mendez) — that yields an
 * Invalid Date, and react-datepicker's formatter throws
 * "RangeError: Invalid time value" during render, taking down the whole CRM.
 *
 *   npx tsx scripts/tests/edit-client-lead-values.test.ts
 */
import { parseMoveDate, csvToArr, arrToCsv } from "@/lib/leads/leadFormValues"

let pass = 0, fail = 0
const eq = (a: unknown, b: unknown, name: string) => {
  if (a === b) pass++
  else { fail++; console.error("✗", name, `(got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`) }
}
const ok = (cond: boolean, name: string) => {
  if (cond) pass++
  else { fail++; console.error("✗", name) }
}

// ── parseMoveDate — never returns an Invalid Date (the crash) ────────────────

// THE failing production shape: a full ISO timestamp (what demo leads store via
// .toISOString()). Must parse to a VALID Date on the intended calendar day, not
// the Invalid Date that crashed the page.
const isoTimestamp = "2026-09-15T10:00:00.000Z"
const dIso = parseMoveDate(isoTimestamp)
ok(dIso instanceof Date && !Number.isNaN(dIso.getTime()), "ISO timestamp → valid Date (was the crash)")
eq(dIso ? dIso.getFullYear() : null, 2026, "ISO timestamp → keeps year 2026")
eq(dIso ? dIso.getMonth() : null, 8, "ISO timestamp → keeps month September (0-based 8)")
eq(dIso ? dIso.getDate() : null, 15, "ISO timestamp → keeps day 15")

// The shape the form itself saves: a bare YYYY-MM-DD.
const dBare = parseMoveDate("2026-09-15")
ok(dBare instanceof Date && !Number.isNaN(dBare.getTime()), "bare YYYY-MM-DD → valid Date")
eq(dBare ? dBare.getDate() : null, 15, "bare YYYY-MM-DD → day 15 (noon-anchored, zone-stable)")

// A real Date instance (in-memory shapes) passes through.
const dInst = parseMoveDate(new Date(2026, 8, 15, 10))
ok(dInst instanceof Date && !Number.isNaN(dInst.getTime()), "Date instance → valid Date")

// Empty / missing / unparseable → null (NOT Invalid Date).
eq(parseMoveDate(""), null, "empty string → null")
eq(parseMoveDate(null), null, "null → null")
eq(parseMoveDate(undefined), null, "undefined → null")
eq(parseMoveDate("not a date"), null, "garbage → null (never Invalid Date)")
eq(parseMoveDate(new Date("bad")), null, "Invalid Date instance → null")

// The exact old expression proved it produced an Invalid Date — assert the fix
// no longer does, for the same input.
ok(Number.isNaN(new Date(isoTimestamp + "T12:00:00").getTime()), "sanity: old expression WAS Invalid Date")
ok(parseMoveDate(isoTimestamp) !== null, "fix: same input now parses safely")

// ── csvToArr — tolerant of legacy / non-string CSV column shapes ─────────────

eq(JSON.stringify(csvToArr("Downtown Dallas")), JSON.stringify(["Downtown Dallas"]), "single value string")
eq(JSON.stringify(csvToArr("Midtown, Montrose")), JSON.stringify(["Midtown", "Montrose"]), "comma string → trimmed array")
eq(JSON.stringify(csvToArr("")), JSON.stringify([]), "empty string → []")
eq(JSON.stringify(csvToArr(null)), JSON.stringify([]), "null → [] (no .split crash)")
eq(JSON.stringify(csvToArr(undefined)), JSON.stringify([]), "undefined → []")
eq(JSON.stringify(csvToArr(["Mueller", "East Austin"])), JSON.stringify(["Mueller", "East Austin"]), "legacy array → coerced, no .split crash")
eq(JSON.stringify(csvToArr(90210)), JSON.stringify(["90210"]), "number → coerced string, no crash")

// Round-trip stays comma+space joined.
eq(arrToCsv(csvToArr("Midtown, Montrose")), "Midtown, Montrose", "csv round-trips ', ' joined")

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
