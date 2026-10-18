// Comments — RATE LIMIT AWARENESS, and the poll plan that keeps us inside it.
//
// Pure. Every decision here is a function of numbers we were given, so the backoff can be tested
// without burning a single real call.
//
// ── THE FORMULA, AND WHY IT INVERTS AGAINST A QUIET ACCOUNT ─────────────────────────────────
// Meta's Instagram business-use-case limit is  4,800 × impressions  calls per 24 hours, where
// impressions is how often the account's content appeared on screen in the last 24 hours. An
// account that is posting hard has an enormous budget; an account that has gone quiet — which is
// exactly where Social Beast is before advertising restarts — has almost none.
//
// So the budget cannot be assumed. Every response carries X-Business-Use-Case-Usage with
// `call_count` as a PERCENTAGE of a rolling one-hour allowance, which is the only trustworthy
// signal, and this module reads it and backs off on it rather than on a guess.
//
// ── THE CHEAP POLL ──────────────────────────────────────────────────────────────────────────
// A naive reconciliation poll costs one call per media per run. GET /me/media?fields=id,
// comments_count costs ONE call and says which media changed, so the comments edge is only fetched
// for those. In the steady state — no new comments — a run costs a single call.

/** One parsed X-Business-Use-Case-Usage entry. Percentages, 0–100+ (Meta can report over 100). */
export type BucUsage = {
  callCount: number
  totalCputime: number
  totalTime: number
  /** Minutes until throttling lifts. Meta reports 0 when not throttled. */
  estimatedTimeToRegainAccess: number
}

/**
 * Parse the X-Business-Use-Case-Usage header.
 *
 * The header is JSON: { "<business-id>": [ { type, call_count, … } ] }. We take the WORST entry
 * across every business id and every bucket rather than the first — a header listing two buckets
 * where one is at 95% must not be read as healthy because the other is at 3%.
 *
 * Returns null when the header is absent or unparseable, which the caller must treat as "unknown",
 * never as "fine". An unreadable header on a response that still succeeded is not evidence of
 * headroom.
 */
export function parseBucUsage(header: string | null | undefined): BucUsage | null {
  const raw = (header ?? "").trim()
  if (!raw) return null
  let parsed: unknown
  try { parsed = JSON.parse(raw) } catch { return null }
  if (typeof parsed !== "object" || parsed === null) return null

  const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0)
  let found = false
  const worst: BucUsage = { callCount: 0, totalCputime: 0, totalTime: 0, estimatedTimeToRegainAccess: 0 }

  for (const buckets of Object.values(parsed as Record<string, unknown>)) {
    if (!Array.isArray(buckets)) continue
    for (const b of buckets) {
      if (typeof b !== "object" || b === null) continue
      const e = b as Record<string, unknown>
      found = true
      worst.callCount = Math.max(worst.callCount, num(e.call_count))
      worst.totalCputime = Math.max(worst.totalCputime, num(e.total_cputime))
      worst.totalTime = Math.max(worst.totalTime, num(e.total_time))
      worst.estimatedTimeToRegainAccess =
        Math.max(worst.estimatedTimeToRegainAccess, num(e.estimated_time_to_regain_access))
    }
  }
  return found ? worst : null
}

/**
 * The percentage at which we stop making discretionary calls for the rest of the run.
 *
 * 60 rather than 100 deliberately. Publishing shares the same budget, and a comment poller that
 * spends the account's last 5% would take Social Beast's posting down with it. Reconciliation is
 * the least important consumer of this budget and should be the first to yield.
 */
export const BACKOFF_THRESHOLD_PERCENT = 60

export type BackoffDecision = {
  /** May we keep spending calls this run? */
  proceed: boolean
  reason: "ok" | "throttled" | "near_limit" | "unknown_usage"
}

/**
 * Should the poller keep going?
 *
 * `unknown_usage` PROCEEDS. This is the one place that does not fail closed, and the reasoning is
 * specific: the header is absent on the very first call of a run, so refusing on absence would
 * mean the poller could never make its first call and would never do anything at all. The cost of
 * being wrong is one extra GET, which Meta answers with a 429 we handle. Everywhere a wrong guess
 * could send a message to a person, the code fails closed instead.
 */
export function shouldContinuePolling(usage: BucUsage | null): BackoffDecision {
  if (!usage) return { proceed: true, reason: "unknown_usage" }
  if (usage.estimatedTimeToRegainAccess > 0) return { proceed: false, reason: "throttled" }
  const worst = Math.max(usage.callCount, usage.totalCputime, usage.totalTime)
  if (worst >= BACKOFF_THRESHOLD_PERCENT) return { proceed: false, reason: "near_limit" }
  return { proceed: true, reason: "ok" }
}

// ── THE POLL PLAN ───────────────────────────────────────────────────────────────────────────

/** How far back the poller looks. Matches Meta's private-reply window — see below. */
export const POLL_WINDOW_DAYS = 7

export type MediaSnapshot = {
  mediaId: string
  /** ISO publish time from the provider. */
  timestamp: string | null
  /** The provider's current comment count, or null when it did not report one. */
  commentsCount: number | null
}

export type MediaCursor = {
  mediaId: string
  /** The count we last saw for this media, or null if we have never polled it. */
  lastCommentsCount: number | null
}

export type PollPlan = {
  /** Media whose comments edge is worth fetching this run. */
  fetch: string[]
  /** Media considered and skipped, with the reason. */
  skipped: { mediaId: string; reason: "outside_window" | "unchanged" | "no_timestamp" }[]
  /** 1 for the media list + one per fetch. The number of calls this plan intends to spend. */
  estimatedCalls: number
}

/**
 * Decide which media to fetch comments for.
 *
 * ── WHY SEVEN DAYS ────────────────────────────────────────────────────────────────────────
 * A private reply is only possible within 7 days of the comment. Beyond that a DM cannot be sent
 * at any price, so polling older media buys public replies alone — and those are off by default.
 * The window is therefore not a performance tweak; it is the boundary past which the calls cannot
 * accomplish the thing they are being spent on.
 *
 * ── WHY AN UNCHANGED COUNT IS SAFE TO SKIP ────────────────────────────────────────────────
 * comments_count rising is the only way a new comment appears. A count that is unchanged since the
 * last run means nothing was added. A count that FELL (someone deleted a comment) is NOT treated
 * as unchanged — it is fetched, because a deletion plus an addition between two runs can leave the
 * total identical, and `!==` catches the fall where `>` would miss it.
 *
 * A media with no count reported is always fetched: absence is not evidence of no change.
 */
export function planPoll(input: {
  media: readonly MediaSnapshot[]
  cursors: readonly MediaCursor[]
  nowMs?: number
  windowDays?: number
}): PollPlan {
  const now = input.nowMs ?? Date.now()
  const windowMs = (input.windowDays ?? POLL_WINDOW_DAYS) * 24 * 60 * 60 * 1000
  const cursorFor = new Map(input.cursors.map((c) => [c.mediaId, c.lastCommentsCount]))

  const fetch: string[] = []
  const skipped: PollPlan["skipped"] = []

  for (const m of input.media) {
    if (!m.timestamp) { skipped.push({ mediaId: m.mediaId, reason: "no_timestamp" }); continue }
    const published = new Date(m.timestamp).getTime()
    if (!Number.isFinite(published) || now - published > windowMs) {
      skipped.push({ mediaId: m.mediaId, reason: "outside_window" })
      continue
    }
    const seen = cursorFor.has(m.mediaId) ? cursorFor.get(m.mediaId)! : undefined
    // Never polled, or either side unknown ⇒ fetch. Only an exact, known, equal pair may skip.
    if (m.commentsCount === null || seen === undefined || seen === null) {
      fetch.push(m.mediaId)
      continue
    }
    if (m.commentsCount !== seen) fetch.push(m.mediaId)
    else skipped.push({ mediaId: m.mediaId, reason: "unchanged" })
  }

  return { fetch, skipped, estimatedCalls: 1 + fetch.length }
}
