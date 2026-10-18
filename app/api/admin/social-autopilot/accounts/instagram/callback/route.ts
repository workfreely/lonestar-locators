export const runtime = "nodejs"

import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { requirePlatformAdmin } from "@/lib/auth/requirePlatformAdmin"
import {
  INSTAGRAM_ADMIN_SCOPES,
  exchangeCodeForShortToken,
  exchangeForLongLivedToken,
  fetchInstagramProfile,
  resolveGrantedScopes,
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
    if (!externalId) return NextResponse.redirect(`${accounts}?error=no_account`)

    // ── WHAT WE ALREADY HOLD, READ BEFORE WE DECIDE WHAT TO WRITE ─────────────────────────
    // Needed so a grant that is missing a scope we already have can be refused rather than
    // silently applied. Read through the session client, so RLS scopes it to this admin.
    const { data: current } = await supabase
      .from("social_connections")
      .select("scopes")
      .eq("provider", "instagram")
      .eq("external_account_id", externalId)
      .maybeSingle()
    const existing = ((current as { scopes?: string[] } | null)?.scopes ?? []) as string[]

    // Store what Instagram CONFIRMS it granted — never what we asked for. See
    // resolveGrantedScopes: it cannot record an assumed grant, and it refuses a write that would
    // drop a scope we already hold.
    const resolution = resolveGrantedScopes({
      requested: INSTAGRAM_ADMIN_SCOPES,
      reported: short.permissions,
      existing,
    })
    if (!resolution.ok) {
      // NOTHING IS WRITTEN on either branch, so the connection, its token and its settings are
      // exactly as they were. `would_revoke` is the one worth spelling out on the page: the user
      // did authorize, but left a switch off that we already depend on.
      console.error(
        `[instagram/callback] refusing to record scopes: ${resolution.reason}` +
          (resolution.lost.length ? ` (would lose: ${resolution.lost.join(", ")})` : ""),
      )
      return NextResponse.redirect(`${accounts}?error=${resolution.reason}`)
    }
    const scopes = resolution.scopes
    if (!resolution.verified) {
      // The token still rotates; the recorded permissions are unchanged and nothing was assumed.
      console.warn("[instagram/callback] provider reported no permissions — scopes left unchanged")
    }
    const { error } = await supabase.rpc("sa_connect_instagram", {
      p_external_account_id: externalId || null,
      p_username: profile.username ?? null,
      p_account_type: profile.account_type ?? null,
      p_scopes: scopes,
      p_token: long.access_token,
      p_expires_at: expiryFromExpiresIn(long.expires_in),
    })
    if (error) {
      console.error(`[instagram/callback] sa_connect_instagram failed: ${error.message}`)
      return NextResponse.redirect(`${accounts}?error=store`)
    }
    return NextResponse.redirect(
      `${accounts}?connected=instagram${resolution.verified ? "" : "&scopes=unverified"}`,
    )
  } catch (e) {
    // THE MESSAGE IS LOGGED, NEVER REDIRECTED. A thrown fetch error can carry the request URL, and
    // these URLs carry client_secret and access_token in their query strings — so the browser gets
    // an opaque code and the server log gets the detail. The message itself is emitted rather than
    // the error object for the same reason: no stack, no cause chain, no request echo.
    console.error(`[instagram/callback] exchange failed: ${(e as Error).message}`)
    return NextResponse.redirect(`${accounts}?error=exchange`)
  }
}
