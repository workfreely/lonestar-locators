// Canonical INTERACTIVE-PROMPT ownership (Companion side).
//
// MIRRORED VERBATIM from the CRM's lib/workflow/promptOwnership.ts (kept separate to
// avoid a cross-package import into the Next.js build — the same split used by the
// workflow-action label maps). The two files must stay in sync; a shared test
// asserts the maps are identical.
//
// The rule: one workflow event has exactly ONE interactive owning surface. The
// non-owning surface may show passive state, never the same interactive decision.
// Presentation/ownership only — no workflow semantics, keys, timing, or templates.

export type PromptSurface = "companion" | "crm"

export const WORKFLOW_PROMPT_OWNER = {
  // Companion-owned (traveling confirmations).
  contact_outcome: "companion",
  build_list_choice: "companion",
  list_built: "companion",
  send_list: "companion",
  contact_follow_up: "companion",
  post_list_follow_up: "companion",
  schedule_tour: "companion",
  // CRM-owned (contextual / heavy / destructive).
  guest_card: "crm",
  application: "crm",
  confirm_lease: "crm",
  invoice_details: "crm",
  send_invoice: "crm",
  commission_paid: "crm",
  send_rebate: "crm",
  tour_follow_up: "crm",
  timezone_confirm: "crm",
  archive: "crm",
} as const

export type WorkflowPromptId = keyof typeof WORKFLOW_PROMPT_OWNER

export function workflowPromptOwner(id: WorkflowPromptId): PromptSurface {
  return WORKFLOW_PROMPT_OWNER[id]
}
export function isCompanionOwned(id: WorkflowPromptId): boolean {
  return WORKFLOW_PROMPT_OWNER[id] === "companion"
}
export function isCrmOwned(id: WorkflowPromptId): boolean {
  return WORKFLOW_PROMPT_OWNER[id] === "crm"
}

// The sole CRM-initiated exception: a manual New → Contacted Kanban drag confirms
// contact IN the CRM because the agent acted there. Not a spontaneous duplicate.
export const CRM_INITIATED_CONFIRMATIONS: ReadonlySet<WorkflowPromptId> = new Set(["contact_outcome"])

export function crmMayConfirm(id: WorkflowPromptId, initiatedInCrm: boolean): boolean {
  if (isCrmOwned(id)) return true
  return initiatedInCrm && CRM_INITIATED_CONFIRMATIONS.has(id)
}

// The Companion opens interactive confirmations only for Companion-owned prompts;
// for a CRM-owned operation it delegates to the CRM via an open-* workflow verb.
export function companionMayConfirm(id: WorkflowPromptId): boolean {
  return isCompanionOwned(id)
}
