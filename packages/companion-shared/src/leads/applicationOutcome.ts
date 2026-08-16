/**
 * Application status — the durable outcome of a client's submitted application for
 * their Top Pick property ("What's the application status?"). Shared by the CRM
 * (producer) and the Companion read-model (consumer). Mirrors the DB CHECK in
 * supabase/migrations/20260815000003_leads_application_status.sql.
 *
 *   pending  — submitted, no decision yet (re-check later)
 *   approved — accepted; the canonical next step is Confirm Lease (NOT Closed)
 *   canceled — the client/property pulled the application (DISTINCT from denied);
 *              the Top Pick is cleared and Schedule Tour reopens (history kept)
 *   denied   — rejected; the Top Pick is cleared and Schedule Tour reopens
 *   other    — anything else; a free note + a dated follow-up, lead stays Applied
 *
 * ONE application per lead for this MVP: leads.application_status is the single
 * durable field (no lead_applications table); lead_timeline holds the immutable
 * history. The application is property-scoped to the lead's Top Pick.
 */

export const APPLICATION_STATUSES = ["pending", "approved", "canceled", "denied", "other"] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

/**
 * The modal's choices, in the exact order shown ("Approved / Still Pending /
 * Canceled / Denied / Other"). Identical value-set to APPLICATION_STATUSES — an
 * outcome the agent picks IS the status recorded — but ordered for the UI.
 */
export const APPLICATION_OUTCOMES = ["approved", "pending", "canceled", "denied", "other"] as const;
export type ApplicationOutcome = (typeof APPLICATION_OUTCOMES)[number];

export function isApplicationStatus(v: unknown): v is ApplicationStatus {
  return typeof v === "string" && (APPLICATION_STATUSES as readonly string[]).includes(v);
}

/** Short modal-choice labels — kept terse because the modal already shows the
 *  "Check Application · {Property}" context. */
export const APPLICATION_OUTCOME_LABELS: Record<ApplicationStatus, string> = {
  approved: "Approved",
  pending: "Still Pending",
  canceled: "Canceled",
  denied: "Denied",
  other: "Other",
};

/**
 * The compact FURTHEST-canonical-state term shown on a Favorite card once an
 * application outcome is recorded (rendered as "Toured · {state}"). "Still Pending"
 * reads as "Application Pending"; "Other" leaves the display at "Applied" (a note,
 * not a positive/negative decision, lead stays Applied with its Top Pick).
 */
export const APPLICATION_FAVORITE_STATE: Record<ApplicationStatus, string> = {
  approved: "Approved",
  pending: "Application Pending",
  canceled: "Application Canceled",
  denied: "Application Denied",
  other: "Applied",
};

/**
 * Fully-contextual Last Action labels ("Action · Property"). Unlike the terse
 * modal choices, the Last Action ALWAYS names the application phase so a glance at
 * the panel/Companion reads "Application Approved · The Foundry". "Other" surfaces
 * as a neutral "Application Update" (something was recorded without a decision).
 */
export const APPLICATION_LAST_ACTION_LABELS: Record<ApplicationStatus, string> = {
  approved: "Application Approved",
  pending: "Application Still Pending",
  canceled: "Application Canceled",
  denied: "Application Denied",
  other: "Application Update",
};
