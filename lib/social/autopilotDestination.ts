// Per-connected-account scheduling identity: WHEN an account posts, and in WHAT market order.
//
// This module is pure. It plans nothing and writes nothing — it answers two questions about a
// connected account, and the existing scheduler consumes the answers. `planDailyTimes` remains the
// one timing authority; this only decides which minutes to hand it.

/** FNV-1a (32-bit). The SAME hash the existing scheduler uses — not a second primitive. */
export function fnv1a(s: string): number {
  let h = 2166136261 >>> 0
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619) >>> 0
  }
  return h >>> 0
}

/** 7:30 AM and 7:30 PM, as minutes from local midnight. The baseline BEFORE any stagger. */
export const BASELINE_DAILY_TIMES = [7 * 60 + 30, 19 * 60 + 30] as const

/**
 * Derived offsets span 1..5 minutes.
 *
 * WAS 30. A destination asked to post at 7:30 and 19:30 is asked for THOSE windows, and a derived
 * offset of 29 minutes put it at 07:59 — inside the approved morning window, so nothing refused it,
 * but not the time anyone chose. Five minutes is enough to keep two accounts off the same instant
 * while leaving the schedule recognisably 7:3x / 19:3x.
 *
 * THIS CHANGES NOTHING THAT IS CONNECTED TODAY. Both live destinations carry an EXPLICIT
 * stagger_offset_minutes = 0, and an explicit value always wins (see staggerOffsetMinutes), so
 * Real Estate Pro stays pinned to the baseline exactly as before. Only a destination whose column
 * is NULL derives an offset, and the only such destinations are ones not yet connected.
 */
export const STAGGER_SPREAD_MINUTES = 5

/**
 * Minutes to add to every baseline time for this connected account.
 *
 * WHY STAGGER AT ALL: several agents publishing at the identical minute looks coordinated and
 * mechanical, and it bunches every account's upload into one moment.
 *
 * SEMANTICS of social_connections.stagger_offset_minutes:
 *   null  → DERIVED, 1..STAGGER_SPREAD_MINUTES, stable for the life of the connection
 *   0     → exactly the baseline (7:30 / 19:30). The explicit "primary account" case.
 *   1..n  → that many minutes after the baseline
 *
 * The derived range deliberately starts at 1, never 0, so a derived account can never collide with
 * an account pinned to the baseline. It is also strictly POSITIVE because the column is constrained
 * to 0..1440 — a negative offset could not be stored, and widening a constraint purely to allow
 * earlier posting is not worth the schema churn.
 *
 * The hash takes the connection id ONLY. No date, no index: an account's times are the same every
 * day, which is what makes time-of-day performance measurable at all. (The interval cadence hashes
 * the date on purpose and therefore moves daily; that cadence is untouched.)
 */
export function staggerOffsetMinutes(connectionId: string, explicit: number | null | undefined): number {
  if (explicit !== null && explicit !== undefined && Number.isFinite(explicit)) {
    return Math.max(0, Math.trunc(explicit))
  }
  return 1 + (fnv1a(connectionId) % STAGGER_SPREAD_MINUTES)
}

/**
 * THE TIMES A DESTINATION POSTS AT, DERIVED FROM ITS OWN posts_per_day.
 *
 * ── WHY THIS EXISTS: posts_per_day DID NOT MEAN POSTS PER DAY ───────────────────────────────
 * The number of posts a destination gets in a day is `dailyTimes.length` — the planner places one
 * occurrence per configured time per day. `posts_per_day` was never wired to that. It was used only
 * as `maxOccurrences = maxDays * postsPerDay`, a cap on the TOTAL across the whole horizon, and it
 * was taken as the MINIMUM across every destination on a platform. So:
 *
 *   posts_per_day = 2   2 a day, because the baseline happens to have two times      (correct)
 *   posts_per_day = 1   still 2 a day, for HALF the horizon, then nothing            (wrong)
 *   posts_per_day = 3   still 2 a day — there is no third time to place one at       (wrong)
 *
 * and one destination set to 1 halved every other destination's queue on that platform.
 *
 * This makes the column mean what it says: the first N approved times, so N is how many posts that
 * destination gets on a calendar day. The planner additionally enforces N as a hard per-day ceiling,
 * because a placement bumped forward off a full day could otherwise land on a day already at N.
 *
 * ── WHAT IT CANNOT DO ───────────────────────────────────────────────────────────────────────
 * It cannot invent a window. The baseline carries two approved times, so a destination asking for
 * three is given two and the planner reports the shortfall rather than inventing a 3rd timestamp
 * inside an approved window nobody chose. More than two a day needs a per-destination times column,
 * which is a schema change and is not this.
 *
 * NULL / absent / non-positive ⇒ the whole baseline, which is today's behaviour for every existing
 * destination (both live rows have posts_per_day = NULL).
 */
export function dailyTimesForPostsPerDay(
  postsPerDay: number | null | undefined,
  baseline: readonly number[] = BASELINE_DAILY_TIMES,
): readonly number[] {
  if (typeof postsPerDay !== "number" || !Number.isFinite(postsPerDay) || postsPerDay <= 0) return baseline
  const n = Math.min(Math.trunc(postsPerDay), baseline.length)
  return baseline.slice(0, n)
}

/** How many posts a day this destination actually gets, and whether that is fewer than it asked
 *  for. Returned together so a caller reports the shortfall instead of discovering it. */
export function destinationCadence(
  postsPerDay: number | null | undefined,
  baseline: readonly number[] = BASELINE_DAILY_TIMES,
): { times: readonly number[]; perDay: number; requested: number; capped: boolean } {
  const times = dailyTimesForPostsPerDay(postsPerDay, baseline)
  const requested = typeof postsPerDay === "number" && Number.isFinite(postsPerDay) && postsPerDay > 0
    ? Math.trunc(postsPerDay)
    : baseline.length
  return { times, perDay: times.length, requested, capped: requested > times.length }
}

/**
 * The account's actual posting times — what gets passed to planDailyTimes as `dailyTimes`.
 *
 * This is the whole integration: the stagger is expressed as SHIFTED MINUTES, not as a new
 * scheduling mode. planDailyTimes already takes explicit minutes, so it needs no change and
 * cadence stays "daily_times".
 */
export function effectiveDailyTimes(
  connectionId: string,
  explicitOffset: number | null | undefined,
  baseline: readonly number[] = BASELINE_DAILY_TIMES,
): number[] {
  const off = staggerOffsetMinutes(connectionId, explicitOffset)
  // Wrap defensively rather than emitting a minute outside the day; normalizeDailyTimes would drop
  // an out-of-range value silently, which would cost the account a slot with no explanation.
  return baseline.map((t) => (t + off) % 1440).sort((a, b) => a - b)
}

/**
 * The account's market order across its daily slots: index 0 is the AM slot, 1 the PM slot.
 *
 * INVERTED PER ACCOUNT so two agents do not present identical feeds — with [Dallas, San Antonio]
 * one account runs Dallas AM / San Antonio PM and another runs the reverse. This is a rotation of
 * the SAME weighted order, not a different order per account, so every account still favours the
 * markets you prioritise; they simply disagree about which comes first today.
 *
 * `explicitSeed` pins an account (e.g. the primary to Dallas-AM) exactly as stagger_offset_minutes
 * pins its time. Otherwise derived from the connection id, stable for the connection's life.
 */
export function marketOrderFor(
  connectionId: string,
  weightedMarkets: readonly string[],
  explicitSeed?: number | null,
): string[] {
  const n = weightedMarkets.length
  if (n === 0) return []
  const rot = explicitSeed !== null && explicitSeed !== undefined && Number.isFinite(explicitSeed)
    ? ((Math.trunc(explicitSeed) % n) + n) % n
    : fnv1a(connectionId) % n
  return weightedMarkets.map((_, i) => weightedMarkets[(i + rot) % n])
}
