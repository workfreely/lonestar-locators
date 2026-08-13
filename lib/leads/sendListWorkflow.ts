import { supabase } from "@/lib/supabase/client"
import { isDemoLeadId } from "@/lib/demo/demoWorkspace"
import { emitWorkflowActionCreated } from "@/lib/workflowToast"
import { autoDueInDays } from "@/lib/workflow/autoDueDate"

/**
 * CANONICAL "Send List complete" workflow — the mirror of buildListWorkflow's
 * completeBuildList, shared by the CRM and Beast Companion so every surface runs
 * the SAME thing:
 *
 *   complete the open send_list action  →  advance Searching → List Sent
 *   (follow_up_count reset to 0)  →  the /api/admin/leads/update-stage route
 *   creates the FU1 successor (getStageWorkflowAction("list_sent") = follow_up_1,
 *   due next calendar day at 9:00 AM local) + Google side effects.
 *
 * No duplicated workflow logic: the stage transition reuses the exact route the
 * Kanban drag + first-contact cascade already use, and FU1 is created there (once,
 * deduped on the canonical follow_up_1 key) — never here.
 */
export async function completeSendList(opts: {
  lead: any
  sendRow?: { id: number | string } | null
  // Saved locator IANA timezone — FU1's cache date is resolved in this zone so it
  // matches the FU1 row the update-stage route creates (also zone-aware server-
  // side). Omitted → runtime-local (unchanged).
  timeZone?: string | null
  onOptimistic?: (updatedLead: any) => void
  onWorkflowAction?: (action: any) => void
}): Promise<void> {
  const { lead, sendRow, timeZone, onOptimistic, onWorkflowAction } = opts

  // Complete the persisted send_list row (real leads) so Last Action derives
  // "Sent List". Demo leads never hit the DB — the caller synthesizes the local
  // completed row instead.
  if (!isDemoLeadId(lead.id) && sendRow?.id != null) {
    const { error } = await supabase
      .from("lead_next_actions")
      .update({ completed: true, completed_at: new Date().toISOString() })
      .eq("id", sendRow.id)
    if (error) console.error("[send-list] complete row failed:", error)
  }

  // Searching → List Sent, follow-up count reset to 0 (same as the Kanban drop).
  onOptimistic?.({ ...lead, crm_status: "list_sent", follow_up_count: 0 })

  if (isDemoLeadId(lead.id)) return

  fetch("/api/admin/leads/update-stage", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      leadId: lead.id,
      crm_status: "list_sent",
      follow_up_count: 0,
      // FU1 is due next calendar day at 9:00 AM in the saved locator zone — mirror
      // that on the lead's cache column so the Kanban/Agenda date matches the row.
      next_action_date: autoDueInDays(1, timeZone),
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
      console.error("Send List → List Sent stage update failed:", err)
    })
}
