import { supabase } from "@/lib/supabase/client"
import { isDemoLeadId } from "@/lib/demo/demoWorkspace"
import { recordTimelineEvent } from "@/lib/leads/timeline"
import { getNextContactFollowUpAction, createWorkflowActionIfNeeded } from "@/lib/workflowEngine"
import { isContactFollowUpAction } from "@/lib/leads/workflowActionLabels"
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
 *      lives in {new, contacted} AND requires that NO build_list action exists (a
 *      build_list means the lead was reached and is on the Build List → List Sent
 *      track — the chase is superseded). If the lead has progressed (Searching+) or
 *      a build_list exists, NO successor is created and NO archive happens.
 *   5. TERMINAL GHOST: completing Contact FU3 (no successor) while still in the chase
 *      archives the lead as ghosted (crm_status "archived", archive_reason "ghosted"
 *      — the SAME canonical pair the post-list Final completion + the 7-day cron use).
 *      This matches FU3's "I'll go ahead and pause your search" message. No FU4, no
 *      Build List, no post-list follow-up. An archived lead's ranker never falls back
 *      to the stage's Build List (getNextAction has no 'archived' rule).
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

  const succ = getNextContactFollowUpAction(completedTitle, timeZone) // FU2/FU3, or null after FU3

  // SUPERSESSION — determined BEFORE the optimistic update so a terminal FU3 can
  // decide whether to archive. The chase lives in {new, contacted}; a build_list
  // action (reached) means the lead is on the Build List track — superseded. On a
  // query error, fail safe (treat as superseded) so we never wrongly archive.
  let superseded = lead.crm_status !== "new" && lead.crm_status !== "contacted"
  if (!superseded && !isDemoLeadId(lead.id)) {
    const { data: buildRows, error: buildErr } = await supabase
      .from("lead_next_actions")
      .select("id")
      .eq("lead_id", lead.id)
      .eq("action_key", "build_list")
      .limit(1)
    if (buildErr) {
      console.error("[contact-follow-up] build_list supersession check failed:", buildErr)
      superseded = true
    } else if (buildRows && buildRows.length > 0) {
      superseded = true
    }
  }

  // Terminal ghost: completing Contact FU3 (no successor) while still in the chase →
  // archive as ghosted. Superseded (reached/progressed) → neither successor nor archive.
  const willArchiveGhost = !succ && isContactFollowUpAction(completedTitle) && !superseded

  // 1) The "sent" signal (the FU message was sent).
  recordTimelineEvent({ leadId: lead.id, type: "text_sent", method: "text", sequence: null, occurredAt: now })

  // 2) Complete the persisted row (real leads) so Last Action derives the label.
  if (!isDemoLeadId(lead.id) && followRow?.id != null) {
    const { error } = await supabase
      .from("lead_next_actions")
      .update({ completed: true, completed_at: now, status: "completed" })
      .eq("id", followRow.id)
    if (error) console.error("[contact-follow-up] complete row failed:", error)
  }

  // 3) Reflect optimistically — completed row, plus the terminal-ghost archive when
  //    applicable (so the card moves to Archived immediately). No post-list cache.
  onOptimistic?.({ ...lead, ...(willArchiveGhost ? { crm_status: "archived", archive_reason: "ghosted" } : {}) })

  if (isDemoLeadId(lead.id)) return

  // 3b) Persist the terminal-ghost archive (RLS-scoped by the caller's client). Same
  //     canonical archived/ghosted pair as the post-list Final + auto-archive cron.
  if (willArchiveGhost) {
    const { error: archErr } = await supabase
      .from("leads")
      .update({ crm_status: "archived", archive_reason: "ghosted" })
      .eq("id", lead.id)
    if (archErr) console.error("[contact-follow-up] ghost archive failed:", archErr)
    return // no FU4, no Build List, no post-list follow-up.
  }

  // 4) Superseded (reached/progressed) → no successor.
  if (superseded) return

  // 5) One successor (Contact FU2/FU3).
  if (!succ) return // defensive — FU3 terminal handled above.
  const created = await createWorkflowActionIfNeeded(supabase, lead.id, succ)
  if (created) {
    onWorkflowAction?.(created)
    emitWorkflowActionCreated(created)
  }
}
