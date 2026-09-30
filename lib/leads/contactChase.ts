// The PRE-LIST contact chase, as one definition.
//
// The chase is the sequence used while we are still trying to reach a lead for the
// first time: Contact Lead → 2nd → 3rd → Final Contact Attempt. It is finished the
// moment the lead progresses into Searching, and is COMPLETELY separate from the
// post-list follow-up ladder (follow_up_1/2/3 + final_follow_up) that begins when
// the list is actually sent.
//
// Those two ladders share no keys and no titles — getNextFollowUpAction switches on
// "FU1"/"FU2"/"FU3" while getNextContactFollowUpAction switches on "Contact FU1"/
// "Contact FU2" — and follow_up_1 is created by the → list_sent TRANSITION, not by
// anything in the chase. So retiring the chase cannot affect the later sequence.
//
// This module exists so the keys live in ONE place: they are used by the stage
// transition (retire the chase) and by contactWorkflow (supersede it when the lead
// is reached mid-chase). Two hand-maintained copies would drift.

/** The three chase FOLLOW-UPS. Superseded when a lead is reached mid-chase. */
export const CONTACT_CHASE_FOLLOW_UP_KEYS = [
  "contact_follow_up_1",
  "contact_follow_up_2",
  "contact_follow_up_3",
] as const

/**
 * The WHOLE chase, including the opening Contact Lead action.
 *
 * contact_lead is included here but NOT in the mid-chase set above: being reached
 * mid-chase leaves the lead in Contacted, where contact_lead may still be a
 * meaningful open item, whereas progressing to Searching retires the entire
 * sequence. It is also the key that had accumulated most in production — two
 * CLOSED leads were still carrying an open "Contact Lead".
 */
export const CONTACT_CHASE_ACTION_KEYS: readonly string[] = [
  "contact_lead",
  ...CONTACT_CHASE_FOLLOW_UP_KEYS,
]

/**
 * Stages at or beyond Searching — the point where the chase is over.
 *
 * Deliberately an explicit list of PROGRESSION stages, not "every stage except new
 * and contacted":
 *   • `archived` is excluded — it is not progress, and rankLeadActions already
 *     returns an inert sentinel for archived leads, so nothing surfaces anyway.
 *   • On Hold is not a stage at all (held_at / hold_follow_up_at columns; crm_status
 *     is preserved), so it can never reach this set.
 */
export const STAGES_PAST_CONTACT_CHASE: ReadonlySet<string> = new Set([
  "searching",
  "list_sent",
  "ready_to_tour",
  "done_touring",
  "applied",
  "closed",
])
