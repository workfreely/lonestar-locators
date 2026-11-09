// Comments — Automated Lead Capture: the KEYWORD MATCHER.
//
// Deterministic and pure. No AI, no network, no database — matching a comment is a decision we
// must be able to reproduce exactly, because the same comment may be evaluated more than once (a
// poll overlap, a retry, a replay while debugging) and every evaluation has to reach the same
// answer. A model call here would make that impossible and cost money per comment.
//
// ── WHAT "MATCHES" MEANS ────────────────────────────────────────────────────────────────────
// Case-insensitive, punctuation-tolerant, WHOLE word or WHOLE phrase. Three rules decide it:
//
//   1. Case is irrelevant.            LIST · list · List · LiSt all match.
//   2. Punctuation and emoji are separators, not characters. "LIST!", "list?", "LIST 🔑" match.
//   3. Only complete tokens count.    "monkey" must NOT match KEY, "homes" must NOT match HOME,
//                                     "listen" must NOT match LIST.
//
// Rule 3 is the one that matters most. A substring match would DM someone who wrote "I listen to
// this on repeat", and an unsolicited DM is the single worst failure this feature can produce.
//
// ── PRECEDENCE IS DETERMINISTIC, NOT "FIRST FOUND" ──────────────────────────────────────────
// A comment can contain several keywords ("more info on the list"). Exactly ONE rule fires, chosen
// by a total order that never depends on iteration order or on where in the sentence a word sits:
//
//   a. Longest keyword by token count, then by character length. A multi-word phrase beats a
//      single word, so "CONTACT ME" wins over a comment that also contains "ME"-like tokens, and
//      an explicit property keyword is never shadowed by a generic one.
//   b. Ties break on the keyword's declared index below — a fixed, reviewable order.
//
// The property keywords are declared before the general-interest ones for exactly that reason: a
// comment saying "more info on townhomes" is a TOWN lead, not a generic MORE lead.

/** A keyword the automation recognises, and what it tells us about the commenter's interest. */
export type CommentKeyword = {
  /** Canonical, uppercase. Stored on the comment row and carried into the lead form's utm_content. */
  keyword: string
  /**
   * The property type this keyword implies, or null for general interest.
   *
   * CARRIED, NOT APPLIED. The Smart Lead Form does not prefill property type from a URL today, so
   * this travels as attribution (utm_content) and is visible on the lead rather than pre-selecting
   * a field. Prefill is a separate, deferred decision — see the Phase 1 report.
   */
  propertyType: string | null
}

/**
 * The approved keyword set. ORDER IS MEANINGFUL — it is the tie-breaker in rule (b) above.
 *
 * WHAT is excluded: ambiguous single words that appear constantly in ordinary praise. "WHAT" was
 * explicitly ruled out. "ME" is not a keyword on its own and only ever matches inside the
 * "CONTACT ME" phrase.
 */
export const COMMENT_KEYWORDS: readonly CommentKeyword[] = [
  // Property keywords first: they say what someone is looking for, so they outrank general interest.
  { keyword: "LIST", propertyType: "Apartment" },
  // USA — a CAMPAIGN keyword, not a property type, asked for by the Military Special template's
  // caption. It sits in this group because the lead it produces is an apartment lead like LIST's,
  // and `utm_content=USA` is what keeps the campaign distinguishable on the lead itself.
  //
  // "USA 🇺🇸" matches: tokenize treats the flag as a separator, so the comment reduces to ["USA"].
  // Whole-token matching is what makes this safe — no English word tokenises to USA, so ordinary
  // praise cannot trigger it. Two things deliberately do NOT match, because the matcher is
  // token-based and nothing here weakens that: "U.S.A." (three tokens) and a flag-only comment
  // (no tokens at all).
  //
  // PRECEDENCE, stated so it is not a surprise: a comment containing BOTH ("USA send the list")
  // resolves to LIST, because equal token counts break on character length and LIST is longer.
  // Declaring USA earlier would not change that — length is compared before the declared index.
  // Both are apartment leads, so the outcome is a correctly captured lead either way.
  { keyword: "USA", propertyType: "Apartment" },
  { keyword: "TOWN", propertyType: "Townhome" },
  { keyword: "LOFT", propertyType: "Loft" },
  { keyword: "RISE", propertyType: "High-Rise" },
  { keyword: "HOME", propertyType: "Rental Home" },
  { keyword: "KEY", propertyType: "Penthouse" },
  // General interest: someone is asking, but has not said what for.
  { keyword: "CONTACT ME", propertyType: null },
  { keyword: "INTERESTED", propertyType: null },
  { keyword: "LOCATION", propertyType: null },
  { keyword: "DETAILS", propertyType: null },
  { keyword: "MESSAGE", propertyType: null },
  { keyword: "INFO", propertyType: null },
  { keyword: "MORE", propertyType: null },
  { keyword: "WHERE", propertyType: null },
] as const

/**
 * Reduce a comment to uppercase tokens.
 *
 * Everything that is not a letter or a digit becomes a boundary, which is what makes the matcher
 * punctuation- and emoji-tolerant without a list of punctuation to maintain: "LIST!!", "list…",
 * "🔑KEY🔑" and "list/town" all tokenise cleanly.
 *
 * \p{L} rather than A-Z deliberately: an accented or non-Latin comment tokenises correctly instead
 * of shattering into fragments that could collide with a keyword.
 */
export function tokenize(text: string | null | undefined): string[] {
  return (text ?? "")
    .toUpperCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
}

/** Token count of a keyword — "CONTACT ME" is 2, "LIST" is 1. Used by the precedence order. */
const keywordTokens = (k: string): string[] => k.toUpperCase().split(/\s+/).filter(Boolean)

/** Does `tokens` contain `phrase`'s tokens consecutively, as whole tokens? */
function containsPhrase(tokens: string[], phrase: string[]): boolean {
  if (phrase.length === 0 || tokens.length < phrase.length) return false
  for (let i = 0; i <= tokens.length - phrase.length; i++) {
    let hit = true
    for (let j = 0; j < phrase.length; j++) {
      if (tokens[i + j] !== phrase[j]) { hit = false; break }
    }
    if (hit) return true
  }
  return false
}

/**
 * Every keyword present in the comment, in PRECEDENCE order (the winner first).
 *
 * Exported alongside the single-match helper because the Inbox shows what else was present when a
 * comment matched more than one rule — a reviewer should be able to see why a given rule won
 * rather than take the matcher's word for it.
 */
export function matchingKeywords(text: string | null | undefined): CommentKeyword[] {
  const tokens = tokenize(text)
  if (tokens.length === 0) return []
  return COMMENT_KEYWORDS
    .map((k, index) => ({ k, index, phrase: keywordTokens(k.keyword) }))
    .filter(({ phrase }) => containsPhrase(tokens, phrase))
    .sort((a, b) =>
      b.phrase.length - a.phrase.length ||            // more tokens wins ("CONTACT ME" over "MORE")
      b.k.keyword.length - a.k.keyword.length ||      // then longer text
      a.index - b.index)                              // then the declared order, which is fixed
    .map(({ k }) => k)
}

/**
 * The ONE keyword that fires for this comment, or null.
 *
 * Total and deterministic: the same comment always yields the same keyword, on every evaluation,
 * in any process, for ever. That is what lets a retry be safe.
 */
export function matchComment(text: string | null | undefined): CommentKeyword | null {
  return matchingKeywords(text)[0] ?? null
}

/**
 * Pick one reply variation for a comment, deterministically.
 *
 * NOT random. A retry must choose the SAME variation it chose the first time, or the action ledger
 * stops describing what was actually sent. Hashing the provider's own comment id gives a stable
 * spread across variations without any stored cursor.
 */
export function pickVariant<T>(variants: readonly T[], externalCommentId: string): T | null {
  if (variants.length === 0) return null
  let h = 0
  for (let i = 0; i < externalCommentId.length; i++) {
    h = (h * 31 + externalCommentId.charCodeAt(i)) >>> 0
  }
  return variants[h % variants.length]
}

/**
 * The branded Smart Lead Form link a DM carries.
 *
 * REUSES THE EXISTING FORM AND ITS EXISTING ATTRIBUTION. /{username}/ig is the clean branded link
 * that already resolves utm_source=instagram server-side (smart-lead-form/_lib/shareConfig), and
 * collectLeadAttribution already persists utm_medium/campaign/content/term onto the lead. Nothing
 * about the form, the submit route or the CRM changes to support this — the comment keyword simply
 * arrives as attribution.
 */
export function leadFormLink(input: {
  origin: string
  username: string
  platformSlug: string
  keyword: string
  mediaId?: string | null
}): string {
  const u = new URL(`/${encodeURIComponent(input.username)}/${encodeURIComponent(input.platformSlug)}`, input.origin)
  u.searchParams.set("utm_medium", "comment")
  u.searchParams.set("utm_campaign", "comment_automation")
  u.searchParams.set("utm_content", input.keyword)
  if (input.mediaId) u.searchParams.set("utm_term", input.mediaId)
  return u.toString()
}

/**
 * The approved private message. EXACT WORDING — never reword, expand or append to the sentence.
 *
 * The branded lead-form link is appended by the caller as a SEPARATE paragraph (see
 * commentRunner), not spliced into the sentence, so the copy and the URL can each be reviewed on
 * their own and neither can silently change the other.
 */
export const APPROVED_DM_BODY =
  "I got you! Fill out this quick form. I’ll send over your best options! 🔑"

/**
 * Per-keyword private messages, for campaigns whose offer the general message cannot describe.
 *
 * ADDITIVE BY CONSTRUCTION. A keyword absent from this map gets APPROVED_DM_BODY, so the thirteen
 * keywords that existed before this map — and every keyword added later — are unaffected by it.
 * That is the whole reason it is a lookup with a fallback rather than a branch in the runner.
 *
 * The same rules still apply to anything in here as to the general message: it is the EXACT
 * wording, the branded lead-form link is appended by the caller as a SEPARATE paragraph and never
 * spliced into the sentence, and it must not claim anything the platform has not accepted.
 */
export const KEYWORD_DM_BODY: Record<string, string> = {
  // The Military Special campaign. Names the offer the commenter actually responded to, which the
  // general message cannot — and thanks them for their service, which is the whole reason this
  // keyword is not just LIST.
  USA: "Thank you for your service! 🇺🇸 Fill out this quick form and I’ll send over the best military specials in San Antonio! 🔑",
}

/**
 * The private message for a keyword — its own, or the general approved one.
 *
 * Uppercased before lookup so it cannot miss on casing: COMMENT_KEYWORDS stores canonical
 * uppercase, but a caller passing through a provider's value should not have to know that.
 */
export function dmBodyForKeyword(keyword: string | null | undefined): string {
  return KEYWORD_DM_BODY[String(keyword ?? "").trim().toUpperCase()] ?? APPROVED_DM_BODY
}

/**
 * The approved public reply used when a DM was NOT sent — because messaging is not authorised, or
 * because the commenter has no stable id to dedupe on.
 *
 * It must never claim a DM. The DM-claiming variations in the reply bank are only ever used after
 * the platform has ACCEPTED the message; this one is the truthful alternative.
 */
export const APPROVED_PUBLIC_FALLBACK =
  "Hey! 😊 I’d love to help! Check the link in my bio to get started. 🏡"
