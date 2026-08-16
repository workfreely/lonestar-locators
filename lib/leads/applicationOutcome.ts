import type { ApplicationStatus } from "@bc/companion-shared"

// Pure Check Application outcome plan (no DB) — safe to import anywhere, including
// tests. The DB-touching completion lives in lib/leads/applicationOutcomeWorkflow.ts.
// Mirrors the shape/spirit of planForOutcome (lib/leads/tourFollowUp.ts): the
// canonical action (check_application) → outcome → durable state → next canonical
// action, property-scoped to the lead's Top Pick.

export type ApplicationOutcomePlan = {
  /** The durable status recorded on leads.application_status. */
  applicationStatus: ApplicationStatus
  /** Top Pick effect. 'clear' = drop the live Top Pick (Denied — the property is
   *  no longer viable, though history is preserved); 'keep' = untouched. */
  topPick: "keep" | "clear"
  /** Mark the check_application row completed (Approved / Denied / Other). */
  completeCheckApplication: boolean
  /** Re-date the SAME check_application to a "check again" date, keeping it OPEN —
   *  Pending only (never a duplicate open Check Application). */
  recheckCheckApplication: boolean
  /** Create the canonical "Confirm Lease" (confirm_lease) action for the Top Pick
   *  property — Approved only. Do NOT advance to 'closed' here. */
  createConfirmLease: boolean
  /** Reopen Schedule Tour so the client can tour/apply elsewhere — Denied only. */
  reopenSetupTour: boolean
  /** Create a dated manual "Follow Up" (Other) — reuses the Add Task system. */
  createFollowUpTask: boolean
  /** The modal asks a second-step date ("When should we check again?" — Pending;
   *  "When should we follow up?" — Other). */
  needsFollowUpDate: boolean
  /** The modal asks a free note (Other only). */
  needsNote: boolean
}

export function planForApplicationOutcome(status: ApplicationStatus): ApplicationOutcomePlan {
  switch (status) {
    case "approved":
      // Approved → complete the check, keep the Top Pick, produce Confirm Lease.
      // The lead stays in the application phase; Confirm Lease → Closed is separate.
      return { applicationStatus: "approved", topPick: "keep", completeCheckApplication: true, recheckCheckApplication: false, createConfirmLease: true, reopenSetupTour: false, createFollowUpTask: false, needsFollowUpDate: false, needsNote: false }
    case "pending":
      // Still Pending → no decision. Keep the lead Applied + the Top Pick; re-date
      // the SAME Check Application to the chosen "check again" date (no duplicate).
      return { applicationStatus: "pending", topPick: "keep", completeCheckApplication: false, recheckCheckApplication: true, createConfirmLease: false, reopenSetupTour: false, createFollowUpTask: false, needsFollowUpDate: true, needsNote: false }
    case "canceled":
      // Canceled → DISTINCT from Denied (the application was pulled, not rejected).
      // Same workflow effect: complete the check, clear the live Top Pick (no longer
      // the active winning option; history preserved), reopen Schedule Tour. Never
      // deletes anything, never marks Closed.
      return { applicationStatus: "canceled", topPick: "clear", completeCheckApplication: true, recheckCheckApplication: false, createConfirmLease: false, reopenSetupTour: true, createFollowUpTask: false, needsFollowUpDate: false, needsNote: false }
    case "denied":
      // Denied → complete the check, clear the live Top Pick (property no longer
      // viable; history preserved), reopen Schedule Tour to find another property.
      return { applicationStatus: "denied", topPick: "clear", completeCheckApplication: true, recheckCheckApplication: false, createConfirmLease: false, reopenSetupTour: true, createFollowUpTask: false, needsFollowUpDate: false, needsNote: false }
    case "other":
      // Other → complete the check; keep the lead Applied + the Top Pick; capture a
      // short note + a dated manual Follow Up (mirrors Tour Follow-Up's "Other").
      return { applicationStatus: "other", topPick: "keep", completeCheckApplication: true, recheckCheckApplication: false, createConfirmLease: false, reopenSetupTour: false, createFollowUpTask: true, needsFollowUpDate: true, needsNote: true }
  }
}
