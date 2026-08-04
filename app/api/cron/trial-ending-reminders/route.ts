import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { sendNotification, trialEndingEmail } from "@/lib/notifications"

export const runtime = "nodejs"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Daily cron (see vercel.json — 0 15 * * *). Emails every trialing user whose
// trial ends ~3 days out. The window is a 24h band anchored to the run time, so
// with a once-daily run each trial matches exactly once (natural idempotency, no
// extra "reminder_sent" column needed). Same Bearer CRON_SECRET auth as the
// other crons in this app.
const REMINDER_DAYS_OUT = 3

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization")
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const now = Date.now()
  const windowStart = new Date(now + REMINDER_DAYS_OUT * 24 * 60 * 60 * 1000)
  const windowEnd = new Date(now + (REMINDER_DAYS_OUT + 1) * 24 * 60 * 60 * 1000)

  const { data: profiles, error } = await supabase
    .from("profiles")
    .select("id, email, first_name, full_name, trial_ends_at")
    .eq("subscription_status", "trialing")
    .gte("trial_ends_at", windowStart.toISOString())
    .lt("trial_ends_at", windowEnd.toISOString())

  if (error) {
    console.error("[cron/trial-ending-reminders] Query failed:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  let sent = 0
  for (const p of profiles ?? []) {
    if (!p.email) continue
    const result = await sendNotification({
      to: p.email,
      ...trialEndingEmail({
        name: p.full_name || p.first_name,
        daysLeft: REMINDER_DAYS_OUT,
        trialEndsAt: p.trial_ends_at,
      }),
    })
    if (result.ok) sent++
  }

  return NextResponse.json({ success: true, matched: profiles?.length ?? 0, sent })
}
