/**
 * System-generated Next Action working-window normalization (locator-local),
 * pure logic, no DB. Proves the 9 AM–9 PM locator-timezone invariant, DST, day
 * rollover, and that it uses the LOCATOR zone (not the client zone).
 *
 *   npx tsx scripts/tests/working-window.test.ts
 */
import { normalizeToWorkingWindow, autoDueInDays, autoDueOnDate } from "../../lib/workflow/autoDueDate"

let failures = 0
function ok(cond: boolean, msg: string) {
  if (!cond) { failures++; console.error("  ✗ " + msg) } else { console.log("  ✓ " + msg) }
}
const CT = "America/Chicago"
const ET = "America/New_York"
// Local hour-of-day in a zone (for asserting the normalized result).
const hourIn = (iso: string, tz: string) =>
  parseInt(new Intl.DateTimeFormat("en-US", { timeZone: tz, hour12: false, hour: "2-digit" }).format(new Date(iso)).replace("24", "0"), 10)
const ymdIn = (iso: string, tz: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso))

console.log("BOUNDARIES (client=locator America/Chicago, Sept = CDT UTC-5)")
// 8:59 AM CDT = 13:59Z → before 9 → 9 AM same day.
{
  const r = normalizeToWorkingWindow("2026-09-23T13:59:00Z", CT)
  ok(hourIn(r, CT) === 9 && ymdIn(r, CT) === "2026-09-23", "8:59 AM → 9:00 AM same day")
}
// 9:00 AM CDT = 14:00Z → unchanged.
ok(normalizeToWorkingWindow("2026-09-23T14:00:00Z", CT) === "2026-09-23T14:00:00Z", "9:00 AM → unchanged")
// 8:59 PM CDT = next-day 01:59Z → inside window → unchanged.
ok(normalizeToWorkingWindow("2026-09-24T01:59:00Z", CT) === "2026-09-24T01:59:00Z", "8:59 PM → unchanged (inside window)")
// 9:00 PM CDT = next-day 02:00Z → at/after 21:00 → 9 AM NEXT day.
{
  const r = normalizeToWorkingWindow("2026-09-24T02:00:00Z", CT)
  ok(hourIn(r, CT) === 9 && ymdIn(r, CT) === "2026-09-24", "9:00 PM → 9:00 AM next day (day rollover)")
}
// Midnight CDT = 05:00Z → before 9 → 9 AM same day.
{
  const r = normalizeToWorkingWindow("2026-09-23T05:00:00Z", CT)
  ok(hourIn(r, CT) === 9 && ymdIn(r, CT) === "2026-09-23", "midnight → 9:00 AM same day")
}
// THE BUG: 09:00 UTC = 4:00 AM CDT → before 9 → 9 AM same Central day.
{
  const r = normalizeToWorkingWindow("2026-09-23T09:00:00Z", CT)
  ok(hourIn(r, CT) === 9 && ymdIn(r, CT) === "2026-09-23", "4:00 AM (= 09:00 UTC) → 9:00 AM same day (the reported bug)")
}

console.log("DST — winter CST is UTC-6, so 9:00 AM CST = 15:00 UTC")
{
  const r = normalizeToWorkingWindow("2026-01-15T14:59:00Z", CT) // 8:59 AM CST
  ok(hourIn(r, CT) === 9 && r === "2026-01-15T15:00:00.000Z", "8:59 AM CST → 9:00 AM CST (DST-correct offset)")
}

console.log("CROSS-TIMEZONE — uses the LOCATOR zone, not the client zone")
// Instant = 8:00 PM Central = 9:00 PM Eastern (same moment).
const inst = "2026-09-24T01:00:00Z"
ok(normalizeToWorkingWindow(inst, CT) === inst, "8:00 PM in CENTRAL locator → in window → unchanged")
{
  const r = normalizeToWorkingWindow(inst, ET) // 9:00 PM Eastern → clamped
  ok(hourIn(r, ET) === 9 && ymdIn(r, ET) === "2026-09-24", "same instant is 9:00 PM EASTERN locator → 9:00 AM next day")
}
ok(normalizeToWorkingWindow(inst, CT) !== normalizeToWorkingWindow(inst, ET), "result depends on the LOCATOR zone, proving locator-timezone evaluation")

console.log("autoDue* use the locator zone (9 AM local, never 9 AM UTC)")
// autoDueInDays(0, Central) must be 9 AM Central today, not 9 AM UTC (= 4 AM CT).
{
  const r = autoDueInDays(0, CT)
  ok(hourIn(r, CT) === 9, "autoDueInDays(0, Central) = 9:00 AM Central (not UTC)")
}
{
  const base = new Date("2026-09-23T12:00:00Z")
  const r = autoDueOnDate(base, 1, CT)
  ok(hourIn(r, CT) === 9, "autoDueOnDate(+1, Central) = 9:00 AM Central")
}

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURE(S)`)
process.exit(failures === 0 ? 0 : 1)
