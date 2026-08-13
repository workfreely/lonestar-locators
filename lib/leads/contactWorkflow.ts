import { supabase } from "@/lib/supabase/client"
import { isDemoLeadId } from "@/lib/demo/demoWorkspace"
import { recordTimelineEvent } from "@/lib/leads/timeline"
import { emitWorkflowActionCreated } from "@/lib/workflowToast"

/**
 * CANONICAL first-contact cascade — the single source of truth for "this lead
 * was contacted," shared by the CRM Lead Panel and Beast Companion so both run
 * the EXACT same automation (no duplicated workflow engine).
 *
 * This is a strict, behavior-preserving extraction of what used to live inline
 * in components/crm/LeadPanel.tsx `recordFirstContact`. Nothing about the
 * workflow changed — same guards, same writes, same order, same side effects:
 *
 *   - conditional stage advance New → Contacted (only when crm_status === "new")
 *   - the /api/admin/leads/update-stage call (Workflow Engine successor action +
 *     Google Contact sync + List Sent calendar) — fire-and-forget, non-blocking
 *   - the SINGLE client-side first_text_sent_at write (powers the 7-day
 *     no-response auto-archive cron); the field is legacy-named but means
 *     "first contact", regardless of call vs text
 *   - the immutable lead_timeline first_contact event (best-effort, last)
 *   - demo-lead guard (isDemoLeadId) — optimistic only, no DB writes
 *
 * The caller supplies `onOptimistic` (merge the optimistic lead update into its
 * own state) and `onWorkflowAction` (append the created successor action). The
 * "✓ Next Action Created" toast (emitWorkflowActionCreated) fires here so it is
 * identical no matter which surface initiated the contact.
 *
 * Note: window.open("sms:"/"tel:") is intentionally NOT part of this function —
 * it stays at the button/gesture layer (CRM handleHeaderText/Call, Companion
 * onContact), exactly as before, so the OS handoff happens on the user's click.
 */
export type FirstContactMethod = "call" | "text"

export function recordFirstContact(opts: {
  lead: any
  method: FirstContactMethod
  onOptimistic?: (updatedLead: any) => void
  onWorkflowAction?: (action: any) => void
}): void {
  const { lead, method, onOptimistic, onWorkflowAction } = opts

  const shouldAdvanceStage = lead.crm_status === "new"
  const contactedAt = new Date().toISOString()

  // Optimistic UI update — merges the (conditional) stage advance with the
  // (unconditional) contact-timestamp write below into one consistent object,
  // so a re-click on an already-Contacted lead can't regress crm_status back to
  // "new" via a stale closure.
  if (onOptimistic) {
    onOptimistic({
      ...lead,
      ...(shouldAdvanceStage ? { crm_status: "contacted" } : {}),
      first_text_sent_at: contactedAt,
    })
  }

  // Demo leads live entirely client-side — their string ids can't key the bigint
  // leads table, so skip every DB write. The optimistic update above is all a
  // demo lead needs.
  if (isDemoLeadId(lead.id)) return

  // Auto-advance stage: New → Contacted. Only fires the first time a "new" lead
  // is contacted. The route runs the Workflow Engine (successor action) + Google
  // Contact sync + List Sent calendar.
  if (shouldAdvanceStage) {
    fetch("/api/admin/leads/update-stage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        leadId: lead.id,
        crm_status: "contacted",
        follow_up_count: lead.follow_up_count ?? 0,
        next_action_date: lead.next_action_date ?? null,
      }),
    })
      .then((res) => res.json())
      .then((json) => {
        // Surface whatever automatic action (if any) the New → Contacted
        // transition just created.
        if (json?.workflowAction) {
          onWorkflowAction?.(json.workflowAction)
          emitWorkflowActionCreated(json.workflowAction)
        }
      })
      .catch((err) => {
        console.error("First contact stage update failed:", err)
      })
  }

  // Record the moment this lead was intentionally contacted — fires on every
  // first-contact click, independent of the stage-advance above and of the
  // update-stage route (so none of that route's other side effects run an extra
  // time). This is deliberately the ONLY place first_text_sent_at is written.
  // Powers the daily 7-day no-response auto-archive.
  supabase
    .from("leads")
    .update({ first_text_sent_at: contactedAt })
    .eq("id", lead.id)
    .then(({ data, error, status, statusText }) => {
      if (error) {
        console.error("[first-contact] Failed to record contact timestamp:", {
          message: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint,
          status,
          statusText,
          data,
        })
      }
    })

  // Append the first-contact event to the immutable lead timeline — done LAST
  // and best-effort, after every workflow-critical write above, so a timeline
  // failure can never affect the New → Contacted workflow. Fires once, on the
  // genuine New → Contacted transition, regardless of which button ran it.
  if (shouldAdvanceStage) {
    recordTimelineEvent({ leadId: lead.id, type: "first_contact", method, sequence: 0, occurredAt: contactedAt })
  }
}
