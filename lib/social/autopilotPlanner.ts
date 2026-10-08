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
  /** REMOVED: horizonDays. The plan is fill-forward — it ends when inventory does, not on a fixed
   *  day count. The only bound is planAutopilot's `maxDays` safety cap, which is global rather than
   *  per rule so two connections cannot disagree about how far the queue reaches. */
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
  /** The BUILDING this placement is about — propertyKeyOf, not the content row. */
  propertyKey: string
  /** True when this property has been posted on this connection before (history or earlier in
   *  this plan). Fresh placements are false. */
  isRecycled: boolean
  /** When this connection last posted this property, if ever. Null for a genuinely fresh one. */
  lastPostedAt: string | null
  /** Days between that last posting and this slot. Null when fresh. Never below the cooldown. */
  daysSinceLastPosted: number | null
}

/**
 * What each connection has already posted, and when.
 *
 * connectionId -> propertyKey -> ISO timestamp of the most recent posting.
 *
 * Supplied by the caller from real rows rather than inferred, because "has this account posted
 * this building?" is a fact about history, not about the current pool — a property can be absent
 * from today's eligible pool and still have been posted last week.
 */
export type PostingHistory = ReadonlyMap<string, ReadonlyMap<string, string>>

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
  marketFallbacks: MarketFallback[]
  reusePoints: ReusePoint[]
  excluded: { postId: string; reason: Ineligible }[]
  collisions: RotationCollision[]
  /** True when the queue ran to the cap without ever needing to recycle a property. */
  sufficient: boolean
  poolSize: number
  requiredPoolSize: number
  unfilledSlots: number
  inventory: {
    eligiblePosts: number
    /** DISTINCT BUILDINGS — what a viewer perceives as repetition. */
    distinctProperties: number
    /** Properties this plan placed that the connection had never posted. */
    freshPropertiesAvailable: number
    freshPlacements: number
    recycledPlacements: number
    /** Distinct properties that had to be recycled at least once. */
    recycledProperties: number
    /** How far the queue can be filled at the current cadence, in days. */
    daysFillable: number
    /** Days of genuinely fresh content before the first recycle. THE headline number. */
    freshRunwayDays: number
    /** When the first recycled property is scheduled. Null when nothing recycles. */
    firstRecycleAt: { dateKey: string; minute: number; propertyName: string | null } | null
    /** Must always be 0 — a placement inside its cooldown is a planner bug, not a policy choice. */
    cooldownViolations: number
    cooldownDays: number
    marketFallbacks: number
    /** Slots the cap asked for that could not be filled because everything was inside cooldown. */
    unfilledSlots: number
    collisions: number
    byPlatform: {
      platform: string; connections: number; eligiblePosts: number
      distinctProperties: number; daysFillable: number; freshRunwayDays: number
    }[]
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
/**
 * FILL-FORWARD. Keep filling future slots with the freshest property available, as far ahead as
 * inventory safely allows, rather than stopping at an arbitrary horizon.
 *
 * Per slot, in strict order:
 *   1. a property this connection has NEVER posted               -> fresh
 *   2. a property whose last posting is OUTSIDE the cooldown,
 *      least-recently-posted first                               -> recycled
 *   3. nothing is outside cooldown -> stop. The queue ends here rather than publishing a repeat
 *      a viewer would notice.
 *
 * `maxDays` is a SAFETY CAP, not the plan length. With enough properties step 2 never runs dry —
 * 60 properties at 2/day is 30 days of fresh content, by which point the earliest is 30 days old
 * and clear of a 21-day cooldown — so without a cap this would fill forever.
 *
 * Cooldown is measured against the SLOT's own time, not planning time: a property posted today is
 * legal in a slot 22 days out even though it is illegal tomorrow.
 */
export function planAutopilot(input: {
  rules: readonly AutopilotRule[]
  pool: readonly PoolPost[]
  startDateKey: string
  wallClockToUtc: (dateKey: string, minute: number, tz: string) => string
  occupancyByConnection?: Map<string, Occupancy>
  /** What each connection has posted before. Absent = nothing posted yet. */
  history?: PostingHistory
  /** Minimum days before a property may appear again on the same connection. */
  cooldownDays?: number
  /** Safety cap on how far ahead to fill. Not the horizon — the plan ends earlier if inventory does. */
  maxDays?: number
}): AutopilotPlan {
  const cooldownDays = input.cooldownDays ?? 21
  const maxDays = Math.max(1, input.maxDays ?? 60)
  const notes: string[] = []
  const rules = input.rules.filter((r) => r.enabled)
  if (rules.length === 0) notes.push("No enabled autopilot rules — nothing to plan.")

  const byPlatform = new Map<string, AutopilotRule[]>()
  for (const r of rules) byPlatform.set(r.platform, [...(byPlatform.get(r.platform) ?? []), r])

  const planned: PlannedPost[] = []
  const marketFallbacks: MarketFallback[] = []
  const reusePoints: ReusePoint[] = []
  const excluded: { postId: string; reason: Ineligible }[] = []
  const collisions: RotationCollision[] = []
  const byPlatformStats: AutopilotPlan["inventory"]["byPlatform"] = []
  let unfilledSlots = 0, requiredPoolSize = 0, cooldownViolations = 0
  let freshPlacements = 0, recycledPlacements = 0
  const recycledPropertyKeys = new Set<string>()
  const usableSomewhere = new Set<string>()
  const exclusionReason = new Map<string, Ineligible>()
  const DAY_MS = 86_400_000

  for (const [platform, groupRules] of byPlatform) {
    const pool: PoolPost[] = []
    for (const p of input.pool) {
      const reason = ineligibleReason(p, platform)
      if (reason) { if (!exclusionReason.has(p.id)) exclusionReason.set(p.id, reason) }
      else { pool.push(p); usableSomewhere.add(p.id) }
    }
    if (pool.length === 0) notes.push(`No eligible ${platform} inventory: nothing rendered, unscheduled and unassigned for that network.`)

    const postsPerDay = Math.max(1, Math.min(...groupRules.map((r) => r.postsPerDay), 3) || 1)
    const dayKeys = dayKeysFrom(input.startDateKey, maxDays)
    const rotation = planRotation({
      connections: groupRules.map((r) => ({ connectionId: r.connectionId, startIndex: r.startIndex })),
      poolSize: pool.length, postsPerDay, dayKeys: dayKeys.slice(0, 7),
    })
    collisions.push(...rotation.collisions)
    requiredPoolSize += rotation.requiredPoolSize

    // Properties available on this network, and the posts that depict each one.
    const postsByProperty = new Map<string, PoolPost[]>()
    for (const p of pool) {
      const k = propertyKeyOf(p)
      postsByProperty.set(k, [...(postsByProperty.get(k) ?? []), p])
    }

    let groupDaysFilled = 0, groupFreshDays = 0

    for (const rule of groupRules) {
      const times = effectiveDailyTimes(rule.connectionId, rule.staggerOffsetMinutes, rule.dailyTimes)
      const placements: Placement[] = planDailyTimes({
        intervalDays: 1, dailyTimes: times, days: dayKeys,
        occupancy: input.occupancyByConnection?.get(rule.connectionId) ?? new Map(),
        maxOccurrences: maxDays * postsPerDay,
      })
      const start = rotation.startIndices.get(rule.connectionId) ?? 0
      const orderedProps = rotatePool([...postsByProperty.keys()], start)
      const marketsPresent = pool.map((p) => p.market ?? "").filter(Boolean)
      const order = marketOrderFor(rule.connectionId, weightedMarketOrder(rule.marketWeights, marketsPresent), rule.marketRotationSeed)

      // lastPosted starts from real history and is advanced as this plan places things, so the
      // cooldown applies across the boundary between what was posted and what is being planned.
      const lastPosted = new Map<string, number>()
      for (const [k, iso] of input.history?.get(rule.connectionId) ?? new Map()) {
        const ms = Date.parse(iso); if (!Number.isNaN(ms)) lastPosted.set(k, ms)
      }
      // Which creative was last used for a property, so a recycle prefers a different one.
      const usedCreatives = new Map<string, Set<string>>()
      let reuseRecorded = false
      let lastFilledDay: string | null = null, lastFreshDay: string | null = null

      for (const pl of placements) {
        const slotMs = Date.parse(input.wallClockToUtc(pl.dateKey, pl.minute, rule.timezone))
        const wantMarket = order.length ? order[placements.indexOf(pl) % order.length] : null
        const marketOf = (k: string) => postsByProperty.get(k)?.[0]?.market ?? null

        const fresh = orderedProps.filter((k) => !lastPosted.has(k))
        let key: string | undefined
        let recycled = false
        let fallbackReason: MarketFallback["reason"] | null = null

        if (fresh.length) {
          key = wantMarket ? fresh.find((k) => marketOf(k) === wantMarket) : fresh[0]
          if (!key && wantMarket) {
            fallbackReason = pool.some((p) => p.market === wantMarket) ? "market_inventory_already_used" : "no_eligible_inventory_in_market"
            key = fresh[0]
          }
        } else {
          // RECYCLE: least-recently-posted first, and never inside the cooldown measured at this slot.
          const legal = orderedProps
            .filter((k) => slotMs - (lastPosted.get(k) ?? 0) >= cooldownDays * DAY_MS)
            .sort((a, b) => (lastPosted.get(a) ?? 0) - (lastPosted.get(b) ?? 0))
          if (legal.length === 0) { unfilledSlots++; continue }
          key = wantMarket ? legal.find((k) => marketOf(k) === wantMarket) : legal[0]
          if (!key) {
            if (wantMarket) fallbackReason = pool.some((p) => p.market === wantMarket) ? "market_inventory_already_used" : "no_eligible_inventory_in_market"
            key = legal[0]
          }
          recycled = true
        }
        if (!key) { unfilledSlots++; continue }

        // CREATIVE CHOICE: prefer a depiction of this property the connection has not used yet.
        const variants = postsByProperty.get(key) ?? []
        const used = usedCreatives.get(key) ?? new Set<string>()
        const pick = variants.find((v) => !used.has(v.id)) ?? variants[0]
        if (!pick) { unfilledSlots++; continue }
        used.add(pick.id); usedCreatives.set(key, used)

        const prevMs = lastPosted.get(key) ?? null
        const days = prevMs === null ? null : Math.floor((slotMs - prevMs) / DAY_MS)
        if (days !== null && days < cooldownDays) cooldownViolations++

        if (recycled) {
          recycledPlacements++; recycledPropertyKeys.add(key)
          if (!reuseRecorded) {
            reusePoints.push({ connectionId: rule.connectionId, dateKey: pl.dateKey, minute: pl.minute, uniqueSourcesExhausted: postsByProperty.size })
            reuseRecorded = true
          }
        } else { freshPlacements++; lastFreshDay = pl.dateKey }

        if (fallbackReason && wantMarket && pick.market !== wantMarket) {
          marketFallbacks.push({ connectionId: rule.connectionId, dateKey: pl.dateKey, minute: pl.minute, requestedMarket: wantMarket, selectedMarket: pick.market, reason: fallbackReason })
        }
        lastPosted.set(key, slotMs)
        lastFilledDay = pl.dateKey
        planned.push({
          postId: pick.id, sourceContentId: pick.sourceContentId, connectionId: rule.connectionId,
          dateKey: pl.dateKey, minute: pl.minute,
          scheduledAtUtc: input.wallClockToUtc(pl.dateKey, pl.minute, rule.timezone),
          market: pick.market, propertyName: pick.propertyName,
          poolIndex: pool.findIndex((x) => x.id === pick.id),
          propertyKey: key, isRecycled: recycled, lastPostedAt: prevMs === null ? null : new Date(prevMs).toISOString(),
          daysSinceLastPosted: days,
        })
      }
      const dayIndex = (d: string | null) => (d ? dayKeys.indexOf(d) + 1 : 0)
      groupDaysFilled = Math.max(groupDaysFilled, dayIndex(lastFilledDay))
      groupFreshDays = Math.max(groupFreshDays, dayIndex(lastFreshDay))
    }

    byPlatformStats.push({
      platform, connections: groupRules.length, eligiblePosts: pool.length,
      distinctProperties: postsByProperty.size, daysFillable: groupDaysFilled, freshRunwayDays: groupFreshDays,
    })
  }

  for (const [id, reason] of exclusionReason) if (!usableSomewhere.has(id)) excluded.push({ postId: id, reason })
  planned.sort((a, b) => (a.scheduledAtUtc < b.scheduledAtUtc ? -1 : a.scheduledAtUtc > b.scheduledAtUtc ? 1 : a.connectionId < b.connectionId ? -1 : 1))

  const firstRecycled = planned.find((p) => p.isRecycled) ?? null
  const distinctProperties = new Set(input.pool.filter((p) => usableSomewhere.has(p.id)).map(propertyKeyOf)).size
  const daysFillable = Math.max(0, ...byPlatformStats.map((b) => b.daysFillable))
  const freshRunwayDays = Math.max(0, ...byPlatformStats.map((b) => b.freshRunwayDays))
  const sufficient = cooldownViolations === 0 && recycledPlacements === 0 && unfilledSlots === 0

  if (unfilledSlots > 0) notes.push(`${unfilledSlots} slot(s) left unfilled: every property was still inside its ${cooldownDays}-day cooldown. The queue ends rather than repeating too soon.`)
  if (recycledPlacements > 0) notes.push(`Fresh inventory runs out after ${freshRunwayDays} day(s); ${recycledPlacements} placement(s) recycle ${recycledPropertyKeys.size} propert${recycledPropertyKeys.size === 1 ? "y" : "ies"}, the longest-unused first.`)
  if (cooldownViolations > 0) notes.push(`BUG: ${cooldownViolations} placement(s) violate the ${cooldownDays}-day cooldown.`)
  if (marketFallbacks.length > 0) notes.push(`${marketFallbacks.length} slot(s) fell forward to another market.`)

  return {
    planned, excluded, marketFallbacks, reusePoints, collisions,
    sufficient, poolSize: usableSomewhere.size, requiredPoolSize, unfilledSlots,
    inventory: {
      eligiblePosts: usableSomewhere.size, distinctProperties,
      freshPropertiesAvailable: distinctProperties, freshPlacements, recycledPlacements,
      recycledProperties: recycledPropertyKeys.size, daysFillable, freshRunwayDays,
      firstRecycleAt: firstRecycled ? { dateKey: firstRecycled.dateKey, minute: firstRecycled.minute, propertyName: firstRecycled.propertyName } : null,
      cooldownViolations, cooldownDays, marketFallbacks: marketFallbacks.length,
      unfilledSlots, collisions: collisions.length, byPlatform: byPlatformStats,
    },
    notes,
  }
}
