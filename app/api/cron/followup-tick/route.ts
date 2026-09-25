export const runtime = "nodejs"
export const dynamic = "force-dynamic"

import { NextResponse } from "next/server"
import { tick } from "@/lib/followup/dispatcher"

// Follow-Up Agent dispatcher tick. Server-side (Vercel Cron / manual with the cron
// secret) — runs regardless of any locator device. Enrolls freshly-created,
// authorized+enrolled leads into a new_lead run and enqueues eligible steps as
// PENDING outbound intents. It NEVER sends a text; Beast Sync claims + delivers,
// and only a confirmed ack advances a run.
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization")
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const summary = await tick(new Date())
    return NextResponse.json({ ok: true, ...summary })
  } catch (err) {
    console.error("[cron/followup-tick] failed:", err instanceof Error ? err.message : "unknown")
    return NextResponse.json({ ok: false, error: "tick_failed" }, { status: 500 })
  }
}
