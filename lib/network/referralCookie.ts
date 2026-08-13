// Single source of truth for the first-party referral-attribution cookie so the
// name/attributes never drift across the three touch points (set in
// /api/join/start; claimed + cleared in /auth/callback and /onboarding).
//
// SameSite=Lax (NOT Strict) is deliberate: after the off-site brokerage redirect,
// the prospect returns to locatorbeast.com via a top-level GET navigation — Lax
// cookies ARE sent then, Strict ones would be dropped. HttpOnly because the token
// is only ever read server-side at claim time. Host-only (no Domain) since the
// whole flow lives on one host. 90-day lifetime tolerates a slow return.
export const REFERRAL_COOKIE = "lb_ref"
export const REFERRAL_COOKIE_MAX_AGE = 60 * 60 * 24 * 90 // 90 days, seconds

export function referralCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: REFERRAL_COOKIE_MAX_AGE,
  }
}
