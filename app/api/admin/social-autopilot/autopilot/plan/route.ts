import { NextResponse, type NextRequest } from "next/server"
import { requirePlatformAdmin } from "@/lib/auth/requirePlatformAdmin"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { ELIGIBLE_POOL_FILTER, ELIGIBLE_POOL_NOT_NULL, type EligibilityInput } from "@/lib/social/autopilotEligibility"
import { applyAutopilotPlan, supabaseClaimExecutor, DEFAULT_WRITE_MODE, type WriteMode } from "@/lib/social/autopilotWrite"
import { planAutopilot, type AutopilotPlan, type AutopilotRule, type PoolPost } from "@/lib/social/autopilotPlanner"
import { loadPostingHistory } from "@/lib/social/postingHistory"
import { BASELINE_DAILY_TIMES } from "@/lib/social/autopilotDestination"
import { wallClockToUtcISO, DEFAULT_TIMEZONE } from "@/lib/social/recurrence"

/** The 21-day property cooldown. Named here rather than left as the planner's default parameter,
 *  so the product rule is findable from the place that applies it. Value unchanged. */
const COOLDOWN_DAYS = 21

/** One select string, shared by the pool query and the re-read, so the two cannot drift. */
const POOL_SELECT =
  "id, platform, status, render_status, rendered_storage_path, scheduled_at, published_at, external_post_id, connection_id, approved_at, follows_post_id, source_content_id, source:source_content_id(place_id, market, property_name)"

/** A joined social_posts row -> the planner's PoolPost. */
function toPoolPost(r: Record<string, unknown>): PoolPost {
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

// AUTOPILOT PLAN — preview a schedule, or commit one.
//
// DRY RUN IS THE DEFAULT AND THE FALLBACK. `mode` must be the exact string "persist" to write;
// anything else — absent, misspelled, true, "PERSIST", 1 — is a dry run. A typo cannot schedule.
//
// A SECOND, INDEPENDENT SWITCH. Persist additionally requires SOCIAL_AUTOPILOT_WRITE_ENABLED
// === "true" in the environment. Both must agree, so no request alone can cause a write while the
// feature is parked — the same fail-closed shape as SOCIAL_INSTAGRAM_AUTOPUBLISH_ENABLED, and
// entirely separate from it. Scheduling and publishing are different powers: this route can place
// posts on a calendar, and nothing here can publish one.
//
// NOT WIRED TO ANY CRON. It is called by hand, by a platform admin. There is no automatic caller,
// so nothing schedules on a timer.
export const dynamic = "force-dynamic"

const writeEnabled = () => (process.env.SOCIAL_AUTOPILOT_WRITE_ENABLED ?? "").trim() === "true"

/**
 * Compute a plan from live state, using the existing pieces unchanged.
 *
 * Rules come from the connected accounts (each carrying its OWN provider, so a TikTok account can
 * never be offered Instagram posts), times from BASELINE_DAILY_TIMES (7:30 / 19:30), the cooldown
 * from COOLDOWN_DAYS, and the history from loadPostingHistory — without which every property reads
 * as "fresh" and the 21-day rule silently never fires.
 */
async function computePlan(now: Date = new Date()): Promise<AutopilotPlan> {
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

  return planAutopilot({
    rules, pool,
    startDateKey: new Intl.DateTimeFormat("en-CA", { timeZone: DEFAULT_TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(now),
    wallClockToUtc: wallClockToUtcISO,
    history,
    cooldownDays: COOLDOWN_DAYS,
    maxDays: 14,
  })
}

export async function POST(req: NextRequest) {
  const guard = await requirePlatformAdmin()
  if (!guard.ok) return guard.response

  let body: Record<string, unknown> = {}
  try { body = (await req.json()) as Record<string, unknown> } catch { /* dry run on empty body */ }

  // Exact-match only. Narrowed here rather than passed through, so an unexpected value degrades to
  // the safe mode instead of reaching the write path as something it has to interpret.
  const requested = body.mode === "persist" ? "persist" : DEFAULT_WRITE_MODE
  const mode: WriteMode = requested === "persist" && writeEnabled() ? "persist" : DEFAULT_WRITE_MODE
  const blocked = requested === "persist" && mode !== "persist"

  // ── THE MISSING CONNECTION ────────────────────────────────────────────────────────────────
  // planAutopilot had NO production caller. This route — the only thing that writes a schedule —
  // required the plan to arrive in the REQUEST BODY, so the server never computed one and the
  // rotation, market weighting and 21-day cooldown were unreachable. loadPostingHistory was in the
  // same position: written, tested, called by nothing.
  //
  // Supplying a plan still works exactly as before. Omitting one now computes it here instead of
  // returning 400. Nothing else changes: the same eligibility filter, the same re-read, the same
  // conditional-UPDATE claim executor, the same two independent write switches.
  let plan = body.plan as AutopilotPlan | undefined
  let computed = false
  if (!plan || !Array.isArray(plan.planned)) {
    plan = await computePlan()
    computed = true
  }

  // SERVICE ROLE, deliberately — not guard.supabase. The caller's RLS client would return 200 with
  // zero rows affected on a policy-denied UPDATE, and this module reads "zero rows" as "another
  // writer claimed it first". An authorisation failure would then be reported as a lost race and
  // the schedule would quietly come up short. The platform-admin check above is the authorisation;
  // this client is only how the write is executed.
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
    if (error) return NextResponse.json({ error: "load_failed", detail: error.message }, { status: 500 })
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

  return NextResponse.json({
    ...result,
    // Stated in the response, not inferred by the caller, so a UI cannot show "scheduled" after a
    // run that deliberately wrote nothing.
    persisted: mode === "persist",
    writeBlockedByEnv: blocked,
    note: blocked
      ? "persist was requested but SOCIAL_AUTOPILOT_WRITE_ENABLED is not 'true' — ran as a dry run and wrote nothing"
      : mode === "persist" ? "rows were written" : "dry run — nothing was written",
    eligibilityFilter: ELIGIBLE_POOL_FILTER,
    // Which half produced the plan. Previously always "supplied" by construction, because a
    // missing plan was a 400.
    planSource: computed ? "computed_server_side" : "supplied_in_request",
    cooldownDays: COOLDOWN_DAYS,
    dailyTimes: BASELINE_DAILY_TIMES,
  })
}
