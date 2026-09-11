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
 * A pending outreach IS a legitimate completed outbound attempt, so it advances the
 * canonical stage New → Contacted (Contacted = "≥1 attempt completed", NOT "client
 * answered"). It is NOT successful contact, so its successor is the pre-list Contact
 * FU chase — NOT Build List. It deliberately does NOT run recordFirstContact, does
 * NOT create Build List, and does NOT write first_text_sent_at (that field stays a
 * genuine-first-contact / reached anchor for the 7-day auto-archive — a call or an
 * unanswered text must never populate a field named "first text sent").
 *
 * The New → Contacted advance reuses the update-stage route with skipWorkflowAction
 * so the stage engine's automatic "Build List" successor is NOT created — the
 * outcome, not the stage, selects the successor (Contact FU1 here; Build List only
 * on a genuinely reached contact via recordFirstContact).
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
 *   2. Contact FU1 — the first step of the pre-list contact chase (Contact FU1 →
 *      FU2 → FU3), action_key 'contact_follow_up_1', title "Contact FU1", due +2
 *      days @ 9AM. One open contact follow-up per lead across all three levels
 *      (guarded here + createWorkflowActionIfNeeded's per-key dedup), so a No
 *      Answer followed by a Text Sent reuse the SAME open step rather than doubling.
 *      This REPLACES the retired single-step 'contacted_follow_up' "Follow Up".
 *      The pre-list chase and the post-List-Sent follow_up_1/2/3 + final_follow_up
 *      sequence are entirely separate and never share keys.
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
  // Called with the optimistic lead update for the New → Contacted advance (so the
  // caller merges crm_status = "contacted" into its own state before the async DB
  // write lands). Mirrors recordFirstContact's onOptimistic.
  onOptimistic?: (updatedLead: any) => void
}): Promise<void> {
  const { lead, method, outcome, timeZone, onFollowUpAction, onOptimistic } = opts
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

  // The New → Contacted advance is a ONE-TIME milestone — only when the lead is
  // still New. A repeat outreach on an already-Contacted lead records the timeline
  // activity above but must not re-advance the stage, reset first-contact history,
  // or create a duplicate Contact FU1 (guarded below).
  const advancing = lead.crm_status === "new"

  // Optimistic New → Contacted so the caller's UI reflects the stage immediately
  // (before the async DB write). Runs for demo leads too (client-side only).
  if (advancing) onOptimistic?.({ ...lead, crm_status: "contacted" })

  // Demo leads live entirely client-side (string ids can't key the bigint tables).
  if (isDemoLeadId(lead.id)) return

  // Only the New → Contacted transition creates Contact FU1 + advances the stage.
  // Already-Contacted leads keep their own workflow (no duplicate FU1, no regress).
  if (!advancing) return

  // 1b) Advance New → Contacted, but SUPPRESS the stage engine's automatic Build
  //     List successor (skipWorkflowAction). Contacted = "≥1 attempt"; the successor
  //     for an UNANSWERED attempt is Contact FU1 (created below). Fire-and-forget
  //     (mirrors recordFirstContact) — the Contact FU1 write below is independent of
  //     the stage row, so it never waits on the route's Google-sync side effect.
  void fetch("/api/admin/leads/update-stage", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      leadId: lead.id,
      crm_status: "contacted",
      follow_up_count: lead.follow_up_count ?? 0,
      next_action_date: lead.next_action_date ?? null,
      skipWorkflowAction: true,
    }),
  }).catch((err) => console.error("[pending-outreach] stage advance failed:", err))

  // 2) Contact FU1 — the FIRST step of the pre-list contact chase (Contact FU1 →
  //    FU2 → FU3). (Replaces the retired single-step contacted_follow_up "Follow Up".)

  // One open contact follow-up per lead ACROSS all three levels. createWorkflow-
  // ActionIfNeeded only dedups within a single action_key, so a repeat outreach
  // while (say) an open Contact FU2 already exists would otherwise add a second
  // open contact FU. Guard across the whole chase set before creating FU1.
  const { data: openContactFu, error: guardErr } = await supabase
    .from("lead_next_actions")
    .select("id")
    .eq("lead_id", lead.id)
    .eq("status", "open")
    .in("action_key", ["contact_follow_up_1", "contact_follow_up_2", "contact_follow_up_3"])
    .limit(1)
  if (guardErr) {
    console.error("[pending-outreach] open-contact-fu guard failed:", guardErr)
    return
  }
  if (openContactFu && openContactFu.length > 0) return // already chasing — keep the one open step

  const created = await createWorkflowActionIfNeeded(supabase, lead.id, {
    title: "Contact FU1",
    dueAt: autoDueInDays(2, timeZone),
    actionKey: "contact_follow_up_1",
    sequence: 1,
  })
  if (created) {
    onFollowUpAction?.(created)
    emitWorkflowActionCreated(created)
  }
}
