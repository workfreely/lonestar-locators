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
  fu1: "Follow-Up 1",
  fu2: "Follow-Up 2",
  fu3: "Follow-Up 3",
  final_follow_up: "Final Follow-Up",
  invoice_details: "Get Invoice Details",
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

/** Full display label ("Follow-Up 1", "Get Invoice Details", …). Others pass through. */
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
