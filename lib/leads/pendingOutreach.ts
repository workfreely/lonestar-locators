import { supabase } from "@/lib/supabase/client"
import { isDemoLeadId } from "@/lib/demo/demoWorkspace"
import { recordTimelineEvent } from "@/lib/leads/timeline"
import { createWorkflowActionIfNeeded } from "@/lib/workflowEngine"
import { autoDueInDays } from "@/lib/workflow/autoDueDate"
import { emitWorkflowActionCreated } from "@/lib/workflowToast"

/**
 * CANONICAL "pending outreach" handler — the single source of truth for a New
 * lead that was CALLED (no answer) or TEXTED (sent) but NOT successfully reached.
 * Shared by BOTH presentations (the Kanban-drag centered CRM modal and Beast
 * Companion) so the outcome is identical no matter which surface initiated it —
 * the same "two presentations → one canonical workflow" rule as recordFirstContact.
 *
 * A pending outreach is NOT successful contact: the lead STAYS New. This function
 * deliberately does NOT run recordFirstContact, does NOT advance New → Contacted,
 * does NOT create Build List, and does NOT write first_text_sent_at (that field
 * stays reserved for genuine first contact + the 7-day auto-archive).
 *
 * It persists exactly two things (so the state survives refresh / reopen / client
 * switch), then hands the created Follow Up back to the caller for optimistic UI:
 *
 *   1. An immutable lead_timeline event — the history-of-record that later
 *      derives the Last Action + Status:
 *        - No Answer  → type 'contact_attempt', method 'call'  → "Called — No Answer" / Status "No Answer"
 *        - Text Sent  → type 'text_sent',       method 'text'  → "Sent Text"        / Status "Waiting for Reply"
 *      (lead_timeline.type is free `text`, so 'text_sent' needs no migration.)
 *
 *   2. The canonical open Follow Up next action — action_key 'contacted_follow_up'
 *      (the existing contacted-stage chase key; NOT contacted-only — nothing in
 *      code assumes that), titled "Follow Up", due +2 days @ 9AM. Deduped one-open
 *      -per-lead by createWorkflowActionIfNeeded, so a No Answer followed later by
 *      a Text Sent on the same lead reuse the SAME Follow Up rather than doubling.
 */
export type PendingOutreachOutcome = "no-answer" | "text-sent"

export async function recordPendingOutreach(opts: {
  lead: any
  method: "call" | "text"
  outcome: PendingOutreachOutcome
  // Saved locator IANA timezone — the Follow Up's 9:00 AM deadline is resolved in
  // this zone (stored UTC). Omitted → runtime-local (unchanged).
  timeZone?: string | null
  // Called with the freshly-created Follow Up row (lead_next_actions) so the
  // caller can merge it into local state and re-broadcast. Not called when an
  // open Follow Up already exists (dedup) or for demo/non-New leads.
  onFollowUpAction?: (row: any) => void
}): Promise<void> {
  const { lead, method, outcome, timeZone, onFollowUpAction } = opts
  const occurredAt = new Date().toISOString()

  // 1) Immutable history event. Fire-and-forget (never blocks the workflow), and
  //    the SAME event the display derives Last Action + Status from — no duplicate
  //    is written for the same click.
  recordTimelineEvent({
    leadId: lead.id,
    type: outcome === "text-sent" ? "text_sent" : "contact_attempt",
    method,
    sequence: null,
    occurredAt,
  })

  // Demo leads live entirely client-side (string ids can't key the bigint tables).
  if (isDemoLeadId(lead.id)) return

  // 2) Canonical Follow Up — ONLY for a still-New lead. A lead already advanced
  //    past New keeps its own workflow; this pending-outreach Follow Up is a
  //    New-lead concept. Never advances the stage.
  if (lead.crm_status !== "new") return

  const created = await createWorkflowActionIfNeeded(supabase, lead.id, {
    title: "Follow Up",
    dueAt: autoDueInDays(2, timeZone),
    actionKey: "contacted_follow_up",
  })
  if (created) {
    onFollowUpAction?.(created)
    emitWorkflowActionCreated(created)
  }
}
