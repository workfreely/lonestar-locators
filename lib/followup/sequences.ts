// Follow-Up Agent — Phase 1 SEQUENCE REGISTRY (sequence-agnostic engine data).
//
// The dispatcher/gate NEVER branch on family; they read these definitions. Each
// step declares its conversation-gate exposure and (for a send) resolves an
// APPROVED body from copy.ts. Adding a family = adding an entry here.

import type { LeadSnapshot, SequenceKey, ShareSnapshot, StepGate } from "./types"
import * as C from "./copy"
import { renderTemplate } from "@bc/companion-shared"

export type StepDef = {
  key: string
  gate: StepGate
  templateKey: string // for audit/analytics; not workflow action_key
  terminal?: boolean // last step of the sequence
}

export type SequenceDef = {
  key: SequenceKey
  steps: StepDef[]
}

// Sequences DERIVED from lead lifecycle state (what applicableSequence() can
// return). Only these are subject to the gate's "a newer applicable sequence
// wins" supersede check. EVENT-TRIGGERED sequences (future_move, post_tour, tour,
// resume_search) are created by an explicit event and are NOT lifecycle-derivable,
// so applicableSequence() never returns them — they must remain authoritative
// rather than being auto-superseded. See gate.ts step 3.
export const LIFECYCLE_SEQUENCES = new Set<SequenceKey>([
  "new_lead",
  "list_sent",
  "application_status",
  "done_selecting",
])

// Only the New-Lead OPENING pair is consent_only (fires on its timer; ordinary
// replies don't cancel it). Everything after is full conversation-gated.
export const SEQUENCES: Record<SequenceKey, SequenceDef> = {
  new_lead: {
    key: "new_lead",
    steps: [
      { key: "t1", gate: "consent_only", templateKey: "new_lead_text1" },
      { key: "t2", gate: "consent_only", templateKey: "new_lead_text2" },
      { key: "contact_fu1", gate: "full", templateKey: "contact_follow_up_1" },
      { key: "contact_fu2", gate: "full", templateKey: "contact_follow_up_2" },
      { key: "contact_fu3", gate: "full", templateKey: "contact_follow_up_3", terminal: true },
    ],
  },
  list_sent: {
    key: "list_sent",
    steps: [
      { key: "fu1", gate: "full", templateKey: "follow_up_1" },
      { key: "fu2", gate: "full", templateKey: "follow_up_2" },
      { key: "fu3", gate: "full", templateKey: "follow_up_3" },
      { key: "final", gate: "full", templateKey: "final_follow_up", terminal: true },
    ],
  },
  done_selecting: {
    key: "done_selecting",
    steps: [{ key: "evaluate", gate: "full", templateKey: "done_selecting_branch", terminal: true }],
  },
  post_tour: {
    key: "post_tour",
    steps: [{ key: "ask", gate: "full", templateKey: "post_tour", terminal: true }],
  },
  application_status: {
    key: "application_status",
    steps: [{ key: "ask", gate: "full", templateKey: "application_status", terminal: true }],
  },
  future_move: {
    key: "future_move",
    steps: [
      // Sent immediately when a >90-day client chooses to WAIT (Branch C). It is a
      // direct acknowledgment of that decision, so it is consent_only (the very
      // reply that triggered it must not cancel it). LOCKED copy.
      { key: "wait_ack", gate: "consent_only", templateKey: "future_move_wait_ack" },
      // The eventual reactivation at move_date − 45 days. Copy is TBD → resolves to
      // null (sends nothing yet); only the trigger is scheduled.
      { key: "reactivate", gate: "full", templateKey: "future_move_reactivate", terminal: true },
    ],
  },
  // TOUR itself is a Next-Action handoff (Schedule Tours), not a client-texting
  // sequence in Phase 1 — represented for completeness, no steps.
  tour: { key: "tour", steps: [] },
  // RESUME SEARCH — an EVENT-TRIGGERED sequence, deliberately OUTSIDE the New-Lead
  // chronological chain. It is entered only by the client-driven "Resume Your
  // Search" event on a paused /r page (never by a lifecycle-stage timer), which is
  // why applicableSequence() below never returns it. Single terminal step; full
  // conversation-gated. Registered so the architecture is ready — nothing schedules
  // or sends it yet (today Resume still surfaces via the one-tap Agenda action).
  resume_search: {
    key: "resume_search",
    steps: [{ key: "resume", gate: "full", templateKey: "resume_search", terminal: true }],
  },
}

export function getSequence(key: SequenceKey): SequenceDef {
  return SEQUENCES[key]
}
export function getStep(key: SequenceKey, stepKey: string): StepDef | null {
  return SEQUENCES[key].steps.find((s) => s.key === stepKey) ?? null
}
export function nextStep(key: SequenceKey, stepKey: string): StepDef | null {
  const steps = SEQUENCES[key].steps
  const i = steps.findIndex((s) => s.key === stepKey)
  if (i < 0 || i + 1 >= steps.length) return null
  return steps[i + 1]
}

/**
 * Resolve the APPROVED body for a step at send time, using CURRENT state (never a
 * stale snapshot). Returns null when the step legitimately has no message.
 */
export function resolveStepBody(
  seq: SequenceKey,
  stepKey: string,
  lead: LeadSnapshot,
  share: ShareSnapshot,
  // Post Tour: confirmed tours on this run's session date (for singular vs plural).
  sessionTourCount?: number | null,
): string | null {
  const first = (lead.firstName || "").trim()
  const vars = { first_name: first, agent_first_name: (lead.agentFirstName || "").trim() }

  if (seq === "new_lead") {
    switch (stepKey) {
      case "t1":
        return C.renderNewLeadText1(lead)
      case "t2":
        return C.NEW_LEAD_TEXT2
      case "contact_fu1":
        return renderTemplate(C.CONTACT_FOLLOW_UP_1, vars)
      case "contact_fu2":
        return C.CONTACT_FOLLOW_UP_2
      case "contact_fu3":
        return C.CONTACT_FOLLOW_UP_3
    }
  }
  if (seq === "list_sent") {
    switch (stepKey) {
      case "fu1":
        return C.LIST_FU1
      case "fu2":
        return C.LIST_FU2
      case "fu3":
        return C.listFu3(share.favoritedCount) // LOCKED conditional variant
      case "final":
        return C.FINAL_PAUSE
    }
  }
  if (seq === "done_selecting" && stepKey === "evaluate") {
    return resolveDoneSelectingBody(lead, share)
  }
  if (seq === "post_tour" && stepKey === "ask") return (sessionTourCount ?? 1) > 1 ? C.POST_TOUR_MULTI : C.POST_TOUR
  if (seq === "application_status" && stepKey === "ask") return C.APPLICATION_STATUS
  if (seq === "resume_search" && stepKey === "resume") return renderTemplate(C.RESUME_SEARCH, vars) // uses {first_name}
  if (seq === "future_move") {
    if (stepKey === "wait_ack") return C.FUTURE_MOVE_WAIT_CONFIRM // LOCKED acknowledgment
    if (stepKey === "reactivate") return renderTemplate(C.FUTURE_MOVE_REACTIVATE, vars) // LOCKED, uses {first_name}
  }
  return null
}

/**
 * The Future-Move reactivation ELIGIBILITY date: move_date − 90 days (default),
 * unless the client gave an explicit instruction (a specific timeframe/date),
 * which is passed as `daysBefore` (or resolved upstream). Returns an ISO date
 * (YYYY-MM-DD) or null when the move date is unknown.
 */
export function futureMoveReactivationDate(
  moveDate: string | null,
  daysBefore = 90,
): string | null {
  if (!moveDate) return null
  const m = new Date(`${moveDate}T00:00:00Z`)
  if (isNaN(m.getTime())) return null
  m.setUTCDate(m.getUTCDate() - daysBefore)
  return m.toISOString().slice(0, 10)
}

/**
 * DONE-SELECTING branch selection (LOCKED behavior), evaluated on CURRENT state
 * after the 10-minute grace:
 *   A) favorites + availability submitted → tour-confirmation acknowledgment.
 *   B) favorites, no availability, move ≤ 90 days → ask for availability.
 *   C) favorites, no availability, move > 90 days → ask tour-now-or-wait.
 * (No favorites at all → no message; handled by the gate as objective-not-met.)
 */
export function resolveDoneSelectingBody(lead: LeadSnapshot, share: ShareSnapshot): string | null {
  if (share.favoritedCount <= 0) return null
  if (share.availabilitySubmittedAt) return C.DONE_SELECTING_A_AVAILABILITY_SUBMITTED
  const days = daysUntilMove(lead.moveDate)
  if (days == null) return C.DONE_SELECTING_B_NEEDS_AVAILABILITY // unknown move date → treat as near-term ask
  return days <= 90 ? C.DONE_SELECTING_B_NEEDS_AVAILABILITY : C.DONE_SELECTING_C_FAR_OUT
}

export function daysUntilMove(moveDate: string | null, now: Date = new Date()): number | null {
  if (!moveDate) return null
  const m = new Date(`${moveDate}T00:00:00Z`)
  if (isNaN(m.getTime())) return null
  return Math.round((m.getTime() - now.getTime()) / 86_400_000)
}

/**
 * Which sequence SHOULD be active for the current lifecycle state — the basis for
 * supersede decisions. Deterministic, precedence-ordered (later lifecycle wins).
 * Returns null when no routine sequence should be running (e.g. waiting on a
 * future-move trigger, or a terminal/closed state).
 */
export function applicableSequence(lead: LeadSnapshot, share: ShareSnapshot): SequenceKey | null {
  const status = (lead.crmStatus || "").toLowerCase()
  if (status.includes("closed") || status.includes("archiv")) return null
  if (lead.appliedAt) return "application_status"
  if (share.doneSelectingAt) return "done_selecting"
  if (share.sentAt) return "list_sent"
  return "new_lead"
}
