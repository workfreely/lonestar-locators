export const runtime = "nodejs"
export const dynamic = "force-dynamic"

import { NextResponse, type NextRequest } from "next/server"
import { DEFAULT_WRITE_MODE, type WriteMode } from "@/lib/social/autopilotWrite"
import { runAutopilotPlan, COOLDOWN_DAYS, MAX_PLAN_DAYS } from "@/lib/social/autopilotPlanRun"
import { BASELINE_DAILY_TIMES } from "@/lib/social/autopilotDestination"
import { DEFAULT_TIMEZONE } from "@/lib/social/recurrence"

/**
 * SOCIAL BEAST — the automatic scheduling trigger.
 *
 * THIS IS NOT A SCHEDULER. It is a doorbell. Every decision about what gets posted, when, in what
 * order, and how long a property must rest is made by code that already existed and is not touched
 * here: planAutopilot for placement, planDailyTimes for timing, the 21-day cooldown, the eligible
 * pool predicate, the conditional-UPDATE claim. This route authenticates, checks two switches, and
 * calls runAutopilotPlan — the exact function the manual admin route calls.
 *
 * IT CANNOT PUBLISH. Scheduling and publishing are separate powers held by separate routes with
 * separate switches. Nothing reachable from this file talks to Instagram.
 *
 * ── WHY THE FIRING TIME IS NOT 7:30 ─────────────────────────────────────────────────────────
 * Worth being explicit, because "replenish slots at 7:30 AM and 7:30 PM Central" reads like a cron
 * expression and must not be implemented as one. The POST times come from BASELINE_DAILY_TIMES
 * (450 and 1170 minutes) resolved through wallClockToUtcISO in America/Chicago. They are a property
 * of the PLAN, not of when this runs. A run at 02:00 and a run at 14:00 place posts at exactly the
 * same instants.
 *
 * That also makes the trigger immune to daylight saving time. A cron entry fixed in UTC drifts an
 * hour against Central twice a year; it does not matter, because the firing time is not the posting
 * time. Encoding 7:30 Central into the cron expression would have been the version that breaks in
 * November.
 *
 * So the cadence answers one question only: how stale may the queue get? Hourly, which bounds the
 * delay between a human approving a video and that video being placed at roughly an hour, and is
 * free to repeat because of the idempotency below.
 *
 * ── IDEMPOTENT, AND SAFE CONCURRENTLY ───────────────────────────────────────────────────────
 * Four independent reasons a second run — overlapping, retried, or an hour later — cannot
 * double-post or double-book:
 *
 *   1. THE POOL EXCLUDES WHAT IS SCHEDULED. A claimed post has scheduled_at and connection_id set,
 *      which ineligibleReason rejects as `already_scheduled`. It is not offered twice.
 *   2. OCCUPANCY EXCLUDES FILLED SLOTS. buildAutopilotOccupancy feeds planAutopilot the minutes
 *      already taken, plus today's elapsed times, so a run proposes only genuinely empty UPCOMING
 *      slots. (Without this the trigger would still be SAFE — see 3 — but useless: every run would
 *      re-propose the same slots and collect 23505s.)
 *   3. THE CLAIM IS AN ATOMIC CONDITIONAL UPDATE. Every eligibility column is in the WHERE clause,
 *      so of N concurrent runs exactly one wins a given post; the losers match zero rows and report
 *      `post_lost`. There is no read-then-write window.
 *   4. THE DATABASE OWNS THE SLOT. social_posts_connection_slot_uidx (verified live) is a unique
 *      index on (connection_id, scheduled_at). Even a planner bug cannot put two posts on one
 *      destination minute; the loser gets 23505 and is reported as `slot_taken`.
 *
 * A retry is therefore a no-op rather than a duplicate, and two simultaneous runs produce the same
 * calendar one run would.
 *
 * ── NOTHING IS APPROVED OR RENDERED HERE ────────────────────────────────────────────────────
 * The eligible pool requires approved_at IS NOT NULL and a finished render. This route cannot
 * create either. A video reaches the queue only because a human approved it.
 */

/**
 * LAUNCH GATE — the trigger's own kill switch, separate from and in addition to CRON_SECRET.
 *
 * CRON_SECRET answers "is this caller allowed to invoke the trigger?". This answers "is the trigger
 * allowed to do anything at all?". The second is what lets this route be deployed and verified in
 * production while automatic scheduling stays off.
 *
 * FAIL CLOSED, and deliberately strict: only the exact string "true" arms it. Missing, empty,
 * "false", "1", "yes", "TRUE " with a stray space — every one of those is OFF. Same shape as
 * SOCIAL_INSTAGRAM_AUTOPUBLISH_ENABLED, and independent of it.
 */
function triggerEnabled(): boolean {
  return (process.env.SOCIAL_AUTOPILOT_TRIGGER_ENABLED ?? "").trim() === "true"
}

/**
 * THE SECOND SWITCH, unchanged and not re-implemented: the same variable the manual route consults.
 * The trigger being ON is not permission to WRITE. With the trigger on and this off, the cron runs
 * a real dry run every hour — a live rehearsal that touches nothing — which is the state to watch
 * before authorising launch.
 */
const writeEnabled = () => (process.env.SOCIAL_AUTOPILOT_WRITE_ENABLED ?? "").trim() === "true"

export async function GET(req: NextRequest) {
  return run(req)
}
export async function POST(req: NextRequest) {
  return run(req)
}

async function run(req: NextRequest) {
  // FAIL CLOSED. A missing CRON_SECRET locks the route rather than opening it — same shape as
  // every other cron in this app (see app/api/cron/social-instagram-publish).
  const cronSecret = process.env.CRON_SECRET
  const auth = req.headers.get("authorization")
  if (!cronSecret || auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // The gate sits BEFORE every read and every write. When it is off this route authenticates and
  // reports, and does nothing else: no connection read, no pool query, no history read, no plan, no
  // claim. Returning here rather than deciding further down is the point — a guard further in could
  // still have computed against live data before declining to use it.
  if (!triggerEnabled()) {
    return NextResponse.json({
      ok: true,
      skipped: "trigger_disabled",
      note: "SOCIAL_AUTOPILOT_TRIGGER_ENABLED is not 'true' — the automatic trigger is parked. Nothing was read, planned or written.",
      wouldRequire: ["SOCIAL_AUTOPILOT_TRIGGER_ENABLED=true", "SOCIAL_AUTOPILOT_WRITE_ENABLED=true"],
    })
  }

  // Both switches must agree before anything is written. With the trigger armed and writes off this
  // is a genuine dry run against live data — the same code path, stopped one step short of the
  // UPDATE — not a simulation of one.
  const mode: WriteMode = writeEnabled() ? "persist" : DEFAULT_WRITE_MODE

  const startedAt = new Date()
  try {
    const result = await runAutopilotPlan({ mode, now: startedAt })
    return NextResponse.json({
      ok: true,
      ranAt: startedAt.toISOString(),
      mode,
      persisted: result.persisted,
      // The headline numbers, promoted out of the full result so a cron log line is readable.
      planned: result.claims.length,
      claimed: result.claimed.length,
      rejected: result.rejected.length,
      unfilledSlots: result.inventory.unfilledSlots,
      cooldownViolations: result.inventory.cooldownViolations,
      note: result.persisted
        ? `scheduled ${result.claimed.length} post(s)`
        : "dry run — SOCIAL_AUTOPILOT_WRITE_ENABLED is not 'true', so nothing was written",
      timezone: DEFAULT_TIMEZONE,
      dailyTimes: BASELINE_DAILY_TIMES,
      cooldownDays: COOLDOWN_DAYS,
      maxPlanDays: MAX_PLAN_DAYS,
      inventory: result.inventory,
      claims: result.claims,
      rejections: result.rejected,
    })
  } catch (e) {
    // A failure is reported, never swallowed: a cron that 200s on an exception is a cron nobody
    // notices has stopped working. Nothing partial is left behind — each claim is its own atomic
    // UPDATE, so a throw mid-run leaves the claims that already landed and no half-written row.
    return NextResponse.json({ ok: false, error: "autopilot_trigger_failed", detail: (e as Error).message }, { status: 500 })
  }
}
