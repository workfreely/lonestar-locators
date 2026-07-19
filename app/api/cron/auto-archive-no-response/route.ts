import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GET /api/cron/auto-archive-no-response
//
// Runs once daily (see vercel.json). Archives leads that have sat in
// "contacted" for 7+ days since First Text was clicked.
//
// Anchor: first_text_sent_at, set ONLY by the First Text button in
// components/crm/LeadPanel.tsx — never by a Kanban drag or a lead edit.
// Rows where it's null (e.g. manually dragged into Contacted, never
// actually texted) are excluded, so this automation never touches a lead
// that wasn't actually contacted via First Text.
//
// Only crm_status === "contacted" rows are candidates — leads that have
// moved to any later stage (searching, list_sent, ready_to_tour,
// done_touring, applied, closed) or are already archived don't match this
// filter and are left untouched.
//
// Deliberately does NOT check sms_replied — First Text is sent from Apple
// Messages on a personal phone, not Twilio, so there's no reliable inbound-
// reply signal for this workflow. The manual expectation is: if a lead
// responds within the 7 days, the lead gets moved beyond "contacted" by
// hand, which already removes it from this query.
//
// Auth: this route archives real leads, so it must not be publicly
// triggerable. Requires a CRON_SECRET env var set in the Vercel project —
// Vercel automatically sends `Authorization: Bearer $CRON_SECRET` when it
// invokes routes listed in vercel.json's `crons` array, as long as
// CRON_SECRET is configured there. Without that env var set, every
// request here is rejected (including Vercel's own), by design — this
// fails closed, not open.
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization")
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  const { data: candidates, error: fetchError } = await supabase
    .from("leads")
    .select("id")
    .eq("crm_status", "contacted")
    .not("first_text_sent_at", "is", null)
    .lte("first_text_sent_at", sevenDaysAgo)

  if (fetchError) {
    console.error("[auto-archive-no-response] Failed to fetch candidates:", fetchError)
    return NextResponse.json({ error: fetchError.message }, { status: 500 })
  }

  const ids = (candidates || []).map((l) => l.id)

  if (ids.length === 0) {
    return NextResponse.json({ success: true, archivedCount: 0 })
  }

  const { error: updateError } = await supabase
    .from("leads")
    .update({ crm_status: "archived", archive_reason: "ghosted" })
    .in("id", ids)

  if (updateError) {
    console.error("[auto-archive-no-response] Failed to archive leads:", updateError)
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  console.log(`[auto-archive-no-response] Archived ${ids.length} lead(s):`, ids)

  return NextResponse.json({ success: true, archivedCount: ids.length, leadIds: ids })
}
