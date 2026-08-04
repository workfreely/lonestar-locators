import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { computeTrialWindow } from "@/lib/billing/trial"

// Mirror of the SQL lb_normalize_phone(): last 10 digits, or null if fewer.
function normalizePhone(phone: string | null | undefined): string | null {
  const digits = (phone ?? "").replace(/\D/g, "")
  if (digits.length < 10) return null
  return digits.slice(-10)
}

// Grants the 30-day free trial. Called explicitly at the end of onboarding (and
// available as a manual/billing-page fallback) so completing onboarding ALWAYS
// yields trial access — it does not depend on the atomic DB trigger having fired.
// Idempotent: if a trial/subscription already exists (e.g. the trigger already
// granted it), it no-ops. Enforces one-trial-per-person via the trial_usage
// ledger (same email OR normalized phone). Grant-only — the welcome/trial-started
// emails are sent separately (see /api/notifications/account-welcome) so they
// fire exactly once regardless of which path granted the trial.
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
    .select("trial_started_at, subscription_status, phone_number")
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

  // Billing fields are server-authoritative — write them with the service role
  // (not the user's session) so the grant never depends on the profiles UPDATE
  // RLS policy, mirroring the SECURITY DEFINER trigger's intent.
  const { error: updateError } = await supabaseAdmin
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

  return NextResponse.json({ granted: true, trialEndsAt: trialEndsAt.toISOString() })
}
