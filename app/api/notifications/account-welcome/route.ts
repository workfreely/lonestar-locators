import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { sendAccountWelcomeEmail } from "@/lib/notifications"

// Sends the account WELCOME email once a user has completed onboarding.
//
// PASS 8: it no longer sends the trial-started email. The trial no longer begins
// here — it begins at successful Texas licence verification, which may be days
// later. Claiming a started trial at this moment, with a trial_ends_at that does
// not exist yet, would simply be false. The trial-started email now fires from
// /api/notifications/trial-started, and only when the verification transaction
// reports that it actually granted one.
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
    .select("first_name, full_name, onboarding_completed")
    .eq("id", user.id)
    .single()

  // Only fire once onboarding is genuinely complete.
  if (!profile?.onboarding_completed) {
    return NextResponse.json({ ok: false, error: "onboarding_incomplete" })
  }

  await sendAccountWelcomeEmail({
    to: user.email,
    name: profile.full_name || profile.first_name,
  })

  return NextResponse.json({ ok: true })
}
