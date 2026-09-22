import { atHourInZone } from "@/lib/timezone"

// ─── Automatic workflow due dates ───────────────────────────────────────────
//
// Every AUTOMATIC, workflow-generated (SCHEDULED / relative) action — stage
// follow-ups, the FU1→Final chain, "Done for now" snoozes, drag-triggered
// follow-up dates — is due at 9:00 AM in the LOCATOR/workspace timezone on its
// target day, never at the odd hour the previous action happened to occur.
//
// LOCATOR TIMEZONE IS REQUIRED. There is no runtime/server-zone fallback: the
// production server is UTC, so `setHours(9)` there was 9:00 AM UTC ≈ 4:00 AM
// Central — exactly the "Contact Lead due at 4 AM the following day" bug. Callers
// MUST pass the resolved locator zone (resolveUserTimeZone server-side; the
// account timezone client-side), and the type now enforces it.
//
// Immediate / do-it-now actions (Setup Tour, guest card, etc.) are NOT built here
// — they use the creation moment on purpose and are exempt from the working
// window. Manual Tasks (user-picked date+time) are likewise exempt.
//
// This is completely separate from the Follow-Up Agent's SMS quiet-hours, which
// live in lib/followup/pacing.ts and are evaluated in the CLIENT zone.

export const AUTO_ACTION_HOUR = 9

// The locator-local working window for SCHEDULED system-generated Next Actions.
// Parameterized so a future workspaces.work_hours_* setting can replace the
// defaults without touching any workflow.
export const WORK_WINDOW_START_HOUR = 9 // 09:00 — first allowed hour
export const WORK_WINDOW_END_HOUR = 21 // 21:00 — first DISALLOWED hour (at/after = out of window)

/** The hour-of-day (0–23) of an instant, in the given IANA zone. */
function localHourInZone(iso: string, timeZone: string): number {
  const h = new Intl.DateTimeFormat("en-US", { timeZone, hour12: false, hour: "2-digit" }).format(new Date(iso))
  return parseInt(h === "24" ? "0" : h, 10)
}

/**
 * Clamp a SCHEDULED system-generated due timestamp into the locator-local working
 * window [startHour, endHour):
 *   • before startHour        → startHour (09:00) the SAME locator-local day
 *   • at/after endHour (21:00) → startHour (09:00) the NEXT locator-local day
 *   • already inside           → unchanged
 * DST-safe (via atHourInZone/date-fns-tz). Evaluated in the LOCATOR zone. This is
 * the single centralized guarantee — no individual workflow can independently
 * create an overnight scheduled due time.
 */
export function normalizeToWorkingWindow(
  dueIso: string,
  timeZone: string,
  opts: { startHour?: number; endHour?: number } = {},
): string {
  const startHour = opts.startHour ?? WORK_WINDOW_START_HOUR
  const endHour = opts.endHour ?? WORK_WINDOW_END_HOUR
  const hour = localHourInZone(dueIso, timeZone)
  if (hour < startHour) return atHourInZone(new Date(dueIso), 0, startHour, timeZone).toISOString()
  if (hour >= endHour) return atHourInZone(new Date(dueIso), 1, startHour, timeZone).toISOString()
  return dueIso
}

// 9:00 AM `days` calendar days from now, in the locator zone, clamped to the
// working window. `timeZone` is REQUIRED (a resolved IANA id).
export function autoDueInDays(days: number, timeZone: string): string {
  const at9 = atHourInZone(new Date(), days, AUTO_ACTION_HOUR, timeZone).toISOString()
  return normalizeToWorkingWindow(at9, timeZone)
}

// 9:00 AM on `base` (plus an optional day offset), in the locator zone, clamped
// to the working window. `timeZone` is REQUIRED.
export function autoDueOnDate(base: Date, dayOffset = 0, timeZone: string): string {
  const at9 = atHourInZone(base, dayOffset, AUTO_ACTION_HOUR, timeZone).toISOString()
  return normalizeToWorkingWindow(at9, timeZone)
}
