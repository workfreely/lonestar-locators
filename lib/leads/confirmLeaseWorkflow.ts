// Confirm Lease workflow (property-scoped to the Top Pick).
//
// After an application is Approved, the canonical next action is Confirm Lease for
// the Top Pick property. "Did the client sign their lease for {Property}?" is
// answered ONCE here — the ONLY explicit point the lead advances to Closed. This
// is the twin of confirmApplicationSubmitted (Apply → Applied): a positive,
// explicit confirmation drives the transition; approval alone never does.
//
// LOCKED-BASELINE SAFETY: Approved / confirm_lease creation are unchanged. Lease
// signing is NEVER inferred from application approval — only this explicit
// "Yes, Lease Signed" confirmation completes confirm_lease and marks Closed.

import { supabase } from "@/lib/supabase/client"
import { isDemoLeadId } from "@/lib/demo/demoWorkspace"
import { recordTimelineEvent } from "@/lib/leads/timeline"
import { createWorkflowActionIfNeeded } from "@/lib/workflowEngine"
import { resolveClosedCommissionSnapshot, type ProjectionMethod } from "@/lib/leads/commissionEstimate"

// The optimistic patch the caller applies to localNextActions / localLeads.
export type ConfirmLeasePatch = {
  /** The confirm_lease row that was completed (client signed). */
  completedConfirmLeaseId: number | string | null
  /** Lead advance — the ONLY explicit Closed transition in the workflow. */
  leadPatch: { crm_status: string; closed_at: string }
}

/**
 * CANONICAL Confirm Lease completion. Completes the confirm_lease action, advances
 * the lead to Closed (+ closed_at) — the single explicit close point — records the
 * immutable lease_signed timeline event, and produces the next canonical closing
 * action, Get Invoice Details, property-scoped to the Top Pick so the Closed
 * transaction always knows which property produced the lease. Demo leads skip DB
 * writes; the caller mirrors the same state locally.
 */
export async function completeConfirmLease(opts: {
  lead: any
  // The open confirm_lease row this signing is about (property-scoped to the Top
  // Pick — property_id was stamped at creation).
  confirmAction: { id: number | string; property_id: number | null; property_name?: string | null }
  now: string
  // The account's canonical Sales Goals at this moment — used to FREEZE this
  // lead's estimated commission on close, via the same estimator the dashboards
  // use (no second formula). Mirrors the Kanban → Closed drag snapshot.
  method: ProjectionMethod
  avgCommission: number
  onOptimistic?: (patch: ConfirmLeasePatch) => void
  // The created Get Invoice Details action.
  onActionCreated?: (action: any) => void
}): Promise<void> {
  const { lead, confirmAction, now, method, avgCommission, onOptimistic, onActionCreated } = opts
  const demo = isDemoLeadId(lead.id)
  const propId = confirmAction.property_id
  const propertyName = (confirmAction.property_name || "").toString().trim() || null
  const closedAt = lead.closed_at ?? now

  // 1) Complete confirm_lease (Last Action → "Lease Signed · Property"). [real only]
  if (!demo) {
    const { error } = await supabase
      .from("lead_next_actions")
      .update({ completed: true, completed_at: now, status: "completed" })
      .eq("id", confirmAction.id)
    if (error) console.error("[confirm-lease] complete failed:", error)
  }

  // 2) Advance to Closed — the ONLY explicit close point (never inferred from
  //    approval). Stamps closed_at once (mirrors the Kanban → Closed drag). [real only]
  if (!demo) {
    const patch: Record<string, unknown> = { crm_status: "closed" }
    // Freeze the close date + estimated-commission snapshot only on the FIRST
    // close (mirrors the Kanban drag: never overwrite an existing snapshot).
    if (!lead.closed_at) {
      patch.closed_at = now
      const snapshot = resolveClosedCommissionSnapshot(lead, method, avgCommission)
      patch.closed_estimated_commission = snapshot.closed_estimated_commission
      patch.closed_estimation_method = snapshot.closed_estimation_method
    }
    const { error } = await supabase.from("leads").update(patch).eq("id", lead.id)
    if (error) console.error("[confirm-lease] advance to closed failed:", error)
  }

  // 3) Immutable history (best-effort, non-blocking; demo-safe inside).
  recordTimelineEvent({
    leadId: lead.id,
    type: "lease_signed",
    occurredAt: now,
    metadata: { confirm_action_id: confirmAction.id, property_id: propId, property_name: propertyName },
  })

  onOptimistic?.({
    completedConfirmLeaseId: confirmAction.id,
    leadPatch: { crm_status: "closed", closed_at: closedAt },
  })

  // 4) Next canonical closing action: Get Invoice Details, property-scoped to the
  //    Top Pick. Deduped on action_key, so a lead already dragged to Closed never
  //    gets a duplicate.
  const created = await createGetInvoiceDetails(lead, propId, propertyName, now, demo)
  if (created) onActionCreated?.(created)
}

/**
 * Create the canonical "Get Invoice Details" (get_invoice_details) action for the
 * Closed lead's Top Pick property — due now. Demo synthesizes the row locally.
 */
async function createGetInvoiceDetails(
  lead: any,
  propertyId: number | null,
  propertyName: string | null,
  now: string,
  demo: boolean,
): Promise<any | null> {
  if (demo) {
    return {
      id: `demo-act-invoice-${now}`,
      lead_id: lead.id,
      title: "Get Invoice Details",
      due_at: now,
      priority: "medium",
      property_id: propertyId,
      property_name: propertyName,
      action_key: "get_invoice_details",
      action_type: "workflow",
      origin: "workflow",
      completed: false,
      status: "open",
    }
  }
  return await createWorkflowActionIfNeeded(supabase, lead.id, {
    title: "Get Invoice Details",
    dueAt: now,
    actionKey: "get_invoice_details",
    propertyId,
    propertyName,
  })
}
