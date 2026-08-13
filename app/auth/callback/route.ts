import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { REFERRAL_COOKIE, referralCookieOptions } from "@/lib/network/referralCookie";

// Landing point for both Google OAuth and email-confirmation links — both
// arrive with a `code` param that gets exchanged for a session here, then
// we hand off to `next` (defaults to /onboarding, which does its own
// completed-vs-not gate).
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/onboarding";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // Beast Network: preserve the referral relationship as soon as a session
      // exists. Best-effort — lb_claim_referral is a no-op on a missing/used/
      // self-referral token, so this can never block sign-in. Clear the cookie
      // afterwards (the token is single-use once consumed).
      try {
        const cookieStore = await cookies();
        const token = cookieStore.get(REFERRAL_COOKIE)?.value;
        if (token) {
          await supabase.rpc("lb_claim_referral", { p_token: token });
          cookieStore.set(REFERRAL_COOKIE, "", { ...referralCookieOptions(), maxAge: 0 });
        }
      } catch {
        // Never let attribution failure interrupt authentication.
      }
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login`);
}
