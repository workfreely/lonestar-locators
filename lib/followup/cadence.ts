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
import type { SequenceKey } from "./types"

const DAY_MS = 24 * 60 * 60 * 1000

// New Lead
export const NEW_LEAD_TEXT1_DELAY_MS = 5 * 60 * 1000 // +5 min after Smart Lead Form submission
// Text 2 is eligible EXACTLY 30s after Text 1 is CONFIRMED sent (the ack's
// local_sent_at), never from queue/claim time. Persisted on the run so Beast Sync
// can claim it when due, independent of the 1-minute dispatcher cron.
export const NEW_LEAD_TEXT2_DELAY_MS = 30 * 1000
export const CONTACT_FU_STEP_DELAY_DAYS = 2 // Contact FU1/FU2/FU3 each +2 days

// List Sent (flat sequential — NOT move-date-aware for the Agent)
export const LIST_FU1_DELAY_DAYS = 1 // FU1 +1 day after the list was sent
export const LIST_FU2_DELAY_DAYS = 2 // FU2 +2 days after FU1
export const LIST_FU3_DELAY_DAYS = 3 // FU3 +3 days after FU2
export const LIST_FINAL_DELAY_DAYS = 7 // Final +7 days after FU3

// Application Status
export const APPLICATION_STATUS_DELAY_CAL_DAYS = 3 // +3 calendar days after applied_at

/** Text 1 eligibility: lead creation + 5 minutes. */
export function newLeadText1EligibleAt(createdAtIso: string): string {
  const base = new Date(createdAtIso)
  const t = isNaN(base.getTime()) ? Date.now() : base.getTime()
  return new Date(t + NEW_LEAD_TEXT1_DELAY_MS).toISOString()
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
): { nextStepKey: string; nextEligibleAt: string } | null {
  const next = nextStep(sequenceKey, justSentStepKey)
  if (!next) return null

  const prev = new Date(prevSentAtIso)
  const base = isNaN(prev.getTime()) ? Date.now() : prev.getTime()
  const plusDays = (d: number) => new Date(base + d * DAY_MS).toISOString()

  let eligible: string
  if (sequenceKey === "new_lead") {
    if (next.key === "t2") eligible = new Date(base + NEW_LEAD_TEXT2_DELAY_MS).toISOString() // exactly +30s
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
