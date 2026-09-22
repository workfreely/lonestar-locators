// Follow-Up Agent — Phase 1 shared types (pure; no DB/network).
//
// mode  = GLOBAL automation control for a client (persists across sequences).
// status = the ONE active run's lifecycle. A client reply stops the RUN, not mode.

export type FollowUpMode = "auto" | "manual" | "paused" | "stopped"

export type RunStatus =
  | "waiting" // scheduled; not yet eligible
  | "due" // eligible now; awaiting the final gate + pacing
  | "completed" // objective met / sequence finished normally
  | "canceled" // stopped before completion (see reason)
  | "superseded" // replaced by a newer applicable sequence

// The Phase-1 sequence families. Free-text in the DB; new families need no schema.
export type SequenceKey =
  | "new_lead"
  | "list_sent"
  | "done_selecting"
  | "tour"
  | "post_tour"
  | "application_status"
  | "future_move"

// A step's exposure to "conversation overrides automation":
//  - consent_only: fires on its timer; only a hard opt-out / global stop blocks it.
//    (Used ONLY by the New-Lead Text 1 / Text 2 opening pair.)
//  - full: any inbound client reply since the baseline stops/supersedes the run.
export type StepGate = "consent_only" | "full"

// Structured cancel/hold reasons for the audit trail.
export type FollowUpReason =
  | "client_replied"
  | "manual_conversation"
  | "objective_completed"
  | "availability_submitted"
  | "stage_changed"
  | "sequence_superseded"
  | "opt_out"
  | "paused"
  | "stopped"
  | "stale"
  | "outside_window"
  | "quiet_hours"
  | "not_enrolled"
  | "future_move_wait"
  | "no_move_date"
  | "not_eligible_yet"
  | "already_sent"

// The deterministic gate's verdict for one run at one instant.
export type SendDecision =
  | { action: "send"; stepKey: string; templateKey: string; body: string }
  | { action: "reschedule"; nextEligibleAt: string; reason: FollowUpReason }
  | { action: "cancel"; reason: FollowUpReason }
  | { action: "hold"; reason: FollowUpReason } // paused/manual/not-yet-eligible: do nothing now

// ── Deterministic input snapshots (everything the engine reads) ──────────────

export type LeadSnapshot = {
  id: number | string
  firstName: string | null
  agentFirstName: string | null
  beds: string | null // e.g. "1", "2", "studio"
  propertyType: string | null // e.g. "High-Rise"
  moveDate: string | null // ISO date (YYYY-MM-DD) or null
  moveMonthLabel: string | null // e.g. "October" or null
  crmStatus: string | null
  smsOptIn: boolean
  // HARD per-lead automation enrollment (leads.followup_opt_in). Default false for
  // EVERY lead: a non-enrolled lead can never produce an automated intent. Bound to
  // the canonical lead_id (the column lives on leads), never phone/email.
  followupOptIn: boolean
  appliedAt: string | null // ISO — real application date (leads.applied_at)
  timeZone: string // IANA, e.g. "America/Chicago"
}

export type ConversationSnapshot = {
  // Most recent INBOUND client message time (companion_messages, is_from_me=false).
  lastInboundAt: string | null
  // Most recent MANUAL locator OUTBOUND message time (is_from_me=true) — forces
  // reevaluation so stale automation doesn't fire right after a human text.
  lastManualOutboundAt: string | null
}

export type ShareSnapshot = {
  sentAt: string | null // client_recommendation_shares.sent_at (the real Send event)
  doneSelectingAt: string | null // done_selecting_at
  favoritedCount: number // favorited_count
  availabilitySubmittedAt: string | null // client_tour_availability.submitted_at
}

export type RunSnapshot = {
  sequenceKey: SequenceKey
  stepKey: string
  stepIndex: number
  status: RunStatus
  mode: FollowUpMode
  baselineInboundAt: string | null // last inbound seen when the step was scheduled
  nextEligibleAt: string | null // when the step became/should become eligible
}
