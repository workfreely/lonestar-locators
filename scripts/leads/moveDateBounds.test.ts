/**
 * MOVE-IN DATE BOUNDS — the window, the forms, and the server.
 *
 *   npx tsx scripts/leads/moveDateBounds.test.ts
 *
 * A lead arrived with 2972-11-15. Nothing transformed it: the picker had a minDate and no
 * maxDate, /api/leads/submit kept move_date among the plain string fields, and Postgres `date`
 * accepts years to 5874897 AD. These cover the shared window, every form that submits a
 * move-in date, and the server refusal that has to hold when a form is bypassed.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import {
  MOVE_DATE_MAX_YEARS_AHEAD, validateMoveDate, parseLocalYMD, toLocalYMD, moveDateMin, moveDateMax,
} from "@/lib/leads/moveDate"

let pass = 0, fail = 0
const ok = (l: string, c: boolean, d = "") => {
  if (c) { pass++; console.log(`  ✓ ${l}`) } else { fail++; console.log(`  ✗ ${l}${d ? ` — ${d}` : ""}`) }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
/** Source with comments removed — so an assertion about CODE cannot be satisfied by prose. */
const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")
/** A fixed "now" so the window is deterministic: Tue 4 Nov 2026, local midday. */
const NOW = new Date(2026, 10, 4, 12, 0, 0)

console.log("\nthe window")
ok("two years, as agreed", MOVE_DATE_MAX_YEARS_AHEAD === 2)
ok("…and it is stated once, not per form",
  (read("lib/leads/moveDate.ts").match(/MOVE_DATE_MAX_YEARS_AHEAD = /g) ?? []).length === 1)
ok("minimum is today, local", toLocalYMD(moveDateMin(NOW)) === "2026-11-04")
ok("maximum is the same day two years on", toLocalYMD(moveDateMax(NOW)) === "2028-11-04")

console.log("\nvalid dates keep working")
for (const d of ["2026-11-04", "2026-11-15", "2027-01-01", "2028-11-04", "2027-06-30"]) {
  ok(`${d} is accepted`, validateMoveDate(d, NOW).ok === true, JSON.stringify(validateMoveDate(d, NOW)))
}
ok("blank is accepted — unanswered is not invalid", validateMoveDate("", NOW).ok === true)
ok("…and so is null", validateMoveDate(null, NOW).ok === true)
ok("an ISO timestamp is judged on its calendar day",
  validateMoveDate("2027-03-01T10:00:00.000Z", NOW).ok === true)

console.log("\nthe date that started this")
{
  const r = validateMoveDate("2972-11-15", NOW)
  ok("2972-11-15 is refused", r.ok === false)
  ok("…with a message that says what is allowed",
    r.ok === false && /within the next 2 years/.test(r.message) && /2028-11-04/.test(r.message),
    r.ok === false ? r.message : "")
}
ok("one day past the ceiling is refused", validateMoveDate("2028-11-05", NOW).ok === false)
ok("yesterday is refused", validateMoveDate("2026-11-03", NOW).ok === false)
ok("…with its own message",
  (() => { const r = validateMoveDate("2026-11-03", NOW); return r.ok === false && /in the past/.test(r.message) })())
ok("a non-date is refused", validateMoveDate("whenever", NOW).ok === false)
ok("…and says what shape to use",
  (() => { const r = validateMoveDate("whenever", NOW); return r.ok === false && /MM\/DD\/YYYY/.test(r.message) })())
ok("a day that does not exist is refused", validateMoveDate("2027-02-31", NOW).ok === false)
ok("…because the parse round-trips", parseLocalYMD("2027-02-31") === null)

console.log("\nno timezone can move the boundary")
{
  // The comparison is on strings, so it cannot depend on a Date, an hour or an offset.
  const src = read("lib/leads/moveDate.ts")
  ok("the check compares calendar strings", /if \(ymd < min\)/.test(src) && /if \(ymd > max\)/.test(src))
  ok("…and no code in it serialises through UTC", !/toISOString/.test(strip(src)))
  // The same instant, judged just after local midnight and just before it, gives one answer.
  const justAfterMidnight = new Date(2026, 10, 4, 0, 1)
  const lateEvening = new Date(2026, 10, 4, 23, 59)
  ok("the window is the same at 00:01 and at 23:59",
    toLocalYMD(moveDateMax(justAfterMidnight)) === toLocalYMD(moveDateMax(lateEvening)))
}

console.log("\nevery form that submits a move-in date is bounded")
for (const [name, file] of [
  ["public Smart Form", "app/smart-lead-form/_components/form/sections/LeadFormFields.tsx"],
  ["LandingForm", "app/components/LandingForm.tsx"],
  ["ContactForm", "app/components/ContactForm.tsx"],
  ["NewHomeContactForm", "app/components/NewHomeContactForm.tsx"],
] as const) {
  const src = read(file)
  ok(`${name}: has a maxDate`, /maxDate=\{/.test(src))
  ok(`${name}: …and a minDate`, /minDate=\{/.test(src))
  ok(`${name}: …both from the one shared module`,
    /from "@\/lib\/leads\/moveDate"/.test(src))
  // THE SAME RANGE MEANS THE SAME SOURCE. A form that computed its own ceiling would drift the
  // moment the number changed, so none of them may define one.
  ok(`${name}: …and defines no bound of its own`,
    !/function startOfToday|getFullYear\(\) \+ \d/.test(strip(src)) &&
    !/maxDate=\{new Date\(/.test(src))
  ok(`${name}: …calling the shared helpers directly`,
    /minDate=\{(minMoveDate|moveDateMin\(\))\}/.test(src) && /maxDate=\{(maxMoveDate|moveDateMax\(\))\}/.test(src))
}

console.log("\nthe server refuses it independently")
{
  const route = read("app/api/leads/submit/route.ts")
  ok("the route validates the move date", /validateMoveDate\(payload\.move_date\)/.test(route))
  ok("…and reports it as a field error", /errors\.push\(\{ field: "move_date", message: check\.message \}\)/.test(route))
  ok("…using the same module the forms use", /from "@\/lib\/leads\/moveDate"/.test(route))
  // UNCHANGED: it stays a string field, so duplicate detection and the change log are untouched.
  ok("move_date is still a plain string field", /"first_name", "last_name", "phone", "email", "move_date"/.test(route))
  ok("…and still carries its scalar label", /move_date: "Move Date"/.test(route))
}

console.log("\nnothing is silently corrected")
{
  const src = read("lib/leads/moveDate.ts")
  ok("no code in the module rewrites a value", !/clamp|coerce/.test(strip(src)))
  // The refusal is the whole contract: validateMoveDate returns ok/false, never a replacement.
  ok("…it returns a verdict, never a corrected date",
    !/return \{ ok: true, value/.test(src) && /export type MoveDateCheck = \{ ok: true \} \| \{ ok: false; message: string \}/.test(src))
  ok("…and the header says it refuses rather than corrects",
    /REFUSED with a message/.test(src) && /never\s*\n?\s*\/\/ clamped or rewritten/.test(src))
}

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"} — ${pass} passed, ${fail} failed\n`)
process.exit(fail === 0 ? 0 : 1)
