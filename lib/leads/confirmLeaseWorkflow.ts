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
import { type ProjectionMethod } from "@/lib/leads/commissionEstimate"

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
  // RETAINED for the callers' existing signature, but no longer read here: the
  // frozen commission snapshot is now computed in exactly one place, inside
  // /api/admin/leads/update-stage, from the owner's saved Sales Goals. Keeping a
  // second copy of that formula on the client is how the two could drift.
  method?: ProjectionMethod
  avgCommission?: number
  onOptimistic?: (patch: ConfirmLeasePatch) => void
  // The created Get Invoice Details action.
  onActionCreated?: (action: any) => void
}): Promise<void> {
  const { lead, confirmAction, now, onOptimistic, onActionCreated } = opts
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
    // THE one stage-write implementation. This previously wrote crm_status and
    // computed its OWN closed_at + frozen commission snapshot, duplicating the
    // route's logic — two implementations of the same irreversible financial
    // record, which could drift apart silently. The route already stamps
    // closed_at and the snapshot on the first close (and clears them on a
    // reopen), so that logic now lives in exactly one place.
    //
    // skipWorkflowAction, because the successor here must be PROPERTY-SCOPED:
    // getStageWorkflowAction("closed") produces a bare "Get Invoice Details",
    // while this one carries the Top Pick property through from confirm_lease.
    const res = await fetch("/api/admin/leads/update-stage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leadId: lead.id, crm_status: "closed", skipWorkflowAction: true }),
    })
    if (!res.ok) {
      console.error("[confirm-lease] advance to closed failed:", res.status)
      throw new Error("confirm-lease: stage update rejected")
    }
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
