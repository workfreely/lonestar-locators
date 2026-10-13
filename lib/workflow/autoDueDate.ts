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
// These are the DEFAULT / fallback bounds used whenever a locator has NOT
// configured custom Working Hours (profiles.work_hours_* is NULL).
export const WORK_WINDOW_START_HOUR = 9 // 09:00 — first allowed hour
export const WORK_WINDOW_END_HOUR = 21 // 21:00 — first DISALLOWED hour (at/after = out of window)

/**
 * A locator's configured Working Hours (Profile setting). Both hours optional:
 * an absent bound falls back to the 9/21 default inside normalizeToWorkingWindow.
 * `startHour` is the first allowed hour; `endHour` is the first DISALLOWED hour
 * (at/after = out of window). This is the ONE shape threaded alongside `timeZone`
 * through every system-generated scheduled Next Action path.
 */
export type WorkHours = { startHour?: number; endHour?: number }

/**
 * Resolve a locator's Working Hours from a profile row (profiles.work_hours_start
 * / work_hours_end). Pure + defensive: returns {} (→ 9/21 fallback) unless BOTH
 * columns are present, integral, in range (start 0–23, end 1–24), and start<end.
 * A half-configured or invalid row NEVER produces a partial/overnight window — it
 * degrades cleanly to the default. This is the single translation from the stored
 * columns to the WorkHours the workflow paths pass around.
 */
export function resolveWorkHoursFromProfile(
  profile: { work_hours_start?: number | null; work_hours_end?: number | null } | null | undefined,
): WorkHours {
  const start = profile?.work_hours_start
  const end = profile?.work_hours_end
  if (
    typeof start === "number" && Number.isInteger(start) &&
    typeof end === "number" && Number.isInteger(end) &&
    start >= 0 && start <= 23 && end >= 1 && end <= 24 && start < end
  ) {
    return { startHour: start, endHour: end }
  }
  return {}
}

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

/**
 * SPEED-TO-LEAD: how long a brand-new lead may sit before its initial Contact Lead
 * action is overdue. Ten minutes, measured from the lead's creation.
 */
export const SPEED_TO_LEAD_MINUTES = 10

/**
 * The due timestamp for the INITIAL Contact Lead action.
 *
 * ── WHY THIS IS NOT autoDueInDays(0) ────────────────────────────────────────────────────────
 * autoDueInDays(0) anchors to 9:00 AM on the target day whatever the hour, so a lead created at
 * 3:34 PM got an action due at 9:00 AM THAT MORNING — six and a half hours before the lead
 * existed. Day-level urgency hid it (it still read "Today"), but the stored timestamp was a
 * deadline that had already passed on arrival.
 *
 * Here the clock starts at creation instead: now + 10 minutes, then the SAME working-window
 * clamp every other scheduled action uses, so the locator's hours and timezone still decide the
 * boundaries:
 *
 *   created 07:00 → 09:00 the same day      (before the window opens → defer to its start)
 *   created 15:34 → 15:44                   (inside the window → ten real minutes)
 *   created 22:30 → 09:00 the next day      (after the window closes → defer to the next start)
 *   created 00:30 → 09:00 the same day      (before the window opens → defer to its start)
 *
 * The result can never precede the lead's creation: it starts at `now` and the clamp only ever
 * moves a timestamp FORWARD to a window start.
 *
 * `now` is injectable so the boundaries, midnight and both DST transitions are testable without
 * waiting for them.
 */
export function speedToLeadDue(timeZone: string, workHours?: WorkHours, now: Date = new Date()): string {
  const target = new Date(now.getTime() + SPEED_TO_LEAD_MINUTES * 60_000).toISOString()
  return normalizeToWorkingWindow(target, timeZone, workHours)
}

// 9:00 AM `days` calendar days from now, in the locator zone, clamped to the
// working window. `timeZone` is REQUIRED (a resolved IANA id). Optional
// `workHours` (the locator's Profile setting) overrides the 9/21 default window;
// omitted/empty → the default. The 9 AM target itself is unchanged — only the
// clamp bounds shift, so a custom start later than 9 AM still lands at that start.
export function autoDueInDays(days: number, timeZone: string, workHours?: WorkHours): string {
  const at9 = atHourInZone(new Date(), days, AUTO_ACTION_HOUR, timeZone).toISOString()
  return normalizeToWorkingWindow(at9, timeZone, workHours)
}

// 9:00 AM on `base` (plus an optional day offset), in the locator zone, clamped
// to the working window. `timeZone` is REQUIRED. Optional `workHours` overrides
// the 9/21 default window (see autoDueInDays).
export function autoDueOnDate(base: Date, dayOffset = 0, timeZone: string, workHours?: WorkHours): string {
  const at9 = atHourInZone(base, dayOffset, AUTO_ACTION_HOUR, timeZone).toISOString()
  return normalizeToWorkingWindow(at9, timeZone, workHours)
}
