// Canonical INTERACTIVE-PROMPT ownership between Beast Companion and the Locator
// Beast CRM. The single source of truth for one rule:
//
//   One workflow event has exactly ONE interactive owning surface.
//   The non-owning surface may show PASSIVE state/status (updated Last Action,
//   Next Action, stage, Agenda, a success/status notice), but must NEVER ask the
//   agent to make the same workflow decision.
//
// This is presentation/ownership only — it changes NO workflow semantics, action
// keys, timing, templates, stages, or archive rules. It exists so the ownership is
// explicit, testable, and regression-proof (e.g. a future re-enable of the legacy
// CRM Lead Panel, or a new CRM prompt, breaks a test rather than silently
// reintroducing a duplicate interactive decision).
//
// Deliberately NOT an event bus / arbiter: the current architecture is already
// single-owner (the traveling confirmations live in Companion; the CRM's only
// workflow-decision prompt is the drag-initiated contact confirmation; heavy
// operations are CRM-owned and Companion merely delegates to them via open-* verbs).
// A narrow lookup is the smallest thing that enforces the rule.

export type PromptSurface = "companion" | "crm"

/**
 * Every INTERACTIVE workflow prompt (a confirmation / decision the agent acts on),
 * mapped to its single owning surface.
 *
 * COMPANION owns the "traveling" workflow confirmations — the ones that make sense
 * while the agent works anywhere on the web (Google, the external property site, property
 * sites). CRM owns contextual / heavy / destructive operations that need richer
 * workspace context, typed input, or larger forms.
 */
export const WORKFLOW_PROMPT_OWNER = {
  // ── Companion-owned (traveling confirmations) ──────────────────────────────
  contact_outcome: "companion", // call/text chooser → reached / no-answer / text-sent
  build_list_choice: "companion", // "How do you want to build …?" (the external site / Locator Beast)
  list_built: "companion", // "Ready to send {name}'s list?" (build_list completion)
  send_list: "companion", // Preview / Copy Link + "Did you send {name}'s list?"
  contact_follow_up: "companion", // Contact FU1 / FU2 / FU3 send-confirmation
  post_list_follow_up: "companion", // post-List-Sent FU1 / FU2 / FU3 / Final send-confirmation
  schedule_tour: "companion", // "Did you schedule the tour for {name}?"

  // ── CRM-owned (contextual / heavy / destructive) ───────────────────────────
  guest_card: "crm", // Guest Card composer (jsPDF + mailto)
  application: "crm", // Mark as Applied / Check Application
  confirm_lease: "crm",
  invoice_details: "crm",
  send_invoice: "crm",
  commission_paid: "crm",
  send_rebate: "crm",
  tour_follow_up: "crm", // "How did the tour go?" outcome modal
  timezone_confirm: "crm",
  archive: "crm", // destructive archive-reason confirmation
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

/**
 * The ONE sanctioned exception to "traveling confirmations are Companion-owned":
 * a workflow action the agent EXPLICITLY initiates inside the CRM confirms IN the
 * CRM, because the agent acted there. Today that is the manual New → Contacted
 * Kanban drag, whose contextual contact confirmation legitimately lives in the CRM.
 *
 * This is NOT a spontaneous duplicate: it is only reached from a CRM gesture, and a
 * backend workflow EVENT never opens this on its own. Any Companion-initiated
 * contact (the "contact" / "contact-attempt" / "text-sent" verbs) runs the canonical
 * appliers directly and opens NO CRM prompt.
 */
export const CRM_INITIATED_CONFIRMATIONS: ReadonlySet<WorkflowPromptId> = new Set(["contact_outcome"])

/**
 * May the CRM open an interactive confirmation for this prompt? True for CRM-owned
 * prompts, and for a Companion-owned prompt ONLY when the agent initiated the action
 * in the CRM AND that prompt is a sanctioned CRM-initiated confirmation. Everything
 * else (a Companion-owned prompt with no CRM initiation) is false — the CRM must not
 * spontaneously mirror it.
 */
export function crmMayConfirm(id: WorkflowPromptId, initiatedInCrm: boolean): boolean {
  if (isCrmOwned(id)) return true
  return initiatedInCrm && CRM_INITIATED_CONFIRMATIONS.has(id)
}

/**
 * May the Companion open an interactive confirmation for this prompt? True only for
 * Companion-owned prompts. The Companion never mirrors a CRM-owned prompt — for a
 * CRM-owned operation it delegates to the CRM (an open-* workflow verb) instead.
 */
export function companionMayConfirm(id: WorkflowPromptId): boolean {
  return isCompanionOwned(id)
}
