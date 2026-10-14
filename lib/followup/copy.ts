// Follow-Up Agent — Phase 1 APPROVED COPY accessors (content only; no timing).
//
// SINGLE SOURCE OF TRUTH: every default string lives in companion-shared
// (DEFAULT_FOLLOW_UP_TEMPLATES) so the editor, the override system and the engine
// all read the same canonical, editable text. This module only re-exports those
// under the engine's stable names and owns the ONE piece of rendering logic that
// is not a flat template: New-Lead Text 1's graceful search-context composition.

import { DEFAULT_FOLLOW_UP_TEMPLATES, renderTemplate } from "@bc/companion-shared"
import { formatPropertyTypeDisplay } from "@/lib/leads/propertyTypeDisplay"
import type { LeadSnapshot } from "./types"

// ── NEW-LEAD initial double-text ──────────────────────────────────────────────
//
// Text 1 is an editable template `new_lead_text1` that carries a SYSTEM token
// {search_tail}. The locator edits the greeting / "I got your form" wording; the
// engine composes {search_tail} — the conditional search clause AND its ending
// punctuation — so the search context is gracefully OMITTED when unknown and can
// never render "a  move". This is the only place that logic lives.

/**
 * The renter's bedroom preference, as a person would say it.
 *
 *   "1" → "1 bed"      "2" → "2 bed"      "3+" → "3+ bed"      "Studio" → "studio"
 *
 * A plus sign is part of what the renter actually selected ("3+ Bedrooms" is a real option
 * in BED_OPTIONS), so it is kept. "bed", not "bedroom" and never "1-bedroom": this is a text
 * message, and the hyphenated form reads like a listing.
 *
 * Returns "" when nothing usable is stored — a count is NEVER invented.
 */
export function bedsLabel(beds: string | null | undefined): string {
  const b = (beds ?? "").trim().toLowerCase()
  if (!b) return ""
  if (b === "studio" || b === "0") return "studio"
  // Tolerant of every shape the column has held — "2", "2 bedrooms", "3+", "3+ Bedrooms".
  const m = /^(\d+)\s*(\+?)/.exec(b)
  if (!m) return ""
  if (m[1] === "0") return "studio"
  return `${m[1]}${m[2]} bed`
}

/**
 * The renter's property type, as a person would say it.
 *
 * Reuses the CANONICAL map (formatPropertyTypeDisplay) rather than restating it — a second
 * table would drift the moment someone added a type to one of them. Two message-specific
 * adjustments sit on top of it, and neither changes what that map returns to anyone else:
 *
 *   • hyphens are removed, so "High-Rise" reads "high rise" rather than "high-rise";
 *   • "Open to All" (which the map renders "apartment search") yields "", because it is the
 *     ABSENCE of a chosen type — "a 1 bed apartment search move" is not a sentence.
 *
 * "Studio" also yields "" here: it is a bedroom count in this sentence, not a type, and
 * bedsLabel has already said it. That is what stops "a studio apartment move".
 */
export function propertyTypeLabel(propertyType: string | null | undefined): string {
  const raw = (propertyType ?? "").trim()
  if (!raw || raw === "Open to All" || raw.toLowerCase() === "studio") return ""
  return formatPropertyTypeDisplay(raw).replace(/-/g, " ").replace(/\s+/g, " ").trim()
}

/**
 * "1 bed high rise" / "2 bed apartment" / "studio" / "1 bed" / "".
 *
 * Studio collapses to one word: the renter chose a layout, not a layout AND a type, and
 * "studio apartment" in this sentence reads like the form echoing itself back.
 */
export function searchPhrase(lead: LeadSnapshot): string {
  const type = propertyTypeLabel(lead.propertyType)
  // "Studio" lives in the property-type dropdown, so a studio lead may carry it there with
  // no bedroom value at all.
  const beds = bedsLabel(lead.beds) || ((lead.propertyType ?? "").trim().toLowerCase() === "studio" ? "studio" : "")
  if (beds === "studio") return "studio"
  return [beds, type].filter(Boolean).join(" ")
}

/** "a" or "an", chosen from the phrase that follows, so no path can emit "a apartment". */
function article(phrase: string): string {
  return /^[aeiou]/i.test(phrase) ? "an" : "a"
}

/**
 * The engine-composed {search_tail}.
 *
 *   phrase + month  →  " for a 1 bed high rise move in October."
 *   phrase only     →  " for a 1 bed apartment."
 *   neither         →  "!"
 *
 * NO PHRASE MEANS NO CLAUSE, even when the month is known: " for a move in October" names
 * nothing the renter asked for and reads like a bug, which is exactly what it would be.
 * The month alone is not worth a sentence.
 */
function computeSearchTail(lead: LeadSnapshot): string {
  const phrase = searchPhrase(lead)
  const month = (lead.moveMonthLabel || "").trim()
  if (!phrase) return "!"
  const noun = month ? `${phrase} move in ${month}` : phrase
  return ` for ${article(phrase)} ${noun}.`
}

/**
 * Render New-Lead Text 1 from the canonical (or overridden) template, filling the
 * name tokens and the engine-composed {search_tail}. Default output:
 *   full:  "Hey Sarah it's Jay! I got your form for a 1 bed apartment move in October."
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

/**
 * New-Lead Text 1 when the locator MANUALLY restarts an Out-of-Office lead.
 *
 * Same sequence, same step, same timing — only the opening sentence differs. The
 * standard copy says "I got your form!", which is true of a lead that arrived
 * minutes ago and absurd for one that has been waiting a week while the locator
 * was away. This names the gap instead of pretending it isn't there.
 *
 * Deliberately NOT in DEFAULT_FOLLOW_UP_TEMPLATES: that catalogue is the
 * agent-editable template set, with token lists, char limits and an editor UI
 * behind it. This is a system variant chosen by lead state, not something a
 * locator picks, so adding it there would imply an editability it does not have.
 *
 * {search_tail} is deliberately absent: the client's beds/move month are stale
 * context by now, and leading with them would read like a form echo rather than a
 * person returning to their request.
 */
export function renderOooRestartText1(lead: LeadSnapshot): string {
  const first = (lead.firstName || "").trim()
  const agent = (lead.agentFirstName || "").trim()
  // Mirrors renderNewLeadText1's graceful degradation: a missing agent name must
  // never leave "Hey Sarah, it's !" on a client's screen.
  const opener = first && agent ? `Hey ${first}, it's ${agent}!` : first ? `Hey ${first}!` : "Hey!"
  return `${opener} I'm back in the office and following up on your apartment request.`
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

// POST-TOUR + APPLICATION (approved). One Post-Tour message per tour DAY: the
// single-tour vs multiple-tour copy is chosen at send time from the day's count.
export const POST_TOUR = DEFAULT_FOLLOW_UP_TEMPLATES.post_tour // single tour
export const POST_TOUR_MULTI = DEFAULT_FOLLOW_UP_TEMPLATES.post_tour_multi // 2+ tours same day
export const APPLICATION_STATUS = DEFAULT_FOLLOW_UP_TEMPLATES.application_status

// RESUME SEARCH (event-triggered). Uses {first_name}. NOTE: no dispatcher sends
// this yet — the wording lives here so the registered sequence can resolve a body
// once a real automated sender exists.
export const RESUME_SEARCH = DEFAULT_FOLLOW_UP_TEMPLATES.resume_search // uses {first_name}
