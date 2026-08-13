import { autoDueInDays } from "./autoDueDate"

/**
 * Move-date-aware follow-up cadence.
 *
 * The List Sent follow-up frequency reflects how soon the client is moving: the
 * sooner the move, the more aggressive the chase. FU1's initial due (next day @
 * 9 AM) is still owned by the List Sent stage workflow — this only governs the
 * due date of each SUBSEQUENT follow-up when the previous one is sent.
 */

/**
 * Whole days from now until the move date, or null when the move date is missing
 * or unparseable. Canonical helper — the ready_to_tour case in workflowEngine
 * inlines the same math, left untouched by scope lock; this is the reusable copy.
 */
export function daysUntilMove(moveDate: string | null | undefined): number | null {
  if (!moveDate) return null
  const d = new Date(moveDate)
  if (isNaN(d.getTime())) return null
  return Math.ceil((d.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
}

/**
 * Due date for the NEXT follow-up, RECALCULATED every time a successor is created
 * using TODAY's date and the client's CURRENT move date. A client is never
 * permanently bucketed — as the move date approaches, later follow-ups naturally
 * shift to a more aggressive cadence.
 *
 * APPROVED ranges (days remaining until move → next follow-up due):
 *   0–60 days   → +1 day  (aggressive; every next follow-up is +1)
 *   61–120 days → +3 days
 *
 * PRESERVE the existing engine timing (`fallbackDueAt`) — never an aggressive
 * bucket — for every case NOT yet approved, so nothing is guessed:
 *   - 120+ days out (pending Reconnect Client audit)
 *   - PAST move date (days < 0) — must NOT be classified as ≤60
 *   - missing / invalid move date
 *
 * `completedTitle` is retained for signature stability (callers pass it); the
 * cadence is now title-agnostic — the range alone decides the next due date.
 */
export function followUpSuccessorDueAt(
  completedTitle: string,
  lead: { move_date?: string | null },
  fallbackDueAt: string,
  // Saved locator IANA timezone — the +1/+3 day 9:00 AM deadline is resolved in
  // this zone (stored UTC). Omitted → runtime-local (unchanged). The fallback is
  // already computed by the caller in the same zone, so it stays authoritative.
  timeZone?: string | null,
): string {
  void completedTitle
  const days = daysUntilMove(lead.move_date)
  if (days == null) return fallbackDueAt // missing / invalid move date
  if (days < 0) return fallbackDueAt // past move date — never treat as ≤60
  if (days <= 60) return autoDueInDays(1, timeZone) // aggressive: +1 day
  if (days <= 120) return autoDueInDays(3, timeZone) // less aggressive: +3 days
  return fallbackDueAt // 120+ days — unapproved, preserve existing timing
}
