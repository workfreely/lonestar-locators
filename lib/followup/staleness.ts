/**
 * STALE AUTOMATION — how overdue a step may be before it must not send.
 *
 * Beast Sync is an offline-tolerant gateway: a Mac can be asleep for days and then
 * reconnect. Nothing previously bounded the AGE of queued automation, so a New
 * Lead "I got your form…" could arrive three days after the form, and a
 * "How did the tour go?" could arrive next week.
 *
 * ── WHY NOT ONE GLOBAL MAX AGE ───────────────────────────────────────────────
 * The sequences have genuinely different shelf lives. The opening pair is tied to
 * a form submission minutes earlier; the application check-in is a polite nudge
 * that is still sensible three days late. One number would either keep sending
 * stale greetings or silently kill legitimate long-cadence follow-ups.
 *
 * ── MEASURED FROM next_eligible_at, NOT FROM CREATION ────────────────────────
 * The question is "how late is this STEP?", not "how old is this run?" — the
 * contact chase legitimately runs for six days after enrollment, so a run-age
 * bound would kill it. Overdue-ness is per step, and the gate re-evaluates it at
 * dispatch AND at claim, so a stale step cannot slip through a reconnect.
 *
 * Exceeding the bound CANCELS the run rather than rescheduling it. Rescheduling
 * would re-render the same time-anchored copy later and send it anyway, which is
 * the bug. A cancel is honest: the moment for that message has passed.
 */
import type { SequenceKey } from "./types"

const MIN = 60_000
const HOUR = 60 * MIN
const DAY = 24 * HOUR

/**
 * The opening pair. Text 1's copy names the form the client just submitted, so it
 * is only true for about as long as the enrollment window itself. Text 2 is the
 * second half of a 30-45 SECOND pair — an hour late it has lost its meaning
 * entirely, and arriving alone it reads as a non-sequitur.
 */
export const NEW_LEAD_T1_MAX_OVERDUE_MS = 6 * HOUR
export const NEW_LEAD_T2_MAX_OVERDUE_MS = 1 * HOUR

/** The pre-list contact chase: a 2-day cadence, so a day late is still fine. */
export const CONTACT_CHASE_MAX_OVERDUE_MS = 2 * DAY

/** "How did the tour go?" is a same-day question. */
export const POST_TOUR_MAX_OVERDUE_MS = 12 * HOUR

/** List follow-ups run on a 1-7 day cadence; 2 days late is tolerable. */
export const LIST_SENT_MAX_OVERDUE_MS = 2 * DAY

/** An application check-in stays sensible for a while. */
export const APPLICATION_MAX_OVERDUE_MS = 3 * DAY

/** Branch messages tied to a decision the client just made. */
export const DONE_SELECTING_MAX_OVERDUE_MS = 1 * DAY
export const RESUME_SEARCH_MAX_OVERDUE_MS = 1 * DAY

/** Anything unmapped. Deliberately conservative rather than generous. */
export const DEFAULT_MAX_OVERDUE_MS = 1 * DAY

/**
 * How overdue this step may be and still be worth sending.
 *
 * Unknown sequences and unknown steps fall back to the conservative default — a
 * new sequence added without a bound here is throttled, not unbounded.
 */
export function maxOverdueMs(sequenceKey: SequenceKey | string, stepKey: string): number {
  switch (sequenceKey) {
    case "new_lead":
      if (stepKey === "t1") return NEW_LEAD_T1_MAX_OVERDUE_MS
      if (stepKey === "t2") return NEW_LEAD_T2_MAX_OVERDUE_MS
      return CONTACT_CHASE_MAX_OVERDUE_MS
    case "list_sent":
      return LIST_SENT_MAX_OVERDUE_MS
    case "post_tour":
      return POST_TOUR_MAX_OVERDUE_MS
    case "application_status":
      return APPLICATION_MAX_OVERDUE_MS
    case "done_selecting":
      return DONE_SELECTING_MAX_OVERDUE_MS
    case "resume_search":
      return RESUME_SEARCH_MAX_OVERDUE_MS
    default:
      return DEFAULT_MAX_OVERDUE_MS
  }
}

/**
 * Is this step too late to send?
 *
 * False when the step is not yet due — "overdue" is only meaningful once the
 * eligibility time has passed, and a future-dated step is early, not stale.
 */
export function isStaleStep(
  sequenceKey: SequenceKey | string,
  stepKey: string,
  nextEligibleAt: string | null,
  now: Date,
): boolean {
  if (!nextEligibleAt) return false
  const due = new Date(nextEligibleAt).getTime()
  if (!Number.isFinite(due)) return false
  const overdue = now.getTime() - due
  if (overdue <= 0) return false
  return overdue > maxOverdueMs(sequenceKey, stepKey)
}
