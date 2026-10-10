import { NextResponse, type NextRequest } from "next/server"
import { requirePlatformAdmin } from "@/lib/auth/requirePlatformAdmin"
import { ELIGIBLE_POOL_FILTER } from "@/lib/social/autopilotEligibility"
import { DEFAULT_WRITE_MODE, type WriteMode } from "@/lib/social/autopilotWrite"
import type { AutopilotPlan } from "@/lib/social/autopilotPlanner"
import { runAutopilotPlan } from "@/lib/social/autopilotPlanRun"

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
// THE PLANNING AND WRITING LOGIC NOW LIVES IN lib/social/autopilotPlanRun.ts, because the cron
// trigger must execute the SAME code rather than a second copy of it. Nothing about this route's
// behaviour changed in the move: same default mode, same env switch, same eligibility filter, same
// conditional-UPDATE claim executor, same response shape.
//
// THIS ROUTE IS STILL CALLED BY HAND, by a platform admin. The automatic caller is
// app/api/cron/social-autopilot-plan, which is gated by its own separate, default-off switch.
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

  // Supplying a plan still works exactly as before; omitting one computes it server-side.
  let result
  try {
    result = await runAutopilotPlan({ plan: body.plan as AutopilotPlan | undefined, mode })
  } catch (e) {
    const msg = (e as Error).message
    if (msg.startsWith("load_failed")) return NextResponse.json({ error: "load_failed", detail: msg }, { status: 500 })
    throw e
  }

  return NextResponse.json({
    ...result,
    writeBlockedByEnv: blocked,
    note: blocked
      ? "persist was requested but SOCIAL_AUTOPILOT_WRITE_ENABLED is not 'true' — ran as a dry run and wrote nothing"
      : mode === "persist" ? "rows were written" : "dry run — nothing was written",
    eligibilityFilter: ELIGIBLE_POOL_FILTER,
  })
}
