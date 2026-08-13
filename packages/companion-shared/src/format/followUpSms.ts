/**
 * List Sent follow-up SMS templates — existing wording preserved verbatim.
 *
 * Keyed by the canonical follow-up identity, accepting either the legacy title
 * ("FU1"/"FU2"/"FU3"/"Final") or the action_key (follow_up_1/2/3/final_follow_up).
 * Only the Final Follow-Up is name-personalized (matches the current CRM copy).
 */
export function buildFollowUpSmsBody(titleOrKey: string, name: string): string {
  const k = (titleOrKey || "").trim().toLowerCase();
  if (k === "fu1" || k === "follow_up_1") {
    return "Hey! Did you see any properties on the list that you'd like to tour?";
  }
  if (k === "fu2" || k === "follow_up_2") {
    return "Is there one that stands out or would you like me to narrow the list down a bit more?";
  }
  if (k === "fu3" || k === "follow_up_3") {
    return "I'm calling communities you were interested in to get updated pricing and specials. Are you still looking to move?";
  }
  // Final Follow-Up (final_follow_up / "Final").
  return `Hey ${name}, I haven't heard back so I'll pause your search for now. No rush, just let me know when you'd like me to pick it back up!`;
}
