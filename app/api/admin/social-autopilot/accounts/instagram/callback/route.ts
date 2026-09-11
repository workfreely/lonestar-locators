export const runtime = "nodejs"

import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { requirePlatformAdmin } from "@/lib/auth/requirePlatformAdmin"
import {
  INSTAGRAM_SCOPES,
  exchangeCodeForShortToken,
  exchangeForLongLivedToken,
  fetchInstagramProfile,
  instagramConfigured,
  instagramRedirectUri,
  expiryFromExpiresIn,
  isValidOAuthState,
} from "@/lib/social/instagram"

// GET ← Instagram redirects here with ?code&state (or ?error). Platform-admin ONLY.
// Validates state (CSRF), exchanges the code server-side for a short then long-lived token,
// fetches the account identity, and persists the connection with the token encrypted in
// Vault (sa_connect_instagram). The token is NEVER logged and NEVER put back in the URL —
// we redirect to Accounts with only a success/error flag.
export async function GET(request: Request) {
  const guard = await requirePlatformAdmin()
  if (!guard.ok) return guard.response
  const { supabase } = guard

  const { origin, searchParams } = new URL(request.url)
  const accounts = `${origin}/admin/social-autopilot/accounts`

  const jar = await cookies()
  const expectedState = jar.get("ig_oauth_state")?.value
  // Single-use: clear the state cookie regardless of outcome.
  jar.set("ig_oauth_state", "", { path: "/", maxAge: 0 })

  const err = searchParams.get("error")
  if (err) return NextResponse.redirect(`${accounts}?error=denied`)

  const code = searchParams.get("code")
  const state = searchParams.get("state")
  if (!code || !isValidOAuthState(state, expectedState)) {
    return NextResponse.redirect(`${accounts}?error=state`)
  }
  if (!instagramConfigured()) return NextResponse.redirect(`${accounts}?error=not_configured`)

  try {
    const redirectUri = instagramRedirectUri(origin)
    const short = await exchangeCodeForShortToken(code, redirectUri)
    const long = await exchangeForLongLivedToken(short.access_token)
    const profile = await fetchInstagramProfile(long.access_token)

    const externalId = String(profile.user_id ?? short.user_id ?? "")
    const { error } = await supabase.rpc("sa_connect_instagram", {
      p_external_account_id: externalId || null,
      p_username: profile.username ?? null,
      p_account_type: profile.account_type ?? null,
      p_scopes: INSTAGRAM_SCOPES,
      p_token: long.access_token,
      p_expires_at: expiryFromExpiresIn(long.expires_in),
    })
    if (error) return NextResponse.redirect(`${accounts}?error=store`)
    return NextResponse.redirect(`${accounts}?connected=instagram`)
  } catch {
    // No token in the error path — nothing sensitive is logged.
    return NextResponse.redirect(`${accounts}?error=exchange`)
  }
}
