// Check Application workflow (property-scoped to the Top Pick).
//
// After a client submits their application (Apply → Yes, Submitted) the lead is
// 'applied' with an open `check_application` row (stamped property_id = Top Pick).
// "What's the application status?" is answered ONCE here — the exact twin of
// completeTourFollowUp: record the durable outcome (leads.application_status +
// immutable lead_timeline), resolve the check_application row (complete it, or
// re-date it for Pending), update the Top Pick, and produce the next canonical
// action per the outcome plan. Never fabricates a 'closed' state.
//
// LOCKED-BASELINE SAFETY: Apply / start_application / the check_application
// creation rule are unchanged. leads.application_status (current state) and
// lead_timeline (history) are stored as orthogonal facts.

import type { SupabaseClient } from "@supabase/supabase-js"
import { CURRENT_WORKFLOW_VERSION, type ApplicationStatus } from "@bc/companion-shared"
import { supabase } from "@/lib/supabase/client"
import { isDemoLeadId } from "@/lib/demo/demoWorkspace"
import { recordTimelineEvent } from "@/lib/leads/timeline"
import { createManualTask } from "@/lib/leads/createManualTask"
import { planForApplicationOutcome } from "@/lib/leads/applicationOutcome"
export { planForApplicationOutcome, type ApplicationOutcomePlan } from "@/lib/leads/applicationOutcome"

// The optimistic patch the caller applies to localNextActions / localLeads
// (mirrors completeTourFollowUp's TourFollowUpPatch).
export type ApplicationOutcomePatch = {
  applicationStatus: ApplicationStatus
  /** The check_application row that was completed (Approved / Denied / Other). */
  completedCheckId: number | string | null
  /** The check_application row re-dated + kept OPEN, with its new due (Pending). */
  recheckedCheckId: number | string | null
  recheckedDueAt: string | null
  /** The setup_tour row reopened (Denied → Schedule Tour). */
  reopenedSetupTourId: number | string | null
  leadPatch: { application_status: ApplicationStatus; top_pick_favorite_id?: number | null }
}

/**
 * CANONICAL Check Application completion for the lead's Top Pick application.
 * Records the outcome (leads.application_status + immutable lead_timeline),
 * resolves the check_application row (complete or re-date), updates the Top Pick,
 * and produces the next canonical action (Confirm Lease / Schedule Tour / dated
 * Follow Up / re-dated Check Application). Demo leads skip DB writes; the caller
 * mirrors the same state locally. NEVER advances the lead to 'closed'.
 */
export async function completeApplicationOutcome(opts: {
  lead: any
  // The open check_application row this outcome is about (property-scoped to the
  // Top Pick — property_id was stamped at creation).
  checkAction: { id: number | string; property_id: number | null; property_name?: string | null }
  status: ApplicationStatus
  // The completed setup_tour row to reopen when the plan returns to Schedule Tour.
  setupTourRow?: { id: number | string } | null
  // ISO due for Pending's "check again" re-date OR Other's dated manual Follow Up.
  followUpDueAt?: string | null
  // Optional free note (Other).
  note?: string | null
  now: string
  // Apply the local optimistic patch (application_status + top pick, completed /
  // re-dated check_application, reopened setup_tour).
  onOptimistic?: (patch: ApplicationOutcomePatch) => void
  // The new next action (Confirm Lease OR the dated manual Follow Up). Pending
  // creates no new action — the re-dated check_application stays the next action.
  onActionCreated?: (action: any) => void
}): Promise<void> {
  const { lead, checkAction, status, setupTourRow, followUpDueAt, note, now, onOptimistic, onActionCreated } = opts
  const demo = isDemoLeadId(lead.id)
  const plan = planForApplicationOutcome(status)
  const propId = checkAction.property_id
  const propertyName = (checkAction.property_name || "").toString().trim() || null

  // Top Pick resolution (durable, one-per-lead — leads.top_pick_favorite_id).
  // 'clear' (Denied) drops the live Top Pick; history is preserved in the timeline
  // and the completed check_application row (property_id kept).
  let nextTopPick: number | null | undefined = undefined // undefined = unchanged
  if (plan.topPick === "clear") nextTopPick = null

  // 1) leads: durable application status (+ optional Top Pick clear). [real only]
  if (!demo) {
    const patch: Record<string, unknown> = { application_status: plan.applicationStatus }
    if (nextTopPick !== undefined) patch.top_pick_favorite_id = nextTopPick
    const { error } = await supabase.from("leads").update(patch).eq("id", lead.id)
    if (error) console.error("[check-application] update leads failed:", error)
  }

  // 2) check_application: complete it (Approved/Denied/Other) OR re-date it and
  //    keep it OPEN (Pending — never a duplicate open Check Application). [real only]
  if (!demo) {
    if (plan.completeCheckApplication) {
      const { error } = await supabase
        .from("lead_next_actions")
        .update({ completed: true, completed_at: now, status: "completed" })
        .eq("id", checkAction.id)
      if (error) console.error("[check-application] complete action failed:", error)
    } else if (plan.recheckCheckApplication && followUpDueAt) {
      const { error } = await supabase
        .from("lead_next_actions")
        .update({ due_at: followUpDueAt })
        .eq("id", checkAction.id)
      if (error) console.error("[check-application] re-date action failed:", error)
    }
  }

  // 3) Immutable history (best-effort, non-blocking; demo-safe inside).
  recordTimelineEvent({
    leadId: lead.id,
    type: "application_outcome",
    occurredAt: now,
    metadata: {
      check_action_id: checkAction.id,
      property_id: propId,
      property_name: propertyName,
      status: plan.applicationStatus,
      ...(note ? { note } : {}),
    },
  })

  // 4) Reopen Schedule Tour (Denied — the client needs another property). [real only]
  if (plan.reopenSetupTour && !demo && setupTourRow?.id != null) {
    const { error } = await supabase
      .from("lead_next_actions")
      .update({ completed: false, completed_at: null, status: "open", due_at: now })
      .eq("id", setupTourRow.id)
    if (error) console.error("[check-application] reopen setup_tour failed:", error)
  }

  onOptimistic?.({
    applicationStatus: plan.applicationStatus,
    completedCheckId: plan.completeCheckApplication ? checkAction.id : null,
    recheckedCheckId: plan.recheckCheckApplication ? checkAction.id : null,
    recheckedDueAt: plan.recheckCheckApplication ? (followUpDueAt ?? null) : null,
    reopenedSetupTourId: plan.reopenSetupTour ? (setupTourRow?.id ?? null) : null,
    leadPatch: {
      application_status: plan.applicationStatus,
      ...(nextTopPick !== undefined ? { top_pick_favorite_id: nextTopPick } : {}),
    },
  })

  // 5) Next canonical action.
  if (plan.createConfirmLease) {
    // Approved → the canonical post-approval step for the Top Pick property. The
    // lead stays in the application phase; Confirm Lease → Closed is wired separately.
    const created = await createConfirmLeaseForTopPick(lead, propId, propertyName, now, demo)
    if (created) onActionCreated?.(created)
  } else if (plan.createFollowUpTask && followUpDueAt) {
    // Other → the ONE canonical manual-task system (Add Task): a dated "Follow Up",
    // NOT another check_application. Demo-safe inside createManualTask.
    const created = await createManualTask({ lead, title: "Follow Up", dueAt: followUpDueAt, notes: note ?? null, now })
    if (created) onActionCreated?.(created)
  }
}

/**
 * Create the canonical "Confirm Lease" (confirm_lease) action for the lead's Top
 * Pick property — due now (do-it-next). Its completion (Confirm Lease → Closed) is
 * designed/wired separately; this only produces the action. No lease record is
 * fabricated. Demo synthesizes the row locally.
 */
async function createConfirmLeaseForTopPick(
  lead: any,
  propertyId: number | null,
  propertyName: string | null,
  now: string,
  demo: boolean,
): Promise<any | null> {
  if (demo) {
    return {
      id: `demo-act-confirm-lease-${now}`,
      lead_id: lead.id,
      title: "Confirm Lease",
      due_at: now,
      priority: "high",
      property_id: propertyId,
      property_name: propertyName,
      action_key: "confirm_lease",
      action_type: "workflow",
      origin: "workflow",
      completed: false,
      status: "open",
    }
  }
  const { data, error } = await supabase
    .from("lead_next_actions")
    .insert([
      {
        lead_id: lead.id,
        title: "Confirm Lease",
        due_at: now,
        priority: "high",
        property_id: propertyId,
        property_name: propertyName,
        action_key: "confirm_lease",
        action_type: "workflow",
        origin: "workflow",
        sequence: null,
        workflow_version: CURRENT_WORKFLOW_VERSION,
        status: "open",
      },
    ])
    .select("*")
    .single()
  if (error) {
    console.error("[check-application] create confirm_lease failed:", error)
    return null
  }
  return data
}
