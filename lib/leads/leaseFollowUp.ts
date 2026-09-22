import { autoDueOnDate } from "@/lib/workflow/autoDueDate"
import { DEFAULT_TIMEZONE } from "@/lib/timezone"

// Future Lease Follow-Up scheduling — the client-retention action created once a
// lease's closing obligations are done. It is due ~90 days before the ESTIMATED
// lease end, derived purely from the canonical Lease Start Date + Lease Term. No
// lease-end column is stored; the date is always recomputed here.
//
// Lease Term is NUMERIC MONTHS only. Legacy/unparseable free text ("12 months",
// "one year", "") yields null — the date is NEVER fabricated. Callers decide how
// to surface a lease_follow_up whose date can't be derived (we surface it now so
// the agent can set a real date, rather than inventing a lease expiration).
//
// All intermediate dates are anchored at 12:00 UTC on their calendar day, so the
// calendar date stays stable regardless of the runtime/display zone; the final
// 9:00-AM-local instant is produced by the shared timezone-safe autoDueOnDate.

export const LEASE_FOLLOW_UP_LEAD_DAYS = 90

/** Parse a Lease Term into a positive whole-number month count, or null. Numeric
 *  months only — "6"/"12"/"18" pass; "0", "-3", "12.5", "12 months", "" → null. */
export function parseLeaseTermMonths(term: unknown): number | null {
  const s = String(term ?? "").trim()
  if (!/^\d+$/.test(s)) return null
  const n = Number(s)
  return Number.isInteger(n) && n > 0 ? n : null
}

/** True when the term is a valid positive whole-number month count (for the
 *  Get Invoice Details required-field validation). */
export function isValidLeaseTerm(term: unknown): boolean {
  return parseLeaseTermMonths(term) !== null
}

/** Estimated lease end = Lease Start ("YYYY-MM-DD") + Lease Term months, returned
 *  as a Date anchored at 12:00 UTC on the end calendar day (day-of-month clamped
 *  to the target month's length, matching "add N months"). Null when the start
 *  date or term can't be interpreted. */
export function estimateLeaseEndDate(startDate: unknown, term: unknown): Date | null {
  const s = String(startDate ?? "").trim().slice(0, 10)
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  const months = parseLeaseTermMonths(term)
  if (!m || months === null) return null
  const y = Number(m[1]), mo = Number(m[2]) - 1, d = Number(m[3])
  const idx = mo + months
  const targetYear = y + Math.floor(idx / 12)
  const targetMonth = ((idx % 12) + 12) % 12
  // Clamp the day to the target month's last day (e.g. Jan 31 + 1mo → Feb 28/29).
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate()
  const day = Math.min(d, lastDay)
  const end = new Date(Date.UTC(targetYear, targetMonth, day, 12, 0, 0))
  return Number.isNaN(end.getTime()) ? null : end
}

/** Future Lease Follow-Up due instant = estimated lease end − 90 days, at 9:00 AM
 *  local (timezone-safe via the existing autoDueOnDate convention). Null when the
 *  lease end can't be derived — the caller must not fabricate a date. */
export function leaseFollowUpDueAt(startDate: unknown, term: unknown, timeZone?: string | null): string | null {
  const end = estimateLeaseEndDate(startDate, term)
  if (!end) return null
  const due = new Date(end.getTime() - LEASE_FOLLOW_UP_LEAD_DAYS * 24 * 60 * 60 * 1000)
  return autoDueOnDate(due, 0, timeZone ?? DEFAULT_TIMEZONE)
}
