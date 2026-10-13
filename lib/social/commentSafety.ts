// Comments — Automated Lead Capture: WHAT MAY BE ANSWERED AUTOMATICALLY.
//
// Deterministic and pure. No model call: screening a stranger's comment must be reproducible, free
// and reviewable, and a model would make it none of those. Everything here is a list or a clock.
//
// ── THE POSTURE ─────────────────────────────────────────────────────────────────────────────
// Three outcomes, and only one of them sends anything:
//
//   process — ordinary comment, clearly in scope
//   skip    — deliberately ignored, for ever (our own comment, too old, already handled)
//   hold    — a HUMAN should look. Not a failure and not a refusal: the comment is surfaced in the
//             Inbox and nothing automatic happens to it.
//
// Ambiguity resolves to `hold`, never to `process`. The cost of holding is that Jay reads a comment
// himself; the cost of processing wrongly is an automated sales pitch under someone's complaint, or
// a DM to somebody who was being hostile. Those are not symmetric.

export type ScreenOutcome = "process" | "skip" | "hold"

export type ScreenReason =
  | "ok"
  | "own_account"
  | "before_activation"
  | "too_old"
  | "already_processed"
  | "spam_or_promo"
  | "hostile"
  | "negative_context"
  | "nested_reply"

export type ScreenResult = { outcome: ScreenOutcome; reason: ScreenReason }

/** How old a comment may be and still be answered automatically. One day, conservatively. */
export const DEFAULT_MAX_COMMENT_AGE_MINUTES = 24 * 60

/**
 * How long before the same person may receive another automatic PUBLIC acknowledgment.
 *
 * Separate from the DM rule, which is once per person for ever. A public reply is lighter, so a
 * regular commenter is not silenced permanently — but acknowledging the same person under three
 * posts in an afternoon reads as a bot, so a day is the floor.
 */
export const DEFAULT_PUBLIC_REPLY_COOLDOWN_MINUTES = 24 * 60

const minutesBetween = (fromIso: string, toMs: number): number =>
  (toMs - new Date(fromIso).getTime()) / 60000

// ── THE LISTS ───────────────────────────────────────────────────────────────────────────────
// Deliberately short and specific. A long list of soft words would hold ordinary comments and
// train the operator to ignore the review queue, which is worse than holding nothing. Each entry
// is here because an automated sales reply beneath it would be plainly wrong.

/** Someone selling something, or driving traffic elsewhere. An automatic reply is pointless. */
const SPAM_PATTERNS: readonly RegExp[] = [
  /\b(?:dm|message)\s+me\s+(?:for|to)\s+(?:promo|growth|followers|likes|views)\b/i,
  /\b(?:cheap|buy)\s+(?:followers|likes|views)\b/i,
  /\bgrow\s+your\s+(?:account|page|following)\b/i,
  /\b(?:click|check)\s+(?:the\s+)?link\s+in\s+(?:my|our)\s+bio\b/i,
  /\b(?:crypto|forex|bitcoin|investment)\s+(?:tips|signals|coach|mentor)\b/i,
  /\bwhatsapp\s*(?:\+|\d)/i,
  /\bt\.me\/|\bbit\.ly\/|\bwa\.me\//i,
]

/** Abuse, threats or plain hostility. Never answered by a machine. */
const HOSTILE_PATTERNS: readonly RegExp[] = [
  /\b(?:scam|scammer|fraud|fake|liar|lying|ripoff|rip[- ]off)\b/i,
  /\b(?:sue|lawsuit|lawyer|attorney general|report(?:ing)? you)\b/i,
  /\b(?:fuck|shit|bitch|asshole|idiot|stupid)\b/i,
  /\b(?:worst|terrible|awful|horrible)\s+(?:service|experience|agent|locator|company)\b/i,
  /\b(?:never|don'?t)\s+(?:use|trust|work with)\s+(?:this|them|him|her)\b/i,
]

/**
 * A keyword sitting inside a NEGATION or a complaint.
 *
 * "don't send me a list", "stop messaging me", "no more info" all contain a trigger word and all
 * mean the opposite of interest. These are held rather than skipped, because a person asking to be
 * left alone is exactly the person a human should see.
 */
const NEGATIVE_CONTEXT_PATTERNS: readonly RegExp[] = [
  /\b(?:don'?t|do not|stop|quit|never)\s+(?:\w+\s+){0,3}(?:send\w*|messag\w*|dm|contact\w*|email\w*|text\w*)\b/i,
  /\b(?:no|not)\s+(?:more\s+)?(?:info|details|interested|thanks)\b/i,
  /\b(?:already|stop)\s+(?:got|have|sent)\s+(?:one|it|the list)\b/i,
  /\bunsubscribe|remove me|leave me alone\b/i,
  /\b(?:not|isn'?t|wasn'?t)\s+(?:interested|for me)\b/i,
]

const matchesAny = (text: string, patterns: readonly RegExp[]): boolean =>
  patterns.some((re) => re.test(text))

/**
 * Should this comment be answered automatically?
 *
 * ORDER IS THE DESIGN. Cheap, certain exclusions run first so a hostile comment is never evaluated
 * for freshness and an old comment is never scanned for abuse — the first true thing wins, and the
 * reason recorded is the first reason, which is the one worth showing.
 */
export function screenComment(input: {
  text: string | null | undefined
  /** When the provider says the comment was written. */
  commentedAt: string | null | undefined
  isOwnAccount: boolean
  /** True when this is a reply under another comment rather than a top-level one. */
  isNestedReply: boolean
  /** Whether an action already exists for this comment. */
  alreadyProcessed: boolean
  /** When automation was switched on for this connected account. */
  activatedAt: string | null | undefined
  maxAgeMinutes?: number
  nowMs?: number
}): ScreenResult {
  const now = input.nowMs ?? Date.now()
  const text = (input.text ?? "").trim()

  // 1. Never answer ourselves. Checked first: it is certain and costs nothing.
  if (input.isOwnAccount) return { outcome: "skip", reason: "own_account" }

  // 2. Idempotence. Re-polling the same comment must be free and must not re-reply.
  if (input.alreadyProcessed) return { outcome: "skip", reason: "already_processed" }

  // 3. NEW COMMENTS ONLY. Switching automation on must not answer a backlog — someone who
  //    commented three weeks ago is not expecting a reply today, and a burst of messages to old
  //    threads is the clearest way to look like a bot and get an account restricted. The same
  //    check covers a reconnection after downtime, which is the other way a backlog appears.
  if (!input.commentedAt) return { outcome: "hold", reason: "too_old" } // no timestamp ⇒ cannot prove freshness
  if (input.activatedAt && new Date(input.commentedAt).getTime() < new Date(input.activatedAt).getTime()) {
    return { outcome: "skip", reason: "before_activation" }
  }
  const maxAge = input.maxAgeMinutes ?? DEFAULT_MAX_COMMENT_AGE_MINUTES
  if (minutesBetween(input.commentedAt, now) > maxAge) return { outcome: "skip", reason: "too_old" }

  // 4. Content screening. All three HOLD rather than skip: each is a comment a person should read.
  if (matchesAny(text, HOSTILE_PATTERNS)) return { outcome: "hold", reason: "hostile" }
  if (matchesAny(text, SPAM_PATTERNS)) return { outcome: "hold", reason: "spam_or_promo" }
  if (matchesAny(text, NEGATIVE_CONTEXT_PATTERNS)) return { outcome: "hold", reason: "negative_context" }

  // 5. A reply under another comment is usually a side conversation, and dropping a sales pitch
  //    into one reads badly. Held rather than skipped so a genuine "LIST please" nested under
  //    someone else's thread is not lost.
  if (input.isNestedReply) return { outcome: "hold", reason: "nested_reply" }

  return { outcome: "process", reason: "ok" }
}

export type PublicReplyDecision = { send: boolean; reason: "ok" | "cooldown" | "disabled" | "duplicate" }

/**
 * May we post an automatic PUBLIC acknowledgment to this person now?
 *
 * Public replies are OPTIONAL and off unless enabled. The cooldown is keyed on the same stable
 * provider id the DM rule uses, so a regular commenter is acknowledged at most once a day across
 * every post rather than once per post.
 *
 * `alreadyRepliedToComment` is the per-comment guard; the database's UNIQUE (comment_id, kind) is
 * what actually enforces it, and this refuses early with a reason worth showing.
 */
export function shouldSendPublicReply(input: {
  publicRepliesEnabled: boolean
  alreadyRepliedToComment: boolean
  /** Last automatic public reply to THIS person on THIS account. Null = never. */
  lastPublicReplyAt: string | null | undefined
  cooldownMinutes?: number
  nowMs?: number
}): PublicReplyDecision {
  if (!input.publicRepliesEnabled) return { send: false, reason: "disabled" }
  if (input.alreadyRepliedToComment) return { send: false, reason: "duplicate" }
  if (input.lastPublicReplyAt) {
    const cooldown = input.cooldownMinutes ?? DEFAULT_PUBLIC_REPLY_COOLDOWN_MINUTES
    if (minutesBetween(input.lastPublicReplyAt, input.nowMs ?? Date.now()) < cooldown) {
      return { send: false, reason: "cooldown" }
    }
  }
  return { send: true, reason: "ok" }
}

export type AccountGate = { active: boolean; reason: "ok" | "global_off" | "account_off" | "not_activated" | "not_authorized" | "unknown_state" }

/**
 * Is automation live for this connected account right now?
 *
 * FAILS CLOSED, and the `unknown_state` branch is the point: if settings or connection health
 * could not be read, we do not fall back to a default — we stop. Every other branch is an explicit
 * refusal, and there is no path that becomes active on missing information.
 */
export function accountAutomationGate(input: {
  settingsReadOk: boolean
  globalEnabled: boolean | null | undefined
  accountEnabled: boolean | null | undefined
  activatedAt: string | null | undefined
  /** Whether the connection currently holds the permissions this needs. */
  permissionsOk: boolean
}): AccountGate {
  if (!input.settingsReadOk) return { active: false, reason: "unknown_state" }
  if (!input.permissionsOk) return { active: false, reason: "not_authorized" }
  if (input.globalEnabled !== true) return { active: false, reason: "global_off" }
  if (input.accountEnabled !== true) return { active: false, reason: "account_off" }
  // An account can be switched on without an activation stamp only through a direct database edit;
  // with no stamp there is no "new comments only" boundary, so nothing may run.
  if (!input.activatedAt) return { active: false, reason: "not_activated" }
  return { active: true, reason: "ok" }
}
