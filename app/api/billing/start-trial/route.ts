import { NextResponse } from "next/server"

// PASS 8 — NEUTRALISED. This route no longer grants anything.
//
// It used to be the third of three trial-start paths (alongside the
// trg_grant_trial_on_signup and trg_grant_trial_on_onboarding triggers, both now
// inert in the database), and OnboardingWizard.finish() awaited it. The 30-day
// trial now begins only inside lb_verify_license, when the platform owner
// verifies a real Texas licence — one trusted path, in one transaction, with the
// anti-abuse ledger claimed in the same statement.
//
// KEPT rather than deleted, deliberately. A user with the previous bundle cached
// can still POST here for a while after deploy; returning a clean, honest 200
// beats a 404 that some client might log as an error. It is also the smaller
// diff to revert if Pass 8 is rolled back.
//
// It must never grant again: the DB is now the only authority on when a trial
// starts, and a client-callable grant would be a way around the licence rule that
// Pass 7 and the Pass 8 SQL exist to enforce.
export async function POST() {
  return NextResponse.json({
    granted: false,
    reason: "trial_starts_on_license_verification",
  })
}
