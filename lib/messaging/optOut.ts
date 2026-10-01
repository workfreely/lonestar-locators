/**
 * EXPLICIT OPT-OUT — the one place a message is judged to be a "stop texting me".
 *
 * Why this is its own module: the New Lead opening pair deliberately ignores
 * ordinary replies, because Text 2 carries the location question and belongs with
 * Text 1. That design is only defensible if an EXPLICIT opt-out still stops it.
 * So this is the single carve-out in an otherwise reply-insensitive pair, and it
 * must mean the same thing everywhere it is asked.
 *
 * ── WHOLE MESSAGE ONLY, AND WHY THAT MATTERS ─────────────────────────────────
 * Three of the standard keywords — CANCEL, END, QUIT — are ordinary English
 * words. A substring test would read every one of these as an opt-out:
 *
 *   "can we cancel the 3pm tour?"        → wants to reschedule, not to leave
 *   "I'll be at the end of the street"   → directions
 *   "quit messing around, send the list" → enthusiasm
 *
 * Opting those clients out of all future texts would be a silent, unrecoverable
 * loss — nothing in the product tells a locator it happened. So the ENTIRE
 * message must be the keyword, which is also how carriers and the TCPA guidance
 * treat it. "STOP please" is accepted (trailing courtesy words are stripped only
 * when the remainder is punctuation); "please stop texting me" is NOT, and is
 * left for a human to read.
 *
 * That asymmetry is deliberate: a missed opt-out keyword is visible to the client
 * (they will say it again, or reply to the locator) whereas a false positive is
 * invisible to everyone.
 */

/**
 * The carrier-standard set. STOP/STOPALL/UNSUBSCRIBE/CANCEL/END/QUIT are the six
 * every US aggregator honours; OPTOUT and REVOKE are included because they appear
 * in the same published lists and cost nothing to accept.
 */
export const OPT_OUT_KEYWORDS: ReadonlySet<string> = new Set([
  "STOP",
  "STOPALL",
  "UNSUBSCRIBE",
  "CANCEL",
  "END",
  "QUIT",
  "OPTOUT",
  "REVOKE",
])

/**
 * Reduce a message to the token an opt-out test can compare.
 *
 * Strips surrounding whitespace and punctuation and upper-cases, so "stop.",
 * " STOP! ", and "**STOP**" all reduce to STOP. Internal spaces are collapsed
 * but NOT removed, which is what keeps "stop texting me" a two-word phrase that
 * fails the whole-message test rather than becoming "STOPTEXTINGME".
 *
 * "OPT OUT" and "OPT-OUT" are folded to OPTOUT, the one case where a space is
 * genuinely part of a single keyword.
 */
function normalizeForOptOut(body: string): string {
  const upper = (body ?? "").trim().toUpperCase()
  // Leading/trailing punctuation and quoting only — never interior.
  const stripped = upper.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "")
  const collapsed = stripped.replace(/\s+/g, " ")
  return collapsed === "OPT OUT" || collapsed === "OPT-OUT" ? "OPTOUT" : collapsed
}

/**
 * Is this message an explicit, unambiguous request to stop receiving texts?
 *
 * True ONLY when the whole message is a keyword — see the module note above for
 * why a substring match is not acceptable here.
 */
export function isOptOutMessage(body: string | null | undefined): boolean {
  if (!body) return false
  return OPT_OUT_KEYWORDS.has(normalizeForOptOut(body))
}

/**
 * The keyword that matched, for the audit trail — null when none did.
 * Callers record this as the stop_reason detail so a cancelled sequence can be
 * explained to a locator later ("client replied STOP").
 */
export function optOutKeyword(body: string | null | undefined): string | null {
  if (!body) return null
  const token = normalizeForOptOut(body)
  return OPT_OUT_KEYWORDS.has(token) ? token : null
}
