// Follow-Up Agent — STORE SEAM.
//
// The engine (engine.ts) contains the REAL orchestration (enroll, tick, claim,
// ack, run advancement, idempotency) and reads/writes exclusively through this
// interface. Production backs it with Supabase (stores/supabaseStore.ts); the
// dry-run simulator backs it with an in-memory store + virtual clock. Same engine
// code runs in both — the ONLY thing that differs is where rows live and, in the
// sim, that no device/transport exists (the sim plays Beast Sync itself).

import type { ConversationSnapshot, LeadSnapshot, ShareSnapshot } from "./types"
import type { LeadRow, RunRow } from "./snapshot"

export type { LeadRow, RunRow }

export type IntentRow = {
  id: string
  run_id: string | null
  lead_id: number
  workspace_id: string
  owner_user_id: string | null
  sequence_key: string
  step_key: string
  template_key: string | null
  rendered_body: string | null
  decision: string
  decision_reason: string | null
  dispatch_status: string
  idempotency_key: string | null
  gateway_device_id: string | null
  claimed_at: string | null
  sent_at: string | null
  local_sent_at: string | null
  send_not_before: string | null
  error: string | null
  created_at: string
}

export type RunInsert = {
  lead_id: number
  workspace_id: string
  owner_user_id: string | null
  mode: string
  sequence_key: string
  step_key: string
  step_index: number
  status: string
  next_eligible_at: string | null
  baseline_inbound_at: string | null
  sequence_version: number
  session_date?: string | null // client-local date for event sessions (Post Tour tour-day)
  session_tour_count?: number | null // tours on session_date (singular/plural copy)
}

export type IntentInsert = {
  run_id: string | null
  lead_id: number
  workspace_id: string
  owner_user_id: string | null
  sequence_key: string
  step_key: string
  template_key: string | null
  rendered_body: string | null
  decision: string
  decision_reason: string | null
  evaluated_state: Record<string, unknown>
  dispatch_status: string
  idempotency_key: string | null
  send_not_before: string | null
}

export interface FollowupStore {
  // Enrollment + tick
  enrollmentCandidates(sinceIso: string, limit: number): Promise<LeadRow[]>
  /**
   * Every lead eligible for LIFECYCLE enrollment — enrolled, consented, not
   * closed/archived — with no created_at window. enrollmentCandidates is bounded
   * to recently-created leads, which is right for new_lead but would make
   * list_sent / application_status / done_selecting unreachable: those events
   * happen long after the lead is created.
   */
  enrolledLeads(limit: number): Promise<LeadRow[]>
  /**
   * The lead's active run in the LIFECYCLE slot (session_date IS NULL), which is
   * the slot the one-active-lifecycle unique index governs. Distinct from
   * hasActiveRun, which also counts event-session runs like post_tour.
   */
  activeLifecycleRun(leadId: number): Promise<RunRow | null>
  /** Has any run (any status) been created for this lead/sequence/session date? */
  sessionRunExists(leadId: number, sequenceKey: string, sessionDate: string): Promise<boolean>
  hasActiveRun(leadId: number): Promise<boolean>
  insertRun(run: RunInsert): Promise<boolean> // false when the one-active-run guard rejects it
  dueWaitingRuns(nowIso: string, limit: number): Promise<RunRow[]>
  leadRow(leadId: number): Promise<LeadRow | null>
  runById(runId: string): Promise<RunRow | null>
  updateRun(runId: string, patch: Record<string, unknown>): Promise<void>

  // Intents
  insertIntent(intent: IntentInsert): Promise<"ok" | "duplicate">
  updateIntent(intentId: string, patch: Record<string, unknown>): Promise<void>
  /**
   * ATOMICALLY take ownership of a pending intent. Returns true only for the
   * caller that actually won it; every other caller gets false and must not send.
   *
   * Separate from updateIntent because the claim is the one write where "did I
   * change the row?" is the answer, not a side effect: two Macs poll the same
   * workspace on independent timers, and a read-then-write claim let both of them
   * send the same text to the same client.
   */
  claimIntent(intentId: string, patch: Record<string, unknown>): Promise<boolean>
  /**
   * The LIVE intent for this (run, step), if one exists — mirrors the partial
   * index followup_intents_active_step_uidx exactly: dispatch_status IN
   * ('pending','claimed','sent').
   *
   * Exists so enqueueIntent can tell a duplicate tick (a real intent is already
   * out, so the run genuinely IS due) from a failed insert (nothing is live, so
   * marking the run due would strand it outside dueWaitingRuns forever).
   * insertIntent's "duplicate" return cannot distinguish them, because the
   * Supabase adapter deliberately collapses every insert error into it rather
   * than risk a double-send.
   */
  activeIntentFor(runId: string, stepKey: string): Promise<IntentRow | null>
  pendingIntents(workspaceId: string, limit: number): Promise<IntentRow[]>
  intentById(intentId: string): Promise<IntentRow | null>
  // Latest send_not_before among the workspace's live (pending/claimed) intents —
  // the cursor new cross-client sends are staggered after. Null when none.
  latestPendingSendAt(workspaceId: string): Promise<string | null>

  // Snapshots (live state the engine feeds to the real gate)
  leadSnapshot(row: LeadRow): Promise<LeadSnapshot>
  conversation(leadId: number): Promise<ConversationSnapshot>
  share(leadId: number): Promise<ShareSnapshot>

  // ── Post Tour wiring (canonical source = lead_tours) ──────────────────────
  // Enrolled leads that currently have ≥1 confirmed (scheduled) tour — candidates
  // for a post_tour run.
  enrolledLeadsWithActiveTours(limit: number): Promise<LeadRow[]>
  // Confirmed (scheduled) tours for a lead, with start + end. Grouped by local date.
  activeToursForLead(leadId: number): Promise<{ scheduledAt: string; endsAt: string }[]>
  // The lead's active (waiting|due) post_tour run FOR A GIVEN tour date, if any
  // (so a reschedule within that date repoints only that date's run).
  activePostTourRunForDate(leadId: number, sessionDate: string): Promise<RunRow | null>
  // Has a post_tour run (ANY status) already been created for this tour DATE?
  // Dedups so a canceled/sent day is not recreated on the next tick.
  postTourRunExistsForDate(leadId: number, sessionDate: string): Promise<boolean>
  // Enrollment-gated handoff: stand down the manual one-tap tour_follow_up action
  // once the automated post_tour run owns the handoff (no-op for non-enrolled).
  suppressManualTourFollowUp(leadId: number): Promise<void>
}
