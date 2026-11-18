export const runtime = "nodejs"
export const dynamic = "force-dynamic"

import { NextResponse, type NextRequest } from "next/server"
import { runInstagramTokenRefresh, type RunMode } from "@/lib/social/instagramTokenRefreshRun"
import { REFRESH_WINDOW_DAYS, MIN_TOKEN_AGE_HOURS } from "@/lib/social/instagramTokenRefresh"

/**
 * SOCIAL BEAST — INSTAGRAM TOKEN RENEWAL.
 *
 * An Instagram long-lived token lasts 60 days. Nothing in this system renewed one: the helper
 * existed with no caller, there was no cron, and the publish worker only reports an expired token
 * as "reconnect the destination". So every Instagram connection has always been on a 60-day fuse,
 * and the live one burns out on 22 December 2026.
 *
 * This renews each connection's token in place, BY CONNECTION ID, while it is still valid.
 *
 * ── IT IS NOT A PUBLISHER ───────────────────────────────────────────────────────────────────
 * It creates no post, reads no content, and calls no publishing endpoint — it exchanges one
 * credential for a fresher copy of itself. It never writes status, pause, cadence, scopes,
 * schedules or any other setting: sa_update_instagram_token_by_connection sets exactly
 * token_secret_id, token_expires_at and updated_at, which is proved against two accounts in
 * scripts/social/instagramTokenIsolation.pg.sql.
 *
 * ── INERT UNTIL DELIBERATELY ARMED ──────────────────────────────────────────────────────────
 * Two independent brakes, the same shape the agent-distribution cron uses:
 *   · CRON_SECRET must match, or nothing runs at all
 *   · ?mode=persist is the ONLY way to write, AND SOCIAL_INSTAGRAM_REFRESH_ENABLED must be
 *     exactly "true"
 * A dry run performs the same reads and the same decisions and reports exactly what a persist
 * run would do, so the schedule can be live and verified before anything rotates.
 *
 * A PAUSED ACCOUNT IS STILL RENEWED, on purpose. Pausing says "do not publish from this", not
 * "let its credentials die"; letting a paused account expire turns a reversible pause into a
 * reconnection nobody asked for.
 */
function refreshEnabled(): boolean {
  return (process.env.SOCIAL_INSTAGRAM_REFRESH_ENABLED ?? "").trim() === "true"
}

export async function GET(req: NextRequest) {
  return run(req)
}
export async function POST(req: NextRequest) {
  return run(req)
}

async function run(req: NextRequest) {
  // FAIL CLOSED on a missing secret, the same shape as every other cron here.
  const cronSecret = process.env.CRON_SECRET
  const auth = req.headers.get("authorization")
  if (!cronSecret || auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const requested = new URL(req.url).searchParams.get("mode")
  const mode: RunMode = requested === "persist" ? "persist" : "preview"

  if (mode === "persist" && !refreshEnabled()) {
    return NextResponse.json({
      ok: true,
      skipped: "refresh_disabled",
      note: "SOCIAL_INSTAGRAM_REFRESH_ENABLED is not 'true' — refusing to rotate any token. Run without ?mode=persist for a dry run.",
    })
  }

  try {
    const result = await runInstagramTokenRefresh({ mode })
    // A run that renewed nothing while an account is expiring is the case worth shouting about,
    // so the counts lead and the window is restated rather than being folklore in a comment.
    return NextResponse.json({
      ok: true,
      mode: result.mode,
      windowDays: REFRESH_WINDOW_DAYS,
      minTokenAgeHours: MIN_TOKEN_AGE_HOURS,
      checked: result.checked,
      refreshed: result.refreshed,
      failed: result.failed,
      attention: result.attention,
      outcomes: result.outcomes,
    })
  } catch (e) {
    console.error(`[instagram-token-refresh] run failed: ${(e as Error).message}`)
    return NextResponse.json({ ok: false, error: "run_failed" }, { status: 500 })
  }
}
