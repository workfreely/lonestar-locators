import { NextResponse, type NextRequest } from "next/server"
import { requirePlatformAdmin } from "@/lib/auth/requirePlatformAdmin"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { ELIGIBLE_POOL_FILTER, type EligibilityInput } from "@/lib/social/autopilotEligibility"
import { applyAutopilotPlan, supabaseClaimExecutor, DEFAULT_WRITE_MODE, type WriteMode } from "@/lib/social/autopilotWrite"
import type { AutopilotPlan } from "@/lib/social/autopilotPlanner"

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

  const plan = body.plan as AutopilotPlan | undefined
  if (!plan || !Array.isArray(plan.planned)) {
    return NextResponse.json({ error: "plan_required", detail: "POST a plan produced by planAutopilot" }, { status: 400 })
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
      .select("id, status, render_status, rendered_storage_path, scheduled_at, published_at, external_post_id, connection_id, platform")
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
  })
}
