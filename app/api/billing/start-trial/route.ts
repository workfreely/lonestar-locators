import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { computeTrialWindow } from "@/lib/billing/trial"
import { sendAccountStartedEmails } from "@/lib/notifications"

// Mirror of the SQL lb_normalize_phone(): last 10 digits, or null if fewer.
function normalizePhone(phone: string | null | undefined): string | null {
  const digits = (phone ?? "").replace(/\D/g, "")
  if (digits.length < 10) return null
  return digits.slice(-10)
}

// Manual/fallback trial start (the primary path is the DB trigger on onboarding
// completion). Enforces the SAME one-trial-per-person rule: denied if the email
// OR the normalized phone already appears in the trial_usage ledger.
export async function POST() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user || !user.email) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("trial_started_at, subscription_status, phone_number, first_name, full_name")
    .eq("id", user.id)
    .single()

  // Idempotent guard — a trial or subscription already exists, nothing to do.
  if (profile?.trial_started_at || profile?.subscription_status) {
    return NextResponse.json({ granted: false, reason: "already_initialized" })
  }

  const email = user.email.toLowerCase().trim()
  const phone = normalizePhone(profile?.phone_number)

  // Fraud-prevention ledger — service role only, checked server-side so it can't
  // be bypassed by client tampering. One trial per person: same email OR phone.
  const { data: existing } = await supabaseAdmin
    .from("trial_usage")
    .select("id")
    .or(phone ? `email.eq.${email},phone.eq.${phone}` : `email.eq.${email}`)
    .limit(1)
    .maybeSingle()

  if (existing) {
    return NextResponse.json({ granted: false, reason: "trial_already_used" })
  }

  const { error: ledgerError } = await supabaseAdmin
    .from("trial_usage")
    .insert({ email, phone, user_id: user.id })

  if (ledgerError) {
    // Unique violation on email or phone — this person already used a free trial.
    return NextResponse.json({ granted: false, reason: "trial_already_used" })
  }

  const { trialStartedAt, trialEndsAt } = computeTrialWindow()

  const { error: updateError } = await supabase
    .from("profiles")
    .update({
      trial_started_at: trialStartedAt.toISOString(),
      trial_ends_at: trialEndsAt.toISOString(),
      subscription_status: "trialing",
    })
    .eq("id", user.id)

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  // Welcome + trial-started emails (fallback path). Non-blocking and self-
  // contained — sendAccountStartedEmails never throws, so a mail failure can't
  // fail the trial grant.
  await sendAccountStartedEmails({
    to: email,
    name: profile?.full_name || profile?.first_name,
    trialEndsAt: trialEndsAt.toISOString(),
  })

  return NextResponse.json({ granted: true, trialEndsAt: trialEndsAt.toISOString() })
}
