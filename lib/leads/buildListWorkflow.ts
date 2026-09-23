import { supabase } from "@/lib/supabase/client"
import { isDemoLeadId } from "@/lib/demo/demoWorkspace"
import { emitWorkflowActionCreated } from "@/lib/workflowToast"
import { getStageWorkflowAction, createWorkflowActionIfNeeded } from "@/lib/workflowEngine"
import { DEFAULT_TIMEZONE } from "@/lib/timezone"

/**
 * CANONICAL "Build List" workflow — shared by the CRM Lead Panel and Beast
 * Companion (and later Beast Voice) so all interfaces run the SAME thing.
 *
 * APPROVED two-step model (companion):
 *   1. Build List (start)  →  open the external site AND advance Contacted → Searching, but
 *      LEAVE build_list open and DO NOT create Send List yet (startBuildList).
 *   2. Mark List Built     →  complete the open build_list row (Last Action
 *      becomes "Built List") and create the Send List successor exactly once,
 *      staying in Searching, never advancing to List Sent (completeBuildList).
 *
 * The CRM Lead Panel still completes Build List in a single step (it has no
 * the external site-open intermediate): advanceBuildListToSearching with the default successor.
 * No duplicated workflow logic — the stage move reuses the same /update-stage
 * route the Kanban drag + first-contact cascade already use.
 */

/**
 * Advance a Contacted lead to Searching. Fire-and-forget, non-blocking — mirrors
 * recordFirstContact. `onOptimistic` merges the stage change into the caller's
 * state; `onWorkflowAction` receives the created successor (the "✓ Next Action
 * Created" toast fires here so it's identical across surfaces).
 *
 * `createSuccessor` (default true) controls whether the /update-stage route
 * creates the Send List successor for this transition. The two-step Build List
 * START passes false so build_list stays the active action until "Mark List
 * Built"; the CRM one-step completion leaves it true.
 */
export function advanceBuildListToSearching(opts: {
  lead: any
  createSuccessor?: boolean
  onOptimistic?: (updatedLead: any) => void
  onWorkflowAction?: (action: any) => void
}): void {
  const { lead, createSuccessor = true, onOptimistic, onWorkflowAction } = opts

  if (onOptimistic) onOptimistic({ ...lead, crm_status: "searching" })

  if (isDemoLeadId(lead.id)) return

  fetch("/api/admin/leads/update-stage", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      leadId: lead.id,
      crm_status: "searching",
      follow_up_count: lead.follow_up_count ?? 0,
      // Send List is an immediate action (its own due_at); don't stamp a stale
      // cache date on the lead.
      next_action_date: null,
      // Build List START moves the stage but must NOT create the Send List
      // successor yet — build_list stays open until "Mark List Built".
      skipWorkflowAction: !createSuccessor,
    }),
  })
    .then((res) => res.json())
    .then((json) => {
      if (json?.workflowAction) {
        onWorkflowAction?.(json.workflowAction)
        emitWorkflowActionCreated(json.workflowAction)
      }
    })
    .catch((err) => {
      console.error("Build List → Searching stage update failed:", err)
    })
}

/**
 * Build List START (the "Build List" click). Moves Contacted → Searching WITHOUT
 * creating the Send List successor and WITHOUT completing the build_list row —
 * build_list stays the open Next Action and the companion control flips to
 * "Mark List Built". Send List is created only on explicit completion
 * (completeBuildList). Opening the external site is the caller's job; this is the stage move.
 */
export function startBuildList(opts: {
  lead: any
  onOptimistic?: (updatedLead: any) => void
}): void {
  advanceBuildListToSearching({
    lead: opts.lead,
    createSuccessor: false,
    onOptimistic: opts.onOptimistic,
  })
}

/**
 * Build List COMPLETION (the "Mark List Built" click). The lead is already in
 * Searching (moved by startBuildList), so this does NOT change the stage. It
 * marks the open build_list row completed (so Last Action derives "Built List")
 * and creates the Send List successor exactly once. Dedup on the canonical
 * send_list key means a double click is safe. Never advances to List Sent.
 *
 * `buildRow` is the open build_list lead_next_actions row (from the caller's
 * loaded actions); if absent, only the successor creation runs.
 */
export async function completeBuildList(opts: {
  lead: any
  buildRow?: { id: number | string } | null
  timeZone?: string | null
  onOptimistic?: (updatedLead: any) => void
  onWorkflowAction?: (action: any) => void
}): Promise<void> {
  const { lead, buildRow, timeZone, onOptimistic, onWorkflowAction } = opts

  if (!isDemoLeadId(lead.id) && buildRow?.id != null) {
    const { error } = await supabase
      .from("lead_next_actions")
      .update({ completed: true, completed_at: new Date().toISOString() })
      .eq("id", buildRow.id)
    if (error) console.error("[build-list] complete row failed:", error)
  }

  // Stay in Searching (Build List START already moved the stage); reflect it
  // locally, then create the Send List successor with the existing workflow.
  onOptimistic?.({ ...lead, crm_status: "searching" })

  if (isDemoLeadId(lead.id)) return

  const spec = getStageWorkflowAction("searching", lead, timeZone ?? DEFAULT_TIMEZONE)
  if (spec) {
    const created = await createWorkflowActionIfNeeded(supabase, lead.id, spec)
    if (created) {
      onWorkflowAction?.(created)
      emitWorkflowActionCreated(created)
    }
  }
}
