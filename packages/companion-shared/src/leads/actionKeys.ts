import { z } from "zod";

/**
 * Canonical workflow action keys — the STABLE identity of a workflow-generated
 * lead_next_actions row. Never derived from the (presentation-only) title.
 * Shared by the CRM workflow engine (producer) and the Companion read model
 * (consumer) so both agree on identity. Mirrors the DB CHECK in
 * supabase/migrations/20260806000001_companion_action_canonicalization.sql.
 *
 * contacted_follow_up is the contacted-stage chase — DISTINCT from the
 * post-list-sent sequence follow_up_1/2/3 + final_follow_up. Some keys are
 * RESERVED (no producer yet): build_list, tour_follow_up, confirm_lease,
 * setup_movers, send_rebate. get_invoice_details stays separate from
 * confirm_lease.
 */
export const WORKFLOW_ACTION_KEYS = [
  "contact_lead",
  "contacted_follow_up",
  // Pre-list contact-chase sequence (Contact FU1 → FU2 → FU3). Distinct from the
  // post-List-Sent follow_up_1/2/3 + final_follow_up ladder. contacted_follow_up
  // is the retired single-step predecessor (kept for history; no longer produced).
  "contact_follow_up_1",
  "contact_follow_up_2",
  "contact_follow_up_3",
  "build_list",
  "send_list",
  "setup_tour",
  "tour_follow_up",
  "start_application",
  "check_application",
  "confirm_lease",
  "get_invoice_details",
  "send_invoice",
  "commission_paid",
  "setup_movers",
  "send_rebate",
  "lease_follow_up",
  "follow_up_1",
  "follow_up_2",
  "follow_up_3",
  "final_follow_up",
  "reconnect_client",
  "email_guest_card",
] as const;

export type WorkflowActionKey = (typeof WORKFLOW_ACTION_KEYS)[number];

/** Validates an action_key; unknown/legacy values do NOT silently coerce. */
export const workflowActionKeySchema = z.enum(WORKFLOW_ACTION_KEYS);

export function isWorkflowActionKey(v: unknown): v is WorkflowActionKey {
  return typeof v === "string" && (WORKFLOW_ACTION_KEYS as readonly string[]).includes(v);
}

/** action_type: 'workflow' = engine-emitted canonical action; 'manual' = user task. */
export const ACTION_TYPES = ["workflow", "manual"] as const;
export type ActionType = (typeof ACTION_TYPES)[number];
export const actionTypeSchema = z.enum(ACTION_TYPES);

/** origin: who created the row. */
export const ACTION_ORIGINS = ["workflow", "custom", "system"] as const;
export type ActionOrigin = (typeof ACTION_ORIGINS)[number];
export const actionOriginSchema = z.enum(ACTION_ORIGINS);

/** status lifecycle; kept in sync with the completed boolean. */
export const ACTION_STATUSES = ["open", "completed", "skipped", "canceled"] as const;
export type ActionStatus = (typeof ACTION_STATUSES)[number];
export const actionStatusSchema = z.enum(ACTION_STATUSES);

/** The workflow-engine version stamped on rows it emits (see lib/workflowEngine). */
export const CURRENT_WORKFLOW_VERSION = 1;
