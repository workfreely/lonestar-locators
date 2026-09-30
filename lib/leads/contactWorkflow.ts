import { supabase } from "@/lib/supabase/client"
import { CONTACT_CHASE_FOLLOW_UP_KEYS } from "./contactChase"
import { DEFAULT_TIMEZONE } from "@/lib/timezone"
import { isDemoLeadId } from "@/lib/demo/demoWorkspace"
import { recordTimelineEvent } from "@/lib/leads/timeline"
import { emitWorkflowActionCreated } from "@/lib/workflowToast"
import { createWorkflowActionIfNeeded } from "@/lib/workflowEngine"
import { autoDueInDays, type WorkHours } from "@/lib/workflow/autoDueDate"

/**
 * CANONICAL successful-contact cascade — the single source of truth for "this lead
 * was successfully reached," shared by the CRM Lead Panel and Beast Companion so
 * both run the EXACT same automation (no duplicated workflow engine).
 *
 * The trigger is the successful-contact OUTCOME, not a stage transition, so it runs
 * for a fresh New lead AND for a lead already in Contacted that is reached while a
 * pre-list Contact FU is still open (reached-during-chase). Side effects:
 *
 *   - New lead → stage advance New → Contacted via /api/admin/leads/update-stage
 *     (Workflow Engine successor = Build List + Google Contact sync + List Sent
 *     calendar) — fire-and-forget, non-blocking.
 *   - Reached-during-chase (already Contacted) → stage unchanged, but supersede
 *     (cancel) every open Contact FU and create Build List directly (deduped), so
 *     successful contact always ends the chase and moves onto the Build List track.
 *   - the SINGLE client-side first_text_sent_at write (powers the 7-day no-response
 *     auto-archive cron); the field is legacy-named but means "first successful
 *     contact", regardless of call vs text — a mere attempt never writes it.
 *   - the immutable lead_timeline first_contact event (best-effort, last).
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
  // Saved locator IANA timezone — the reached-during-chase Build List's 9:00 AM
  // backstop is resolved in this zone (stored UTC). Omitted → runtime-local.
  timeZone?: string | null
  // Optional locator Working Hours (Profile setting). Omitted/empty → 9–21 default.
  workHours?: WorkHours
  onOptimistic?: (updatedLead: any) => void
  onWorkflowAction?: (action: any) => void
}): void {
  const { lead, method, timeZone, workHours, onOptimistic, onWorkflowAction } = opts

  const shouldAdvanceStage = lead.crm_status === "new"
  // Reached-during-chase: an already-Contacted lead is successfully reached while a
  // pre-list Contact FU is still open. Successful contact — NOT the stage — is the
  // trigger: supersede the open Contact FU and move onto the Build List track, even
  // though the stage does not change (it is already Contacted). This is why the
  // function must NOT no-op just because the lead is already Contacted.
  const reachedDuringChase = lead.crm_status === "contacted"
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
  // is contacted. The route runs the Workflow Engine (successor action = Build List)
  // + Google Contact sync + List Sent calendar.
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
  } else if (reachedDuringChase) {
    // Reached mid-chase: the stage stays Contacted (no route call — there is no
    // stage TRANSITION, so the route would create no successor anyway). Instead we
    // (a) supersede every open pre-list Contact FU by canceling it, and (b) create
    // the Build List action directly (deduped one-open-per-key by the engine helper,
    // so a repeat "reached" confirmation never creates a second Build List).
    void (async () => {
      const { error: cancelErr } = await supabase
        .from("lead_next_actions")
        .update({ status: "canceled" })
        .eq("lead_id", lead.id)
        .eq("status", "open")
        .in("action_key", [...CONTACT_CHASE_FOLLOW_UP_KEYS])
      if (cancelErr) console.error("[first-contact] cancel Contact FU failed:", cancelErr)

      const created = await createWorkflowActionIfNeeded(supabase, lead.id, {
        title: "Build List",
        dueAt: autoDueInDays(1, timeZone ?? DEFAULT_TIMEZONE, workHours),
        actionKey: "build_list",
      })
      if (created) {
        onWorkflowAction?.(created)
        emitWorkflowActionCreated(created)
      }
    })()
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
  // failure can never affect the workflow. Fires on the genuine New → Contacted
  // transition AND on a reached-during-chase success (the first time meaningful
  // contact is established), regardless of which button ran it.
  if (shouldAdvanceStage || reachedDuringChase) {
    recordTimelineEvent({ leadId: lead.id, type: "first_contact", method, sequence: 0, occurredAt: contactedAt })
  }
}
