import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { createClient } from "@/lib/supabase/server"
import { REFERRAL_COOKIE, referralCookieOptions } from "@/lib/network/referralCookie"

// Referral claim for the Google Identity Services sign-in path.
//
// WHY THIS EXISTS. The redirect flow lands on /auth/callback, which claims the
// referral and clears the cookie. GIS never touches that route — the ID token is
// exchanged in the browser — so this endpoint gives that path the same two steps.
//
// It is deliberately NOT a parallel referral workflow: same lb_claim_referral
// RPC, same REFERRAL_COOKIE, same cookie options, same best-effort semantics as
// the callback. The cookie is httpOnly (see lib/network/referralCookie.ts), so
// reading and clearing it can only happen server-side — hence a route rather
// than inline client code.
//
// Note that attribution does not actually depend on this endpoint: /onboarding
// independently claims from the same cookie, and lb_claim_referral is a no-op on
// an unknown/consumed/self-referral token. This runs the claim at the same
// moment the redirect flow would, and — the part onboarding does not do —
// clears the cookie.
export async function POST() {
  const supabase = await createClient()

  // Only a real session may claim. lb_claim_referral is SECURITY DEFINER and
  // derives the beneficiary from auth.uid(), so an anonymous call would be a
  // no-op anyway; rejecting here keeps the contract explicit.
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ claimed: false, reason: "no_session" }, { status: 401 })
  }

  try {
    const cookieStore = await cookies()
    const token = cookieStore.get(REFERRAL_COOKIE)?.value
    if (!token) {
      return NextResponse.json({ claimed: false, reason: "no_token" })
    }
    await supabase.rpc("lb_claim_referral", { p_token: token })
    cookieStore.set(REFERRAL_COOKIE, "", { ...referralCookieOptions(), maxAge: 0 })
    return NextResponse.json({ claimed: true })
  } catch {
    // Attribution must never break authentication — the user is already signed
    // in by the time this runs, and onboarding will retry the claim.
    return NextResponse.json({ claimed: false, reason: "error" })
  }
}
