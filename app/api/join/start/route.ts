import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { REFERRAL_COOKIE, referralCookieOptions } from "@/lib/network/referralCookie"

// Starts a referral: called from the public Join page BEFORE any account exists.
// 1) Mints a referral intent bound to the sponsor (lb_record_referral_intent,
//    which validates the slug resolves to an ACTIVE member — the only members who
//    may recruit). 2) Sets the first-party attribution cookie. 3) Returns the
//    sponsor's brokerage referral URL for the client to redirect to.
//
// Uses the service-role client only to invoke the SECURITY DEFINER RPCs / read
// the sponsor's redirect URL — the ONLY input trusted from the client is `slug`,
// which the RPC re-validates server-side. No session required (prospect is anon).
export async function POST(request: Request) {
  let slug: string | null = null
  try {
    const body = await request.json()
    slug = typeof body?.slug === "string" ? body.slug.trim() : null
  } catch {
    slug = null
  }

  if (!slug) {
    return NextResponse.json({ error: "missing_slug" }, { status: 400 })
  }

  // Mint the intent (also enforces sponsor-exists + sponsor-active).
  const { data: token, error } = await supabaseAdmin.rpc("lb_record_referral_intent", {
    p_sponsor_slug: slug,
  })

  if (error || !token) {
    // invalid_sponsor / sponsor_not_active → treat as not found (no working page).
    return NextResponse.json({ error: "invalid_sponsor" }, { status: 404 })
  }

  // Resolve the redirect target via the token we just minted (token → sponsor →
  // brokerage_referral_url). Service role bypasses RLS; never exposed in the
  // public page payload. May be null if the sponsor hasn't set their URL yet.
  let brokerageUrl: string | null = null
  try {
    const { data: intent } = await supabaseAdmin
      .from("referral_intents")
      .select("sponsor_id")
      .eq("token", token)
      .maybeSingle()
    if (intent?.sponsor_id) {
      const { data: member } = await supabaseAdmin
        .from("network_members")
        .select("brokerage_referral_url")
        .eq("user_id", intent.sponsor_id)
        .maybeSingle()
      brokerageUrl = member?.brokerage_referral_url ?? null
    }
  } catch {
    brokerageUrl = null
  }

  const res = NextResponse.json({ ok: true, brokerageUrl })
  res.cookies.set(REFERRAL_COOKIE, token as string, referralCookieOptions())
  return res
}
