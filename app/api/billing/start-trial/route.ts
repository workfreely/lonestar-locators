import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { computeTrialWindow } from "@/lib/billing/trial"

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
    .select("trial_started_at, subscription_status")
    .eq("id", user.id)
    .single()

  // Idempotent guard — a trial or subscription already exists, nothing to do.
  if (profile?.trial_started_at || profile?.subscription_status) {
    return NextResponse.json({ granted: false, reason: "already_initialized" })
  }

  const email = user.email.toLowerCase()

  // Fraud-prevention ledger — service role only, checked server-side so it
  // can't be bypassed by client tampering. Email-only for now; verified-
  // phone dedup lands when this connects to onboarding in a later
  // milestone.
  const { error: ledgerError } = await supabaseAdmin
    .from("trial_usage")
    .insert({ email, user_id: user.id })

  if (ledgerError) {
    // Unique violation — this email has already used a free trial.
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

  return NextResponse.json({ granted: true, trialEndsAt: trialEndsAt.toISOString() })
}
