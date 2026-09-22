// Follow-Up Agent — Phase 1 DETERMINISTIC SEND GATE.
//
// AI never decides whether an approved scheduled message may send. This pure
// function runs the send-authorization checklist and returns send/reschedule/
// cancel/hold with a structured reason. It reads CURRENT state only.

import type {
  ConversationSnapshot,
  LeadSnapshot,
  RunSnapshot,
  SendDecision,
  ShareSnapshot,
} from "./types"
import { applicableSequence, getStep, resolveStepBody } from "./sequences"
import { nextMorningEligible, withinMorningWindow } from "./pacing"

// Sequences whose routine steps must land in the client-local morning window.
// New-Lead t1/t2 (immediate opening), Done-Selecting (event-relative, 10-min
// grace) and Post-Tour (event-relative, ~2h after tour) are NOT morning-gated.
const MORNING_GATED = new Set(["list_sent", "application_status", "future_move"])
// New-Lead contact-chase steps (contact_fu*) ARE morning-gated; t1/t2 are not.
function isMorningGated(seqKey: string, stepKey: string): boolean {
  if (seqKey === "new_lead") return stepKey.startsWith("contact_")
  return MORNING_GATED.has(seqKey)
}

function newer(a: string | null, b: string | null): boolean {
  if (!a) return false
  if (!b) return true
  return new Date(a).getTime() > new Date(b).getTime()
}

/**
 * Decide whether the run's current step may send RIGHT NOW.
 * Order matters: hard blocks first, then conversation override (BEFORE any
 * interpretation), then timeliness/objective, then the actual send.
 */
export function evaluateSend(
  now: Date,
  lead: LeadSnapshot,
  conv: ConversationSnapshot,
  share: ShareSnapshot,
  run: RunSnapshot,
): SendDecision {
  const step = getStep(run.sequenceKey, run.stepKey)
  if (!step) return { action: "cancel", reason: "stale" }

  // 1) Global automation control.
  if (run.mode === "stopped") return { action: "cancel", reason: "stopped" }
  if (run.mode === "paused") return { action: "hold", reason: "paused" }
  if (run.mode === "manual") return { action: "hold", reason: "paused" } // surfaced as a suggestion, never auto-sent

  // 2) Consent (opt-out flips sms_opt_in=false upstream — covers a hard "stop"
  //    even for the consent_only opening pair).
  if (!lead.smsOptIn) return { action: "cancel", reason: "opt_out" }

  // 3) Lifecycle still matches this sequence? A newer applicable sequence wins.
  const applicable = applicableSequence(lead, share)
  if (applicable !== run.sequenceKey) {
    return { action: "cancel", reason: applicable ? "sequence_superseded" : "stage_changed" }
  }

  // 4) Eligibility time reached?
  if (run.nextEligibleAt && now.getTime() < new Date(run.nextEligibleAt).getTime()) {
    return { action: "hold", reason: "not_eligible_yet" }
  }

  // 5) CONVERSATION OVERRIDES AUTOMATION — full-gated steps: ANY inbound since the
  //    baseline cancels the run BEFORE interpretation. consent_only opening pair
  //    (t1/t2) intentionally ignores ordinary replies (only opt-out, handled above).
  if (step.gate === "full" && newer(conv.lastInboundAt, run.baselineInboundAt)) {
    return { action: "cancel", reason: "client_replied" }
  }

  // 6) Manual locator outbound after the step was scheduled → don't fire stale
  //    automation right after a human text; reschedule to the next window.
  if (newer(conv.lastManualOutboundAt, run.baselineInboundAt)) {
    if (isMorningGated(run.sequenceKey, run.stepKey)) {
      return { action: "reschedule", nextEligibleAt: nextMorningEligible(now, lead.timeZone), reason: "manual_conversation" }
    }
    return { action: "hold", reason: "manual_conversation" }
  }

  // 7) Objective already satisfied → complete, don't nag.
  const objective = objectiveSatisfied(run.sequenceKey, run.stepKey, share)
  if (objective) return { action: "cancel", reason: objective }

  // 8) Communication window (routine morning-gated steps only).
  if (isMorningGated(run.sequenceKey, run.stepKey) && !withinMorningWindow(now, lead.timeZone)) {
    return { action: "reschedule", nextEligibleAt: nextMorningEligible(now, lead.timeZone), reason: "outside_window" }
  }

  // 9) Resolve the APPROVED body from CURRENT state.
  const body = resolveStepBody(run.sequenceKey, run.stepKey, lead, share)
  if (!body) return { action: "cancel", reason: "objective_completed" } // nothing meaningful to say (e.g. 0 favorites)

  return { action: "send", stepKey: run.stepKey, templateKey: step.templateKey, body }
}

/**
 * Per-sequence objective checks: has the client already done the thing this
 * sequence is chasing? Returns a cancel reason when satisfied, else null.
 */
function objectiveSatisfied(
  seqKey: string,
  stepKey: string,
  share: ShareSnapshot,
): "objective_completed" | "availability_submitted" | null {
  if (seqKey === "list_sent") {
    // The list ladder is chasing engagement with the sent list. Any of these means
    // the client engaged → stop the routine ladder.
    if (share.availabilitySubmittedAt) return "availability_submitted"
    if (share.doneSelectingAt) return "objective_completed"
    if (share.favoritedCount > 0) return "objective_completed"
  }
  if (seqKey === "done_selecting" && stepKey === "evaluate") {
    // If availability arrived during the grace, Branch A still SENDS (a positive
    // ack), so availability is NOT an objective-complete here — handled in copy.
    if (share.favoritedCount <= 0) return "objective_completed" // nothing was favorited → nothing to act on
  }
  return null
}
