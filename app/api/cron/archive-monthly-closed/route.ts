import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GET /api/cron/archive-monthly-closed
//
// Runs daily (see vercel.json) so the Closed column always starts a new
// month empty. closed_at (set once by update-stage/route.ts on the first
// transition into "closed") keeps the lead's historical closed date
// intact after archiving — Closed This Month, Conversion Rate, Closed
// Deals by City, and Monthly Performance History all key off closed_at,
// not crm_status, so this archival never changes what those already
// report.
//
// Condition is closed_at < start of the current month, so this is a
// no-op most days — it only actually moves leads in the first days of a
// new month, and self-heals if a run is ever missed instead of depending
// on firing exactly on day 1.
//
// Auth: same CRON_SECRET gate as the other cron routes — fails closed
// without it, including for Vercel's own invocations.
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization")
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const now = new Date()
  const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString()

  const { data: candidates, error: fetchError } = await supabase
    .from("leads")
    .select("id")
    .eq("crm_status", "closed")
    .not("closed_at", "is", null)
    .lt("closed_at", startOfMonth)

  if (fetchError) {
    console.error("[archive-monthly-closed] Failed to fetch candidates:", fetchError)
    return NextResponse.json({ error: fetchError.message }, { status: 500 })
  }

  const ids = (candidates || []).map((l) => l.id)

  if (ids.length === 0) {
    return NextResponse.json({ success: true, archivedCount: 0 })
  }

  const { error: updateError } = await supabase
    .from("leads")
    .update({ crm_status: "archived", archive_reason: "closed" })
    .in("id", ids)

  if (updateError) {
    console.error("[archive-monthly-closed] Failed to archive leads:", updateError)
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  console.log(`[archive-monthly-closed] Archived ${ids.length} lead(s):`, ids)

  return NextResponse.json({ success: true, archivedCount: ids.length, leadIds: ids })
}
