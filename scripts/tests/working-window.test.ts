/**
 * System-generated Next Action working-window normalization (locator-local),
 * pure logic, no DB. Proves the 9 AM–9 PM locator-timezone invariant, DST, day
 * rollover, and that it uses the LOCATOR zone (not the client zone).
 *
 *   npx tsx scripts/tests/working-window.test.ts
 */
import { normalizeToWorkingWindow, autoDueInDays, autoDueOnDate, resolveWorkHoursFromProfile } from "../../lib/workflow/autoDueDate"

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

// ─── CONFIGURABLE Working Hours (Profile setting) ──────────────────────────
console.log("CUSTOM WINDOW [10:00–18:00] (client=locator America/Chicago, CDT UTC-5)")
const W = { startHour: 10, endHour: 18 }
// 9:59 AM CDT = 14:59Z → before custom start 10 → 10 AM SAME day.
{
  const r = normalizeToWorkingWindow("2026-09-23T14:59:00Z", CT, W)
  ok(hourIn(r, CT) === 10 && ymdIn(r, CT) === "2026-09-23", "9:59 AM → 10:00 AM same day (custom start)")
}
// 10:00 AM CDT = 15:00Z → exactly custom start → unchanged.
ok(normalizeToWorkingWindow("2026-09-23T15:00:00Z", CT, W) === "2026-09-23T15:00:00Z", "10:00 AM → unchanged (custom start boundary)")
// 5:59 PM CDT = 22:59Z → inside custom window → unchanged.
ok(normalizeToWorkingWindow("2026-09-23T22:59:00Z", CT, W) === "2026-09-23T22:59:00Z", "5:59 PM → unchanged (inside custom window)")
// 6:00 PM CDT = 23:00Z → at/after custom end 18 → 10 AM NEXT day (custom rollover).
{
  const r = normalizeToWorkingWindow("2026-09-23T23:00:00Z", CT, W)
  ok(hourIn(r, CT) === 10 && ymdIn(r, CT) === "2026-09-24", "6:00 PM → 10:00 AM next day (custom day rollover)")
}
// The DEFAULT 9 AM target is now BEFORE the custom start → clamps UP to 10 AM.
{
  const r = autoDueInDays(0, CT, W)
  ok(hourIn(r, CT) === 10, "autoDueInDays(0) with custom start 10 → 10:00 AM (9 AM target clamped up)")
}
{
  const base = new Date("2026-09-23T12:00:00Z")
  const r = autoDueOnDate(base, 1, CT, W)
  ok(hourIn(r, CT) === 10 && ymdIn(r, CT) === "2026-09-24", "autoDueOnDate(+1) with custom start 10 → 10:00 AM")
}

console.log("CUSTOM end = 24 (midnight) — only at/after midnight rolls over")
{
  const late = { startHour: 8, endHour: 24 }
  // 11:00 PM CDT = next-day 04:00Z → inside [8,24) → unchanged.
  ok(normalizeToWorkingWindow("2026-09-24T04:00:00Z", CT, late) === "2026-09-24T04:00:00Z", "11:00 PM with end=24 → unchanged (inside)")
}

console.log("CUSTOM WINDOW is DST-safe (winter CST UTC-6, custom start 8)")
{
  const early = { startHour: 8, endHour: 20 }
  // 7:59 AM CST = 13:59Z → before 8 → 8:00 AM CST = 14:00Z.
  const r = normalizeToWorkingWindow("2026-01-15T13:59:00Z", CT, early)
  ok(hourIn(r, CT) === 8 && r === "2026-01-15T14:00:00.000Z", "7:59 AM CST → 8:00 AM CST (custom start, DST-correct)")
}

console.log("CUSTOM WINDOW evaluated in the LOCATOR zone (cross-timezone)")
{
  // 5:30 PM Central = 6:30 PM Eastern (same instant). Custom [10,18).
  const inst2 = "2026-09-23T22:30:00Z"
  ok(normalizeToWorkingWindow(inst2, CT, W) === inst2, "5:30 PM CENTRAL with custom [10–18] → inside → unchanged")
  const r = normalizeToWorkingWindow(inst2, ET, W)
  ok(hourIn(r, ET) === 10 && ymdIn(r, ET) === "2026-09-24", "same instant is 6:30 PM EASTERN → after custom end → 10 AM next day")
}

console.log("DEFAULT FALLBACK — empty / undefined workHours === the 9–21 default")
{
  const x = "2026-09-24T02:00:00Z" // 9 PM CDT
  ok(normalizeToWorkingWindow(x, CT, {}) === normalizeToWorkingWindow(x, CT), "empty {} workHours matches the default window")
  ok(normalizeToWorkingWindow(x, CT, undefined) === normalizeToWorkingWindow(x, CT), "undefined workHours matches the default window")
  // A partial window ({} for a missing bound) still uses defaults per-bound.
  ok(hourIn(normalizeToWorkingWindow(x, CT, { startHour: 9 }), CT) === 9, "only startHour set → endHour falls back to 21 (rolls over at 9 PM)")
}

console.log("resolveWorkHoursFromProfile — valid vs. degrade-to-default")
ok(JSON.stringify(resolveWorkHoursFromProfile({ work_hours_start: 8, work_hours_end: 18 })) === JSON.stringify({ startHour: 8, endHour: 18 }), "valid window → {startHour, endHour}")
ok(JSON.stringify(resolveWorkHoursFromProfile(null)) === "{}", "null profile → {} (default)")
ok(JSON.stringify(resolveWorkHoursFromProfile({ work_hours_start: 9, work_hours_end: null })) === "{}", "half-configured (end NULL) → {} (default)")
ok(JSON.stringify(resolveWorkHoursFromProfile({ work_hours_start: 18, work_hours_end: 9 })) === "{}", "inverted (start >= end) → {} (default)")
ok(JSON.stringify(resolveWorkHoursFromProfile({ work_hours_start: -1, work_hours_end: 18 })) === "{}", "out-of-range start → {} (default)")
ok(JSON.stringify(resolveWorkHoursFromProfile({ work_hours_start: 9, work_hours_end: 25 })) === "{}", "out-of-range end (>24) → {} (default)")
ok(JSON.stringify(resolveWorkHoursFromProfile({ work_hours_start: 9.5 as unknown as number, work_hours_end: 18 })) === "{}", "non-integer start → {} (default)")

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURE(S)`)
process.exit(failures === 0 ? 0 : 1)
