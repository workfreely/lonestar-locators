// ONE AUTOPILOT RUN — compute a plan from live state and apply it.
//
// RELOCATED, NOT REDESIGNED. Every line below came out of
// app/api/admin/social-autopilot/autopilot/plan/route.ts unchanged. It moved here for exactly one
// reason: a second caller (the cron trigger) must run the SAME code, not a copy of it. A copy is
// how two schedulers come to disagree about the cooldown.
//
// The route keeps what is the route's: platform-admin authorisation, request parsing, the HTTP
// response. What moved is the part that must be identical no matter who calls it.
//
// WHAT THIS MODULE DOES NOT DECIDE: whether it may write. `mode` arrives already resolved by the
// caller, and `persist` additionally needs an executor — see applyAutopilotPlan, which throws
// rather than report a write that did not happen.
import { supabaseAdmin } from "@/lib/supabase/admin"
import { ELIGIBLE_POOL_FILTER, ELIGIBLE_POOL_NOT_NULL, ineligibleReason, type EligibilityInput } from "@/lib/social/autopilotEligibility"
import { applyAutopilotPlan, supabaseClaimExecutor, DEFAULT_WRITE_MODE, type WriteMode, type WriteResult } from "@/lib/social/autopilotWrite"
import { planAutopilot, type AutopilotPlan, type AutopilotRule, type PoolPost } from "@/lib/social/autopilotPlanner"
import { mirrorSchedule, marketTally, slotKeyOf, type MirrorGap } from "@/lib/social/mirroredSchedule"
import { debutStateFor } from "@/lib/social/debutGate"
import { autoCreateTikTokSiblings } from "@/lib/social/siblingAutoCreate"
import { effectiveAgent } from "@/lib/social/agentIdentity"
import { loadPostingHistory } from "@/lib/social/postingHistory"
import { parseMarketRestriction } from "@/lib/social/marketRestriction"
import { BASELINE_DAILY_TIMES, dailyTimesForPostsPerDay } from "@/lib/social/autopilotDestination"
import { buildAutopilotOccupancy } from "@/lib/social/autopilotOccupancy"
import { isPlannableConnection } from "@/lib/social/connectionHealth"
import { wallClockToUtcISO, DEFAULT_TIMEZONE } from "@/lib/social/recurrence"

/** The 21-day property cooldown. Named here rather than left as the planner's default parameter,
 *  so the product rule is findable from the place that applies it. Value unchanged. */
export const COOLDOWN_DAYS = 21

/** How far ahead the queue is filled, at most. A safety cap, not the horizon — the plan ends
 *  earlier when inventory does. Unchanged from the route. */
export const MAX_PLAN_DAYS = 14

/** One select string, shared by the pool query and the re-read, so the two cannot drift. */
export const POOL_SELECT =
  "id, platform, destination, status, render_status, rendered_storage_path, scheduled_at, published_at, external_post_id, connection_id, approved_at, follows_post_id, source_content_id, source:source_content_id(place_id, market, property_name, available_to_agents), render:render_id(identity_state, identity_owner_user_id)"

/**
 * The same select, plus the two social_content columns the personal-ownership and first-video
 * features read.
 *
 * SEPARATE FROM POOL_SELECT, AND THE REASON MATTERS. Those columns are introduced by a prepared
 * migration that is not applied yet. PostgREST fails the WHOLE query when an embedded select names
 * a column that does not exist — so shipping this inside POOL_SELECT would empty the eligible pool
 * on a deploy that landed before the migration, and an empty pool plans nothing and reports no
 * error. The pool query therefore tries this one and falls back to POOL_SELECT, recording the
 * fallback in the plan's notes rather than degrading quietly.
 */
export const POOL_SELECT_WITH_OWNERSHIP = POOL_SELECT.replace(
  "available_to_agents)",
  "available_to_agents, personal_agent_user_id)",
)

/** A joined social_posts row -> the planner's PoolPost. */
export function toPoolPost(r: Record<string, unknown>): PoolPost {
  const raw = (r as { source?: unknown }).source
  const src = (Array.isArray(raw) ? raw[0] : raw) as Record<string, unknown> | null | undefined
  const rawRender = (r as { render?: unknown }).render
  const ren = (Array.isArray(rawRender) ? rawRender[0] : rawRender) as Record<string, unknown> | null | undefined
  return {
    id: String(r.id),
    sourceContentId: String(r.source_content_id ?? ""),
    placeId: (src?.place_id as string | null) ?? null,
    market: (src?.market as string | null) ?? null,
    propertyName: (src?.property_name as string | null) ?? null,
    // Phase C. A post with no social_renders row yields null, which the predicate reads as
    // 'unknown' — fail-closed for an agent, no objection for the owner's own account.
    identityState: (ren?.identity_state as PoolPost["identityState"]) ?? null,
    identityOwnerUserId: (ren?.identity_owner_user_id as string | null) ?? null,
    availableToAgents: (src?.available_to_agents as boolean | null) ?? null,
    // Absent when the ownership migration is not applied, or when the fallback select was used.
    // Null reads as "unassigned", which is how the entire existing library behaves.
    personalAgentUserId: (src?.personal_agent_user_id as string | null) ?? null,
    status: (r.status as string | null) ?? null,
    renderStatus: (r.render_status as string | null) ?? null,
    renderedStoragePath: (r.rendered_storage_path as string | null) ?? null,
    scheduledAt: (r.scheduled_at as string | null) ?? null,
    publishedAt: (r.published_at as string | null) ?? null,
    externalPostId: (r.external_post_id as string | null) ?? null,
    connectionId: (r.connection_id as string | null) ?? null,
    platform: (r.platform as string | null) ?? null,
    // The surface, which is what decides the post's network now. See providerOf.
    destination: (r.destination as string | null) ?? null,
    approvedAt: (r.approved_at as string | null) ?? null,
    followsPostId: (r.follows_post_id as string | null) ?? null,
  }
}

/**
 * Compute a plan from live state, using the existing pieces unchanged.
 *
 * Rules come from the connected accounts (each carrying its OWN provider, so a TikTok account can
 * never be offered Instagram posts), times from BASELINE_DAILY_TIMES (7:30 / 19:30), the cooldown
 * from COOLDOWN_DAYS, and the history from loadPostingHistory — without which every property reads
 * as "fresh" and the 21-day rule silently never fires.
 *
 * READ ONLY. Nothing here writes; the caller decides whether to apply what comes back.
 */
export async function computeAutopilotPlan(now: Date = new Date()): Promise<AutopilotPlan> {
  const { data: conns } = await supabaseAdmin
    .from("social_connections")
    .select("id, provider, status, posting_paused, posts_per_day, stagger_offset_minutes, token_expires_at, market_restriction, agent_user_id, owner_user_id, mirrors_connection_id, balance_markets")
  const rules: AutopilotRule[] = (conns ?? []).map((c) => ({
    connectionId: String(c.id),
    // Carried so the planner can ask whose account this is. A null agent is the OWNER's own
    // account, which is what the live TikTok row looks like — never "no agent".
    agentUserId: (c as { agent_user_id?: string | null }).agent_user_id ?? null,
    ownerUserId: (c as { owner_user_id?: string | null }).owner_user_id ?? null,
    platform: String(c.provider ?? "instagram"),
    // `status` alone is not enough: it is stamped at OAuth time and never revisited, so a row can
    // read "connected" with an access token that expired days ago. isPlannableConnection keeps a
    // REFRESHABLE account in the rotation (the publish path refreshes on the way through) and
    // excludes a genuinely disconnected one, which would otherwise fill a queue that cannot drain.
    enabled: isPlannableConnection(c as { status?: string | null; token_expires_at?: string | null }, now)
      && c.posting_paused !== true,
    timezone: DEFAULT_TIMEZONE,
    // THIS DESTINATION'S OWN TIMES, from its own posts_per_day. Previously every rule got the whole
    // baseline and posts_per_day only capped the horizon total, so the column could not express "one
    // a day" at all. NULL — which is what both live rows carry — yields the full baseline, so their
    // schedules are byte-identical to before: 07:30 and 19:30, plus their own (explicit, zero)
    // stagger.
    //
    // The SAME value is handed to buildAutopilotOccupancy below. That is load-bearing: the
    // occupancy builder marks today's elapsed times as spent, and if it computed them from a
    // different baseline than the planner fills, the minute marked spent would not be the minute
    // the planner tries to use — which is exactly the duplicate-scheduling hazard its header warns
    // about.
    dailyTimes: dailyTimesForPostsPerDay(typeof c.posts_per_day === "number" ? c.posts_per_day : null),
    postsPerDay: typeof c.posts_per_day === "number" && c.posts_per_day > 0 ? c.posts_per_day : BASELINE_DAILY_TIMES.length,
    marketWeights: {},
    // THE DESTINATION'S OWN MARKET RESTRICTION, straight off its row. NULL stays null, which the
    // planner reads as unrestricted — so every account that predates the column keeps drawing
    // from every market. Read here rather than defaulted, because a default is how a restriction
    // gets lost: the planner requires this field, so a future rule built without it fails to
    // compile instead of quietly posting San Antonio to a Dallas-only account.
    allowedMarkets: parseMarketRestriction((c as { market_restriction?: unknown }).market_restriction),
    // Opt-in, column-driven. FALSE on every destination that predates the column, which is the
    // planner's long-standing parity rule — the identical code path, not an equivalent one.
    balanceMarkets: (c as { balance_markets?: boolean | null }).balance_markets === true,
    marketRotationSeed: null,
    staggerOffsetMinutes: typeof c.stagger_offset_minutes === "number" ? c.stagger_offset_minutes : null,
    startIndex: null,
  }))

  // The SAME pool filter the predicate enforces, plus the approval NOT NULL columns. Every row is
  // still run through ineligibleReason inside the planner, so a column this query forgets cannot
  // admit an ineligible post.
  const poolQuery = (select: string) => {
    let q = supabaseAdmin.from("social_posts").select(select)
    for (const [col, val] of Object.entries(ELIGIBLE_POOL_FILTER)) q = q.eq(col, val as never)
    for (const col of ELIGIBLE_POOL_NOT_NULL) q = q.not(col, "is", null)
    return q
  }
  const planNotes: string[] = []
  let { data: poolRows, error: poolErr } = await poolQuery(POOL_SELECT_WITH_OWNERSHIP)
  if (poolErr) {
    // The ownership column is not there yet. Fall back to the select that has always worked, and
    // SAY SO — a pool read that silently lost a column is how a personal video ends up treated as
    // general content.
    ;({ data: poolRows } = await poolQuery(POOL_SELECT))
    planNotes.push(`social_content.personal_agent_user_id is not readable (${poolErr.message.slice(0, 120)}), so personal-video ownership is not being enforced by the planner. Apply the ownership migration before assigning a video to anyone.`)
  }
  // The select is chosen at runtime, so supabase-js cannot infer the row type from a literal and
  // falls back to GenericStringError[]. The shape is verified by toPoolPost reading each column
  // defensively and by the fallback above, not by this assertion — a cast proves nothing about
  // what PostgREST returned.
  const pool = ((poolRows ?? []) as unknown as Record<string, unknown>[]).map(toPoolPost)

  const history = await loadPostingHistory(supabaseAdmin as never, { now })

  // WHAT IS ALREADY ON THE CALENDAR. This argument is why a repeating trigger is idempotent: the
  // slots a previous run filled, and the times that have simply passed today, are not offered
  // again. planAutopilot has always taken it; until now nobody passed it, which only mattered once
  // something started calling this more than once. See lib/social/autopilotOccupancy.ts.
  const occupancyByConnection = await buildAutopilotOccupancy(supabaseAdmin as never, {
    connections: rules.map((r) => ({
      connectionId: r.connectionId,
      staggerOffsetMinutes: r.staggerOffsetMinutes,
      dailyTimes: r.dailyTimes,
      timezone: r.timezone,
    })),
    now,
  })

  // ── THE FIRST VIDEO, PER AGENT ─────────────────────────────────────────────────────────────
  // While an agent's debut is outstanding, every one of that agent's destinations is narrowed to
  // the debut content, so the next slot takes the first video and nothing queues ahead of it. The
  // publishing gate in the Buffer worker enforces the other half — that nothing else may publish
  // even if it somehow reached a slot. See lib/social/debutGate.ts.
  const debutContentByAgent = new Map<string, string>()
  {
    const { data: debutRows, error: debutErr } = await supabaseAdmin
      .from("social_content")
      .select("id, debut_for_agent_user_id")
      .not("debut_for_agent_user_id", "is", null)
    if (debutErr) {
      // Same reasoning as the pool fallback: the column arrives with a prepared migration, and a
      // first-video requirement that silently is not enforced is worse than one that says so.
      planNotes.push(`social_content.debut_for_agent_user_id is not readable (${debutErr.message.slice(0, 120)}), so no first-video hold is being applied. Apply the ownership migration before designating one.`)
    } else {
      for (const r of debutRows ?? []) {
        const agent = String((r as { debut_for_agent_user_id?: string | null }).debut_for_agent_user_id ?? "").trim()
        const contentId = String((r as { id?: string | null }).id ?? "").trim()
        // FIRST ONE WINS, and a second is reported rather than silently ignored: two debuts for one
        // agent is a contradiction the operator has to resolve, not something to pick between.
        if (!agent || !contentId) continue
        if (debutContentByAgent.has(agent)) {
          planNotes.push(`Agent ${agent} has more than one video designated as its first — ${debutContentByAgent.get(agent)} is being used and ${contentId} is ignored. Clear one.`)
          continue
        }
        debutContentByAgent.set(agent, contentId)
      }
    }
  }
  for (const [agent, contentId] of debutContentByAgent) {
    // EVERY destination of that agent, paused ones included — see debutStateFor's own note on why
    // a paused account still has to receive the first video before the rest is released.
    const destinationIds = (conns ?? [])
      .filter((c) => effectiveAgent(c as { agent_user_id?: string | null; owner_user_id?: string | null }) === agent)
      .map((c) => String(c.id))
    const { data: publishedRows, error: publishedErr } = await supabaseAdmin
      .from("social_posts")
      .select("connection_id")
      .eq("source_content_id", contentId)
      .eq("status", "published")
      .not("connection_id", "is", null)
    if (publishedErr) {
      // UNREADABLE ⇒ HOLD. The hold is the safe direction: assuming the debut had published
      // because we could not check would release the queue on exactly the run that could not see.
      for (const r of rules) if (destinationIds.includes(r.connectionId)) r.debutContentId = contentId
      planNotes.push(`Could not read where agent ${agent}'s first video has published (${publishedErr.message.slice(0, 120)}) — the hold stays on, and only that video is being scheduled.`)
      continue
    }
    const state = debutStateFor({
      contentId,
      destinationConnectionIds: destinationIds,
      publishedConnectionIds: (publishedRows ?? []).map((r) => String((r as { connection_id?: string | null }).connection_id ?? "")),
    })
    if (state.required && !state.satisfied) {
      for (const r of rules) if (destinationIds.includes(r.connectionId)) r.debutContentId = contentId
      planNotes.push(`Agent ${agent} is held for its first video (content ${contentId}): published on ${state.publishedOn.length} of ${state.publishedOn.length + state.pending.length} destination(s). Only that video is being scheduled until it publishes on all of them.`)
    } else if (state.required) {
      planNotes.push(`Agent ${agent}'s first video has published on every destination — the hold is satisfied and regular content is scheduling normally. Clear debut_for_agent_user_id when convenient.`)
    }
  }

  // ── WHICH DESTINATIONS FOLLOW ANOTHER ──────────────────────────────────────────────────────
  // social_connections.mirrors_connection_id, read here rather than carried on AutopilotRule
  // because the planner never consults it: mirroring happens AFTER the plan, to the plan. Null on
  // every destination that predates the column, so the filter below is a no-op for all of them.
  const mirrorOf = new Map<string, string>()
  for (const c of conns ?? []) {
    const lead = (c as { mirrors_connection_id?: string | null }).mirrors_connection_id
    if (lead) mirrorOf.set(String(c.id), String(lead))
  }
  const ruleByConnection = new Map(rules.map((r) => [r.connectionId, r]))

  const plan = planAutopilot({
    // A FOLLOWER MUST NOT ALSO PLAN FOR ITSELF. Its slots come from its lead; letting it choose
    // independently would fill the same minutes with a different creative, and then one of the two
    // rows would lose its post to buildClaims' per-post dedupe — leaving a gap that looks like
    // missing inventory. Excluded here and mirrored below.
    rules: rules.filter((r) => !mirrorOf.has(r.connectionId)),
    pool,
    startDateKey: new Intl.DateTimeFormat("en-CA", { timeZone: DEFAULT_TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(now),
    wallClockToUtc: wallClockToUtcISO,
    occupancyByConnection,
    history,
    cooldownDays: COOLDOWN_DAYS,
    maxDays: MAX_PLAN_DAYS,
  })

  // Everything the reads above had to say, carried into the plan rather than logged and lost.
  plan.notes.push(...planNotes)

  // Originals whose follower had no row to put in a slot — the work list for automatic sibling
  // creation, collected across every mirrored pair. See lib/social/siblingAutoCreate.ts for why
  // this list and not "every approved Instagram post".
  const needsSibling: string[] = []

  for (const [followerId, leadId] of mirrorOf) {
    const follower = ruleByConnection.get(followerId)
    if (!follower) continue
    if (!follower.enabled) {
      plan.notes.push(`Destination ${followerId} mirrors ${leadId} but is paused or not plannable — nothing mirrored.`)
      continue
    }
    if (!ruleByConnection.has(leadId)) {
      plan.notes.push(`Destination ${followerId} mirrors ${leadId}, which is not a connected destination — nothing mirrored. The pair is broken until mirrors_connection_id points at a real row.`)
      continue
    }
    const leadPlacements = plan.planned.filter((p) => p.connectionId === leadId)
    if (leadPlacements.length === 0) {
      plan.notes.push(`Destination ${followerId} mirrors ${leadId}, which has no placements this run — nothing to mirror.`)
      continue
    }

    // Rows another destination already took. Excluded so a competing rule on the follower's own
    // platform cannot win the row that completes the pair: the pair is the point, and half a pair
    // is a different video on one of the two platforms.
    const claimed = new Set(plan.planned.map((p) => p.postId))
    const followerPool = pool
      .filter((p) => !claimed.has(p.id) && !ineligibleReason(p, follower.platform))
      .map((p) => ({ id: p.id, sourceContentId: p.sourceContentId, market: p.market, propertyName: p.propertyName }))

    // The follower's own calendar: slots a previous run filled, and today's elapsed times. This is
    // what makes a re-run add nothing — and what stops a failure on the lead's platform from
    // producing a second follower row for a minute that already has one.
    const occupiedSlots = new Set<string>()
    for (const [dateKey, day] of occupancyByConnection.get(followerId) ?? new Map()) {
      for (const minute of day.minutes ?? []) occupiedSlots.add(slotKeyOf(dateKey, minute))
    }

    const mirrored = mirrorSchedule({
      leadPlacements,
      followerConnectionId: followerId,
      followerPool,
      followerAllowedMarkets: follower.allowedMarkets,
      occupiedSlots,
      followerPostsPerDay: follower.postsPerDay,
    })
    plan.planned.push(...mirrored.placements)

    const tally = [...marketTally(mirrored.placements).entries()].map(([m, n]) => `${m} ${n}`).join(", ")
    plan.notes.push(`Destination ${followerId} mirrors ${leadId}: ${mirrored.mirrored} of ${leadPlacements.length} slot(s) carry the same creative at the same minute${tally ? ` (${tally})` : ""}.`)
    for (const g of mirrored.gaps) {
      if (g.reason === "no_eligible_row_for_creative") needsSibling.push(g.leadPostId)
    }
    if (mirrored.unmirrored > 0) {
      const byReason = new Map<MirrorGap["reason"], number>()
      for (const g of mirrored.gaps) byReason.set(g.reason, (byReason.get(g.reason) ?? 0) + 1)
      plan.notes.push(`Destination ${followerId}: ${mirrored.unmirrored} slot(s) left UNFILLED rather than carrying a different video — ${[...byReason.entries()].map(([r, n]) => `${r} ${n}`).join(", ")}.`)
    }
  }

  // ── THE MISSING TIKTOK HALVES ──────────────────────────────────────────────────────────────
  // Off unless SOCIAL_TIKTOK_SIBLING_AUTOCREATE is set, in which case each unfillable follower
  // slot gets its sibling row created and queued to render. Reported into the plan's notes either
  // way, so an operator reading a dry run can see what the queue is waiting for.
  const siblings = await autoCreateTikTokSiblings(needsSibling)
  plan.notes.push(...siblings.notes)
  if (siblings.created.length > 0) {
    plan.notes.push(`Created ${siblings.created.length} TikTok sibling(s) and queued ${siblings.renderJobsQueued} render job(s). They are drafts until rendered and approved, and will be mirrored into their slots on the next run.`)
  }
  if (siblings.skipped.length > 0) {
    plan.notes.push(`${siblings.skipped.length} TikTok sibling(s) were not created: ${siblings.skipped.map((x) => x.reason).join(", ")}.`)
  }

  // Re-sorted on the planner's own comparator, so a merged plan reads in schedule order and the
  // write path's slot dedupe sees the same ordering it would have seen without mirroring.
  plan.planned.sort((a, b) => (a.scheduledAtUtc < b.scheduledAtUtc ? -1 : a.scheduledAtUtc > b.scheduledAtUtc ? 1 : a.connectionId < b.connectionId ? -1 : 1))
  return plan
}

export type AutopilotRunResult = WriteResult & {
  persisted: boolean
  planSource: "computed_server_side" | "supplied_in_request"
  cooldownDays: number
  dailyTimes: readonly number[]
}

/**
 * Apply a plan — computing one first if none was supplied.
 *
 * `mode` is the ALREADY-RESOLVED mode. This function does not consult the environment and does not
 * second-guess the caller: the admin route and the cron each decide, by their own rules, whether a
 * persist is permitted, and the decision arrives here settled.
 */
export async function runAutopilotPlan(input: {
  plan?: AutopilotPlan
  mode: WriteMode
  now?: Date
}): Promise<AutopilotRunResult> {
  const now = input.now ?? new Date()
  const mode = input.mode ?? DEFAULT_WRITE_MODE

  let plan = input.plan
  let computed = false
  if (!plan || !Array.isArray(plan.planned)) {
    plan = await computeAutopilotPlan(now)
    computed = true
  }

  // SERVICE ROLE, deliberately — not a caller's RLS client. An RLS client would return 200 with
  // zero rows affected on a policy-denied UPDATE, and this module reads "zero rows" as "another
  // writer claimed it first". An authorisation failure would then be reported as a lost race and
  // the schedule would quietly come up short. Authorisation happens in the caller; this client is
  // only how the write is executed.
  const supabase = supabaseAdmin
  // Load CURRENT state for every post the plan names. The plan is a snapshot; this is the row as it
  // is now. Both this and the conditional UPDATE's WHERE clause must agree before anything is
  // claimed — one is a better error message, the other is the actual guarantee.
  const ids = [...new Set(plan.planned.map((p) => p.postId))]
  const current = new Map<string, EligibilityInput>()
  if (ids.length) {
    const { data, error } = await supabase
      .from("social_posts")
      .select("id, status, render_status, rendered_storage_path, scheduled_at, published_at, external_post_id, connection_id, platform, destination, approved_at")
      .in("id", ids)
    if (error) throw new Error(`load_failed: ${error.message}`)
    for (const r of data ?? []) {
      current.set(r.id as string, {
        status: r.status as string | null,
        renderStatus: r.render_status as string | null,
        renderedStoragePath: r.rendered_storage_path as string | null,
        scheduledAt: r.scheduled_at as string | null,
        publishedAt: r.published_at as string | null,
        externalPostId: r.external_post_id as string | null,
        connectionId: r.connection_id as string | null,
        platform: r.platform as string | null,
        destination: r.destination as string | null,
        approvedAt: r.approved_at as string | null,
      })
    }
  }

  const result = await applyAutopilotPlan({
    plan, current, mode,
    // The executor is only constructed for a real persist, so a dry run has no object capable of
    // writing even if the mode were somehow wrong.
    executor: mode === "persist" ? supabaseClaimExecutor(supabase) : undefined,
  })

  return {
    ...result,
    // Stated in the response, not inferred by the caller, so a UI cannot show "scheduled" after a
    // run that deliberately wrote nothing.
    persisted: mode === "persist",
    // Which half produced the plan.
    planSource: computed ? "computed_server_side" : "supplied_in_request",
    cooldownDays: COOLDOWN_DAYS,
    dailyTimes: BASELINE_DAILY_TIMES,
  }
}
