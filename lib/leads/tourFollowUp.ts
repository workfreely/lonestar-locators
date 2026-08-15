import { fromZonedTime, formatInTimeZone } from "date-fns-tz"
import { DEFAULT_TIMEZONE } from "@/lib/timezone"

// Pure tour date/time helpers (no DB) — safe to import anywhere, including tests.
// The DB-touching completion lives in lib/leads/setupTourWorkflow.ts.

// Tour Follow-Up fires this many hours after the LAST active scheduled tour, so
// the locator follows up the same day while the properties are still fresh.
export const TOUR_FOLLOW_UP_OFFSET_HOURS = 2

/**
 * The Tour Follow-Up due instant for a touring block: the LAST active scheduled
 * tour + 2 hours. Canonical rule — evolves naturally to multiple tours
 * (11:00 · 12:30 · 2:00 → follow-up 4:00). Only 'scheduled' tours count (canceled
 * ones never drive the follow-up). Returns null when there are no active tours.
 */
export function tourFollowUpDueAt(
  tours: { scheduledAt: string | Date; status?: string }[]
): string | null {
  const active = tours.filter((t) => (t.status ?? "scheduled") === "scheduled")
  if (active.length === 0) return null
  const lastMs = Math.max(...active.map((t) => new Date(t.scheduledAt).getTime()))
  return new Date(lastMs + TOUR_FOLLOW_UP_OFFSET_HOURS * 3600 * 1000).toISOString()
}

/**
 * Convert a locator's LOCAL wall-clock tour date+time into the canonical UTC
 * instant, using the resolved IANA zone (the same fromZonedTime convention as
 * lib/workflow/autoDueDate). "2026-08-15" + "13:00" in America/Chicago → the
 * correct UTC instant; never browser-local/UTC guessing. Falls back to the
 * workspace default zone when none is provided.
 */
export function localTourToUtc(dateStr: string, timeStr: string, timeZone?: string | null): string {
  // dateStr = "YYYY-MM-DD", timeStr = "HH:mm"
  return fromZonedTime(`${dateStr}T${timeStr}:00`, timeZone || DEFAULT_TIMEZONE).toISOString()
}

/**
 * Inverse of localTourToUtc — a canonical UTC instant back to the locator's LOCAL
 * wall-clock "YYYY-MM-DDTHH:mm" in the resolved zone, so the Edit/Reschedule UI
 * prefills the picker with the tour's real local date+time (never browser-local).
 * Round-trips with localTourToUtc under the same zone.
 */
export function utcToLocalTourValue(iso: string, timeZone?: string | null): string {
  return formatInTimeZone(new Date(iso), timeZone || DEFAULT_TIMEZONE, "yyyy-MM-dd'T'HH:mm")
}
