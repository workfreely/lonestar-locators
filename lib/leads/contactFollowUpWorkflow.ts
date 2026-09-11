import { supabase } from "@/lib/supabase/client"
import { isDemoLeadId } from "@/lib/demo/demoWorkspace"
import { recordTimelineEvent } from "@/lib/leads/timeline"
import { getNextContactFollowUpAction, createWorkflowActionIfNeeded } from "@/lib/workflowEngine"
import { emitWorkflowActionCreated } from "@/lib/workflowToast"

/**
 * CANONICAL pre-list Contact FU completion — one handler for the Contact FU1 →
 * FU2 → FU3 chase, shared by the CRM and Beast Companion. This is DELIBERATELY
 * SEPARATE from completeFollowUp (the post-List-Sent FU1→…→Final ladder) and must
 * never touch it, its keys, follow_up_count, next_action_date, or the move-date
 * cadence.
 *
 * On "Yes, Sent" it:
 *   1. records a text_sent lead_timeline event — the SAME signal the New-lead flow
 *      uses, so the newly-open successor derives Status "Waiting for Reply";
 *   2. completes the persisted contact-FU row (real leads) with the real timestamp;
 *   3. keeps the lead in its current stage (NO stage change); and
 *   4. creates AT MOST one successor (Contact FU2/FU3) via getNextContactFollowUp-
 *      Action — but ONLY while the lead is still in the pre-list chase. That chase
 *      now lives in the Contacted stage (an unanswered attempt advances New →
 *      Contacted), so the guard allows crm_status ∈ {new, contacted} AND requires
 *      that NO build_list action exists (a build_list means the lead was reached and
 *      is on the Build List → List Sent track — the chase is superseded). If the
 *      lead has progressed to Searching/List Sent/etc., or a build_list exists, NO
 *      successor is created. Completing Contact FU3 creates nothing (no FU4) and does
 *      NOT archive — the 7-day ghost/archive behavior is intentionally unchanged here.
 *
 * Demo leads never reach this (recordPendingOutreach no-ops on demo ids, so no
 * contact-FU rows exist for them); the guards below are still demo-safe.
 */
export async function completeContactFollowUp(opts: {
  lead: any
  followRow?: { id: number | string } | null
  completedTitle: string
  // Single timestamp shared by the completion + the text_sent event.
  now: string
  // Saved locator IANA timezone — the successor's +2-day 9:00 AM deadline is
  // resolved in this zone (stored UTC). Omitted → runtime-local.
  timeZone?: string | null
  onOptimistic?: (updatedLead: any) => void
  onWorkflowAction?: (action: any) => void
}): Promise<void> {
  const { lead, followRow, completedTitle, now, timeZone, onOptimistic, onWorkflowAction } = opts

  // 1) The "sent" signal that drives Waiting for Reply (demo is a no-op here).
  recordTimelineEvent({ leadId: lead.id, type: "text_sent", method: "text", sequence: null, occurredAt: now })

  // 2) Complete the persisted row (real leads) so Last Action derives the label.
  if (!isDemoLeadId(lead.id) && followRow?.id != null) {
    const { error } = await supabase
      .from("lead_next_actions")
      .update({ completed: true, completed_at: now, status: "completed" })
      .eq("id", followRow.id)
    if (error) console.error("[contact-follow-up] complete row failed:", error)
  }

  // 3) Reflect optimistically — no stage change, no post-list cache fields touched.
  onOptimistic?.({ ...lead })

  if (isDemoLeadId(lead.id)) return

  // 4) SUPERSESSION GUARD. The pre-list chase lives in New (legacy) or Contacted
  //    (an unanswered attempt now advances New → Contacted). Beyond that — Searching,
  //    List Sent, etc. — the lead has progressed and the chase is over.
  if (lead.crm_status !== "new" && lead.crm_status !== "contacted") return

  //    A build_list action (open OR completed) means the lead was REACHED and is on
  //    the Build List → List Sent track — the pre-list chase is superseded even while
  //    the stage still reads Contacted. Do not create a Contact FU successor then.
  const { data: buildRows, error: buildErr } = await supabase
    .from("lead_next_actions")
    .select("id")
    .eq("lead_id", lead.id)
    .eq("action_key", "build_list")
    .limit(1)
  if (buildErr) {
    console.error("[contact-follow-up] build_list supersession check failed:", buildErr)
    return
  }
  if (buildRows && buildRows.length > 0) return

  const succ = getNextContactFollowUpAction(completedTitle, timeZone)
  if (!succ) return // Contact FU3 (terminal) — no FU4, no archive.

  const created = await createWorkflowActionIfNeeded(supabase, lead.id, succ)
  if (created) {
    onWorkflowAction?.(created)
    emitWorkflowActionCreated(created)
  }
}
