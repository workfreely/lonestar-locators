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
import { ELIGIBLE_POOL_FILTER, ELIGIBLE_POOL_NOT_NULL, type EligibilityInput } from "@/lib/social/autopilotEligibility"
import { applyAutopilotPlan, supabaseClaimExecutor, DEFAULT_WRITE_MODE, type WriteMode, type WriteResult } from "@/lib/social/autopilotWrite"
import { planAutopilot, type AutopilotPlan, type AutopilotRule, type PoolPost } from "@/lib/social/autopilotPlanner"
import { loadPostingHistory } from "@/lib/social/postingHistory"
import { BASELINE_DAILY_TIMES } from "@/lib/social/autopilotDestination"
import { buildAutopilotOccupancy } from "@/lib/social/autopilotOccupancy"
import { wallClockToUtcISO, DEFAULT_TIMEZONE } from "@/lib/social/recurrence"

/** The 21-day property cooldown. Named here rather than left as the planner's default parameter,
 *  so the product rule is findable from the place that applies it. Value unchanged. */
export const COOLDOWN_DAYS = 21

/** How far ahead the queue is filled, at most. A safety cap, not the horizon — the plan ends
 *  earlier when inventory does. Unchanged from the route. */
export const MAX_PLAN_DAYS = 14

/** One select string, shared by the pool query and the re-read, so the two cannot drift. */
export const POOL_SELECT =
  "id, platform, status, render_status, rendered_storage_path, scheduled_at, published_at, external_post_id, connection_id, approved_at, follows_post_id, source_content_id, source:source_content_id(place_id, market, property_name)"

/** A joined social_posts row -> the planner's PoolPost. */
export function toPoolPost(r: Record<string, unknown>): PoolPost {
  const raw = (r as { source?: unknown }).source
  const src = (Array.isArray(raw) ? raw[0] : raw) as Record<string, unknown> | null | undefined
  return {
    id: String(r.id),
    sourceContentId: String(r.source_content_id ?? ""),
    placeId: (src?.place_id as string | null) ?? null,
    market: (src?.market as string | null) ?? null,
    propertyName: (src?.property_name as string | null) ?? null,
    status: (r.status as string | null) ?? null,
    renderStatus: (r.render_status as string | null) ?? null,
    renderedStoragePath: (r.rendered_storage_path as string | null) ?? null,
    scheduledAt: (r.scheduled_at as string | null) ?? null,
    publishedAt: (r.published_at as string | null) ?? null,
    externalPostId: (r.external_post_id as string | null) ?? null,
    connectionId: (r.connection_id as string | null) ?? null,
    platform: (r.platform as string | null) ?? null,
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
    .select("id, provider, status, posting_paused, posts_per_day, stagger_offset_minutes")
  const rules: AutopilotRule[] = (conns ?? []).map((c) => ({
    connectionId: String(c.id),
    platform: String(c.provider ?? "instagram"),
    enabled: c.status === "connected" && c.posting_paused !== true,
    timezone: DEFAULT_TIMEZONE,
    dailyTimes: BASELINE_DAILY_TIMES,
    postsPerDay: typeof c.posts_per_day === "number" && c.posts_per_day > 0 ? c.posts_per_day : BASELINE_DAILY_TIMES.length,
    marketWeights: {},
    marketRotationSeed: null,
    staggerOffsetMinutes: typeof c.stagger_offset_minutes === "number" ? c.stagger_offset_minutes : null,
    startIndex: null,
  }))

  // The SAME pool filter the predicate enforces, plus the approval NOT NULL columns. Every row is
  // still run through ineligibleReason inside the planner, so a column this query forgets cannot
  // admit an ineligible post.
  let q = supabaseAdmin.from("social_posts").select(POOL_SELECT)
  for (const [col, val] of Object.entries(ELIGIBLE_POOL_FILTER)) q = q.eq(col, val as never)
  for (const col of ELIGIBLE_POOL_NOT_NULL) q = q.not(col, "is", null)
  const { data: poolRows } = await q
  const pool = (poolRows ?? []).map(toPoolPost)

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

  return planAutopilot({
    rules, pool,
    startDateKey: new Intl.DateTimeFormat("en-CA", { timeZone: DEFAULT_TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(now),
    wallClockToUtc: wallClockToUtcISO,
    occupancyByConnection,
    history,
    cooldownDays: COOLDOWN_DAYS,
    maxDays: MAX_PLAN_DAYS,
  })
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
      .select("id, status, render_status, rendered_storage_path, scheduled_at, published_at, external_post_id, connection_id, platform, approved_at")
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
