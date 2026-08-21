// Beast Voice — the phrase library.
//
// The ONE place every supported utterance is declared. Patterns live here as
// data so the vocabulary can grow without touching the parser, the resolver, the
// UI, or any CRM workflow. Adding a phrasing means adding a row.
//
// Design rules:
//   • Deterministic. Ordinary regexes, no model, no scoring, no fuzzy intent.
//   • Anchored. Every pattern matches the WHOLE utterance, so "call Maria" can
//     never be mistaken for a bare "call" and a stray word can never turn a
//     command into a confirmation.
//   • Specific before general. "contact X by phone" is tried before "contact X",
//     so the method is never lost.
//   • Tolerant of speech, not of ambiguity. Optional wake word, punctuation,
//     casing, filler and first-vs-full name are absorbed; anything genuinely
//     unclear returns no match and executes nothing.

export type ContactMethod = "unspecified" | "call" | "text"

/** A contact phrasing. `re` must contain exactly one capture group: the client name. */
export type ContactPattern = {
  /** Stable id, logged so we learn which phrasings are actually used. */
  id: string
  method: ContactMethod
  re: RegExp
}

// ── contact_client ──────────────────────────────────────────────────────────
// All of these mean the same thing: begin the EXISTING first-contact workflow.
// `method` only says which branch of that workflow the locator already has in
// mind — it never implies a different workflow.
export const CONTACT_PATTERNS: ContactPattern[] = [
  // — method: call — ordered before the generic "contact X" so "by phone" wins.
  { id: "contact-by-phone", method: "call", re: /^contact\s+(.+?)\s+(?:by|on|via)\s+(?:the\s+)?(?:phone|call)$/ },
  { id: "give-a-call", method: "call", re: /^give\s+(.+?)\s+a\s+(?:call|ring)$/ },
  { id: "call", method: "call", re: /^(?:call|phone|ring)\s+(.+)$/ },

  // — method: text —
  { id: "contact-by-text", method: "text", re: /^contact\s+(.+?)\s+(?:by|via|with)\s+(?:a\s+)?(?:text|message|sms)$/ },
  { id: "send-a-text", method: "text", re: /^send\s+(.+?)\s+an?\s+(?:text|message|sms|text\s+message)$/ },
  { id: "text", method: "text", re: /^(?:text|message)\s+(.+)$/ },

  // — method: unspecified — the locator has not decided; the existing Call/Text
  //   chooser asks. "move X to contacted" is deliberately NOT a stage write:
  //   the Contact Gate owns what New → Contacted means.
  { id: "move-to-contacted", method: "unspecified", re: /^move\s+(.+?)\s+(?:to|into|2)\s+contact(?:ed|s|\s+it)?$/ },
  { id: "contact", method: "unspecified", re: /^contact\s+(.+)$/ },
]

// ── Contextual method responses ─────────────────────────────────────────────
// Bare "Call" / "Text" — an answer to the existing chooser, not a command. They
// carry no client because the active workflow already owns one, which is exactly
// why they must never execute without a prompt on screen: with nothing active,
// "Call" names nobody.
export const RESPOND_CALL_PATTERNS: RegExp[] = [
  /^(?:call|phone|ring)(?:\s+(?:her|him|them|it))?$/,
  /^(?:by\s+|on\s+the\s+)?phone$/,
  /^give\s+(?:her|him|them)\s+a\s+call$/,
  /^call\s+(?:her|him|them)\s+(?:instead|please)$/,
]

export const RESPOND_TEXT_PATTERNS: RegExp[] = [
  /^(?:text|message|sms)(?:\s+(?:her|him|them|it))?$/,
  /^send\s+(?:her|him|them)\s+an?\s+(?:text|message)$/,
  /^(?:send\s+)?an?\s+(?:text|message)$/,
]

// ── Contextual responses ────────────────────────────────────────────────────
// Answers to a question the EXISTING workflow is already asking. They carry no
// client and no method: they mean "the affirmative/negative button of whatever
// is on screen", so they can never invent an action of their own.
//
// Whole-utterance only. A response phrase buried in a longer sentence is not
// treated as an answer — that is the kind of guessing this must not do.
export const YES_PATTERNS: RegExp[] = [
  /^(?:yes|yeah|yep|yup|sure|correct|affirmative)$/,
  /^(?:yes\s*,?\s*)?i\s+(?:did|have)$/,
  /^(?:yes\s*,?\s*)?i\s+(?:reached|got|spoke\s+to|talked\s+to|contacted)\s+(?:her|him|them|it)$/,
  /^(?:yes\s*,?\s*)?i\s+(?:texted|messaged)\s+(?:her|him|them|it)$/,
  /^(?:yes\s*,?\s*)?(?:i\s+)?sent\s+(?:it|the\s+text|the\s+message)$/,
  /^yes\s*,?\s*(?:i\s+did|sent|contacted|reached\s+(?:her|him|them))$/,
]

export const NO_PATTERNS: RegExp[] = [
  /^(?:no|nope|nah|negative)$/,
  /^not\s+yet$/,
  /^(?:no\s*,?\s*)?i\s+(?:didn'?t|did\s+not|haven'?t)$/,
  /^(?:no\s*,?\s*)?(?:no\s+)?answer$/,
  /^(?:no\s*,?\s*)?(?:she|he|they|nobody|no\s+one)\s+didn'?t\s+answer$/,
  /^(?:no\s*,?\s*)?(?:she|he|they)\s+did\s+not\s+answer$/,
  /^(?:no\s*,?\s*)?didn'?t\s+answer$/,
  /^(?:no\s*,?\s*)?i\s+(?:couldn'?t|could\s+not|can'?t)\s+reach\s+(?:her|him|them)$/,
  /^(?:no\s*,?\s*)?no\s+response$/,
]

export const CANCEL_PATTERNS: RegExp[] = [
  /^(?:cancel|stop)\s+(?:it|that|this)$/,
  /^cancel(?:\s+that)?$/,
  /^never\s*mind$/,
  /^stop$/,
  /^forget\s+(?:it|about\s+it|that)$/,
  /^(?:no\s*,?\s*)?nothing$/,
]

// ── Utterance tolerances ────────────────────────────────────────────────────

/**
 * The wake word is OPTIONAL — pressing the mic already scopes the utterance, so
 * "contact Maria" works exactly like "Beast, contact Maria". Common mis-hearings
 * are accepted because the word carries no meaning: dropping it can only reveal
 * the command behind it, never change one.
 */
export const WAKE_WORD = /^(?:hey\s+|ok\s+|okay\s+)?(?:beast|beasts|beast's|feast|least|beat|bee)\b[\s,.]*/

/** Politeness the recognizer appends. Trimmed AFTER intent matching so a pattern
 *  never has to spell out every courtesy. */
export const TRAILING_FILLER = /\s+(?:please|now|for\s+me|thanks|thank\s+you|okay|ok)$/

/** Leading noun the locator may use for the client ("contact the client Maria"). */
export const LEADING_CLIENT_NOUN = /^(?:the\s+|my\s+)?(?:client|lead|customer)\s+/
