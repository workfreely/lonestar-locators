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
import { LIFECYCLE_SEQUENCES, applicableSequence, getStep, resolveStepBody } from "./sequences"
import { nextAllowedTime, nextMorningEligible, withinAllowedHours, withinMorningWindow, withinHandoffWindow } from "./pacing"
import { isStaleStep } from "./staleness"

// Sequences whose routine steps must land in the client-local morning window.
// New-Lead t1/t2 (immediate opening), Done-Selecting (event-relative, 10-min
// grace) and Post-Tour (event-relative, ~2h after tour) are NOT morning-gated.
const MORNING_GATED = new Set(["list_sent", "application_status", "future_move"])

/**
 * future_move has BOTH kinds of step, so the sequence-level set above is not
 * enough on its own:
 *   wait_ack   — a direct acknowledgment of a decision the client just made
 *                ("you'd rather wait — got it"). consent_only, and documented as
 *                immediate. Morning-gating it would have deferred an immediate
 *                reply to the next 09:00-10:30 band, which contradicted both the
 *                step's gate and its own comment.
 *   reactivate — a routine unprompted nudge 45 days before the move date, which
 *                is exactly what the morning band exists for.
 * Resolved in favour of the step's stated intent: wait_ack is NOT morning-gated.
 */
const FUTURE_MOVE_IMMEDIATE_STEPS = new Set(["wait_ack"])
// New-Lead contact-chase steps (contact_fu*) ARE morning-gated; t1/t2 are not.
function isMorningGated(seqKey: string, stepKey: string): boolean {
  if (seqKey === "new_lead") return stepKey.startsWith("contact_")
  if (seqKey === "future_move") return !FUTURE_MOVE_IMMEDIATE_STEPS.has(stepKey)
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

  // ── PRECEDENCE ─────────────────────────────────────────────────────────────
  //   1. authorization / enrollment
  //   2. hard stops (explicit Stop, client opt-out)
  //   3. lifecycle supersession / stage invalidation
  //   4. temporary suppression (locator pause, On Hold, human handoff)
  //   5. eligibility / staleness / reply / objective / time windows
  //
  // 3 BEFORE 4 IS THE POINT. Suppression used to come first, so a paused or
  // on-hold run could never be retired: it stayed `waiting`, kept the single
  // lead_followup_runs_one_active_lifecycle slot, and blocked every future
  // enrollment for that lead. A temporary suppression must never outlive the
  // lifecycle truth it is suppressing.

  // 1) AUTHORIZATION / ENROLLMENT. Both HOLD, never cancel, so a lead resumes
  //    cleanly once authorized/enrolled.
  //    1a) ACCOUNT: the controlling locator is in automated_texting_accounts
  //        (resolved live, so a revoke disables every one of their leads at once).
  //    1b) PER-LEAD enrollment (leads.followup_opt_in), default OFF.
  if (!lead.accountAuthorized) return { action: "hold", reason: "not_authorized" }
  if (!lead.followupOptIn) return { action: "hold", reason: "not_enrolled" }

  // 2) HARD STOPS — terminal, and they outrank lifecycle truth because there is
  //    nothing to supersede INTO: this client is not to be texted at all.
  if (run.mode === "stopped") return { action: "cancel", reason: "stopped" }
  if (!lead.smsOptIn) return { action: "cancel", reason: "opt_out" }

  // 3) LIFECYCLE SUPERSESSION / STAGE INVALIDATION. Runs even while suppressed —
  //    see the precedence note above.
  //    LIFECYCLE-derived sequences yield to whatever the current lifecycle makes
  //    applicable. EVENT-TRIGGERED sequences (resume_search, future_move,
  //    post_tour, tour) are created by an explicit event and are not
  //    lifecycle-derivable, so they stay authoritative — but are still stood down
  //    when the lead is closed/archived (applicable === null).
  const applicable = applicableSequence(lead, share)
  if (LIFECYCLE_SEQUENCES.has(run.sequenceKey)) {
    if (applicable !== run.sequenceKey) {
      return { action: "cancel", reason: applicable ? "sequence_superseded" : "stage_changed" }
    }
  } else if (applicable === null) {
    return { action: "cancel", reason: "stage_changed" } // closed/archived → stand down
  }

  // 4) TEMPORARY SUPPRESSION — all HOLD/RESCHEDULE, never cancel, so the run
  //    survives and the gate re-runs from current state later.
  //
  //    4a) Locator automation pause (run.mode).
  if (run.mode === "paused") return { action: "hold", reason: "paused" }
  if (run.mode === "manual") return { action: "hold", reason: "paused" } // suggestion only, never auto-sent

  //    4b) ON HOLD — the client paused their SEARCH. This applies to the
  //        consent_only opening pair too, unlike handoff below: a client who asked
  //        to stop looking should not receive "I got your form!" follow-ups, and
  //        held_at previously never reached this engine at all, so a held client
  //        kept being texted.
  if (lead.heldAt) return { action: "hold", reason: "on_hold" }

  //    4c) HUMAN HANDOFF — a genuine manual locator text within the last
  //        HANDOFF_WINDOW_MS suppresses competing automation, so Locator Beast
  //        does not talk over a live conversation.
  //
  //        A RECENCY WINDOW, not a comparison against run.baselineInboundAt. That
  //        baseline never advances, so one manual text used to suppress this lead's
  //        automation permanently. It now expires on its own.
  //
  //        The automation's OWN sends cannot trigger this: lastManualOutboundAt is
  //        built from provenance = 'manual_outbound' (see lib/followup/snapshot).
  //
  //        consent_only steps are EXEMPT. The New-Lead pair is one thought split in
  //        two and Text 2 carries the location question; a locator texting inside
  //        that 30-45s window is greeting the client, not answering it. Deciding
  //        otherwise would require interpreting whether the manual text "covered"
  //        the question, which is exactly the judgement this engine must not make.
  if (step.gate === "full" && withinHandoffWindow(now, conv.lastManualOutboundAt)) {
    if (isMorningGated(run.sequenceKey, run.stepKey)) {
      return { action: "reschedule", nextEligibleAt: nextMorningEligible(now, lead.timeZone), reason: "manual_conversation" }
    }
    return { action: "hold", reason: "manual_conversation" }
  }

  // 5) ELIGIBILITY / STALENESS / REPLY / OBJECTIVE / TIME WINDOWS.
  if (run.nextEligibleAt && now.getTime() < new Date(run.nextEligibleAt).getTime()) {
    return { action: "hold", reason: "not_eligible_yet" }
  }

  // 5b) STALENESS. Beast Sync can reconnect after days offline; nothing used to
  //     bound how LATE automation could be, so a New Lead "I got your form…" could
  //     arrive three days after the form. Cancel rather than reschedule — the
  //     moment for that message has passed, and rescheduling would re-render the
  //     same time-anchored copy and send it anyway. Bounds are per sequence and
  //     step (lib/followup/staleness), because shelf lives genuinely differ.
  if (isStaleStep(run.sequenceKey, run.stepKey, run.nextEligibleAt, now)) {
    return { action: "cancel", reason: "stale_sequence" }
  }

  // 5c) CONVERSATION OVERRIDES AUTOMATION — full-gated steps: ANY inbound since
  //     the baseline cancels the run. The consent_only opening pair intentionally
  //     ignores ordinary replies (only opt-out, handled at 2, stops it).
  if (step.gate === "full" && newer(conv.lastInboundAt, run.baselineInboundAt)) {
    return { action: "cancel", reason: "client_replied" }
  }

  // 5d) Objective already satisfied → complete, don't nag.
  const objective = objectiveSatisfied(run.sequenceKey, run.stepKey, share)
  if (objective) return { action: "cancel", reason: objective }

  // 5e) HARD quiet-hours invariant — EVERY family, including the New-Lead double
  //     text. Never before 09:00 or at/after 21:00 client-local; defer to the next
  //     allowed period, where this whole gate re-runs.
  if (!withinAllowedHours(now, lead.timeZone)) {
    return { action: "reschedule", nextEligibleAt: nextAllowedTime(now, lead.timeZone), reason: "quiet_hours" }
  }

  // 5f) Routine morning window (the narrower 09:00-10:30 band) for routine steps.
  if (isMorningGated(run.sequenceKey, run.stepKey) && !withinMorningWindow(now, lead.timeZone)) {
    return { action: "reschedule", nextEligibleAt: nextMorningEligible(now, lead.timeZone), reason: "outside_window" }
  }

  // 9) Resolve the APPROVED body from CURRENT state.
  const body = resolveStepBody(run.sequenceKey, run.stepKey, lead, share, run.sessionTourCount)
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
