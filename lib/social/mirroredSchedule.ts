// ONE CREATIVE, TWO PLATFORMS, THE SAME MINUTE.
//
// An agent who posts twice a day to Instagram and TikTok posts TWO videos, not four: the 07:30
// video goes to both surfaces and the 19:30 video goes to both. The planner cannot produce that on
// its own, and the reason is structural rather than a missing option:
//
//   • a social_posts row carries exactly one destination, so Instagram and TikTok are two rows;
//   • planAutopilot groups rules BY PLATFORM and builds a separate eligible pool per group, so the
//     two rows are chosen by two independent passes;
//   • each pass rotates the pool from its own start index and picks its own market order
//     (marketOrderFor hashes the CONNECTION id), so the two passes disagree by design — that
//     disagreement is what stops two agents presenting identical feeds.
//
// So the two platforms diverge for the same reasons that make multi-account rotation work. This
// module does not fight that. It MIRRORS: the lead destination is planned normally, by the existing
// planner, and the follower is handed the lead's choices rather than making its own.
//
// ── WHAT "THE SAME VIDEO" CAN AND CANNOT MEAN HERE ──────────────────────────────────────────
// The two rows cannot share one rendered artifact. instagram_reel has safeAreaId "instagram" and
// tiktok_video has "tiktok" — a different overlay geometry — and sharesAsset() is false for that
// pair, which is why tiktokSiblingRowFrom deliberately starts a sibling with NO render. Handing
// the Instagram MP4 to TikTok publishes pixels laid out for another app, which is the defect the
// publish route's wrong_destination guard exists to catch.
//
// What travels is therefore the CREATIVE, not the file: the same source_content_id — one upload of
// one building — the same caption, overlay copy, audio and presenter settings (copied by
// tiktokSiblingRowFrom), rendered once per geometry. Two viewers watching both feeds see the same
// video; the bytes differ only in where the headline sits.
//
// Matching is on source_content_id ALONE, never on the property. propertyKeyOf collapses two
// separate uploads of one building into one property, which is right for "don't repeat a building"
// and wrong here: two uploads are two different videos, and mirroring onto the wrong one would put
// a different video on TikTok while reporting success.
//
// ── UNMIRRORED SLOTS ARE REPORTED, NEVER SUBSTITUTED ────────────────────────────────────────
// When the follower has no eligible row for the lead's creative, the slot is left EMPTY and a gap
// is returned. The alternative — fall forward to whatever else the follower has — would publish a
// video to TikTok that is not the day's video, quietly breaking the one property this module
// exists to provide. Leaving the slot empty is the same choice the market restriction already
// makes, for the same reason.
//
// This module is PURE. It reads nothing and writes nothing: the caller supplies the lead's
// placements and the follower's eligible rows, and merges what comes back into the plan.
import { isMarketAllowed, parseMarketRestriction } from "@/lib/social/marketRestriction"

/** A placement the real planner produced for the lead destination. PlannedPost satisfies this. */
export type MirrorLead = {
  postId: string
  sourceContentId: string
  connectionId: string
  dateKey: string
  minute: number
  scheduledAtUtc: string
  market: string | null
  propertyName: string | null
  propertyKey: string
}

/** One of the follower's eligible rows. PoolPost satisfies this. */
export type MirrorCandidate = {
  id: string
  sourceContentId: string
  market: string | null
  propertyName: string | null
}

export type MirrorGapReason =
  /** The follower has no eligible row for this creative — usually not yet rendered for its geometry. */
  | "no_eligible_row_for_creative"
  /** Every follower row for this creative is already taken by an earlier slot in this mirror. */
  | "creative_already_mirrored"
  /** The slot is already filled on the follower — a previous run, or time that has passed. */
  | "slot_occupied"
  /** The follower is at its per-day ceiling for that calendar day. */
  | "daily_cap_reached"
  /** The creative's market is not one the FOLLOWER is permitted to post. Must never fire when the
   *  two destinations carry the same restriction; checked because it is cheap and silent failure
   *  is not. */
  | "market_not_permitted_on_follower"

export type MirrorGap = {
  followerConnectionId: string
  leadPostId: string
  sourceContentId: string
  dateKey: string
  minute: number
  market: string | null
  propertyName: string | null
  reason: MirrorGapReason
}

/** A follower placement. Deliberately the same shape the planner emits, so the caller can merge
 *  it into AutopilotPlan.planned and the existing write path needs no change. */
export type MirroredPlacement = {
  postId: string
  sourceContentId: string
  connectionId: string
  dateKey: string
  minute: number
  scheduledAtUtc: string
  market: string | null
  propertyName: string | null
  poolIndex: number
  propertyKey: string
  isRecycled: boolean
  lastPostedAt: string | null
  daysSinceLastPosted: null
  /** The lead placement this mirrors. Present only on mirrored rows, so a reader can always tell
   *  which half of a pair chose the creative and which half followed. */
  mirrorsPostId: string
}

export type MirrorResult = {
  placements: MirroredPlacement[]
  gaps: MirrorGap[]
  /** Slots the lead filled that the follower matched. */
  mirrored: number
  /** Slots the lead filled that the follower could not. */
  unmirrored: number
}

/** `${dateKey}:${minute}` — the key the caller builds from the follower's existing occupancy. */
export const slotKeyOf = (dateKey: string, minute: number): string => `${dateKey}:${minute}`

/**
 * Give the follower the lead's schedule.
 *
 * THE TIME IS THE LEAD'S, EXACTLY. Not the follower's own derived minute: "the same video at
 * 07:30 on both platforms" is the requirement, and a follower that computed its own stagger would
 * post the same video a few minutes apart for no reason anyone asked for. A destination whose
 * stagger_offset_minutes is 0 — which is what a mirrored pair should carry — would have produced
 * the same minute anyway.
 *
 * IDEMPOTENCE comes from `occupiedSlots`, and it is what keeps a failure on one platform from
 * duplicating on the other. If the lead's Instagram post failed and a later run re-plans, the
 * follower's slot is already filled, so this returns a `slot_occupied` gap instead of a second
 * TikTok row for the same moment. Publishing success is tracked per row and is never consulted
 * here: this module decides what is SCHEDULED, and one platform's outcome has no vote in that.
 */
export function mirrorSchedule(input: {
  leadPlacements: readonly MirrorLead[]
  followerConnectionId: string
  followerPool: readonly MirrorCandidate[]
  /** The follower's own market restriction. Null ⇒ unrestricted. */
  followerAllowedMarkets?: readonly string[] | null
  /** `${dateKey}:${minute}` for slots the follower has already filled. */
  occupiedSlots?: ReadonlySet<string>
  /** The follower's posts_per_day ceiling. Absent ⇒ the lead's own count governs. */
  followerPostsPerDay?: number | null
}): MirrorResult {
  const { followerConnectionId } = input
  const allowed = parseMarketRestriction(input.followerAllowedMarkets ?? null)
  const occupied = input.occupiedSlots ?? new Set<string>()
  const perDayCap = typeof input.followerPostsPerDay === "number" && input.followerPostsPerDay > 0
    ? Math.trunc(input.followerPostsPerDay)
    : null

  // The follower's rows indexed by creative. A creative with several follower rows (a re-render,
  // say) keeps them in input order, so the choice is deterministic.
  const byCreative = new Map<string, MirrorCandidate[]>()
  for (const c of input.followerPool) {
    const k = (c.sourceContentId ?? "").trim()
    if (!k) continue
    byCreative.set(k, [...(byCreative.get(k) ?? []), c])
  }

  const placements: MirroredPlacement[] = []
  const gaps: MirrorGap[] = []
  const taken = new Set<string>()
  const placedOnDay = new Map<string, number>()

  // Chronological, so "the first slot of the day gets the first available row" is stable and a
  // re-run of the same inputs produces the same pairing.
  const leads = [...input.leadPlacements].sort((a, b) =>
    a.scheduledAtUtc < b.scheduledAtUtc ? -1 : a.scheduledAtUtc > b.scheduledAtUtc ? 1
    : a.postId < b.postId ? -1 : a.postId > b.postId ? 1 : 0,
  )

  for (const lead of leads) {
    const creative = (lead.sourceContentId ?? "").trim()
    const gap = (reason: MirrorGapReason) => {
      gaps.push({
        followerConnectionId, leadPostId: lead.postId, sourceContentId: creative,
        dateKey: lead.dateKey, minute: lead.minute, market: lead.market,
        propertyName: lead.propertyName, reason,
      })
    }

    if (occupied.has(slotKeyOf(lead.dateKey, lead.minute))) { gap("slot_occupied"); continue }
    if (perDayCap !== null && (placedOnDay.get(lead.dateKey) ?? 0) >= perDayCap) { gap("daily_cap_reached"); continue }
    // The follower's own restriction, asked before anything is selected — the same ordering the
    // planner uses, for the same reason.
    if (!isMarketAllowed(allowed, lead.market)) { gap("market_not_permitted_on_follower"); continue }

    const candidates = creative ? byCreative.get(creative) ?? [] : []
    if (candidates.length === 0) { gap("no_eligible_row_for_creative"); continue }
    const pick = candidates.find((c) => !taken.has(c.id))
    if (!pick) { gap("creative_already_mirrored"); continue }

    taken.add(pick.id)
    placedOnDay.set(lead.dateKey, (placedOnDay.get(lead.dateKey) ?? 0) + 1)
    placements.push({
      postId: pick.id,
      sourceContentId: creative,
      connectionId: followerConnectionId,
      dateKey: lead.dateKey,
      minute: lead.minute,
      scheduledAtUtc: lead.scheduledAtUtc,
      // The LEAD's market and property, which is the pair's identity. The follower row's own
      // columns come from the same source_content_id and must agree; taking the lead's keeps the
      // pair's reported market single-valued even if a join somewhere returned null.
      market: lead.market,
      propertyName: lead.propertyName,
      poolIndex: input.followerPool.findIndex((x) => x.id === pick.id),
      propertyKey: lead.propertyKey,
      // Freshness is a fact about the LEAD's selection; the follower did not choose and does not
      // get its own cooldown accounting. Reported as the lead's slot being fresh or not is the
      // caller's business — here it is false, and `mirrorsPostId` says where to look instead.
      isRecycled: false,
      lastPostedAt: null,
      daysSinceLastPosted: null,
      mirrorsPostId: lead.postId,
    })
  }

  return { placements, gaps, mirrored: placements.length, unmirrored: gaps.length }
}

/**
 * How many of each market the mirror actually placed, per destination — the number that shows
 * whether the SA/Austin balance survived contact with inventory, rather than whether it was
 * requested.
 */
export function marketTally(placements: readonly { market: string | null }[]): Map<string, number> {
  const out = new Map<string, number>()
  for (const p of placements) {
    const m = (p.market ?? "").trim()
    if (!m) continue
    out.set(m, (out.get(m) ?? 0) + 1)
  }
  return out
}
