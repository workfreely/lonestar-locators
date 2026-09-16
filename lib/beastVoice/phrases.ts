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

// ═══════════════════════════════════════════════════════════════════════════
// BEAST VOICE V1 — INPUT-LAYER COMMAND VOCABULARY
//
// Everything below is NEW V1 grammar. It only ever names an EXISTING product
// action; nothing here implies a new workflow, stage, or business rule. Each
// family is data (patterns) so widening a phrasing never touches the parser.
//
// Whole-utterance anchored, deterministic, offline — identical discipline to the
// contact grammar above. Anything unmatched stays `unknown` and executes nothing.
// ═══════════════════════════════════════════════════════════════════════════

/** The verb families that carry a client target the resolver must look up. */

// ── Navigation (approved routes, §17) ───────────────────────────────────────
// Voice only router.push()es these; each destination page enforces its own
// auth/gating server-side, exactly as the manual menu links do.
export type NavTarget =
  | "profile"
  | "smart_lead_form"
  | "analytics"
  | "sales_goals"
  | "integrations"
  | "import_leads"
  | "billing"
  | "help"
  | "social_beast"
  | "referral_network"
  | "license_verification"

export type NavPattern = { id: NavTarget; re: RegExp }

// "open"/"show"/"pull up"/"go to" are all accepted openers; the target name is
// the discriminating part. Longer/more-specific names are listed first so
// "sales analytics" is never shadowed by a looser "analytics".
const OPEN = /^(?:open|show|pull\s+up|go\s+to|take\s+me\s+to|view)\s+/
export const NAV_PATTERNS: NavPattern[] = [
  { id: "smart_lead_form", re: /^(?:my\s+)?smart\s+lead\s+form$/ },
  { id: "sales_goals", re: /^sales\s+goals$/ },
  { id: "analytics", re: /^(?:sales\s+)?analytics$/ },
  { id: "integrations", re: /^integrations?$/ },
  { id: "import_leads", re: /^import(?:\s+leads?)?$/ },
  { id: "billing", re: /^billing$/ },
  { id: "help", re: /^(?:help(?:\s+center)?)$/ },
  { id: "social_beast", re: /^(?:beast\s+)?social(?:\s+beast)?$/ },
  { id: "referral_network", re: /^(?:beast\s+)?referral\s+network$/ },
  { id: "referral_network", re: /^referral\s+network$/ },
  { id: "license_verification", re: /^(?:license\s+verification|agent\s+licenses?)$/ },
  { id: "profile", re: /^(?:my\s+)?profile$/ },
]

// ── Workspace (Lead Board / Map, §13) ───────────────────────────────────────
export const BOARD_PATTERNS: RegExp[] = [/^lead\s+board$/, /^board$/, /^kanban$/]
export const MAP_PATTERNS: RegExp[] = [/^map$/, /^property\s+map$/, /^explorer$/]

// ── Focus (§16) ─────────────────────────────────────────────────────────────
export const FOCUS_ON_PATTERNS: RegExp[] = [/^focus(?:\s+mode)?$/, /^enter\s+focus(?:\s+mode)?$/, /^focus\s+on$/]
export const FOCUS_OFF_PATTERNS: RegExp[] = [/^exit\s+focus(?:\s+mode)?$/, /^leave\s+focus$/, /^focus\s+off$/, /^unfocus$/]

// ── Agenda (§15) — absolute where the target state is known, never a blind toggle. ──
export type AgendaOp = "open" | "close" | "expand" | "collapse" | "left" | "right"
export type AgendaPattern = { op: AgendaOp; re: RegExp }
export const AGENDA_PATTERNS: AgendaPattern[] = [
  // "move the agenda …" and the chain-friendly pronoun form "move it …".
  { op: "left", re: /^move\s+(?:the\s+agenda|it)\s+(?:to\s+the\s+)?left$/ },
  { op: "right", re: /^move\s+(?:the\s+agenda|it)\s+(?:to\s+the\s+)?right$/ },
  { op: "expand", re: /^expand\s+(?:the\s+)?agenda$/ },
  { op: "collapse", re: /^collapse\s+(?:the\s+)?agenda$/ },
  { op: "open", re: /^open\s+(?:the\s+)?agenda$/ },
  { op: "close", re: /^close\s+(?:the\s+)?agenda$/ },
]

// ── Theme (§18) — canonical ids only; validated again in the executor. ───────
export type ThemeName = "midnight" | "obsidian" | "rose" | "evergreen" | "purple"
export const THEME_PATTERNS: RegExp[] = [
  /^(?:set|change|use|switch)\s+(?:the\s+)?theme\s+(?:to\s+|=\s*)?(midnight|obsidian|rose|evergreen|purple)$/,
  /^(?:set|change|use)\s+(midnight|obsidian|rose|evergreen|purple)\s+theme$/,
  /^theme\s+(midnight|obsidian|rose|evergreen|purple)$/,
  /^(midnight|obsidian|rose|evergreen|purple)\s+theme$/,
]

// ── Add Lead (§14) — opens the EXISTING modal only, creates nothing. ─────────
export const ADD_LEAD_PATTERNS: RegExp[] = [/^add\s+lead$/, /^new\s+lead$/, /^create\s+lead$/, /^add\s+a\s+lead$/]

// ── Select / Open client (§19) — captures the spoken name in group 1. This is
//    the LAST-RESORT opener, tried only after every specific "open X" family
//    (nav, workspace, agenda, Ask Beast, CRM-owned flows). When no client
//    matches while the Map is open, the executor re-routes it to a market
//    attempt (see MARKET_PATTERNS). ──────────────────────────────────────────
export const SELECT_CLIENT_PATTERNS: RegExp[] = [
  /^(?:open|select|show|pull\s+up|go\s+to)\s+(.+)$/,
]

// ── Ask Beast (§36) — open/focus the existing panel only. ────────────────────
export const ASK_BEAST_PATTERNS: RegExp[] = [/^(?:open\s+)?ask\s+beast(?:\s+ai)?$/]

// ── Unleash the Beast (§1) ───────────────────────────────────────────────────
export const UNLEASH_PATTERNS: RegExp[] = [/^unleash(?:\s+(?:the\s+)?beast)?$/, /^release\s+the\s+beast$/]

// ── Market selection (§1) — captures the spoken market in group 1; the
//    executor validates it against the agent's service areas and does nothing
//    for an out-of-area market. Deliberately MARKET-ONLY verbs: "select X" is
//    NOT here because it collides with selecting a client — instead select_client
//    falls back to a market attempt when no client matches while the map is open,
//    so "Open map, select Dallas, unleash Beast" resolves Dallas as the market. ─
export const MARKET_PATTERNS: RegExp[] = [
  /^(?:switch\s+to|set\s+market\s+to|choose\s+market)\s+(.+)$/,
  /^market\s+(.+)$/,
]

// ── Copy (§8) — allow-listed fields only. group 1 (when present) = client name. ──
export type CopyField = "phone" | "email" | "address"
export type CopyTarget = "client" | "current_property"
export type CopyPattern = { field: CopyField; target: CopyTarget; re: RegExp; nameGroup: number | null }
// The "this …/current" forms are listed BEFORE the named forms so a phrase like
// "copy this client's phone" resolves to the current client (clientName null),
// not to a client literally named "this client".
export const COPY_PATTERNS: CopyPattern[] = [
  // Current property address — "this property/address".
  { field: "address", target: "current_property", nameGroup: null, re: /^copy\s+(?:this\s+)?(?:property(?:'s)?\s+)?address$/ },
  { field: "address", target: "current_property", nameGroup: null, re: /^copy\s+the\s+address$/ },
  // Client phone — "this client" first, then a named client.
  { field: "phone", target: "client", nameGroup: null, re: /^copy\s+(?:this\s+client'?s?\s+|this\s+|the\s+)?(?:phone(?:\s+number)?|number)$/ },
  { field: "phone", target: "client", nameGroup: 1, re: /^copy\s+(.+?)(?:'s)?\s+(?:phone(?:\s+number)?|number)$/ },
  // Client email — "this client" first, then a named client.
  { field: "email", target: "client", nameGroup: null, re: /^copy\s+(?:this\s+client'?s?\s+|this\s+|the\s+)?email(?:\s+address)?$/ },
  { field: "email", target: "client", nameGroup: 1, re: /^copy\s+(.+?)(?:'s)?\s+(?:email(?:\s+address)?)$/ },
]

// ── CRM-owned OPEN actions (§7, §24–§32) ─────────────────────────────────────
// Voice may OPEN these existing CRM-owned flows; the human completes them in the
// modal. Completion words on these ("mark commission paid") ALSO map here — a
// CRM-owned action is never completed by voice, only opened (§5, §30). The verb
// is the exact existing workflow-verb the Companion's open-* delegation uses.
//
// group `nameGroup` (when non-null) captures a client the resolver looks up;
// otherwise the currently selected client is the target.
export type CrmOpenVerb =
  | "open-check-application"
  | "open-apply"
  | "open-confirm-lease"
  | "open-guest-card"
  | "open-invoice-details"
  | "open-send-invoice"
  | "open-commission-paid"
  | "open-send-rebate"
  | "open-tour-follow-up"
export type CrmOpenPattern = { verb: CrmOpenVerb; re: RegExp; nameGroup: number | null }
export const CRM_OPEN_PATTERNS: CrmOpenPattern[] = [
  { verb: "open-check-application", nameGroup: 1, re: /^(?:open\s+|mark\s+)?check(?:\s+(.+?)(?:'s)?)?\s+application$/ },
  { verb: "open-check-application", nameGroup: null, re: /^(?:mark\s+)?application\s+checked$/ },
  { verb: "open-apply", nameGroup: null, re: /^(?:open\s+)?appl(?:y|ication)$/ },
  { verb: "open-confirm-lease", nameGroup: null, re: /^(?:open\s+)?confirm\s+lease$/ },
  { verb: "open-guest-card", nameGroup: null, re: /^(?:open\s+|send\s+)?guest\s+card$/ },
  { verb: "open-invoice-details", nameGroup: null, re: /^(?:open\s+)?invoice\s+details$/ },
  { verb: "open-send-invoice", nameGroup: null, re: /^send\s+invoice$/ },
  { verb: "open-commission-paid", nameGroup: null, re: /^(?:mark\s+)?commission\s+paid$/ },
  { verb: "open-send-rebate", nameGroup: null, re: /^send\s+rebate$/ },
  { verb: "open-tour-follow-up", nameGroup: null, re: /^(?:open\s+)?tour\s+follow[\s-]?up$/ },
]

// ── Edit client (§23) — opens the existing editor modal. ─────────────────────
export type EditClientPattern = { re: RegExp; nameGroup: number | null }
// The bare "edit client" / "open client editor" forms are listed BEFORE the
// named "edit X" so "edit client" targets the current client, not one named
// "client".
export const EDIT_CLIENT_PATTERNS: EditClientPattern[] = [
  { nameGroup: null, re: /^(?:edit\s+client|open\s+client\s+editor)$/ },
  { nameGroup: 1, re: /^edit\s+(.+)$/ },
]

// ── Property actions on the CURRENT property (§20–§22) ───────────────────────
// These are direct-write verbs the CRM already posts itself from the property
// card controls (no interactive prompt) — so voice posting the same verb is
// identical to the manual click. "this" resolves ONLY from a known current
// property; with none, the executor does nothing (§20, §44).
export type PropertyVerb =
  | "add-recommendation"
  | "add-favorite"
  | "move-to-favorite"
  | "move-to-recommendation"
  | "remove-recommendation"
export type PropertyPattern = { verb: PropertyVerb; re: RegExp }
export const PROPERTY_PATTERNS: PropertyPattern[] = [
  { verb: "remove-recommendation", re: /^remove\s+(?:this\s+)?(?:from\s+)?(?:the\s+)?recommendations?$/ },
  { verb: "remove-recommendation", re: /^remove\s+this\s+recommendation$/ },
  { verb: "move-to-favorite", re: /^(?:move\s+this\s+to|add\s+this\s+to)\s+favorites?$/ },
  { verb: "move-to-favorite", re: /^favorite\s+(?:this|it)$/ },
  { verb: "move-to-recommendation", re: /^move\s+this\s+to\s+recommendations?$/ },
  { verb: "add-recommendation", re: /^(?:recommend\s+(?:this|it)(?:\s+property)?|add\s+(?:this|it)\s+to\s+(?:the\s+)?recommendations?)$/ },
]

// ── Completion of COMPANION-OWNED workflow prompts (§2, §3, §33, §34, §35) ────
// These name an existing companion-owned confirmation (post-list follow-ups,
// contact-attempt chase, send list, build list, setup tour, schedule tour). The
// executor NEVER blind-posts their completion verb: it answers an on-screen CRM
// prompt if one is readable, and otherwise does nothing (their confirmation is
// owned by the Companion, not the CRM DOM). Parsed so usage is logged and so the
// distinction from "show"/"open" (§5) is enforced by a matched pattern.
export type CompletionTarget =
  | "post_list_follow_up"
  | "contact_follow_up"
  | "send_list"
  | "build_list"
  | "setup_tour"
  | "schedule_tour"
  | "generic"
export type CompletionPattern = { target: CompletionTarget; re: RegExp }
// Leading completion verbs a phrase may open with ("mark/complete/finish/done
// with …"). Kept as one fragment so every target shares the same opener set.
const DONE_PREFIX = "(?:mark\\s+|complete\\s+|finish\\s+|done\\s+with\\s+)?"
export const COMPLETION_PATTERNS: CompletionPattern[] = [
  { target: "contact_follow_up", re: new RegExp(`^${DONE_PREFIX}(?:the\\s+)?(?:2nd|second|3rd|third|final)\\s+contact\\s+attempt(?:\\s+(?:complete|done|finished))?$`) },
  { target: "post_list_follow_up", re: new RegExp(`^${DONE_PREFIX}(?:the\\s+)?(?:1st|first|2nd|second|3rd|third|final)\\s+follow[\\s-]?up(?:\\s+(?:complete|done|finished|is\\s+done))?$`) },
  { target: "post_list_follow_up", re: /^(?:1st|first|2nd|second|3rd|third|final)\s+follow[\s-]?up\s+(?:complete|done|finished|is\s+done)$/ },
  { target: "send_list", re: /^(?:complete\s+|finish\s+|mark\s+)?send\s+list(?:\s+(?:complete|done))?$/ },
  { target: "build_list", re: /^(?:complete|finish)\s+build\s+list$/ },
  { target: "setup_tour", re: /^(?:mark\s+|complete\s+)?setup\s+tour(?:\s+(?:complete|done))?$/ },
  { target: "schedule_tour", re: /^(?:mark\s+)?schedule(?:d)?\s+tour(?:\s+(?:complete|done))?$/ },
  // Bare completion ("mark this complete", "done", "finished") — no named target.
  { target: "generic", re: /^(?:mark\s+this\s+(?:complete|done)|complete\s+this|done|finished|mark\s+complete)$/ },
]

// ── Send List / Build List / Schedule Tour OPENERS (§33, §34, §35) ───────────
// "Send list" / "build list" / "schedule tour" as bare openers name companion-
// owned flows whose interactive step lives in the Companion. Parsed to their
// completion target so the executor applies the same conservative rule (answer a
// readable CRM prompt, else do nothing) rather than blind-posting.
export const SEND_LIST_OPEN_PATTERNS: RegExp[] = [/^send\s+list$/, /^send\s+(.+?)(?:'s)?\s+list$/]
export const BUILD_LIST_OPEN_PATTERNS: RegExp[] = [/^(?:start\s+)?build\s+list$/]
export const SCHEDULE_TOUR_OPEN_PATTERNS: RegExp[] = [/^(?:open\s+)?schedule\s+tour$/, /^open\s+tour\s+setup$/]

// ── Stop (§37) — distinct from Cancel. Terminates Voice listening / the chain,
//    reverses nothing. Cancel answers an existing dismiss when unambiguous. ────
export const STOP_PATTERNS: RegExp[] = [/^stop$/, /^stop\s+listening$/, /^that'?s\s+enough$/]

// ── Chain connectors (§38, §39) ──────────────────────────────────────────────
// Split ONE utterance into ordered segments. Applied to comma-PRESERVING text
// (before punctuation is normalized away), so a comma, "then", "and then", or a
// bare "and" all delimit steps. Only these explicit connectors split; a segment
// that then fails the grammar aborts the chain (§40.1) rather than guessing, so
// a stray "and" inside a name degrades safely instead of executing wrong.
export const CHAIN_SPLIT = /\s*,\s*(?:then\s+|and\s+then\s+|and\s+)?|\s+and\s+then\s+|\s+then\s+|\s+and\s+/

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
