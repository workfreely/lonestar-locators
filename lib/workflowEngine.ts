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
import { CURRENT_WORKFLOW_VERSION, type WorkflowActionKey } from "@bc/companion-shared"
import { autoDueInDays, autoDueOnDate } from "./workflow/autoDueDate"
import { isDemoLeadId } from "@/lib/demo/demoWorkspace"

export type WorkflowActionSpec = {
  title: string // presentation label ONLY — never identity
  dueAt: string // ISO string
  actionKey: WorkflowActionKey // stable canonical identity of this workflow action
  sequence?: number | null // intra-chain ordering (follow-up steps); null otherwise
  // Optional property scope. Application-phase actions (check_application) are
  // stamped with the lead's Top Pick so real and demo rows carry the same property
  // context; omitted → null (lead-level action, unchanged behavior).
  propertyId?: number | string | null
  propertyName?: string | null
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
const IMMEDIATE_TITLES = new Set(["Contact Lead", "Build List", "Send List", "Setup Tour", "Email Guest Card"])

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
  lead: { follow_up_count?: number | null; move_date?: string | null },
  // Saved locator IANA timezone. When provided, every 9:00 AM deadline below is
  // computed in that zone (stored UTC). Omitted → runtime-local (unchanged).
  timeZone: string
): WorkflowActionSpec | null {
  switch (newStage) {
    case "new":
      // Actionable IMMEDIATELY — the moment a lead lands, Contact Lead is the Next
      // Action and is clickable right away. A brand-new lead is a highest-priority
      // Contact Lead due the CREATION calendar day (autoDueInDays(0) → 9:00 AM local
      // today), so it appears in Agenda → Today the moment it lands and only flips to
      // Overdue once the local day advances (day-level urgency in lib/nextActions).
      return { title: "Contact Lead", dueAt: autoDueInDays(0, timeZone), actionKey: "contact_lead" }

    case "contacted":
      // After first contact, the canonical next step is building the client's
      // property list — an IMMEDIATE do-it-now action (product decision, Phase 3
      // Slice A: replaces the former +2-day "Follow Up" chase). The follow_up_count
      // guard keeps this from re-creating on a contacted lead that has already
      // progressed through follow-ups; createWorkflowActionIfNeeded dedups on the
      // canonical build_list key so a repeated contact never doubles it.
      if ((lead.follow_up_count ?? 0) > 0) return null
      // Actionable immediately; due is a backstop — 9:00 AM the next calendar day.
      return { title: "Build List", dueAt: autoDueInDays(1, timeZone), actionKey: "build_list" }

    case "searching":
      // Actionable immediately; due is a backstop — 9:00 AM the next calendar day.
      return { title: "Send List", dueAt: autoDueInDays(1, timeZone), actionKey: "send_list" }

    case "list_sent":
      return { title: "FU1", dueAt: autoDueInDays(1, timeZone), actionKey: "follow_up_1", sequence: 1 }

    case "ready_to_tour": {
      const moveDate = lead.move_date ? new Date(lead.move_date) : null
      if (!moveDate || isNaN(moveDate.getTime())) {
        // No usable Move Date to branch on — Setup Tour is always the
        // safe default rather than silently creating nothing.
        return { title: "Setup Tour", dueAt: immediateNow(), actionKey: "setup_tour" }
      }
      const daysUntilMove = Math.ceil((moveDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
      if (daysUntilMove > 90) {
        return { title: "Reconnect Client", dueAt: autoDueOnDate(moveDate, -90, timeZone), actionKey: "reconnect_client" }
      }
      return { title: "Setup Tour", dueAt: immediateNow(), actionKey: "setup_tour" }
    }

    case "applied":
      return { title: "Check App", dueAt: autoDueInDays(3, timeZone), actionKey: "check_application" }

    case "closed":
      return { title: "Get Invoice Details", dueAt: autoDueOnDate(new Date(), 0, timeZone), actionKey: "get_invoice_details" }

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
export function getNextFollowUpAction(completedTitle: string, timeZone: string): WorkflowActionSpec | null {
  switch (completedTitle) {
    case "FU1": return { title: "FU2", dueAt: autoDueInDays(2, timeZone), actionKey: "follow_up_2", sequence: 2 }
    case "FU2": return { title: "FU3", dueAt: autoDueInDays(3, timeZone), actionKey: "follow_up_3", sequence: 3 }
    case "FU3": return { title: "Final", dueAt: autoDueInDays(7, timeZone), actionKey: "final_follow_up", sequence: 4 }
    default: return null
  }
}

/**
 * PRE-LIST contact chase: Contact FU1 → FU2 → FU3, then STOP (no FU4).
 * Completely separate from getNextFollowUpAction (the post-List-Sent ladder).
 * Each step is due +2 days at 9:00 AM local (flat cadence — NOT the move-date
 * cadence the post-list sequence uses). Only ever the ONE next step, created on
 * completion of the previous one — never the whole chain in advance.
 */
export function getNextContactFollowUpAction(completedTitle: string, timeZone: string): WorkflowActionSpec | null {
  switch ((completedTitle || "").trim()) {
    case "Contact FU1": return { title: "Contact FU2", dueAt: autoDueInDays(2, timeZone), actionKey: "contact_follow_up_2", sequence: 2 }
    case "Contact FU2": return { title: "Contact FU3", dueAt: autoDueInDays(2, timeZone), actionKey: "contact_follow_up_3", sequence: 3 }
    // Contact FU3 is terminal — no successor, and (per this checkpoint) no archive.
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
  // Demo leads are client-side only (string ids like "demo-1"); a
  // lead_next_actions write (lead_id bigint) would throw 22P02. Never write.
  if (isDemoLeadId(leadId)) return null

  // Dedup keyed on the stable action_key (NOT lower(title)): at most one OPEN
  // row per canonical action per lead. The DB unique index enforces the same
  // invariant as a backstop. (email_guest_card is per-property and is created
  // via lib/leads/guestCardWorkflow.ts, not this helper.)
  const { data: existing, error: checkError } = await client
    .from("lead_next_actions")
    .select("id")
    .eq("lead_id", leadId)
    .eq("status", "open")
    .eq("action_key", action.actionKey)
    .limit(1)

  if (checkError) {
    console.error("[workflow-engine] duplicate check failed:", checkError)
    return null
  }

  if (existing && existing.length > 0) return null // active equivalent action already exists — do nothing

  // Resolve ownership from the PARENT LEAD so the row is RLS-visible to the lead's
  // workspace regardless of which client inserts it. Server/service-role ingestion
  // (e.g. the Lone Star bridge / Smart Form / Meta intake in app/api/leads/submit)
  // has no auth.uid(), and the set_workspace_ownership() trigger cannot derive a
  // workspace in a multi-workspace DB — so without this the row lands with a NULL
  // workspace_id and RLS hides it from the Agenda. The lead already carries the
  // authoritative workspace_id + owner_user_id; deriving from it (never from
  // auth.uid()) works identically for service-role and authenticated CRM paths and
  // does not weaken RLS (the trigger's guards leave provided non-null values intact).
  const { data: leadRow, error: leadError } = await client
    .from("leads")
    .select("workspace_id, owner_user_id")
    .eq("id", leadId)
    .single()
  if (leadError) {
    // Don't drop the action: fall back to letting the trigger resolve ownership
    // (works in authenticated contexts). Logged so a service-role miss is visible.
    console.error("[workflow-engine] lead ownership lookup failed:", leadError)
  }

  const { data: created, error: insertError } = await client
    .from("lead_next_actions")
    .insert([{
      lead_id: leadId,
      title: action.title,
      due_at: action.dueAt,
      priority: "medium",
      // Explicit parent-lead ownership (see above) — makes the row RLS-visible.
      workspace_id: leadRow?.workspace_id ?? null,
      owner_user_id: leadRow?.owner_user_id ?? null,
      // Canonical workflow identity — every engine-emitted row is tagged
      // explicitly (no reliance on column defaults, which are manual/custom).
      action_key: action.actionKey,
      action_type: "workflow",
      origin: "workflow",
      sequence: action.sequence ?? null,
      // Optional property scope (Top Pick for application-phase actions). Null for
      // the vast majority of workflow actions — identical to the prior behavior.
      property_id: action.propertyId ?? null,
      property_name: action.propertyName ?? null,
      workflow_version: CURRENT_WORKFLOW_VERSION,
      status: "open",
    }])
    .select("*")
    .single()

  if (insertError) {
    console.error("[workflow-engine] create failed:", insertError)
    return null
  }

  return created
}
