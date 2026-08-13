/**
 * Public Companion API contract — runtime-validated with Zod. This is the STABLE
 * surface the extension talks to; it is intentionally a camelCase projection, not
 * the raw `leads` row (server maps row → this). Validate at every API boundary.
 *
 * Outcome/disposition fields appear ONLY as OPTIONAL extension points, per the
 * approved decision to preserve current behavior — do not make them required or
 * build UI for them in this refactor.
 */

import { z } from "zod";
import { LEAD_STAGES } from "./stages";

export const leadStageSchema = z.enum(LEAD_STAGES);
export const prioritySchema = z.enum(["low", "medium", "high"]);

/** Lead id may be a numeric bigint or a demo string id. */
export const leadIdSchema = z.union([z.number(), z.string().min(1)]);
export const nextActionIdSchema = z.union([z.number(), z.string().min(1)]);

// ── Sub-objects ──────────────────────────────────────────────────────────────
export const rangeSchema = z.object({
  min: z.number().nullish(),
  max: z.number().nullish(),
});

export const searchCriteriaSchema = z.object({
  city: z.string().nullish(),
  interest: z.string().nullish(), // inferred market for short leads
  budgetText: z.string().nullish(), // preserves the "$1,149 – $1,958" display form
  budget: rangeSchema.nullish(),
  // Monthly Household Income — the SmartLead Form's canonical range string,
  // stored verbatim (value === label), e.g. "$4,000 – $6,000 / month". Nullish
  // when the form did not collect it; the row is then omitted (never blank/$0).
  income: z.string().nullish(),
  propertyType: z.string().nullish(),
  beds: z.string().nullish(),
  baths: z.string().nullish(),
  moveDate: z.string().nullish(),
  desiredAreas: z.string().nullish(),
  source: z.string().nullish(),
});

export const creditScreeningSchema = z.object({
  creditScore: z.string().nullish(),
  creditHistory: z.string().nullish(),
  brokenLeaseAge: z.string().nullish(),
  evictionAge: z.string().nullish(),
  criminalBackground: z.string().nullish(),
  felonyAge: z.string().nullish(),
  misdemeanorAge: z.string().nullish(),
});

export const nextActionSchema = z.object({
  id: nextActionIdSchema,
  leadId: leadIdSchema,
  title: z.string(),
  dueAt: z.string().nullish(),
  priority: prioritySchema,
  notes: z.string().nullish(),
  completed: z.boolean(),
  completedAt: z.string().nullish(),
  propertyName: z.string().nullish(),
  /**
   * Resting status label for this open action, when it differs from the default
   * Pending/Overdue derivation — e.g. a New lead's Follow Up that came from a
   * "No Answer" ("No Answer") or a sent text ("Waiting for Reply"). Overdue still
   * wins when the due date passes (decided in the panel from dueAt). Nullish for
   * ordinary actions, which stay Pending/Overdue.
   */
  statusLabel: z.string().nullish(),
  /** Optional extension point — reserved, not collected today. */
  outcome: z.string().nullish(),
});
export type NextActionDTO = z.infer<typeof nextActionSchema>;

export const workflowStateSchema = z.object({
  followUpCount: z.number().default(0),
  nextActionDate: z.string().nullish(),
  firstContactAt: z.string().nullish(),
});

/**
 * Last Action — the most recently successfully COMPLETED workflow action (title
 * + when). Null for a brand-new lead where nothing has been completed yet (do
 * NOT fabricate one). Derived canonically (see lib/companion/leadToDto), never
 * from UI state; a "No Answer" attempt is NOT a completion and never appears here.
 */
export const lastActionSchema = z.object({
  title: z.string(),
  completedAt: z.string().nullish(),
});
export type LastActionDTO = z.infer<typeof lastActionSchema>;

/** The safe lead projection the panel renders. No workspace_id, no soft-delete
 *  bookkeeping beyond what the UI needs. */
export const leadSummarySchema = z.object({
  id: leadIdSchema,
  firstName: z.string().nullish(),
  lastName: z.string().nullish(),
  phone: z.string().nullish(),
  stage: leadStageSchema,
  isArchived: z.boolean().default(false),
  archiveReason: z.string().nullish(),
  /** Pre-formatted canonical archive-reason label (e.g. "👻 Ghosted / No
   *  Response"), computed CRM-side via the ONE canonical map in
   *  lib/leads/archiveReasons so the Companion never re-derives or duplicates
   *  reason labels. Null for active leads / unmapped reasons. */
  archiveReasonLabel: z.string().nullish(),
  isClosed: z.boolean().default(false),
  searchCriteria: searchCriteriaSchema,
  creditScreening: creditScreeningSchema,
  workflow: workflowStateSchema,
  /** Most recently COMPLETED workflow action (see lastActionSchema). Null when
   *  nothing has been completed yet — the panel then hides the Last Action row. */
  lastAction: lastActionSchema.nullish(),
  /**
   * Client Notes — the client's original FORM-SUBMITTED notes, read-only. Maps to
   * the existing `leads.notes` column (the same data the CRM's Client Notes shows).
   * NOT a new field, and NOT the editable Locator Notes (`leads.locator_notes`).
   */
  clientNotes: z.string().nullish(),
});
export type LeadSummaryDTO = z.infer<typeof leadSummarySchema>;

/** Full detail response: summary + open actions (+ favorites handled separately). */
export const leadDetailSchema = z.object({
  lead: leadSummarySchema,
  nextActions: z.array(nextActionSchema),
});
export type LeadDetailDTO = z.infer<typeof leadDetailSchema>;

// ── Request DTOs (validate on the server) ────────────────────────────────────
export const advanceStageInput = z.object({
  leadId: leadIdSchema,
  toStage: leadStageSchema,
});

export const setFollowUpInput = z.object({
  leadId: leadIdSchema,
  step: z.number().int().min(0).max(4),
});

export const doneForNowInput = z.object({
  leadId: leadIdSchema,
  days: z.number().int().min(1),
});

export const archiveInput = z.object({ leadId: leadIdSchema });
export const restoreInput = z.object({ leadId: leadIdSchema });

export const createNextActionInput = z.object({
  leadId: leadIdSchema,
  title: z.string().min(1),
  dueAt: z.string(),
  priority: prioritySchema.default("medium"),
  notes: z.string().nullish(),
});

export const updateNextActionInput = z.object({
  actionId: nextActionIdSchema,
  title: z.string().min(1),
  dueAt: z.string(),
  priority: prioritySchema,
  notes: z.string().nullish(),
});

export const completeNextActionInput = z.object({
  actionId: nextActionIdSchema,
  /** Optional disposition — reserved extension point; ignored by the current
   *  server implementation (parity). */
  outcome: z.string().nullish(),
});

export const leadSearchQuery = z.object({
  query: z.string().default(""),
  limit: z.number().int().min(1).max(50).default(20),
});

// ── Response DTOs ────────────────────────────────────────────────────────────
/** Result of a mutation — the server returns the fields the caller must reflect
 *  (updated lead + any workflow-engine-created action) so the UI can update
 *  optimistically and the bridge can broadcast a minimal event. */
export const mutationResultSchema = z.object({
  ok: z.boolean(),
  lead: leadSummarySchema.nullish(),
  createdAction: nextActionSchema.nullish(),
  workflowAction: nextActionSchema.nullish(),
  error: z.string().nullish(),
});
export type MutationResultDTO = z.infer<typeof mutationResultSchema>;

export const leadSearchResultSchema = z.object({
  results: z.array(
    z.object({
      id: leadIdSchema,
      firstName: z.string().nullish(),
      lastName: z.string().nullish(),
      stage: leadStageSchema,
      phone: z.string().nullish(),
    }),
  ),
});
export type LeadSearchResultDTO = z.infer<typeof leadSearchResultSchema>;
