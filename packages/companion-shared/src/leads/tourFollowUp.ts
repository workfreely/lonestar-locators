// THE PER-PROPERTY TOUR FOLLOW-UP LADDER — shared identity, copy and progression.
//
// Lives here, beside actionKeys, because BOTH surfaces need it: the CRM writes the
// rows and the Companion renders the send/confirm for them. A second copy in
// lib/leads would be the drift this package exists to prevent.
//
// ── THE TWO HALVES OF THE LADDER ARE NOT THE SAME KIND OF STEP ──────────────────
// Rung 1 (tour_follow_up) asks "how did the tour go" and its answer is an OUTCOME:
// it sets lead_tours.status/outcome, Top Pick, the stage, and the next workflow
// action. WORKFLOW_PROMPT_OWNER already records that decision — `tour_follow_up:
// "crm"` — because that prompt is the CRM's contextual outcome modal.
//
// Rungs 2 and 3 are plain follow-up texts: send, confirm, done. They have the same
// shape as the post-list ladder, whose prompt is companion-owned, so they travel
// the SAME send/confirm path the Companion already uses — no new control and no
// second completion system.

export const TOUR_FOLLOW_UP_LADDER = ["tour_follow_up", "tour_follow_up_2", "tour_follow_up_3"] as const;
export type TourFollowUpKey = (typeof TOUR_FOLLOW_UP_LADDER)[number];

const LADDER_TITLE: Record<TourFollowUpKey, string> = {
  tour_follow_up: "Tour Follow-Up",
  tour_follow_up_2: "2nd Tour Follow-Up",
  tour_follow_up_3: "3rd Tour Follow-Up",
};

/** The title stored on the row. Kept in step with FULL in labels/workflowActions. */
export function tourFollowUpTitle(key: TourFollowUpKey): string {
  return LADDER_TITLE[key];
}

export type TourFollowUpRow = {
  action_key?: string | null;
  title?: string | null;
  status?: string | null;
  completed?: boolean | null;
};

/** Any rung. Matches action_key, falling back to the stored title the way every
 *  other call site does — a row written before action_key existed has only a title. */
export function isTourFollowUpRow(r: TourFollowUpRow): boolean {
  const key = String(r.action_key ?? "");
  if ((TOUR_FOLLOW_UP_LADDER as readonly string[]).includes(key)) return true;
  const title = String(r.title ?? "").trim().toLowerCase();
  return title === "tour follow-up" || title === "2nd tour follow-up" || title === "3rd tour follow-up";
}

/** The rung a row IS, or null. Same resolution order as isTourFollowUpRow. */
export function tourFollowUpKeyOf(r: TourFollowUpRow): TourFollowUpKey | null {
  const key = String(r.action_key ?? "");
  if ((TOUR_FOLLOW_UP_LADDER as readonly string[]).includes(key)) return key as TourFollowUpKey;
  const title = String(r.title ?? "").trim().toLowerCase();
  if (title === "tour follow-up") return "tour_follow_up";
  if (title === "2nd tour follow-up") return "tour_follow_up_2";
  if (title === "3rd tour follow-up") return "tour_follow_up_3";
  return null;
}

/**
 * Is this a rung the COMPANION sends and confirms?
 *
 * Rungs 2 and 3 only. Rung 1 is deliberately excluded: its prompt is the CRM's
 * outcome modal (WORKFLOW_PROMPT_OWNER.tour_follow_up === "crm"), and routing it
 * here instead would complete the row without ever recording the outcome, Top Pick
 * or stage advance that modal exists to capture.
 */
export function isTourFollowUpSendAction(titleOrKey: string | null | undefined): boolean {
  const key = tourFollowUpKeyOf({ action_key: titleOrKey ?? null, title: titleOrKey ?? null });
  return key === "tour_follow_up_2" || key === "tour_follow_up_3";
}

const isOpenRow = (r: TourFollowUpRow) =>
  r.completed !== true && String(r.status ?? "open").toLowerCase() === "open";
const isCompletedRow = (r: TourFollowUpRow) =>
  r.completed === true || String(r.status ?? "").toLowerCase() === "completed";

/**
 * WHICH RUNG COMES NEXT for one (lead, property), decided from the rows themselves.
 *
 * Counting COMPLETED rungs rather than reading a counter is the point. A counter
 * would have to live on the lead, and the ladder is per-property: the moment a
 * client tours two properties — the normal case, 2-5 of them — one number cannot
 * describe both.
 *
 * Returns null when the property already has an OPEN rung (the duplicate-reminder
 * case the partial unique index also refuses) or when all three are spent. A
 * CANCELED rung neither blocks nor advances.
 *
 * The CALLER decides whether another follow-up is warranted at all; this only
 * answers "if one is created, which rung is it". Completing a rung never calls it.
 */
export function nextTourFollowUpKey(rows: readonly TourFollowUpRow[]): TourFollowUpKey | null {
  const ladder = rows.filter(isTourFollowUpRow);
  if (ladder.some(isOpenRow)) return null;
  const done = ladder.filter(isCompletedRow).length;
  return TOUR_FOLLOW_UP_LADDER[done] ?? null;
}

/**
 * The approved message each rung opens with, pre-filled with the client's first
 * name. DRAFTS: they open in the locator's own SMS app, where they can be edited or
 * abandoned. Nothing in this codebase sends a text. No emojis.
 */
export const TOUR_FOLLOW_UP_SMS: Record<TourFollowUpKey, (name: string) => string> = {
  tour_follow_up: (name) => `Hey ${name}! How did the tours go? Hopefully everything went well!`,
  tour_follow_up_2: (name) => `Hey ${name}! How did the other tours go? Did any stand out?`,
  tour_follow_up_3: (name) => `Hey ${name}! Do you think any of them might be the one?`,
};

/** The body for one rung, by title or key. "" when the title is not a rung —
 *  the same empty-string contract buildContactFollowUpSmsBody uses. */
export function buildTourFollowUpSmsBody(titleOrKey: string, name: string): string {
  const key = tourFollowUpKeyOf({ action_key: titleOrKey, title: titleOrKey });
  return key ? TOUR_FOLLOW_UP_SMS[key](name) : "";
}
