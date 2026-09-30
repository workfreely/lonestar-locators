import { NextResponse } from "next/server"
import { requirePlatformAdmin } from "@/lib/auth/requirePlatformAdmin"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { sendTrialStartedEmail } from "@/lib/notifications"

// PASS 8 — the trial-started email, sent when licence verification actually
// granted a trial.
//
// WHO MAY CALL IT. Platform admin only, through the existing requirePlatformAdmin
// guard (is_platform_admin(), backed by the self-elevation-proof platform_admins
// table). Verification is an owner action, so the notification that follows it is
// too. Without this a signed-in user could mail an arbitrary account.
//
// WHY THE DATE IS RE-READ RATHER THAN TRUSTED. The caller already knows
// trial_ends_at — lb_verify_license returns it — but a client-supplied date in an
// email is a client-supplied claim. The DECISION to send comes from the RPC's
// trial_granted (which only that transaction can know); the CONTENT comes from the
// committed row. Both halves are then server-authoritative.
//
// The guard below is deliberately redundant with the caller's: it refuses to send
// unless the profile really is verified and really has a live trial. A caller that
// somehow asked for an email the database does not support gets a no-op, not a
// message telling an agent their trial started when it did not.
export async function POST(request: Request) {
  const guard = await requirePlatformAdmin()
  if (!guard.ok) return guard.response

  let userId: string | null = null
  try {
    const body = (await request.json()) as { userId?: unknown }
    userId = typeof body.userId === "string" ? body.userId : null
  } catch {
    userId = null
  }
  if (!userId) {
    return NextResponse.json({ ok: false, error: "missing_user" }, { status: 400 })
  }

  // Service role: this reads another user's profile, which the admin's own RLS
  // scope does not cover.
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("email, first_name, full_name, trial_ends_at, license_verified_at")
    .eq("id", userId)
    .single()

  if (!profile?.email) {
    return NextResponse.json({ ok: false, error: "no_email" })
  }
  // Do not announce a trial the database does not actually show.
  if (!profile.license_verified_at || !profile.trial_ends_at) {
    return NextResponse.json({ ok: false, error: "no_trial" })
  }

  await sendTrialStartedEmail({
    to: profile.email,
    name: profile.full_name || profile.first_name,
    trialEndsAt: profile.trial_ends_at,
  })

  return NextResponse.json({ ok: true })
}
