/**
 * Workflow-action DISPLAY labels. Identity stays the stable internal key
 * (fu1/fu2/fu3/final_follow_up) or the legacy title string ("FU1"/"Final"/"Invoice
 * Details") — this module ONLY maps identity → user-facing text. Never use the
 * display text as workflow identity.
 *
 * Full labels are the default everywhere (Kanban, Next/Last Action, Companion,
 * calendar). The compact form (FU1/FU2/FU3/Final) is ONLY for a verified
 * ultra-compact layout, with the full phrase in tooltip / aria-label / details.
 *
 * NOTE: mirrored verbatim in the CRM at lib/leads/workflowActionLabels.ts to
 * avoid a cross-package import into the Next.js build. Phase 3.5 (action_key)
 * unifies these. Keep the two in sync.
 */

// Full display overrides (identity → user-facing). Follow-up steps + other
// renamed actions. "Get Invoice Details" is a DISPLAY rename only — it stays a
// separate action from Confirm Lease; legacy identity is unchanged.
const FULL: Record<string, string> = {
  fu1: "1st Follow-Up",
  fu2: "2nd Follow-Up",
  fu3: "3rd Follow-Up",
  final_follow_up: "Final Follow-Up",
  invoice_details: "Get Invoice Details",
  // Display renames only — the internal titles ("Check App", "Setup Tour",
  // "Waiting for Response") and keys (check_application, setup_tour) are
  // unchanged; this maps them to the standardized user-facing text everywhere
  // formatWorkflowActionLabel is used.
  check_application: "Check Application",
  setup_tour: "Schedule Tour",
  tour_follow_up: "Tour Follow-Up",
  // The canonical application-start action. DISPLAY ONLY reads "Mark as Applied"
  // (the agent confirms the client submitted, they don't submit it); the key stays
  // start_application and completing it still advances the lead to 'applied'.
  start_application: "Mark as Applied",
  // The canonical post-approval action created by Check Application → Approved.
  // Its completion (Confirm Lease → Closed) is designed/wired separately.
  confirm_lease: "Confirm Lease",
  // Post-invoice-collection closing step: email the invoice to the property.
  send_invoice: "Send Invoice",
  // Terminal closing step: the OPEN action reads "Confirm Invoice Paid" (payment not
  // yet received); completed it reads "Commission Paid" (see LAST_ACTION_BY_DISPLAY).
  // DISPLAY ONLY — the key stays commission_paid and its behavior is unchanged.
  commission_paid: "Confirm Invoice Paid",
  // Post-payment closing action for the Cash Rebate incentive only — the OPEN
  // action reads "Send Rebate"; completed it reads "Sent Rebate" (LAST_ACTION).
  send_rebate: "Send Rebate",
  // Client-retention action scheduled ~90 days before lease end — the agent reaches
  // out about renewing. DISPLAY ONLY reads "Renewal Follow-Up"; the key stays
  // lease_follow_up and all creation/date/sequencing behavior is unchanged.
  lease_follow_up: "Renewal Follow-Up",
  email_guest_card: "Send Guest Card",
  waiting_for_response: "Waiting for Reply",
};

const COMPACT: Record<string, string> = {
  fu1: "FU1",
  fu2: "FU2",
  fu3: "FU3",
  final_follow_up: "Final",
};

const FOLLOW_UP_KEYS = new Set(["fu1", "fu2", "fu3", "final_follow_up"]);

// Legacy/display title strings AND canonical keys → canonical key.
const TO_KEY: Record<string, string> = {
  fu1: "fu1",
  fu2: "fu2",
  fu3: "fu3",
  final: "final_follow_up",
  "final fu": "final_follow_up",
  "final follow-up": "final_follow_up",
  final_follow_up: "final_follow_up",
  "invoice details": "invoice_details",
  "get invoice details": "invoice_details",
  invoice_details: "invoice_details",
  "check app": "check_application",
  "check application": "check_application",
  check_application: "check_application",
  "setup tour": "setup_tour",
  "schedule tour": "setup_tour",
  setup_tour: "setup_tour",
  "tour follow-up": "tour_follow_up",
  "tour follow up": "tour_follow_up",
  tour_follow_up: "tour_follow_up",
  apply: "start_application",
  "start application": "start_application",
  "mark as applied": "start_application",
  start_application: "start_application",
  "confirm lease": "confirm_lease",
  confirm_lease: "confirm_lease",
  "send invoice": "send_invoice",
  send_invoice: "send_invoice",
  "confirm payment": "commission_paid",
  "confirm invoice paid": "commission_paid",
  commission_paid: "commission_paid",
  "send rebate": "send_rebate",
  send_rebate: "send_rebate",
  "renewal follow-up": "lease_follow_up",
  "future lease follow-up": "lease_follow_up",
  "lease follow-up": "lease_follow_up",
  lease_follow_up: "lease_follow_up",
  "email guest card": "email_guest_card",
  "send guest card": "email_guest_card",
  email_guest_card: "email_guest_card",
  "waiting for response": "waiting_for_response",
  "waiting for reply": "waiting_for_response",
  waiting_for_response: "waiting_for_response",
};

function keyOf(titleOrKey: string | null | undefined): string | null {
  const k = (titleOrKey ?? "").trim().toLowerCase();
  return TO_KEY[k] ?? (FULL[k] ? k : null);
}

/** True when the title/key is one of the four follow-up steps. */
export function isFollowUpAction(titleOrKey: string | null | undefined): boolean {
  const key = keyOf(titleOrKey);
  return key !== null && FOLLOW_UP_KEYS.has(key);
}

/** Full display label ("1st Follow-Up", "Get Invoice Details", …). Others pass through. */
export function formatWorkflowActionLabel(titleOrKey: string): string {
  const key = keyOf(titleOrKey);
  return key ? FULL[key] : titleOrKey;
}

/** Compact label ("FU1" … / "Final") — verified-compact follow-up rows only.
 *  Non-follow-up actions fall back to their full label. */
export function workflowActionCompactLabel(titleOrKey: string): string {
  const key = keyOf(titleOrKey);
  if (key && FOLLOW_UP_KEYS.has(key)) return COMPACT[key];
  return key ? FULL[key] : titleOrKey;
}

// Last Action (completed-state) DISPLAY labels, keyed by the Next Action display
// label. DISPLAY ONLY — never touches internal identity/keys/stages. Unmapped
// canonical actions (contacted_follow_up "Follow Up", reconnect_client, and
// email_guest_card) intentionally fall back to their Next Action label until a
// completed-state term is provided.
const LAST_ACTION_BY_DISPLAY: Record<string, string> = {
  "Contact Lead": "Contacted Lead",
  // Standardized visible milestone pair: the completed Last Action reads
  // "List Built" / "List Sent" (the open Next Action stays "Build List" / "Send
  // List"). DISPLAY ONLY — internal keys (build_list/send_list) are unchanged.
  "Build List": "List Built",
  "Send List": "List Sent",
  // Follow-ups intentionally fall through to their base label ("1st Follow-Up",
  // …) — the panel section is already titled LAST ACTION, so a "Completed" prefix
  // is redundant. Identity/keys (fu1/follow_up_1/…) are unchanged.
  "Schedule Tour": "Tour Scheduled",
  "Send Guest Card": "Guest Card Sent",
  // A completed Tour Follow-Up reads as the tour having happened ("Toured ·
  // Property") — the tour occurrence, not a generic "completed" prefix.
  "Tour Follow-Up": "Toured",
  // Completing "Mark as Applied" (client submitted) → "Applied · Property".
  "Mark as Applied": "Applied",
  "Check Application": "Checked Application",
  // Completing Confirm Lease (client signed) → "Lease Signed · Property".
  "Confirm Lease": "Lease Signed",
  // Completing Send Invoice (agent confirmed sent) → "Invoice Sent · Property".
  "Send Invoice": "Invoice Sent",
  // Completing Confirm Invoice Paid (agent confirmed received) → "Commission Paid · Property".
  "Confirm Invoice Paid": "Commission Paid",
  "Setup Movers": "Movers Scheduled",
  // Completing Send Rebate (agent confirmed the Cash Rebate was sent) → "Rebate Sent · Property".
  "Send Rebate": "Rebate Sent",
  // Completing Renewal Follow-Up (agent reached out near lease end) → "Lease Followed Up · Property".
  "Renewal Follow-Up": "Lease Followed Up",
  "Get Invoice Details": "Got Invoice Details",
};

/** Completed-state label for the Last Action row ("Contacted Lead", "Built List",
 *  "Completed 1st Follow-Up", …). Canonicalizes to the Next Action label first,
 *  then maps to its completed form; unmapped actions pass through unchanged. */
export function formatLastActionLabel(titleOrKey: string): string {
  const nextLabel = formatWorkflowActionLabel(titleOrKey);
  return LAST_ACTION_BY_DISPLAY[nextLabel] ?? nextLabel;
}
