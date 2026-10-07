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

/** Derived offsets span 1..30 minutes. */
export const STAGGER_SPREAD_MINUTES = 30

/**
 * Minutes to add to every baseline time for this connected account.
 *
 * WHY STAGGER AT ALL: several agents publishing at the identical minute looks coordinated and
 * mechanical, and it bunches every account's upload into one moment.
 *
 * SEMANTICS of social_connections.stagger_offset_minutes:
 *   null  → DERIVED, 1..30, stable for the life of the connection
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
