// Follow-Up Agent — APPROVED per-step CADENCE (eligibility intervals only).
//
// Cadence = when a step becomes ELIGIBLE. Pacing (pacing.ts) + the gate (gate.ts)
// decide the ACTUAL handoff instant (quiet hours, morning window, jitter). These
// are the values approved for the automated Agent. NOTE: the automated Agent does
// NOT use the one-tap system's move-date-aware List Sent override — it uses the
// flat sequential List Sent cadence below (explicit product decision).
//
// Text 1 is anchored to lead creation; every later step is anchored to the moment
// the PREVIOUS step actually sent (its confirmed local_sent_at / sent_at), so the
// chain never runs ahead of real delivery.

import { nextStep } from "./sequences"
import { DOUBLE_TEXT_MIN_MS, doubleTextSpacingMs, DONE_SELECTING_GRACE_MS } from "./pacing"
import type { SequenceKey } from "./types"

const DAY_MS = 24 * 60 * 60 * 1000

// New Lead
export const NEW_LEAD_TEXT1_DELAY_MS = 5 * 60 * 1000 // +5 min after Smart Lead Form submission
// Text 2 is eligible 30-45s after Text 1 is CONFIRMED sent (the ack's
// local_sent_at), never from queue/claim time. Persisted on the run so Beast Sync
// can claim it when due, independent of the 1-minute dispatcher cron.
//
// The actual gap is RANDOMIZED in that range by pacing.doubleTextSpacingMs() — a
// fixed 30.000s cadence across every lead is a machine signature, and the pair is
// meant to read like a person sending a second thought. This constant remains the
// floor of that range and the two must stay in agreement; a test asserts it.
export const NEW_LEAD_TEXT2_DELAY_MS = DOUBLE_TEXT_MIN_MS
export const CONTACT_FU_STEP_DELAY_DAYS = 2 // Contact FU1/FU2/FU3 each +2 days

// List Sent (flat sequential — NOT move-date-aware for the Agent)
export const LIST_FU1_DELAY_DAYS = 1 // FU1 +1 day after the list was sent
export const LIST_FU2_DELAY_DAYS = 2 // FU2 +2 days after FU1
export const LIST_FU3_DELAY_DAYS = 3 // FU3 +3 days after FU2
export const LIST_FINAL_DELAY_DAYS = 7 // Final +7 days after FU3

// Application Status
export const APPLICATION_STATUS_DELAY_CAL_DAYS = 3 // +3 calendar days after applied_at

// Post Tour — one message per tour DAY (multiple same-day tours = one session),
// anchored to the END of the LAST confirmed tour that day, +2 hours. Quiet hours
// still apply downstream (the gate reschedules a too-late slot to the next 09:00),
// and any meaningful client reply cancels it (post_tour is conversation-gated).
export const POST_TOUR_DELAY_MS = 2 * 60 * 60 * 1000

/** Text 1 eligibility: lead creation + 5 minutes. */
export function newLeadText1EligibleAt(createdAtIso: string): string {
  const base = new Date(createdAtIso)
  const t = isNaN(base.getTime()) ? Date.now() : base.getTime()
  return new Date(t + NEW_LEAD_TEXT1_DELAY_MS).toISOString()
}

/**
 * Post-Tour eligibility: the END of the LAST confirmed tour that day + 2 hours.
 * Pass the latest confirmed-tour end for the session; whoever creates the
 * post_tour run stamps this as next_eligible_at. Quiet-hours deferral is applied
 * later by the gate (a 2h-after-last-tour instant past 21:00 waits for 09:00).
 */
/**
 * FIRST-STEP ELIGIBILITY for the lifecycle sequences whose producers were missing.
 *
 * Each is anchored to the DURABLE event that defines the sequence, never to "when
 * the dispatcher noticed" — so a cron that was down for an hour does not shift a
 * client's cadence, and re-running enrollment is idempotent.
 */

/** list_sent FU1 — +1 day after the share was actually sent. */
export function listSentFu1EligibleAt(sentAtIso: string): string {
  const t = new Date(sentAtIso).getTime()
  return new Date((isNaN(t) ? Date.now() : t) + LIST_FU1_DELAY_DAYS * DAY_MS).toISOString()
}

/**
 * done_selecting — a short grace after the client finished choosing, so the
 * branch message reflects their final selection rather than a mid-click state.
 */
export function doneSelectingEligibleAt(doneAtIso: string): string {
  const t = new Date(doneAtIso).getTime()
  return new Date((isNaN(t) ? Date.now() : t) + DONE_SELECTING_GRACE_MS).toISOString()
}

/** application_status — +3 calendar days after the application was submitted. */
export function applicationStatusEligibleAt(appliedAtIso: string): string {
  const t = new Date(appliedAtIso).getTime()
  return new Date((isNaN(t) ? Date.now() : t) + APPLICATION_STATUS_DELAY_CAL_DAYS * DAY_MS).toISOString()
}

/**
 * resume_search — near-immediate. The client just tapped "Resume Your Search", so
 * this is a direct acknowledgment; the small grace only keeps it from racing the
 * RPC's own writes. Quiet hours still defers it if they tapped at 2am.
 */
export const RESUME_SEARCH_GRACE_MS = 2 * 60 * 1000
export function resumeSearchEligibleAt(resumedAtIso: string): string {
  const t = new Date(resumedAtIso).getTime()
  return new Date((isNaN(t) ? Date.now() : t) + RESUME_SEARCH_GRACE_MS).toISOString()
}

export function postTourEligibleAt(lastTourEndIso: string): string {
  const end = new Date(lastTourEndIso)
  const t = isNaN(end.getTime()) ? Date.now() : end.getTime()
  return new Date(t + POST_TOUR_DELAY_MS).toISOString()
}

/**
 * Eligibility for the step that FOLLOWS `justSentStepKey`, anchored to when that
 * step actually sent (`prevSentAtIso`). Returns { nextStepKey, nextEligibleAt } or
 * null when the sequence is terminal (no successor).
 *
 * This is title-agnostic step math: it maps each {sequence, next-step} to its
 * approved interval. The gate later reschedules morning-gated steps (contact_fu*,
 * list_sent, application_status, future_move) into the client-local window.
 */
export function nextStepEligibility(
  sequenceKey: SequenceKey,
  justSentStepKey: string,
  prevSentAtIso: string,
  // The opening pair's gap is randomized, which would make every assertion about
  // it flaky. Injecting the source keeps production random and tests exact: the
  // suite pins it to a known value for equality checks and separately samples the
  // real generator to prove the range.
  opts: { spacingMs?: () => number } = {},
): { nextStepKey: string; nextEligibleAt: string } | null {
  const next = nextStep(sequenceKey, justSentStepKey)
  if (!next) return null

  const prev = new Date(prevSentAtIso)
  const base = isNaN(prev.getTime()) ? Date.now() : prev.getTime()
  const plusDays = (d: number) => new Date(base + d * DAY_MS).toISOString()

  let eligible: string
  if (sequenceKey === "new_lead") {
    // +30-45s, randomized per pair (see NEW_LEAD_TEXT2_DELAY_MS above).
    if (next.key === "t2") eligible = new Date(base + (opts.spacingMs ?? doubleTextSpacingMs)()).toISOString()
    else eligible = plusDays(CONTACT_FU_STEP_DELAY_DAYS) // contact_fu1/2/3
  } else if (sequenceKey === "list_sent") {
    if (next.key === "fu2") eligible = plusDays(LIST_FU2_DELAY_DAYS)
    else if (next.key === "fu3") eligible = plusDays(LIST_FU3_DELAY_DAYS)
    else if (next.key === "final") eligible = plusDays(LIST_FINAL_DELAY_DAYS)
    else eligible = plusDays(LIST_FU1_DELAY_DAYS)
  } else {
    // Single-step / event sequences have no successor; defensive fallback.
    eligible = plusDays(1)
  }
  return { nextStepKey: next.key, nextEligibleAt: eligible }
}
