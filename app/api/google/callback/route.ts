export const runtime = "nodejs"

import { google } from "googleapis"
import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { createClient } from "@/lib/supabase/server"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { reconnectCredentialRow } from "@/lib/google/integrationHealthRules"

// Per-user Google OAuth callback (onboarding Connect step).
//
// Verifies the CSRF nonce, exchanges the code for tokens, and stores the
// refresh token in google_credentials (service-role only — never exposed to
// the browser), then flips profiles.google_connected so the UI reflects it.
// Redirects back to the app path carried in `state.next`.
const SCOPES = [
  "https://www.googleapis.com/auth/contacts",
  "https://www.googleapis.com/auth/calendar.events",
]

function safeNext(next: unknown): string {
  return typeof next === "string" && next.startsWith("/") ? next : "/onboarding"
}

export async function GET(request: Request) {
  const { origin, searchParams } = new URL(request.url)
  const code = searchParams.get("code")
  const rawState = searchParams.get("state")

  // Parse state (nonce + next). Malformed state → treat as forged.
  let nonce: string | null = null
  let next = "/onboarding"
  try {
    const parsed = JSON.parse(rawState ?? "{}")
    nonce = typeof parsed?.n === "string" ? parsed.n : null
    next = safeNext(parsed?.next)
  } catch {
    /* handled below */
  }

  const jar = await cookies()
  const cookieNonce = jar.get("google_oauth_nonce")?.value
  jar.delete("google_oauth_nonce")

  // CSRF: the nonce echoed by Google must match the one we set on initiation.
  if (!code || !nonce || !cookieNonce || nonce !== cookieNonce) {
    // Non-PII diagnostic: which precondition failed (no token/code/email logged).
    console.warn(
      `[google/callback] state/nonce check failed (hasCode=${!!code} hasStateNonce=${!!nonce} hasCookieNonce=${!!cookieNonce} match=${nonce === cookieNonce}) — CSRF or expired nonce`,
    )
    return NextResponse.redirect(`${origin}${next}?google=error`)
  }

  // Bind the connection to the signed-in user (never to a body/param value).
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.redirect(`${origin}/login`)
  }

  try {
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      `${origin}/api/google/callback`
    )

    const { tokens } = await oauth2Client.getToken(code)

    // Without a refresh token we can't act on the user's behalf later. Force a
    // reconsent by sending them back unconnected.
    if (!tokens.refresh_token) {
      // Non-PII diagnostic: Google returned no refresh_token (needs a
      // prompt=consent reconsent). No token/code/email logged.
      console.warn("[google/callback] no refresh_token returned by Google — reconsent required")
      return NextResponse.redirect(`${origin}${next}?google=error`)
    }

    // Best-effort email for display — present only if Google returns an
    // id_token (it may not, since we don't request the email scope).
    let googleEmail: string | null = null
    if (tokens.id_token) {
      try {
        const payload = JSON.parse(
          Buffer.from(tokens.id_token.split(".")[1], "base64").toString("utf8")
        )
        if (typeof payload?.email === "string") googleEmail = payload.email
      } catch {
        /* non-fatal */
      }
    }

    // Service-role write — the refresh token never touches the browser.
    // reconnectCredentialRow also CLEARS the recorded health failure in the same write: a stale
    // last_error would leave shouldAttemptGoogle refusing to use the token we just stored.
    const { error: credError } = await supabaseAdmin.from("google_credentials").upsert(
      reconnectCredentialRow({
        userId: user.id,
        refreshToken: tokens.refresh_token,
        googleEmail,
        scopes: SCOPES,
      }),
      { onConflict: "user_id" }
    )
    if (credError) {
      console.error("[google/callback] credential upsert failed:", credError.message)
      return NextResponse.redirect(`${origin}${next}?google=error`)
    }

    // Non-sensitive UI flag the client can safely read.
    await supabaseAdmin.from("profiles").update({ google_connected: true }).eq("id", user.id)

    return NextResponse.redirect(`${origin}${next}?google=connected`)
  } catch (err) {
    console.error("[google/callback] OAuth exchange failed:", err)
    return NextResponse.redirect(`${origin}${next}?google=error`)
  }
}
