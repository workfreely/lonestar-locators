// The autopilot planner: ORCHESTRATION ONLY.
//
// It composes pieces that already exist and introduces no scheduling logic of its own:
//
//   effectiveDailyTimes  (autopilotDestination)  per-account 7:30/19:30 + stagger
//   planDailyTimes       (recurrence)            THE timing authority — unchanged
//   marketOrderFor       (autopilotDestination)  per-account AM/PM market order
//   planRotation         (autopilotRotation)     start index into the shared ready pool
//   ineligibleReason     (autopilotEligibility)  what may be scheduled at all
//
// It NEVER renders, never creates posts, and never widens the pool. Insufficient inventory is
// returned as a report, not worked around.
//
// This module is PURE: it takes the rules and the pool as data and returns a plan. Reading rows
// and writing scheduled_at belong to the caller, so a dry run and a real run differ only in
// whether the caller persists the result.
import { planDailyTimes, dayKeysFrom, type Occupancy, type Placement } from "@/lib/social/recurrence"
import { effectiveDailyTimes, marketOrderFor } from "@/lib/social/autopilotDestination"
import { planRotation, rotatePool, type RotationCollision } from "@/lib/social/autopilotRotation"
import { ineligibleReason, type EligibilityInput, type Ineligible } from "@/lib/social/autopilotEligibility"

export type PoolPost = EligibilityInput & {
  id: string
  /** The PROPERTY. Two different rendered creatives of one property share this id, and for the
   *  uniqueness rule they count as the same property — varying the creative does not make a
   *  second post about the same building feel like fresh content to a viewer. */
  sourceContentId: string
  market: string | null
  propertyName: string | null
}

export type AutopilotRule = {
  connectionId: string
  enabled: boolean
  timezone: string
  /** Baseline minutes BEFORE stagger — normally {450, 1170}. */
  dailyTimes: readonly number[]
  postsPerDay: number
  horizonDays: number
  marketWeights: Record<string, number>
  marketRotationSeed: number | null
  /** social_connections.stagger_offset_minutes — null ⇒ derived. */
  staggerOffsetMinutes: number | null
  /** Pinned start index into the pool — null ⇒ placed automatically. */
  startIndex: number | null
}

export type PlannedPost = {
  postId: string
  sourceContentId: string
  connectionId: string
  dateKey: string
  minute: number
  scheduledAtUtc: string
  market: string | null
  propertyName: string | null
  poolIndex: number
}

/** A slot whose preferred market had nothing available, recorded rather than silently swapped. */
export type MarketFallback = {
  connectionId: string
  dateKey: string
  minute: number
  requestedMarket: string
  selectedMarket: string | null
  reason: "no_eligible_inventory_in_market" | "market_inventory_already_used"
}

/** Where a connection had to start repeating properties, and how far unique inventory stretched. */
export type ReusePoint = {
  connectionId: string
  dateKey: string
  minute: number
  uniqueSourcesExhausted: number
}

export type AutopilotPlan = {
  planned: PlannedPost[]
  /** Slots where the preferred market was unavailable. Empty when every slot got its first choice. */
  marketFallbacks: MarketFallback[]
  /** Per connection, the first slot that had to repeat a property. Empty when none did. */
  reusePoints: ReusePoint[]
  /** Every pool candidate that was rejected, with the reason. Never silently dropped. */
  excluded: { postId: string; reason: Ineligible }[]
  collisions: RotationCollision[]
  sufficient: boolean
  poolSize: number
  requiredPoolSize: number
  /** Slots the horizon asked for but inventory could not fill. */
  unfilledSlots: number
  notes: string[]
}

/** Markets ordered by weight, highest first; ties alphabetical so the order is deterministic. */
export function weightedMarketOrder(weights: Record<string, number>, present: readonly string[]): string[] {
  return [...new Set(present)]
    .filter((m) => !!m)
    .sort((a, b) => (weights[b] ?? 0) - (weights[a] ?? 0) || (a < b ? -1 : a > b ? 1 : 0))
}

/**
 * Build the schedule.
 *
 * `wallClockToUtc` is injected so this stays pure and testable without a timezone database call.
 */
export function planAutopilot(input: {
  rules: readonly AutopilotRule[]
  pool: readonly PoolPost[]
  startDateKey: string
  wallClockToUtc: (dateKey: string, minute: number, tz: string) => string
  /** Existing scheduled posts per connection, so manual posts still win their slot. */
  occupancyByConnection?: Map<string, Occupancy>
  platform?: string
}): AutopilotPlan {
  const platform = input.platform ?? "instagram"
  const notes: string[] = []

  // 1. ELIGIBILITY. Applied in code even though the query also filters, so a forgotten column
  //    cannot admit an ineligible post.
  const excluded: { postId: string; reason: Ineligible }[] = []
  const eligible: PoolPost[] = []
  for (const p of input.pool) {
    const reason = ineligibleReason(p, platform)
    if (reason) excluded.push({ postId: p.id, reason })
    else eligible.push(p)
  }
  // Stable pool order: the caller's order is preserved (it is the curated bulk-render order), with
  // id as the tiebreak so two runs over the same set agree.
  const pool = [...eligible]

  const rules = input.rules.filter((r) => r.enabled)
  if (rules.length === 0) notes.push("No enabled autopilot rules — nothing to plan.")
  if (pool.length === 0) notes.push("Ready pool is empty: no rendered, unscheduled, unassigned posts.")

  // 2. ROTATION. One start index per connection into the shared pool, plus the collision report.
  const postsPerDay = Math.max(1, Math.min(...rules.map((r) => r.postsPerDay), 3) || 1)
  const horizon = Math.max(...rules.map((r) => r.horizonDays), 1)
  const dayKeys = dayKeysFrom(input.startDateKey, horizon)
  const rotation = planRotation({
    connections: rules.map((r) => ({ connectionId: r.connectionId, startIndex: r.startIndex })),
    poolSize: pool.length,
    postsPerDay,
    dayKeys,
  })

  // 3. TIMING + ASSIGNMENT, per rule.
  const planned: PlannedPost[] = []
  const marketFallbacks: MarketFallback[] = []
  const reusePoints: ReusePoint[] = []
  let unfilledSlots = 0

  for (const rule of rules) {
    const times = effectiveDailyTimes(rule.connectionId, rule.staggerOffsetMinutes, rule.dailyTimes)
    const placements: Placement[] = planDailyTimes({
      intervalDays: 1,
      dailyTimes: times,
      days: dayKeys,
      occupancy: input.occupancyByConnection?.get(rule.connectionId) ?? new Map(),
      maxOccurrences: rule.horizonDays * rule.postsPerDay,
    })

    // The account's view of the pool: same order, different entry point.
    const start = rotation.startIndices.get(rule.connectionId) ?? 0
    const ordered = rotatePool(pool, start)

    // Market order is applied as a PREFERENCE within the account's rotated view: for each slot,
    // prefer the next unused post whose market matches that slot's market, else fall through to
    // the next unused post of any market. Preferences, not quotas — a market with no inventory
    // simply does not participate rather than blocking the slot.
    const marketsPresent = pool.map((p) => p.market ?? "").filter(Boolean)
    const order = marketOrderFor(rule.connectionId, weightedMarketOrder(rule.marketWeights, marketsPresent), rule.marketRotationSeed)

    // SELECTION, in strict preference order:
    //   1. an unused PROPERTY in the slot's preferred market
    //   2. an unused PROPERTY in any other enabled market   -> recorded as a market fallback
    //   3. unique inventory exhausted -> reset and allow repeats -> recorded as a reuse point
    //
    // Uniqueness is tracked by sourceContentId, not post id: two creatives of the same building
    // are the same property to a viewer, so exhausting distinct PROPERTIES is the rule.
    const usedPosts = new Set<string>()
    let usedSources = new Set<string>()
    let reuseRecorded = false
    const uniqueSourceCount = new Set(pool.map((p) => p.sourceContentId)).size

    placements.forEach((pl, i) => {
      const wantMarket = order.length ? order[i % order.length] : null
      const free = (p: PoolPost) => !usedPosts.has(p.id) && !usedSources.has(p.sourceContentId)

      let pick = wantMarket ? ordered.find((p) => free(p) && p.market === wantMarket) : ordered.find(free)
      let fallbackReason: MarketFallback["reason"] | null = null

      if (!pick && wantMarket) {
        // The preferred market could not supply this slot. Distinguish "that market has no eligible
        // inventory at all" from "it had some but this connection has already used it", because the
        // two call for different fixes — render more of that market, or widen the pool.
        const marketHasAny = pool.some((p) => p.market === wantMarket)
        fallbackReason = marketHasAny ? "market_inventory_already_used" : "no_eligible_inventory_in_market"
        pick = ordered.find(free)
      }

      if (!pick) {
        // Every distinct property has been used. Reuse is permitted ONLY from here, and the point
        // at which it begins is reported so the shortfall is visible rather than inferred.
        if (!reuseRecorded && ordered.length > 0) {
          reusePoints.push({ connectionId: rule.connectionId, dateKey: pl.dateKey, minute: pl.minute, uniqueSourcesExhausted: uniqueSourceCount })
          reuseRecorded = true
        }
        usedSources = new Set()
        pick = wantMarket ? ordered.find((p) => !usedSources.has(p.sourceContentId) && p.market === wantMarket) : undefined
        if (!pick) {
          if (wantMarket && !fallbackReason) fallbackReason = "market_inventory_already_used"
          pick = ordered[0] ? ordered.find((p) => !usedSources.has(p.sourceContentId)) ?? ordered[0] : undefined
        }
      }

      if (!pick) { unfilledSlots++; return }
      if (fallbackReason && wantMarket && pick.market !== wantMarket) {
        marketFallbacks.push({ connectionId: rule.connectionId, dateKey: pl.dateKey, minute: pl.minute, requestedMarket: wantMarket, selectedMarket: pick.market, reason: fallbackReason })
      }
      usedPosts.add(pick.id)
      usedSources.add(pick.sourceContentId)
      planned.push({
        postId: pick.id,
        sourceContentId: pick.sourceContentId,
        connectionId: rule.connectionId,
        dateKey: pl.dateKey,
        minute: pl.minute,
        scheduledAtUtc: input.wallClockToUtc(pl.dateKey, pl.minute, rule.timezone),
        market: pick.market,
        propertyName: pick.propertyName,
        poolIndex: pool.findIndex((p) => p.id === pick!.id),
      })
    })
  }

  planned.sort((a, b) => (a.scheduledAtUtc < b.scheduledAtUtc ? -1 : a.scheduledAtUtc > b.scheduledAtUtc ? 1 : a.connectionId < b.connectionId ? -1 : 1))

  if (!rotation.sufficient) {
    notes.push(`Inventory too small for collision-free scheduling: ${rotation.poolSize} eligible, need at least ${rotation.requiredPoolSize} for ${rules.length} account(s) at ${postsPerDay}/day.`)
  }
  if (unfilledSlots > 0) {
    notes.push(`${unfilledSlots} slot(s) in the ${horizon}-day horizon could not be filled — the pool recycles or runs out before the horizon ends.`)
  }

  if (reusePoints.length > 0) {
    notes.push(`Unique inventory exhausted — property reuse begins ${reusePoints.map((r) => `${r.dateKey} for ${r.connectionId.slice(0, 8)}`).join(", ")}.`)
  }
  if (marketFallbacks.length > 0) {
    notes.push(`${marketFallbacks.length} slot(s) fell forward to another market because the preferred one had nothing available.`)
  }

  return {
    planned, excluded, marketFallbacks, reusePoints,
    collisions: rotation.collisions,
    sufficient: rotation.sufficient && unfilledSlots === 0,
    poolSize: pool.length,
    requiredPoolSize: rotation.requiredPoolSize,
    unfilledSlots,
    notes,
  }
}
