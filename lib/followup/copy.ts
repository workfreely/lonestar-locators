// Follow-Up Agent — Phase 1 APPROVED COPY (content only; no timing/logic).
//
// PROVENANCE:
//  - EXISTING approved defaults are re-used from companion-shared
//    (DEFAULT_FOLLOW_UP_TEMPLATES) — never re-typed here, so the one canonical
//    home stays authoritative.
//  - NEW / LOCKED strings the locator explicitly approved in this checkpoint are
//    defined here verbatim. LOCKED / PROVEN COPY must NOT be reworded.
//
// A later checkpoint may migrate the NEW strings into companion-shared with editor
// + override support; kept here for now to keep Phase 1 self-contained.

import { DEFAULT_FOLLOW_UP_TEMPLATES } from "@bc/companion-shared"
import type { LeadSnapshot } from "./types"

// ── NEW-LEAD initial double-text (split from the existing single `intro`) ──────
//
// Text 1 re-uses the existing form-context greeting concept but WITHOUT the
// location question. Rendered robustly so missing beds/type/move never produces
// awkward output ("a  move", double spaces) — a rendering-robustness fix, not a
// wording change. Text 2 is the location question, verbatim from the existing
// intro's tail.

/** Derive the beds/type phrase the existing intro used ("1 bedroom" / "studio" /
 *  "high-rise"), or "" when unknown — mirrors the legacy conflation but omitted
 *  cleanly when absent. */
function bedsPhrase(lead: LeadSnapshot): string {
  const t = (lead.propertyType || "").toLowerCase()
  if (t === "high-rise") return "high-rise"
  const b = (lead.beds || "").trim().toLowerCase()
  if (!b) return ""
  if (b === "studio" || b === "0") return "studio"
  return `${b} bedroom`
}

/** Text 1 — greeting + form context, gracefully omitting unknown pieces. */
export function renderNewLeadText1(lead: LeadSnapshot): string {
  const first = (lead.firstName || "").trim()
  const agent = (lead.agentFirstName || "").trim()
  const hi = first ? `Hey ${first}` : "Hey"
  const intro = agent ? `${hi} it's ${agent}!` : `${hi}!`
  const phrase = bedsPhrase(lead)
  const month = (lead.moveMonthLabel || "").trim()
  // Build the "I got your form for a <phrase> move[ in <Month>]" tail, dropping
  // any unknown component so there is never an empty slot or double space.
  const moveBits = [phrase, "move"].filter(Boolean).join(" ")
  const monthSuffix = month ? ` in ${month}` : ""
  const tail = phrase || month ? ` I got your form for a ${moveBits}${monthSuffix}.` : ` I got your form!`
  return `${intro}${tail}`
}

/** Text 2 — the location question (LOCKED). Sent ~30–45s after Text 1. */
export const NEW_LEAD_TEXT2 =
  "Are you trying to stay near a specific address or side of town?"

// ── NEW-LEAD contact-chase (EXISTING approved copy, re-used verbatim) ─────────
export const CONTACT_FOLLOW_UP_1 = DEFAULT_FOLLOW_UP_TEMPLATES.contact_follow_up_1 // uses {first_name}
export const CONTACT_FOLLOW_UP_2 = DEFAULT_FOLLOW_UP_TEMPLATES.contact_follow_up_2
export const CONTACT_FOLLOW_UP_3 = DEFAULT_FOLLOW_UP_TEMPLATES.contact_follow_up_3

// ── LIST-SENT ladder (EXISTING FU1/FU2 re-used; FU3 + final are LOCKED here) ───
export const LIST_FU1 = DEFAULT_FOLLOW_UP_TEMPLATES.follow_up_1
export const LIST_FU2 = DEFAULT_FOLLOW_UP_TEMPLATES.follow_up_2

// LOCKED / PROVEN re-engagement copy — do NOT optimize. Conditional on favorites.
export const LIST_FU3_WITH_FAVORITES =
  "I'm calling the communities you were interested in to get updated pricing and specials. Are you still looking to move?"
export const LIST_FU3_NO_FAVORITES =
  "I'm calling communities on your list to get updated pricing and specials. Are you still looking to move?"

/** Pick the LOCKED FU3 variant from CURRENT favorites (checked at send time). */
export function listFu3(favoritedCount: number): string {
  return favoritedCount > 0 ? LIST_FU3_WITH_FAVORITES : LIST_FU3_NO_FAVORITES
}

// LOCKED final/pause language (no client name), shared by appropriate endings.
export const FINAL_PAUSE =
  "I haven't heard back so I'll pause your search for now. No rush, just let me know when you'd like me to pick it back up."

// ── DONE-SELECTING branches (LOCKED, after the 10-min grace + final state check) ─
export const DONE_SELECTING_A_AVAILABILITY_SUBMITTED =
  "Those are excellent options! I noted those as your favorites. I'll get back to you once I have the tour confirmations."
export const DONE_SELECTING_B_NEEDS_AVAILABILITY =
  "Those are excellent options! I noted those as your favorites. When you get a chance, can you select your availability to tour on the recommendations page?"
export const DONE_SELECTING_C_FAR_OUT =
  "Those are excellent options! I noted those as your favorites. Would you like me to set up a tour now or wait until you're closer to your move date?"
// Sent only after the client (in Branch C) chooses to WAIT.
export const FUTURE_MOVE_WAIT_CONFIRM =
  "Perfect! Let's keep in touch. I'll reach back out about 90 days before your move date so we can get everything set up."

// The reactivation message sent at the reactivation date (default move − 90 days,
// or the client's explicit instruction). LOCKED. Uses {first_name} deliberately —
// the conversation may have been inactive for months, so re-identifying is natural.
export const FUTURE_MOVE_REACTIVATE =
  "Hey {first_name}! Hope you're doing well. We're getting closer to your move date. When would you like me to get the tours set up for your favorites?"

// ── POST-TOUR (LOCKED) ────────────────────────────────────────────────────────
export const POST_TOUR = "How did the tour go? Hopefully everything went well"

// ── APPLICATION-STATUS (approved) ─────────────────────────────────────────────
export const APPLICATION_STATUS = "Have you heard anything back on your application yet?"
