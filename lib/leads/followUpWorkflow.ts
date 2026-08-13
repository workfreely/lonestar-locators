import { supabase } from "@/lib/supabase/client"
import { isDemoLeadId } from "@/lib/demo/demoWorkspace"
import { recordTimelineEvent } from "@/lib/leads/timeline"
import { getNextFollowUpAction, createWorkflowActionIfNeeded } from "@/lib/workflowEngine"
import { followUpSuccessorDueAt } from "@/lib/workflow/moveDateCadence"
import { emitWorkflowActionCreated } from "@/lib/workflowToast"

/**
 * CANONICAL List Sent follow-up completion — one generic handler for the whole
 * FU1 → FU2 → FU3 → Final sequence (keyed on the completed action's title), shared
 * by the CRM and Beast Companion. Mirrors completeBuildList/completeSendList.
 *
 * On "Yes, Sent" it:
 *   1. records a text_sent lead_timeline event — the SAME signal the New-lead
 *      flow uses, so the newly-open successor derives Status "Waiting for Reply";
 *   2. completes the persisted follow-up row (real leads) with the real timestamp;
 *   3. keeps the lead in List Sent (NO stage change); and
 *   4. creates exactly ONE successor through the existing sequence engine
 *      (getNextFollowUpAction), overriding only its due date with the approved
 *      move-date cadence (followUpSuccessorDueAt). Never duplicates the engine.
 *
 * Demo leads: recordTimelineEvent + createWorkflowActionIfNeeded both no-op on
 * demo ids, so this only completes-in-memory via onOptimistic; the caller
 * synthesizes the completed row, the successor, and the Waiting-for-Reply signal.
 */
export async function completeFollowUp(opts: {
  lead: any
  followRow?: { id: number | string } | null
  completedTitle: string
  // Single timestamp shared by the completion + the text_sent event so the
  // "outreach at-or-after the completed follow-up" Waiting-for-Reply check holds.
  now: string
  // Saved locator IANA timezone — the successor's 9:00 AM cadence deadline is
  // resolved in this zone (stored UTC). Omitted → runtime-local (unchanged).
  timeZone?: string | null
  onOptimistic?: (updatedLead: any) => void
  onWorkflowAction?: (action: any) => void
}): Promise<void> {
  const { lead, followRow, completedTitle, now, timeZone, onOptimistic, onWorkflowAction } = opts

  // 1) The "sent" signal that drives Waiting for Reply (demo is a no-op here —
  //    recordTimelineEvent guards demo ids; the caller sets it optimistically).
  recordTimelineEvent({ leadId: lead.id, type: "text_sent", method: "text", sequence: null, occurredAt: now })

  // Advance the follow-up cache in LOCKSTEP with the successor. follow_up_count is
  // the completed-follow-up count (0→1→2→3→4); next_action_date mirrors the
  // successor's due (null after Final). Without this the count-based automatic
  // Next Action (getNextAction) stays stuck on the FIRST follow-up while the real
  // successor rows advance, so the Kanban badge / Agenda / Lead Panel / Companion
  // disagree. Keeping them in step also lets rankLeadActions dedup the automatic
  // against the matching open successor. Identity/due come from the same engine +
  // move-date cadence the successor row uses, so the automatic and the row match.
  const newCount = (Number(lead.follow_up_count) || 0) + 1
  const succ = getNextFollowUpAction(completedTitle, timeZone)
  const successorDue = succ ? followUpSuccessorDueAt(completedTitle, lead, succ.dueAt, timeZone) : null

  // 2) Complete the persisted follow-up row (real leads) so Last Action derives
  //    the follow-up label. Demo never hits the DB — caller synthesizes locally.
  if (!isDemoLeadId(lead.id) && followRow?.id != null) {
    const { error } = await supabase
      .from("lead_next_actions")
      .update({ completed: true, completed_at: now })
      .eq("id", followRow.id)
    if (error) console.error("[follow-up] complete row failed:", error)
  }

  // 3) Stay in List Sent — no stage change. Reflect the advanced cache locally.
  onOptimistic?.({ ...lead, follow_up_count: newCount, next_action_date: successorDue })

  if (isDemoLeadId(lead.id)) return

  // 3b) Persist the advanced cache for real leads (RLS-scoped by the client).
  const { error: cacheErr } = await supabase
    .from("leads")
    .update({ follow_up_count: newCount, next_action_date: successorDue })
    .eq("id", lead.id)
  if (cacheErr) console.error("[follow-up] advance cache failed:", cacheErr)

  // 4) Exactly one successor — identity from the existing engine, due date from
  //    the move-date cadence (same value stamped on next_action_date above).
  //    Deduped one-open-per-key by the engine helper.
  if (succ) {
    const created = await createWorkflowActionIfNeeded(supabase, lead.id, {
      ...succ,
      dueAt: successorDue ?? succ.dueAt,
    })
    if (created) {
      onWorkflowAction?.(created)
      emitWorkflowActionCreated(created)
    }
  }
}
