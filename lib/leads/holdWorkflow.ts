// On Hold workflow — pure, canonical helpers shared by every surface (board,
// agenda, companion DTO, mutations). Hold is represented by two leads columns:
//   held_at            — non-null ⇒ On Hold (crm_status is preserved, never changed)
//   hold_follow_up_at  — the required follow-up/reminder date (YYYY-MM-DD)
// Hold creates NO lead_next_actions rows and NO 'hold' stage. The normal Next
// Action is suppressed at the ONE ranking chokepoint (lib/nextActions.ts) via
// isOnHold below; nothing is completed/deleted, so Resume is a pure restore.

import { autoDueOnDate, type WorkHours } from "@/lib/workflow/autoDueDate"

/** True when the lead is paused. The single, canonical hold predicate. */
export function isOnHold(lead: { held_at?: string | null } | null | undefined): boolean {
  return !!lead?.held_at
}

/**
 * Fields to write when placing a lead On Hold. Deliberately does NOT touch
 * crm_status, next_action_date, follow_up_count, or any lead_next_actions row —
 * the existing workflow is preserved dormant and returns intact on Resume.
 */
export function buildHoldUpdate(
  followUpDate: string,
  now: Date = new Date(),
): { held_at: string; hold_follow_up_at: string } {
  return { held_at: now.toISOString(), hold_follow_up_at: followUpDate }
}

/** Fields to write when rescheduling — stays On Hold, only the reminder moves. */
export function buildRescheduleHoldUpdate(followUpDate: string): { hold_follow_up_at: string } {
  return { hold_follow_up_at: followUpDate }
}

/**
 * Fields to write on Resume: clear both hold columns. crm_status is left
 * untouched, so the lead reappears at its preserved stage and the canonical
 * Next Action system reactivates automatically — no new action is manufactured.
 */
export function buildResumeUpdate(): { held_at: null; hold_follow_up_at: null } {
  return { held_at: null, hold_follow_up_at: null }
}

/**
 * Fields merged into the ARCHIVE write so Hold and Archive can never coexist:
 * archiving a held lead clears the hold columns.
 */
export function buildHoldClearedOnArchive(): { held_at: null; hold_follow_up_at: null } {
  return { held_at: null, hold_follow_up_at: null }
}

/**
 * Compact display of the hold follow-up DATE (no time — hold_follow_up_at is a
 * date, not a timestamp). "Sep 30", or "Sep 30, 2027" when the year differs from
 * `now` — the same short-date convention the shared due-date formatter uses,
 * without the bogus midnight time a timestamp formatter would append. Parsed as a
 * LOCAL calendar date so it never drifts a day. Shared by the card, Agenda and
 * Companion so the held date renders identically everywhere.
 */
export function formatHoldFollowUp(
  holdFollowUpAt: string | null | undefined,
  now: Date = new Date(),
): string {
  if (!holdFollowUpAt) return ""
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(holdFollowUpAt)
  const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(holdFollowUpAt)
  if (isNaN(d.getTime())) return ""
  const opts: Intl.DateTimeFormatOptions =
    d.getFullYear() === now.getFullYear()
      ? { month: "short", day: "numeric" }
      : { month: "short", day: "numeric", year: "numeric" }
  return d.toLocaleDateString("en-US", opts)
}

/**
 * Numeric MM/DD/YYYY display of the hold follow-up date (four-digit year, no
 * time) — used ONLY by the compact On Hold Lead Board card ("Follow Up ·
 * 10/05/2026"). The Agenda and Companion keep the compact month-day form
 * (formatHoldFollowUp). Parsed as a LOCAL calendar date so it never drifts a day.
 */
export function formatHoldFollowUpNumeric(holdFollowUpAt: string | null | undefined): string {
  if (!holdFollowUpAt) return ""
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(holdFollowUpAt)
  const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(holdFollowUpAt)
  if (isNaN(d.getTime())) return ""
  return d.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" })
}

/**
 * The hold follow-up as a real INSTANT: 9:00 AM local on hold_follow_up_at, via the
 * same canonical 9 AM convention as automatic workflow actions (autoDueOnDate). The
 * column stays a plain `date`; this derives the timestamp at read time so the Agenda
 * can order, classify overdue/today, and display "· 9:00 AM" from actual scheduling
 * data — and a date-only value (including every existing held lead) is handled with
 * no migration. Returns null when there's no hold date. Parsed as a LOCAL calendar
 * date so it never drifts a day. Does NOT touch the lead's dormant Next Action.
 */
export function holdFollowUpInstant(
  holdFollowUpAt: string | null | undefined,
  timeZone: string,
  // Optional locator Working Hours (Profile setting). Omitted/empty → 9–21 default.
  workHours?: WorkHours,
): string | null {
  if (!holdFollowUpAt) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(holdFollowUpAt)
  if (!m) return null
  const base = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  if (isNaN(base.getTime())) return null
  return autoDueOnDate(base, 0, timeZone, workHours)
}

export type HoldUrgency = "overdue" | "today" | "upcoming" | "none"

/**
 * Day-granularity urgency of the hold follow-up date, parsed as a LOCAL calendar
 * date (YYYY-MM-DD) so an all-day reminder never drifts a day across time zones.
 * Mirrors lib/nextActions.ts urgencyOf: past = overdue, same day = today, else
 * upcoming; a missing date is "none" (never surfaced). Used by the Agenda to
 * decide when to show the "Lead On Hold" reminder.
 */
export function holdReminderUrgency(
  holdFollowUpAt: string | null | undefined,
  now: Date = new Date(),
): HoldUrgency {
  if (!holdFollowUpAt) return "none"
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(holdFollowUpAt)
  const due = m
    ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
    : new Date(holdFollowUpAt)
  if (isNaN(due.getTime())) return "none"
  const today = new Date(now)
  today.setHours(0, 0, 0, 0)
  due.setHours(0, 0, 0, 0)
  if (due.getTime() < today.getTime()) return "overdue"
  if (due.getTime() === today.getTime()) return "today"
  return "upcoming"
}
