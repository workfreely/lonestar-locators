export const runtime = "nodejs"
export const maxDuration = 300

import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { syncWorkspaceInsights } from "@/lib/meta/sync"

// Daily, CONSERVATIVE read-only sync of every connected workspace's Meta ad performance (rolling
// 30-day window). Bearer CRON_SECRET auth (same as the other product crons). This is a NEW product
// cron for Meta insights — NOT the Social Beast recurrence/publishing cron (which stays absent).
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization")
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const { data: conns } = await supabaseAdmin
    .from("meta_connections")
    .select("workspace_id, id, ad_account_id")
    .eq("provider", "meta")
    .eq("connection_status", "connected")
    .not("ad_account_id", "is", null)

  let ok = 0, failed = 0
  for (const c of conns ?? []) {
    try {
      await syncWorkspaceInsights(c.workspace_id as string, c.id as string, c.ad_account_id as string)
      ok++
    } catch {
      failed++ // one workspace's failure never blocks the others; its cache is left intact
    }
  }
  return NextResponse.json({ status: "ok", synced: ok, failed })
}
