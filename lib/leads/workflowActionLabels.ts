/**
 * Workflow-action DISPLAY labels for the CRM. Identity stays the internal key /
 * legacy title ("FU1"/"Final"); this only maps identity → user-facing text. Never
 * use the display text as workflow identity (rankLeadActions / getNextFollowUpAction
 * still match on the raw title strings).
 *
 * Full labels are the default; the compact form (FU1/FU2/FU3/Final) is ONLY for a
 * verified ultra-compact layout, with the full phrase in tooltip/aria/details.
 *
 * Mirrored verbatim from packages/companion-shared/src/labels/workflowActions.ts
 * (kept separate to avoid a cross-package import into the Next build). Phase 3.5
 * (action_key) will unify these — keep them in sync.
 */

const FULL: Record<string, string> = {
  fu1: "Follow-Up 1",
  fu2: "Follow-Up 2",
  fu3: "Follow-Up 3",
  final_follow_up: "Final Follow-Up",
}

const COMPACT: Record<string, string> = {
  fu1: "FU1",
  fu2: "FU2",
  fu3: "FU3",
  final_follow_up: "Final",
}

const TO_KEY: Record<string, string> = {
  fu1: "fu1",
  fu2: "fu2",
  fu3: "fu3",
  final: "final_follow_up",
  "final fu": "final_follow_up",
  "final follow-up": "final_follow_up",
  final_follow_up: "final_follow_up",
}

function keyOf(titleOrKey: string | null | undefined): string | null {
  const k = (titleOrKey ?? "").trim().toLowerCase()
  return TO_KEY[k] ?? (FULL[k] ? k : null)
}

export function isFollowUpAction(titleOrKey: string | null | undefined): boolean {
  return keyOf(titleOrKey) !== null
}

/** Full display label ("Follow-Up 1" …). Non-follow-up titles pass through. */
export function formatWorkflowActionLabel(titleOrKey: string): string {
  const key = keyOf(titleOrKey)
  return key ? FULL[key] : titleOrKey
}

/** Compact label ("FU1" … / "Final") — verified-compact layouts only. */
export function workflowActionCompactLabel(titleOrKey: string): string {
  const key = keyOf(titleOrKey)
  return key ? COMPACT[key] : titleOrKey
}
