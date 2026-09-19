export const runtime = "nodejs"

import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { requirePlatformAdmin } from "@/lib/auth/requirePlatformAdmin"
import {
  TIKTOK_SCOPES,
  exchangeCodeForToken,
  fetchTikTokUserInfo,
  tiktokConfigured,
  tiktokRedirectUri,
  expiryFromExpiresIn,
  isValidOAuthState,
  buildTokenBundle,
} from "@/lib/social/tiktok"

// GET ← TikTok redirects here with ?code&state (or ?error). This is the FIXED registered
// Sandbox redirect URI (/api/integrations/tiktok/callback). Platform-admin ONLY.
// Validates state (CSRF), exchanges the code server-side for the access + refresh token
// bundle, fetches the account identity (open_id + display_name), and persists the connection
// with the token bundle encrypted in Vault (sa_connect_tiktok). Tokens are NEVER logged and
// NEVER put back in the URL — we redirect to the Integrations page with only a success/error
// flag. The scope is tied to the authenticated Locator Beast admin (auth.uid() inside the RPC).
export async function GET(request: Request) {
  const guard = await requirePlatformAdmin()
  if (!guard.ok) return guard.response
  const { supabase } = guard

  const { origin, searchParams } = new URL(request.url)
  const accounts = `${origin}/admin/social-autopilot/accounts`

  const jar = await cookies()
  const expectedState = jar.get("tt_oauth_state")?.value
  // Single-use: clear the state cookie regardless of outcome.
  jar.set("tt_oauth_state", "", { path: "/", maxAge: 0 })

  const err = searchParams.get("error")
  if (err) return NextResponse.redirect(`${accounts}?error=denied`)

  const code = searchParams.get("code")
  const state = searchParams.get("state")
  if (!code || !isValidOAuthState(state, expectedState)) {
    return NextResponse.redirect(`${accounts}?error=state`)
  }
  if (!tiktokConfigured()) return NextResponse.redirect(`${accounts}?error=not_configured`)

  try {
    const token = await exchangeCodeForToken(code, tiktokRedirectUri())
    const user = await fetchTikTokUserInfo(token.access_token)

    const openId = token.open_id || user.open_id || ""
    const scopes = (token.scope ? token.scope.split(",").map((s) => s.trim()).filter(Boolean) : [...TIKTOK_SCOPES])
    const { error } = await supabase.rpc("sa_connect_tiktok", {
      p_open_id: openId || null,
      p_username: user.display_name ?? null,
      p_scopes: scopes,
      p_token_bundle: buildTokenBundle(token),
      p_expires_at: expiryFromExpiresIn(token.expires_in),
    })
    if (error) return NextResponse.redirect(`${accounts}?error=store`)
    return NextResponse.redirect(`${accounts}?connected=tiktok`)
  } catch {
    // No token in the error path — nothing sensitive is logged.
    return NextResponse.redirect(`${accounts}?error=exchange`)
  }
}
