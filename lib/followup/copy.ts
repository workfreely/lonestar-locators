// Follow-Up Agent — Phase 1 APPROVED COPY accessors (content only; no timing).
//
// SINGLE SOURCE OF TRUTH: every default string lives in companion-shared
// (DEFAULT_FOLLOW_UP_TEMPLATES) so the editor, the override system and the engine
// all read the same canonical, editable text. This module only re-exports those
// under the engine's stable names and owns the ONE piece of rendering logic that
// is not a flat template: New-Lead Text 1's graceful search-context composition.

import { DEFAULT_FOLLOW_UP_TEMPLATES, renderTemplate } from "@bc/companion-shared"
import type { LeadSnapshot } from "./types"

// ── NEW-LEAD initial double-text ──────────────────────────────────────────────
//
// Text 1 is an editable template `new_lead_text1` that carries a SYSTEM token
// {search_tail}. The locator edits the greeting / "I got your form" wording; the
// engine composes {search_tail} — the conditional search clause AND its ending
// punctuation — so the search context is gracefully OMITTED when unknown and can
// never render "a  move". This is the only place that logic lives.

/** Beds/property-type phrase ("1 bedroom" / "studio" / "high-rise"), or "". */
function bedsPhrase(lead: LeadSnapshot): string {
  const t = (lead.propertyType || "").toLowerCase()
  if (t === "high-rise") return "high-rise"
  const b = (lead.beds || "").trim().toLowerCase()
  if (!b) return ""
  if (b === "studio" || b === "0") return "studio"
  return `${b} bedroom`
}

/** The engine-composed {search_tail}: " for a <phrase> move[ in <Month>]." with any
 *  known search info, or "!" when neither beds/type nor move month is known. */
function computeSearchTail(lead: LeadSnapshot): string {
  const phrase = bedsPhrase(lead)
  const month = (lead.moveMonthLabel || "").trim()
  if (!phrase && !month) return "!"
  const noun = phrase ? (month ? `${phrase} move in ${month}` : `${phrase} move`) : `move in ${month}`
  return ` for a ${noun}.`
}

/**
 * Render New-Lead Text 1 from the canonical (or overridden) template, filling the
 * name tokens and the engine-composed {search_tail}. Default output:
 *   full:  "Hey Sarah it's Jay! I got your form for a 1 bedroom move in October."
 *   none:  "Hey Sarah it's Jay! I got your form!"
 */
export function renderNewLeadText1(lead: LeadSnapshot, override?: string | null): string {
  const tpl = override ?? DEFAULT_FOLLOW_UP_TEMPLATES.new_lead_text1
  const rendered = renderTemplate(tpl, {
    first_name: (lead.firstName || "").trim(),
    agent_first_name: (lead.agentFirstName || "").trim(),
    search_tail: computeSearchTail(lead),
  })
  // Graceful greeting cleanup for a missing name (production always supplies both,
  // but a name-less lead/agent must never leave "  it's !" artifacts): drop the
  // "it's" clause when the agent name is empty, then collapse any double space.
  return rendered
    .replace(/\s+it's\s+!/g, "!") // agent name empty → "Hey Sarah!" / "Hey!"
    .replace(/\s{2,}/g, " ") // first name empty → single space
    .trim()
}

// ── Canonical strings re-exported under the engine's stable names ─────────────
export const NEW_LEAD_TEXT2 = DEFAULT_FOLLOW_UP_TEMPLATES.new_lead_text2

// EXISTING approved copy re-used verbatim (unchanged legacy keys).
export const CONTACT_FOLLOW_UP_1 = DEFAULT_FOLLOW_UP_TEMPLATES.contact_follow_up_1 // uses {first_name}
export const CONTACT_FOLLOW_UP_2 = DEFAULT_FOLLOW_UP_TEMPLATES.contact_follow_up_2
export const CONTACT_FOLLOW_UP_3 = DEFAULT_FOLLOW_UP_TEMPLATES.contact_follow_up_3
export const LIST_FU1 = DEFAULT_FOLLOW_UP_TEMPLATES.follow_up_1
export const LIST_FU2 = DEFAULT_FOLLOW_UP_TEMPLATES.follow_up_2

// LOCKED / PROVEN copy — now canonical in companion-shared.
export const LIST_FU3_WITH_FAVORITES = DEFAULT_FOLLOW_UP_TEMPLATES.list_fu3_favorites
export const LIST_FU3_NO_FAVORITES = DEFAULT_FOLLOW_UP_TEMPLATES.list_fu3_no_favorites

/** Pick the LOCKED FU3 variant from CURRENT favorites (checked at send time). */
export function listFu3(favoritedCount: number): string {
  return favoritedCount > 0 ? LIST_FU3_WITH_FAVORITES : LIST_FU3_NO_FAVORITES
}

export const FINAL_PAUSE = DEFAULT_FOLLOW_UP_TEMPLATES.list_final

// DONE-SELECTING branches (LOCKED).
export const DONE_SELECTING_A_AVAILABILITY_SUBMITTED = DEFAULT_FOLLOW_UP_TEMPLATES.ds_availability_submitted
export const DONE_SELECTING_B_NEEDS_AVAILABILITY = DEFAULT_FOLLOW_UP_TEMPLATES.ds_needs_availability
export const DONE_SELECTING_C_FAR_OUT = DEFAULT_FOLLOW_UP_TEMPLATES.ds_tour_now_or_wait

// FUTURE-MOVE (LOCKED): the wait acknowledgment and the 90-day reactivation.
export const FUTURE_MOVE_WAIT_CONFIRM = DEFAULT_FOLLOW_UP_TEMPLATES.future_move_wait_ack
export const FUTURE_MOVE_REACTIVATE = DEFAULT_FOLLOW_UP_TEMPLATES.future_move_reactivate // uses {first_name}

// POST-TOUR + APPLICATION (approved).
export const POST_TOUR = DEFAULT_FOLLOW_UP_TEMPLATES.post_tour
export const APPLICATION_STATUS = DEFAULT_FOLLOW_UP_TEMPLATES.application_status

// RESUME SEARCH (event-triggered). Uses {first_name}. NOTE: no dispatcher sends
// this yet — the wording lives here so the registered sequence can resolve a body
// once a real automated sender exists.
export const RESUME_SEARCH = DEFAULT_FOLLOW_UP_TEMPLATES.resume_search // uses {first_name}
