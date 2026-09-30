export const dynamic = "force-dynamic"

import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { passesLicenseGate } from "@/lib/license/status"
import VerifyLicenseClient from "./_components/VerifyLicenseClient"

// PASS 6 — the licence-verification status destination for the AGENT.
//
// Not to be confused with /admin/license-verification, which is the owner's review
// queue. This page is the agent's side of the same three columns.
//
// PASS 6 CREATES THE DESTINATION ONLY. Nothing routes a user here yet: middleware
// carries no licence condition, lb_workspace_has_access and getAccessState are
// untouched, and no trial is started, extended or consumed. Pass 7 turns on routing.
//
// The status is DERIVED by lib/license/status.ts — the same function onboarding,
// Profile and the owner panel use — so this page cannot disagree with them.

// Where a verified user belongs. Deliberately the same constant /onboarding already
// sends a finished user to, rather than a second opinion about "the app".
const WORKSPACE = "/admin/leads"

export default async function VerifyLicensePage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Defence in depth. The Pass 5 middleware boundary already redirected an anonymous
  // request before this component ever rendered; this keeps the page correct on its
  // own terms rather than depending on middleware for its security.
  if (!user) redirect("/login")

  const { data: profile } = await supabase
    .from("profiles")
    .select(
      "license_number, license_state, license_verified_at, license_rejected_at, license_rejection_reason, internal_demo_access",
    )
    .eq("id", user.id)
    .single()

  // PASS 7 LOOP FIX. This asks the SAME question the middleware gate asks, so the
  // two can never disagree about who belongs here.
  //
  // It used to redirect on `licenseStatus() === "verified"`, which was correct
  // while nothing routed users here — but once middleware started sending
  // ineligible users to /verify-license, a VERIFIED NON-TEXAS agent would bounce
  // forever: middleware → /verify-license → (verified) → /admin/leads → middleware.
  // Asking "does this user pass the gate?" instead of "is this licence verified?"
  // closes that: a verified Illinois licence does not pass, so they stay here and
  // get the out-of-state state below.
  if (passesLicenseGate(profile)) redirect(WORKSPACE)

  return (
    <VerifyLicenseClient
      userId={user.id}
      initial={{
        licenseNumber: profile?.license_number ?? "",
        // Reuse what is already known. Texas is the launch state, but a legacy
        // profile carrying another state is SHOWN as it is rather than relabelled.
        licenseState: profile?.license_state ?? "",
        licenseVerifiedAt: profile?.license_verified_at ?? null,
        licenseRejectedAt: profile?.license_rejected_at ?? null,
        licenseRejectionReason: profile?.license_rejection_reason ?? null,
      }}
    />
  )
}
