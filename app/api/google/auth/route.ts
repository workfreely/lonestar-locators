export const runtime = "nodejs"

import { google } from "googleapis"
import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { createClient } from "@/lib/supabase/server"

// Per-user Google OAuth initiation (onboarding Connect step).
//
// Requires an authenticated user, then redirects to Google's consent screen
// for Calendar + Contacts. A random `state` nonce is stored in a short-lived
// httpOnly cookie and echoed to Google so the callback can reject forged /
// cross-user completions (CSRF). The redirect URI is derived from the request
// origin so it works in dev and prod (both must be registered in the Google
// Cloud console).
export async function GET(request: Request) {
  const { origin, searchParams } = new URL(request.url)

  // Where to return the user after connecting — defaults to onboarding, which
  // resumes at the persisted Connect step. Only accept same-origin app paths.
  const nextParam = searchParams.get("next") ?? "/onboarding"
  const next = nextParam.startsWith("/") ? nextParam : "/onboarding"

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.redirect(`${origin}/login`)
  }

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${origin}/api/google/callback`
  )

  const scopes = [
    "https://www.googleapis.com/auth/contacts",
    "https://www.googleapis.com/auth/calendar.events",
  ]

  const nonce = crypto.randomUUID()
  const state = JSON.stringify({ n: nonce, next })

  const url = oauth2Client.generateAuthUrl({
    access_type: "offline",
    // Force a consent prompt so Google reliably returns a refresh_token even
    // if the user has authorized before.
    prompt: "consent",
    include_granted_scopes: true,
    scope: scopes,
    state,
  })

  // Short-lived, httpOnly nonce the callback compares against `state`.
  const jar = await cookies()
  jar.set("google_oauth_nonce", nonce, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  })

  return NextResponse.redirect(url)
}
