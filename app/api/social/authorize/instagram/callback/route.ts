export const runtime = "nodejs"

import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { supabaseAdmin } from "@/lib/supabase/admin"
import {
  INSTAGRAM_SCOPES,
  completeInstagramOAuth,
  instagramConfigured,
  instagramAuthorizeRedirectUri,
  isValidOAuthState,
} from "@/lib/social/instagram"

// GET ← Instagram redirects the RECIPIENT here with ?code&state (or ?error). PUBLIC — there is no
// Locator Beast session and none is ever created. Steps:
//   1. Read the bound invite hash + CSRF state from the short-lived httpOnly cookies (set by begin)
//      and clear them immediately (single-use).
//   2. Validate state (CSRF) and that Instagram didn't return an error/denial.
//   3. Complete the OAuth token exchange server-side (never exposing the token to the browser).
//   4. Consume the invitation ATOMICALLY: sa_consume_destination_invitation re-checks
//      valid/unexpired/unused/unrevoked under a row lock, stores the token in Vault, and creates
//      the destination under the INVITE OWNER's id (from the invite row, never a session).
//   5. Redirect to a tokenless completion page with only a coarse status.
// A replayed callback finds the invite already used → 'used' status, no second connection.
export async function GET(request: Request) {
  const { origin, searchParams } = new URL(request.url)
  const complete = (status: string) => NextResponse.redirect(`${origin}/authorize/instagram/complete?status=${status}`)

  const jar = await cookies()
  const expectedState = jar.get("ig_invite_state")?.value
  const tokenHash = jar.get("ig_invite_hash")?.value
  // Single-use: clear both cookies regardless of outcome so this callback can't be re-driven.
  jar.set("ig_invite_state", "", { path: "/", maxAge: 0 })
  jar.set("ig_invite_hash", "", { path: "/", maxAge: 0 })

  const err = searchParams.get("error")
  if (err) return complete("denied")

  const code = searchParams.get("code")
  const state = searchParams.get("state")
  if (!tokenHash) return complete("invalid")
  if (!code || !isValidOAuthState(state, expectedState)) return complete("state")
  if (!instagramConfigured()) return complete("not_configured")

  try {
    const oauth = await completeInstagramOAuth(code, instagramAuthorizeRedirectUri(origin))
    if (!oauth.externalId) return complete("no_account")

    const { data, error } = await supabaseAdmin.rpc("sa_consume_destination_invitation", {
      p_token_hash: tokenHash,
      p_external_account_id: oauth.externalId,
      p_username: oauth.username,
      p_account_type: oauth.accountType,
      p_scopes: INSTAGRAM_SCOPES,
      p_token: oauth.token,
      p_expires_at: oauth.expiresAt,
    })
    if (error) return complete("store")
    const row = Array.isArray(data) ? data[0] : data
    const status = (row as { status?: string } | null)?.status ?? "store"
    // Map the RPC's status to the recipient page (connected | used | revoked | expired | ...).
    return complete(status)
  } catch {
    // No token in the error path — nothing sensitive is logged.
    return complete("exchange")
  }
}
