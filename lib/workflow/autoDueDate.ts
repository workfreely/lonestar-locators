import { atHourInZone } from "@/lib/timezone"

// ─── Automatic workflow due dates ───────────────────────────────────────────
//
// Every AUTOMATIC, workflow-generated action (stage follow-ups, the FU1→Final
// chain, "Done for now" snoozes, drag-triggered follow-up dates) is due at
// 9:00 AM local on its target day — never at the odd hour the previous action
// happened to occur (e.g. 4:43 AM). Locators start their day working the
// dashboard, so the morning workload should be clean and predictable.
//
// This is the single source of truth for that convention. Manual Tasks are
// deliberately EXEMPT: users pick an exact date and time (see
// AddNextActionModal) because those are appointments / one-off reminders.
//
// Timezone note: this schema has no per-user timezone column, so "9:00 AM
// local" is plain Date math in whichever environment runs it (the browser for
// client-triggered actions, the server for the update-stage API route).

export const AUTO_ACTION_HOUR = 9

// 9:00 AM `days` calendar days from now, as a UTC instant.
//
// When `timeZone` (an IANA id like "America/Chicago") is supplied, the calendar
// day + 9:00 AM are resolved IN THAT ZONE first (DST-safe via date-fns-tz), then
// stored as the corresponding UTC instant — so the locator's saved timezone is
// authoritative regardless of the server/browser runtime zone. When omitted, the
// original runtime-local behavior is preserved unchanged (zero regression).
export function autoDueInDays(days: number, timeZone?: string | null): string {
  if (timeZone) return atHourInZone(new Date(), days, AUTO_ACTION_HOUR, timeZone).toISOString()
  const d = new Date()
  d.setDate(d.getDate() + days)
  d.setHours(AUTO_ACTION_HOUR, 0, 0, 0)
  return d.toISOString()
}

// 9:00 AM on `base` (plus an optional day offset). Same `timeZone` semantics as
// autoDueInDays: zone-aware when supplied, runtime-local (unchanged) when omitted.
export function autoDueOnDate(base: Date, dayOffset = 0, timeZone?: string | null): string {
  if (timeZone) return atHourInZone(base, dayOffset, AUTO_ACTION_HOUR, timeZone).toISOString()
  const d = new Date(base)
  d.setDate(d.getDate() + dayOffset)
  d.setHours(AUTO_ACTION_HOUR, 0, 0, 0)
  return d.toISOString()
}
