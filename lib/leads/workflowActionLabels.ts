/**
 * Workflow-action DISPLAY labels for the CRM. Identity stays the internal key /
 * legacy title ("FU1"/"Final"/"Invoice Details"); this only maps identity →
 * user-facing text. Never use the display text as workflow identity
 * (rankLeadActions / getNextFollowUpAction still match on the raw title strings).
 *
 * Full labels are the default; the compact form (FU1/FU2/FU3/Final) is ONLY for a
 * verified ultra-compact layout, with the full phrase in tooltip/aria/details.
 * "Get Invoice Details" is a DISPLAY rename only — still a separate action from
 * Confirm Lease; legacy identity unchanged.
 *
 * Mirrored verbatim from packages/companion-shared/src/labels/workflowActions.ts
 * (kept separate to avoid a cross-package import into the Next build). Phase 3.5
 * (action_key) will unify these — keep them in sync.
 */

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
  // The new canonical application-start action ("Apply"). Completing it advances
  // the lead to 'applied' (which fires the existing check_application rule).
  start_application: "Apply",
  // The canonical post-approval action created by Check Application → Approved.
  // Its completion (Confirm Lease → Closed) is designed/wired separately.
  confirm_lease: "Confirm Lease",
  // Post-invoice-collection closing step: email the invoice to the property.
  send_invoice: "Send Invoice",
  // Terminal closing step: the OPEN action reads "Confirm Payment" (payment not yet
  // received); completed it reads "Commission Paid" (see LAST_ACTION_BY_DISPLAY).
  commission_paid: "Confirm Payment",
  email_guest_card: "Send Guest Card",
  waiting_for_response: "Waiting for Reply",
}

const COMPACT: Record<string, string> = {
  fu1: "FU1",
  fu2: "FU2",
  fu3: "FU3",
  final_follow_up: "Final",
}

const FOLLOW_UP_KEYS = new Set(["fu1", "fu2", "fu3", "final_follow_up"])

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
  start_application: "start_application",
  "confirm lease": "confirm_lease",
  confirm_lease: "confirm_lease",
  "send invoice": "send_invoice",
  send_invoice: "send_invoice",
  "confirm payment": "commission_paid",
  commission_paid: "commission_paid",
  "email guest card": "email_guest_card",
  "send guest card": "email_guest_card",
  email_guest_card: "email_guest_card",
  "waiting for response": "waiting_for_response",
  "waiting for reply": "waiting_for_response",
  waiting_for_response: "waiting_for_response",
}

function keyOf(titleOrKey: string | null | undefined): string | null {
  const k = (titleOrKey ?? "").trim().toLowerCase()
  return TO_KEY[k] ?? (FULL[k] ? k : null)
}

export function isFollowUpAction(titleOrKey: string | null | undefined): boolean {
  const key = keyOf(titleOrKey)
  return key !== null && FOLLOW_UP_KEYS.has(key)
}

/** Full display label ("1st Follow-Up", "Get Invoice Details", …). Others pass through. */
export function formatWorkflowActionLabel(titleOrKey: string): string {
  const key = keyOf(titleOrKey)
  return key ? FULL[key] : titleOrKey
}

/** Compact label ("FU1" … / "Final") — verified-compact follow-up rows only.
 *  Non-follow-up actions fall back to their full label. */
export function workflowActionCompactLabel(titleOrKey: string): string {
  const key = keyOf(titleOrKey)
  if (key && FOLLOW_UP_KEYS.has(key)) return COMPACT[key]
  return key ? FULL[key] : titleOrKey
}

// Last Action (completed-state) DISPLAY labels, keyed by the Next Action display
// label. DISPLAY ONLY — never touches internal identity/keys/stages. Unmapped
// canonical actions (contacted_follow_up "Follow Up", reconnect_client, and
// email_guest_card) intentionally fall back to their Next Action label until a
// completed-state term is provided. Mirrored in packages/companion-shared.
const LAST_ACTION_BY_DISPLAY: Record<string, string> = {
  "Contact Lead": "Contacted Lead",
  "Build List": "Built List",
  "Send List": "Sent List",
  // Follow-ups intentionally fall through to their base label ("1st Follow-Up",
  // …) — the panel section is already titled LAST ACTION, so a "Completed" prefix
  // is redundant. Identity/keys (fu1/follow_up_1/…) are unchanged.
  "Schedule Tour": "Tour Scheduled",
  "Send Guest Card": "Guest Card Sent",
  // A completed Tour Follow-Up reads as the tour having happened ("Toured ·
  // Property") — the tour occurrence, not a generic "completed" prefix.
  "Tour Follow-Up": "Toured",
  // Completing "Apply" (client submitted) → "Applied · Property".
  "Apply": "Applied",
  "Check Application": "Checked Application",
  // Completing Confirm Lease (client signed) → "Lease Signed · Property".
  "Confirm Lease": "Lease Signed",
  // Completing Send Invoice (agent confirmed sent) → "Invoice Sent · Property".
  "Send Invoice": "Invoice Sent",
  // Completing Confirm Payment (agent confirmed received) → "Commission Paid · Property".
  "Confirm Payment": "Commission Paid",
  "Setup Movers": "Movers Scheduled",
  "Send Rebate": "Sent Rebate",
  "Get Invoice Details": "Got Invoice Details",
}

/** Completed-state label for the Last Action row ("Contacted Lead", "Built List",
 *  "Completed 1st Follow-Up", …). Canonicalizes to the Next Action label first,
 *  then maps to its completed form; unmapped actions pass through unchanged. */
export function formatLastActionLabel(titleOrKey: string): string {
  const nextLabel = formatWorkflowActionLabel(titleOrKey)
  return LAST_ACTION_BY_DISPLAY[nextLabel] ?? nextLabel
}
