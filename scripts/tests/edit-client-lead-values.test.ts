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
import { parseMoveDate, csvToArr, arrToCsv, buildEditPatch, NON_TEXT_EDITABLE_COLUMNS } from "@/lib/leads/leadFormValues"

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

// ── buildEditPatch — blank NON-TEXT columns become NULL at the DB boundary ────
// Regression: Edit Client built its patch as `form[k] ?? ""` for EVERY editable
// column, so a lead with no Move Date sent move_date: "" to a Postgres `date` and
// the entire save failed with 22007 ("Could not save changes"). move_date is the
// ONLY non-text column among the 28 editable ones; the other 27 must be untouched.
const EDITABLE = [
  "first_name", "last_name", "phone", "email",
  "move_date", "city", "neighborhoods", "submarkets",
  "property_type", "must_have_amenities", "desired_rent", "beds", "baths", "income",
  "credit_history", "credit_score", "broken_lease_age", "broken_lease_amount",
  "eviction_court", "eviction_age", "eviction_balance",
  "criminal_background", "criminal_charge", "felony_age", "misdemeanor_age",
  "notes", "locator_notes", "referred_by",
] as const

// The bug itself: every blank shape a move_date can arrive in → null, never "".
eq(buildEditPatch({ move_date: "" }, ["move_date"]).move_date, null, "move_date '' → null (the 22007 bug)")
eq(buildEditPatch({ move_date: "   " }, ["move_date"]).move_date, null, "move_date whitespace → null")
eq(buildEditPatch({ move_date: null }, ["move_date"]).move_date, null, "move_date null → null")
eq(buildEditPatch({ move_date: undefined }, ["move_date"]).move_date, null, "move_date undefined → null")
eq(buildEditPatch({}, ["move_date"]).move_date, null, "move_date absent from form → null")

// A real date is preserved verbatim — the fix must not touch valid values.
eq(buildEditPatch({ move_date: "2026-12-31" }, ["move_date"]).move_date, "2026-12-31", "valid move_date preserved")
eq(
  buildEditPatch({ move_date: "2026-09-15T10:00:00.000Z" }, ["move_date"]).move_date,
  "2026-09-15T10:00:00.000Z",
  "ISO timestamp move_date passes through unchanged",
)

// Text columns keep EXACTLY today's behavior — "" stays "", it does not become null.
const textBlank = buildEditPatch({}, ["notes", "locator_notes", "city", "credit_score", "referred_by"])
eq(textBlank.notes, "", "blank text column stays '' (unchanged behavior)")
eq(textBlank.locator_notes, "", "blank locator_notes stays ''")
eq(textBlank.city, "", "blank city stays ''")
eq(textBlank.credit_score, "", "credit_score is TEXT — blank stays '', not null")
eq(textBlank.referred_by, "", "referred_by stays '' (Pass 1 behavior preserved)")
eq(buildEditPatch({ notes: "hello" }, ["notes"]).notes, "hello", "text value preserved")

// Patch SHAPE is unchanged: every requested column is present.
const full = buildEditPatch({ first_name: "Kevin", move_date: "" }, EDITABLE)
eq(Object.keys(full).length, EDITABLE.length, "patch contains every editable column")
ok(EDITABLE.every((k) => k in full), "no editable column dropped from the patch")
eq(full.move_date, null, "move_date nulled inside a full patch")
eq(full.first_name, "Kevin", "other values survive a full patch")

// set → save → clear → save (the interactive path: DatePicker writes '' on clear).
const afterSet = buildEditPatch({ move_date: "2026-12-31" }, EDITABLE)
eq(afterSet.move_date, "2026-12-31", "set → save persists the date")
const afterClear = buildEditPatch({ move_date: "" }, EDITABLE)
eq(afterClear.move_date, null, "clear → save sends null, not ''")

// Guard: the non-text set must stay a subset of the editable columns.
ok([...NON_TEXT_EDITABLE_COLUMNS].every((c) => (EDITABLE as readonly string[]).includes(c)),
  "NON_TEXT_EDITABLE_COLUMNS ⊆ EDITABLE_COLUMNS")
eq(NON_TEXT_EDITABLE_COLUMNS.size, 1, "move_date is currently the ONLY non-text editable column")

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
