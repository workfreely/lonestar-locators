import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { sendAccountStartedEmails } from "@/lib/notifications"

// Sends the Welcome + Trial-started emails for the PRIMARY trial path: a user
// completing onboarding (which grants the trial via DB trigger, so there's no
// server route to hook otherwise). The onboarding wizard calls this once,
// fire-and-forget, after marking onboarding complete.
//
// Auth-gated to the signed-in user and gated on onboarding actually being
// complete, so it can't be used to spam arbitrary addresses. sendAccountStarted
// Emails never throws — a mail failure returns ok:false, never a 500 that would
// surface to the user mid-onboarding.
export async function POST() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user || !user.email) {
    return NextResponse.json({ ok: false, error: "not_authenticated" }, { status: 401 })
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("first_name, full_name, trial_ends_at, onboarding_completed")
    .eq("id", user.id)
    .single()

  // Only fire once onboarding is genuinely complete (the moment the trial starts).
  if (!profile?.onboarding_completed) {
    return NextResponse.json({ ok: false, error: "onboarding_incomplete" })
  }

  await sendAccountStartedEmails({
    to: user.email,
    name: profile.full_name || profile.first_name,
    trialEndsAt: profile.trial_ends_at,
  })

  return NextResponse.json({ ok: true })
}
