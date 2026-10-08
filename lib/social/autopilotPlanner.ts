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
  /** The CONTENT row. NOT the property identity — see propertyKeyOf. */
  sourceContentId: string
  /** Google Places id of the building, when the content row was matched to one. THE property
   *  identity when present. */
  placeId: string | null
  market: string | null
  propertyName: string | null
}

/**
 * THE PROPERTY IDENTITY, for uniqueness and reuse.
 *
 * This used to be sourceContentId, on the stated assumption that "two creatives of one property
 * share this id". Production disproves it: two separate uploads of one building are two content
 * rows with different ids and the SAME place_id —
 *
 *     src=30f39a56  place=ChIJT5xoBCCK…  The Standard at Legacy
 *     src=808cbb09  place=ChIJT5xoBCCK…  The Standard at Legacy
 *
 * so a 7-post pool was being counted as 7 properties when it is 6, and one building could be
 * scheduled twice as though it were two. place_id is the authoritative building identity.
 *
 * FALLBACK, only when place_id is absent: the normalised property name scoped to its market, so an
 * unmatched upload still collapses against another unmatched upload of the same name. Last resort
 * is the content id, which at least never merges two genuinely different buildings — the failure
 * mode there is over-counting uniqueness, which is the safer direction for an unidentifiable row.
 */
export function propertyKeyOf(p: Pick<PoolPost, "placeId" | "propertyName" | "market" | "sourceContentId">): string {
  const place = (p.placeId ?? "").trim()
  if (place) return `place:${place}`
  const name = (p.propertyName ?? "").trim().toLowerCase().replace(/\s+/g, " ")
  if (name) return `name:${(p.market ?? "").trim().toLowerCase()}|${name}`
  return `content:${p.sourceContentId}`
}

export type AutopilotRule = {
  connectionId: string
  /**
   * THE DESTINATION'S OWN PLATFORM, derived from the connection's provider — never a global.
   *
   * planAutopilot previously took ONE `platform` and applied it to every rule, so a TikTok
   * connection was handed Instagram-eligible posts (14 of them, in the first real dry run). Those
   * would have faulted at publish. Eligibility is now evaluated per rule against THIS value, so a
   * connection can only ever be offered posts for its own network.
   */
  platform: string
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
  /**
   * HEALTHY inventory for the whole horizon — NOT merely collision-free for one day.
   *
   * This used to be `collisions.length === 0`, which made a 7-post pool report "sufficient" while
   * filling 28 placements by reusing 21 of them. A single day's collision-free minimum says nothing
   * about whether a 7-day rotation has enough distinct buildings to stay interesting.
   */
  sufficient: boolean
  poolSize: number
  /** Posts needed to fill ONE day across all connections without a same-slot collision. */
  requiredPoolSize: number
  /** Slots the horizon asked for but inventory could not fill. */
  unfilledSlots: number
  /** The full picture, so "is there enough content?" is answerable without arithmetic. */
  inventory: {
    /** Every slot the horizon asks for: connections x postsPerDay x horizonDays. */
    horizonPlacements: number
    eligiblePosts: number
    /** DISTINCT BUILDINGS (propertyKeyOf), which is what a viewer perceives as repetition. */
    uniqueProperties: number
    /** Placements filled with a property not yet used by that connection. */
    uniquePlacements: number
    reusedPlacements: number
    reusePercent: number
    /** When reuse first begins, earliest across connections. Null when nothing repeats. */
    firstReuseAt: { dateKey: string; minute: number } | null
    marketFallbacks: number
    unfilledSlots: number
    collisions: number
    /** Per platform, so a shortfall on one network is not hidden by surplus on another. */
    byPlatform: { platform: string; connections: number; eligiblePosts: number; uniqueProperties: number; horizonPlacements: number }[]
  }
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
}): AutopilotPlan {
  const notes: string[] = []
  const rules = input.rules.filter((r) => r.enabled)
  if (rules.length === 0) notes.push("No enabled autopilot rules — nothing to plan.")

  // PLATFORM ISOLATION. Connections are grouped by their OWN platform and each group is planned
  // against its own eligible pool. There is no global platform any more: a rule can only ever be
  // offered posts that passed ineligibleReason for ITS network, so an Instagram post cannot reach a
  // TikTok destination or the reverse.
  const byPlatform = new Map<string, AutopilotRule[]>()
  for (const r of rules) byPlatform.set(r.platform, [...(byPlatform.get(r.platform) ?? []), r])

  const planned: PlannedPost[] = []
  const marketFallbacks: MarketFallback[] = []
  const reusePoints: ReusePoint[] = []
  const excluded: { postId: string; reason: Ineligible }[] = []
  const collisions: RotationCollision[] = []
  const byPlatformStats: AutopilotPlan["inventory"]["byPlatform"] = []
  let unfilledSlots = 0
  let requiredPoolSize = 0
  let horizonPlacements = 0
  let uniquePlacements = 0
  let rotationSufficient = true
  // A post ineligible for one network may be fine for another, so exclusion is only reported for a
  // post that no planned platform could use.
  const usableSomewhere = new Set<string>()
  const exclusionReason = new Map<string, Ineligible>()

  for (const [platform, groupRules] of byPlatform) {
    const pool: PoolPost[] = []
    for (const p of input.pool) {
      const reason = ineligibleReason(p, platform)
      if (reason) { if (!exclusionReason.has(p.id)) exclusionReason.set(p.id, reason) }
      else { pool.push(p); usableSomewhere.add(p.id) }
    }
    if (pool.length === 0) notes.push(`No eligible ${platform} inventory: nothing rendered, unscheduled and unassigned for that network.`)

    const postsPerDay = Math.max(1, Math.min(...groupRules.map((r) => r.postsPerDay), 3) || 1)
    const horizon = Math.max(...groupRules.map((r) => r.horizonDays), 1)
    const dayKeys = dayKeysFrom(input.startDateKey, horizon)
    const rotation = planRotation({
      connections: groupRules.map((r) => ({ connectionId: r.connectionId, startIndex: r.startIndex })),
      poolSize: pool.length, postsPerDay, dayKeys,
    })
    collisions.push(...rotation.collisions)
    rotationSufficient = rotationSufficient && rotation.sufficient
    requiredPoolSize += rotation.requiredPoolSize
    const groupPlacements = groupRules.length * postsPerDay * horizon
    horizonPlacements += groupPlacements
    byPlatformStats.push({
      platform, connections: groupRules.length, eligiblePosts: pool.length,
      uniqueProperties: new Set(pool.map(propertyKeyOf)).size, horizonPlacements: groupPlacements,
    })
    if (!rotation.sufficient) {
      notes.push(`${platform}: inventory too small for collision-free scheduling — ${rotation.poolSize} eligible, need at least ${rotation.requiredPoolSize} for ${groupRules.length} account(s) at ${postsPerDay}/day.`)
    }

    for (const rule of groupRules) {
      const times = effectiveDailyTimes(rule.connectionId, rule.staggerOffsetMinutes, rule.dailyTimes)
      const placements: Placement[] = planDailyTimes({
        intervalDays: 1, dailyTimes: times, days: dayKeys,
        occupancy: input.occupancyByConnection?.get(rule.connectionId) ?? new Map(),
        maxOccurrences: rule.horizonDays * rule.postsPerDay,
      })
      const start = rotation.startIndices.get(rule.connectionId) ?? 0
      const ordered = rotatePool(pool, start)
      const marketsPresent = pool.map((p) => p.market ?? "").filter(Boolean)
      const order = marketOrderFor(rule.connectionId, weightedMarketOrder(rule.marketWeights, marketsPresent), rule.marketRotationSeed)

      const usedPosts = new Set<string>()
      // Keyed on the BUILDING (propertyKeyOf), not the content row: two uploads of one community
      // are one property, so using either exhausts it. This set is RESET when the cycle restarts.
      let usedProps = new Set<string>()
      // A SECOND, never-reset set, used only for counting. `usedProps` is cycling state: once it is
      // cleared to allow repeats, the next pick looks "free" again, so counting off it reported a
      // property the account had already posted as a unique placement. For the report, unique means
      // "this connection has not posted this building anywhere in the horizon".
      const everUsedProps = new Set<string>()
      let reuseRecorded = false
      const uniquePropertyCount = new Set(pool.map(propertyKeyOf)).size

      placements.forEach((pl, i) => {
        const wantMarket = order.length ? order[i % order.length] : null
        const free = (p: PoolPost) => !usedPosts.has(p.id) && !usedProps.has(propertyKeyOf(p))
        let pick = wantMarket ? ordered.find((p) => free(p) && p.market === wantMarket) : ordered.find(free)
        let fallbackReason: MarketFallback["reason"] | null = null
        let isReuse = false

        if (!pick && wantMarket) {
          const marketHasAny = pool.some((p) => p.market === wantMarket)
          fallbackReason = marketHasAny ? "market_inventory_already_used" : "no_eligible_inventory_in_market"
          pick = ordered.find(free)
        }
        if (!pick) {
          if (!reuseRecorded && ordered.length > 0) {
            reusePoints.push({ connectionId: rule.connectionId, dateKey: pl.dateKey, minute: pl.minute, uniqueSourcesExhausted: uniquePropertyCount })
            reuseRecorded = true
          }
          isReuse = true
          usedProps = new Set()
          pick = wantMarket ? ordered.find((p) => !usedProps.has(propertyKeyOf(p)) && p.market === wantMarket) : undefined
          if (!pick) {
            if (wantMarket && !fallbackReason) fallbackReason = "market_inventory_already_used"
            pick = ordered[0] ? ordered.find((p) => !usedProps.has(propertyKeyOf(p))) ?? ordered[0] : undefined
          }
        }
        if (!pick) { unfilledSlots++; return }
        if (!everUsedProps.has(propertyKeyOf(pick))) uniquePlacements++
        everUsedProps.add(propertyKeyOf(pick))
        void isReuse
        if (fallbackReason && wantMarket && pick.market !== wantMarket) {
          marketFallbacks.push({ connectionId: rule.connectionId, dateKey: pl.dateKey, minute: pl.minute, requestedMarket: wantMarket, selectedMarket: pick.market, reason: fallbackReason })
        }
        usedPosts.add(pick.id)
        usedProps.add(propertyKeyOf(pick))
        planned.push({
          postId: pick.id, sourceContentId: pick.sourceContentId, connectionId: rule.connectionId,
          dateKey: pl.dateKey, minute: pl.minute,
          scheduledAtUtc: input.wallClockToUtc(pl.dateKey, pl.minute, rule.timezone),
          market: pick.market, propertyName: pick.propertyName,
          poolIndex: pool.findIndex((p) => p.id === pick!.id),
        })
      })
    }
  }

  for (const [id, reason] of exclusionReason) if (!usableSomewhere.has(id)) excluded.push({ postId: id, reason })

  planned.sort((a, b) => (a.scheduledAtUtc < b.scheduledAtUtc ? -1 : a.scheduledAtUtc > b.scheduledAtUtc ? 1 : a.connectionId < b.connectionId ? -1 : 1))

  const reusedPlacements = planned.length - uniquePlacements
  const firstReuse = [...reusePoints].sort((a, b) => (a.dateKey < b.dateKey ? -1 : a.dateKey > b.dateKey ? 1 : a.minute - b.minute))[0] ?? null
  const uniqueProperties = new Set(input.pool.filter((p) => usableSomewhere.has(p.id)).map(propertyKeyOf)).size
  const reusePercent = planned.length ? Math.round((reusedPlacements / planned.length) * 100) : 0

  // HEALTHY, not merely collision-free: every slot the horizon asks for must be fillable with a
  // property that connection has not already used. Reuse at all means the pool is short.
  const sufficient = rotationSufficient && unfilledSlots === 0 && reusedPlacements === 0

  if (unfilledSlots > 0) notes.push(`${unfilledSlots} slot(s) in the horizon could not be filled at all.`)
  if (reusePoints.length > 0) notes.push(`Unique inventory exhausted — property reuse begins ${reusePoints.map((r) => `${r.dateKey} for ${r.connectionId.slice(0, 8)}`).join(", ")}.`)
  if (marketFallbacks.length > 0) notes.push(`${marketFallbacks.length} slot(s) fell forward to another market because the preferred one had nothing available.`)
  if (reusedPlacements > 0) {
    notes.push(`INSUFFICIENT for a healthy rotation: ${horizonPlacements} placement(s) requested against ${uniqueProperties} distinct propert${uniqueProperties === 1 ? "y" : "ies"} — ${reusedPlacements} (${reusePercent}%) repeat a building the account has already posted.`)
  }

  return {
    planned, excluded, marketFallbacks, reusePoints, collisions,
    sufficient, poolSize: new Set([...usableSomewhere]).size, requiredPoolSize, unfilledSlots,
    inventory: {
      horizonPlacements, eligiblePosts: usableSomewhere.size, uniqueProperties,
      uniquePlacements, reusedPlacements, reusePercent,
      firstReuseAt: firstReuse ? { dateKey: firstReuse.dateKey, minute: firstReuse.minute } : null,
      marketFallbacks: marketFallbacks.length, unfilledSlots, collisions: collisions.length,
      byPlatform: byPlatformStats,
    },
    notes,
  }
}
