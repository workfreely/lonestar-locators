// Locator Beast Workflow Engine v1.
//
// Pure decision logic for what automatic Next Action to create when a
// lead changes stages (or when a chained follow-up step completes) —
// plus one shared, duplicate-protected write helper both server (API
// routes, via supabaseAdmin) and client (LeadPanel, via the browser
// supabase client) call into. Nothing here ever deletes or edits an
// existing lead_next_actions row; it only ever inserts a new one, and
// only when no equivalent open action already exists.
//
// Timezone note: this schema has no per-user/per-lead timezone column
// (confirmed — the only existing timezone handling in the codebase is a
// hardcoded "America/Chicago" for Google Calendar events). Deferred actions
// are due 9:00 AM local on their target day — see lib/workflow/autoDueDate.ts,
// the single source of truth for the automatic-action time convention.

import type { SupabaseClient } from "@supabase/supabase-js"
import { autoDueInDays, autoDueOnDate } from "./workflow/autoDueDate"

export type WorkflowActionSpec = {
  title: string
  dueAt: string // ISO string
}

export type CreatedWorkflowAction = {
  id: number
  lead_id: number
  title: string
  due_at: string
  priority: "low" | "medium" | "high"
}

// Immediate Actions are created due "now" (do-this-right-away tasks like
// contacting a fresh lead) rather than deferred to 9:00 AM on a future day —
// everything else is a Review Action, due 9:00 AM local on its target day.
const IMMEDIATE_TITLES = new Set(["Contact Lead", "Send List", "Setup Tour", "Email Guest Card"])

export function isImmediateAction(title: string): boolean {
  return IMMEDIATE_TITLES.has(title)
}

function immediateNow(): string {
  return new Date().toISOString()
}

/**
 * Given a lead's NEW crm_status (after a stage transition), returns the
 * automatic action the Workflow Engine should create — or null if this
 * stage has no rule. Pure: callers own the actual duplicate-check + insert
 * (see createWorkflowActionIfNeeded below).
 */
export function getStageWorkflowAction(
  newStage: string,
  lead: { follow_up_count?: number | null; move_date?: string | null }
): WorkflowActionSpec | null {
  switch (newStage) {
    case "new":
      return { title: "Contact Lead", dueAt: immediateNow() }

    case "contacted":
      // "Client has not responded" has no clean signal in this schema (no
      // inbound-message-read tracking) — treated as "no manual follow-up
      // progress yet" (follow_up_count still 0). The duplicate check in
      // createWorkflowActionIfNeeded covers "active Follow Up doesn't
      // already exist"; "stage is still Contacted" is trivially true here
      // since this only runs on transitions INTO contacted.
      if ((lead.follow_up_count ?? 0) > 0) return null
      return { title: "Follow Up", dueAt: autoDueInDays(2) }

    case "searching":
      return { title: "Send List", dueAt: immediateNow() }

    case "list_sent":
      return { title: "FU1", dueAt: autoDueInDays(1) }

    case "ready_to_tour": {
      const moveDate = lead.move_date ? new Date(lead.move_date) : null
      if (!moveDate || isNaN(moveDate.getTime())) {
        // No usable Move Date to branch on — Setup Tour is always the
        // safe default rather than silently creating nothing.
        return { title: "Setup Tour", dueAt: immediateNow() }
      }
      const daysUntilMove = Math.ceil((moveDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
      if (daysUntilMove > 90) {
        return { title: "Reconnect Client", dueAt: autoDueOnDate(moveDate, -90) }
      }
      return { title: "Setup Tour", dueAt: immediateNow() }
    }

    case "applied":
      return { title: "Check App", dueAt: autoDueInDays(3) }

    case "closed":
      return { title: "Get Invoice Details", dueAt: autoDueOnDate(new Date()) }

    // "archived": no automatic actions (explicit).
    // "done_touring": Tour Management ("Tour Scheduled") isn't implemented
    // yet — no rule here by design. Once it exists, it should create
    // "Tour Follow-Up" due 9:00 AM the day after the scheduled tour.
    default:
      return null
  }
}

/**
 * FU1 -> FU2 -> FU3 -> Final. Only ever the ONE next step, triggered by
 * completing the previous step — never the whole sequence at once.
 */
export function getNextFollowUpAction(completedTitle: string): WorkflowActionSpec | null {
  switch (completedTitle) {
    case "FU1": return { title: "FU2", dueAt: autoDueInDays(2) }
    case "FU2": return { title: "FU3", dueAt: autoDueInDays(3) }
    case "FU3": return { title: "Final", dueAt: autoDueInDays(7) }
    default: return null
  }
}

/**
 * Duplicate-protected insert: does nothing if an open (not completed)
 * action with the same title already exists for this lead. Never
 * overwrites a manually created action — it only ever checks-then-inserts.
 * Shared by every call site (server routes via supabaseAdmin, LeadPanel
 * via the browser supabase client) so "never create duplicates" is
 * enforced in exactly one place.
 */
export async function createWorkflowActionIfNeeded(
  client: SupabaseClient,
  leadId: number | string,
  action: WorkflowActionSpec
): Promise<CreatedWorkflowAction | null> {
  const { data: existing, error: checkError } = await client
    .from("lead_next_actions")
    .select("id")
    .eq("lead_id", leadId)
    .eq("completed", false)
    .ilike("title", action.title)
    .limit(1)

  if (checkError) {
    console.error("[workflow-engine] duplicate check failed:", checkError)
    return null
  }

  if (existing && existing.length > 0) return null // active equivalent action already exists — do nothing

  const { data: created, error: insertError } = await client
    .from("lead_next_actions")
    .insert([{ lead_id: leadId, title: action.title, due_at: action.dueAt, priority: "medium" }])
    .select("*")
    .single()

  if (insertError) {
    console.error("[workflow-engine] create failed:", insertError)
    return null
  }

  return created
}
