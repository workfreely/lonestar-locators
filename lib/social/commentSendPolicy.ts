// Comments — THE SEND POLICY: the provider's own rules, and how we classify what it told us.
//
// Pure. These are the checks that commentIdentity and commentSafety do not cover, because they are
// Meta's constraints rather than ours.
//
// ── THE THREE ENVIRONMENT GATES ─────────────────────────────────────────────────────────────
// Separate switches for separate questions, because conflating them is how a feature gets deployed
// and starts messaging strangers in the same change:
//
//   SOCIAL_COMMENT_AUTOMATION_ENABLED  may this feature do ANYTHING at all?  (the kill switch)
//   SOCIAL_COMMENT_SEND_ENABLED        may we actually call Meta to send?    (the sending gate)
//
// With the first on and the second off the pipeline runs end to end and writes its full action
// ledger with every send marked `skipped / sending_disabled` — a true dry run against real traffic,
// which is the only honest way to verify this before it talks to anyone.
//
// Both demand the string "true", CASE-SENSITIVELY, after trimming surrounding whitespace.
// Missing, empty, "false", "0", "1", "yes", "on", "TRUE" and "True" are all OFF — a truthy-looking
// value is not consent. Whitespace IS forgiven (" true" arms the gate) because a leading space in a
// Vercel field is a paste artifact and carries no intent, and because the publish worker's gate
// already behaves this way; the two must not disagree about what "on" means.

/** Only "true" arms a gate — case-sensitive, whitespace-trimmed. Stricter than truthiness. */
const armed = (v: string | null | undefined): boolean => (v ?? "").trim() === "true"

export type FeatureGate = { active: boolean; reason: "ok" | "automation_disabled" }

/** The emergency kill switch. Unset it and the whole feature goes inert on the next invocation. */
/** Accepts process.env or any plain record, so tests can pass a literal environment. */
export type EnvLike = Record<string, string | undefined>

export function featureGate(env: EnvLike): FeatureGate {
  return armed(env.SOCIAL_COMMENT_AUTOMATION_ENABLED)
    ? { active: true, reason: "ok" }
    : { active: false, reason: "automation_disabled" }
}

export type SendGate = { active: boolean; reason: "ok" | "sending_disabled" }

/** The sending gate. Off ⇒ the pipeline still runs and logs, but no call reaches Meta. */
export function sendGate(env: EnvLike): SendGate {
  return armed(env.SOCIAL_COMMENT_SEND_ENABLED)
    ? { active: true, reason: "ok" }
    : { active: false, reason: "sending_disabled" }
}

// ── META'S PRIVATE-REPLY WINDOW ─────────────────────────────────────────────────────────────

/**
 * A private reply may be sent within SEVEN DAYS of the comment's creation. Meta's rule, not ours.
 *
 * This is checked BEFORE the atomic claim, and that ordering is the whole point. Claiming a person
 * for a send that cannot possibly succeed would mark them as spoken for and — because an uncertain
 * outcome is never released — could lock them out of a legitimate DM for ever. Refusing first
 * leaves the record clean.
 */
export const PRIVATE_REPLY_WINDOW_DAYS = 7

export type WindowDecision = {
  withinWindow: boolean
  reason: "ok" | "expired" | "unknown_age"
  /** Whole hours left, for the Inbox. Null when the age is unknown. */
  hoursRemaining: number | null
}

/**
 * Is this comment still inside the private-reply window?
 *
 * `unknown_age` REFUSES. A comment we cannot date might be a month old, and the failure mode of
 * guessing is messaging someone about a video they commented on long ago.
 */
export function privateReplyWindow(input: {
  commentedAt: string | null | undefined
  nowMs?: number
  windowDays?: number
}): WindowDecision {
  const at = (input.commentedAt ?? "").trim()
  if (!at) return { withinWindow: false, reason: "unknown_age", hoursRemaining: null }
  const t = new Date(at).getTime()
  if (!Number.isFinite(t)) return { withinWindow: false, reason: "unknown_age", hoursRemaining: null }

  const now = input.nowMs ?? Date.now()
  const windowMs = (input.windowDays ?? PRIVATE_REPLY_WINDOW_DAYS) * 24 * 60 * 60 * 1000
  const remainingMs = t + windowMs - now
  if (remainingMs <= 0) return { withinWindow: false, reason: "expired", hoursRemaining: 0 }
  return { withinWindow: true, reason: "ok", hoursRemaining: Math.floor(remainingMs / 3_600_000) }
}

// ── CLASSIFYING WHAT META TOLD US ───────────────────────────────────────────────────────────

/**
 * Turn a send attempt's result into one of the three outcomes resolveDmOutcome understands.
 *
 * This classification decides whether a person can ever be messaged again, so the distinction
 * between "definitely did not send" and "we do not know" is the most consequential judgement in
 * the feature:
 *
 *   accepted   2xx AND the provider returned an id. A 2xx with no id is NOT an acceptance — we
 *              would have nothing to record and no way to prove delivery, so it is uncertain.
 *   failed     A DEFINITE rejection: the request was understood and refused, so nothing was
 *              delivered and the claim is safe to release. 4xx permission, validation, window and
 *              rate-limit errors are all in this class — a throttled call was not processed.
 *   uncertain  Anything else. 5xx, a timeout, a network error, an unparseable body. The message
 *              may have arrived. The claim is NEVER released and nothing is retried.
 *
 * The default is `uncertain`, so an error shape nobody anticipated lands in the safe class rather
 * than being optimistically retried.
 */
export type SendAttempt = {
  /** HTTP status, or null when the request never completed (timeout, DNS, socket). */
  status: number | null
  /** The id the provider returned for the thing it created, if any. */
  externalId?: string | null
  /** Meta's error.code, when the body carried one. */
  errorCode?: number | null
  /** Meta's error.error_subcode, when present. */
  errorSubcode?: number | null
  /** True when the body could not be parsed as JSON at all. */
  unparseable?: boolean
  /** True when the request threw before any response (timeout/network). */
  transportError?: boolean
}

export type Classification = {
  outcome: "accepted" | "failed" | "uncertain"
  reason:
    | "accepted"
    | "no_id_returned"
    | "rejected"
    | "rate_limited"
    | "permission"
    | "outside_window"
    | "server_error"
    | "transport_error"
    | "unparseable"
    | "unknown"
}

/** Meta error codes that mean "throttled" — the call was refused, not delivered. */
const RATE_LIMIT_CODES = new Set([4, 17, 32, 613])
/** Meta error codes that mean "you are not permitted" — definite, and retrying will not help. */
const PERMISSION_CODES = new Set([10, 190, 200, 2200])

export function classifySendAttempt(a: SendAttempt): Classification {
  // A request that never completed is the textbook uncertain case: the server may have processed
  // it and we simply never heard the answer.
  if (a.transportError) return { outcome: "uncertain", reason: "transport_error" }
  if (a.status === null) return { outcome: "uncertain", reason: "transport_error" }

  if (a.status >= 200 && a.status < 300) {
    if (a.unparseable) return { outcome: "uncertain", reason: "unparseable" }
    const id = (a.externalId ?? "").trim()
    // 2xx WITHOUT AN ID IS NOT AN ACCEPTANCE. Stamping dm_sent_at on this would claim a delivery we
    // cannot evidence, and the person could never be messaged again on the strength of it.
    return id
      ? { outcome: "accepted", reason: "accepted" }
      : { outcome: "uncertain", reason: "no_id_returned" }
  }

  // 5xx — the server failed. It may have failed before or after doing the work.
  if (a.status >= 500) return { outcome: "uncertain", reason: "server_error" }

  if (a.status === 429) return { outcome: "failed", reason: "rate_limited" }

  if (a.status >= 400 && a.status < 500) {
    const code = a.errorCode ?? null
    if (code !== null && RATE_LIMIT_CODES.has(code)) return { outcome: "failed", reason: "rate_limited" }
    if (code !== null && PERMISSION_CODES.has(code)) return { outcome: "failed", reason: "permission" }
    // A 4xx we could not even parse is still a definite rejection — the server understood the
    // request well enough to refuse it with a client error, so nothing was delivered.
    return { outcome: "failed", reason: "rejected" }
  }

  // 1xx/3xx and anything else unaccounted for. Safe class by default.
  return { outcome: "uncertain", reason: "unknown" }
}

/**
 * The durable failure record: a classification, plus Meta's NUMBERS and nothing else.
 *
 * ── WHY NUMBERS ONLY, AND WHY THIS IS SAFE ────────────────────────────────────────────────
 * The ledger previously stored the classification alone. That was a deliberate choice — Meta's
 * error *messages* can echo the request, and the request carried a bearer token, so persisting the
 * provider's text risked writing a credential into a table the admin UI renders. That reasoning
 * still holds and is why nothing here touches `error.message`, the response body, headers or the
 * request.
 *
 * It does not hold for `error.code` and `error.error_subcode`. They are small integers from a
 * closed vocabulary; they cannot carry a token, a URL or a person's data. And without them an
 * operator cannot tell code 190 (our token is dead) from code 200 (the app is not permitted) —
 * two failures with completely different remedies that both render as the single word
 * "permission". Blind triage was the real cost of storing nothing.
 *
 * The shape stays greppable and stable: `<reason>` alone when Meta reported no numbers, otherwise
 * `<reason> code=<n>` and ` subcode=<n>` when present.
 */
export function failureRecord(reason: string, a: SendAttempt): string {
  const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null)
  const code = num(a.errorCode)
  const subcode = num(a.errorSubcode)
  let out = reason
  if (code !== null) out += ` code=${code}`
  if (subcode !== null) out += ` subcode=${subcode}`
  return out
}

/**
 * Meta subcode 2534037 and friends mean the comment is too old for a private reply. Recognised so
 * the ledger can say `outside_window` rather than a generic rejection — the operator should be able
 * to tell "we were too late" apart from "we are not allowed".
 */
export function isOutsideWindowError(a: SendAttempt): boolean {
  return a.errorSubcode === 2534037 || a.errorCode === 2534037
}
