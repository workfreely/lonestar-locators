export const runtime = "nodejs"
export const dynamic = "force-dynamic"

import { NextResponse } from "next/server"
import { refreshSettledInsights } from "@/lib/ai/insightsRefresh"

// AI Insight refresh sweep. Finds client conversations whose messages changed and
// have gone quiet, and regenerates their brief through the existing
// syncAiInsights path.
//
// WHY A SEPARATE ROUTE FROM followup-tick. Both are crons, and folding this into
// the follow-up dispatcher would have been fewer lines — but that dispatcher's job
// is deciding whether to SEND a client a message. Keeping insight refresh on its
// own route means "the brief was regenerated" can never become a step on a path
// that reaches outbound messaging, no matter how either side is edited later.
// This route creates no lead_followup_runs, no followup_outbound_intents, touches
// no followup_opt_in / sms_opt_in, and sends nothing.
//
// Runs every 2 minutes against a ~150s settle window, so a conversation is
// summarised shortly after it goes quiet rather than mid-exchange.
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization")
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const summary = await refreshSettledInsights(new Date())
    return NextResponse.json({ ok: true, ...summary })
  } catch (err) {
    // A sweep failure must never look like success, but it is also never fatal:
    // nothing was consumed, so the next tick re-evaluates from current state.
    console.error("[cron/insights-refresh] failed:", err instanceof Error ? err.message : "unknown")
    return NextResponse.json({ ok: false, error: "refresh_failed" }, { status: 500 })
  }
}
