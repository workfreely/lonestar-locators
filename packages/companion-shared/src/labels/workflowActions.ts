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
  "Build List": "Built List",
  "Send List": "Sent List",
  // Follow-ups intentionally fall through to their base label ("1st Follow-Up",
  // …) — the panel section is already titled LAST ACTION, so a "Completed" prefix
  // is redundant. Identity/keys (fu1/follow_up_1/…) are unchanged.
  "Schedule Tour": "Tour Scheduled",
  "Tour Follow-Up": "Completed Tour Follow-Up",
  "Check Application": "Checked Application",
  "Confirm Lease": "Confirmed Lease",
  "Setup Movers": "Movers Scheduled",
  "Send Rebate": "Sent Rebate",
  "Get Invoice Details": "Got Invoice Details",
};

/** Completed-state label for the Last Action row ("Contacted Lead", "Built List",
 *  "Completed 1st Follow-Up", …). Canonicalizes to the Next Action label first,
 *  then maps to its completed form; unmapped actions pass through unchanged. */
export function formatLastActionLabel(titleOrKey: string): string {
  const nextLabel = formatWorkflowActionLabel(titleOrKey);
  return LAST_ACTION_BY_DISPLAY[nextLabel] ?? nextLabel;
}
