import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { REFERRAL_COOKIE, referralCookieOptions } from "@/lib/network/referralCookie";
import { recordSecurityEvent } from "@/lib/security/events";

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
    const { data: exchanged, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // Security Beast (best-effort): this callback is the server-side landing
      // point for Google OAuth (the only configured provider; password resets go
      // to /reset-password, not here), so record a 'login' event with the IP/UA
      // this server request already carries. recordSecurityEvent never throws, so
      // it can never interrupt sign-in.
      const authedUserId = exchanged.session?.user?.id ?? exchanged.user?.id;
      if (authedUserId) {
        await recordSecurityEvent({
          userId: authedUserId,
          eventType: "login",
          method: "google_oauth",
          headers: request.headers,
        });
      }

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
