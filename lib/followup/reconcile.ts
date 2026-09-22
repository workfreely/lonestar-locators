// Follow-Up Agent — Phase 1 RECONCILER (start / stop / supersede).
//
// Event-driven counterpart to the send gate: when an inbound arrives, a stage
// changes, or the locator texts manually, decide what happens to the ACTIVE run
// immediately (don't wait for the next dispatcher tick). A client reply stops the
// RUN (status), never the global mode.

import type { LeadSnapshot, RunSnapshot, SequenceKey, ShareSnapshot, FollowUpReason } from "./types"
import { applicableSequence, getStep } from "./sequences"

/** The sequence that should start on a fresh lifecycle trigger (or null). */
export function sequenceToStart(lead: LeadSnapshot, share: ShareSnapshot): SequenceKey | null {
  return applicableSequence(lead, share)
}

/**
 * An inbound client reply arrived. Should it STOP the active run?
 *
 * CONVERSATION OVERRIDES AUTOMATION: for a full-gated current step, yes — stop
 * BEFORE interpretation (interpretation/AI happens afterward, separately). For the
 * consent_only New-Lead opening pair (t1/t2), an ORDINARY reply does NOT stop it
 * (Text 2 still sends); a hard opt-out is handled elsewhere (flips sms_opt_in).
 */
export function inboundStopsRun(run: RunSnapshot): { stop: boolean; reason: FollowUpReason } {
  const step = getStep(run.sequenceKey, run.stepKey)
  if (step && step.gate === "consent_only") return { stop: false, reason: "client_replied" }
  return { stop: true, reason: "client_replied" }
}

/**
 * Manual locator outbound occurred → the active run must be reevaluated before it
 * fires again (so stale automation doesn't send right after a human text). Phase 1
 * signals "reevaluate"; the gate then reschedules/holds/cancels on the next pass.
 */
export function manualOutboundForcesReeval(run: RunSnapshot): boolean {
  return run.status === "waiting" || run.status === "due"
}

/**
 * Does the current lifecycle state make a DIFFERENT sequence applicable than the
 * one the active run is pursuing? If so the run should be superseded and the new
 * one started. Returns the new sequence (or null = keep / stand down).
 */
export function supersedeTo(
  run: RunSnapshot,
  lead: LeadSnapshot,
  share: ShareSnapshot,
): { supersede: boolean; to: SequenceKey | null } {
  const applicable = applicableSequence(lead, share)
  if (applicable === run.sequenceKey) return { supersede: false, to: null }
  return { supersede: true, to: applicable }
}
