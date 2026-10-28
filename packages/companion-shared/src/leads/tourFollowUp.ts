// THE PER-PROPERTY TOUR FOLLOW-UP LADDER — shared identity, copy and progression.
//
// Lives here, beside actionKeys, because BOTH surfaces need it: the CRM writes the
// rows and the Companion renders the send/confirm for them. A second copy in
// lib/leads would be the drift this package exists to prevent.
//
// ── EVERY RUNG IS ONE OUTREACH ATTEMPT, AND THE CRM PROMPTS ALL THREE ───────────
// A rung is an outreach attempt, NOT a property visit. Scheduling the next rung is
// how the locator says "I'll reach out again on this date" — it never implies
// another tour. WORKFLOW_PROMPT_OWNER records the whole ladder as `tour_follow_up:
// "crm"`: all three rungs open the CRM's contextual outcome modal, which is the one
// place an outcome is recorded and the next rung is dated.
//
// The Companion still opens the SMS composer with that rung's approved template and
// hands off to the CRM tab. What it must NOT do is run its own send/confirm sheet
// for a rung: that would complete the row with no chance to choose the next date,
// and it is the duplicate confirmation this ladder deliberately does not have.
//
// Only rung 1 describes the visit, so only rung 1 may write lead_tours.status and
// outcome. Rungs 2 and 3 are later conversations about a tour already recorded, and
// rewriting its history from them would destroy the original answer.

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

/**
 * The question the CRM outcome modal asks AT THIS RUNG. The outcome choices are the
 * same at every rung — a client who becomes ready on the 2nd attempt must still be
 * able to go straight to Ready to Apply — but asking "how did the tour go?" on the
 * 3rd attempt would be asking about a visit that was already reported on the 1st.
 */
const LADDER_QUESTION: Record<TourFollowUpKey, string> = {
  tour_follow_up: "How did the tour go?",
  tour_follow_up_2: "Have they made a decision about the apartment?",
  tour_follow_up_3: "Are they still considering the apartment?",
};

export function tourFollowUpQuestion(key: TourFollowUpKey): string {
  return LADDER_QUESTION[key];
}

/**
 * The rung that follows this one once it is completed, or null at the end of the
 * ladder. Position-based, so it answers "is there a next attempt to schedule?"
 * without consulting the rows — which is what the modal needs BEFORE it offers a
 * date. There is no 4th rung: Pause Search is a separate workflow, and offering a
 * date for a step that does not exist would promise something nothing creates.
 */
export function rungAfter(key: TourFollowUpKey): TourFollowUpKey | null {
  const i = TOUR_FOLLOW_UP_LADDER.indexOf(key);
  return TOUR_FOLLOW_UP_LADDER[i + 1] ?? null;
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
