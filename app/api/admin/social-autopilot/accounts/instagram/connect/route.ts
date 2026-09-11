export const runtime = "nodejs"

import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { requirePlatformAdmin } from "@/lib/auth/requirePlatformAdmin"
import { instagramConfigured, instagramRedirectUri, instagramAuthorizeUrl } from "@/lib/social/instagram"

// GET → begin Instagram (Instagram Login) OAuth. Platform-admin ONLY. Generates a
// cryptographically-secure state nonce, stores it in a short-lived httpOnly cookie, and
// redirects to Instagram's authorization window requesting only instagram_business_basic.
// When credentials are missing it bounces back to Accounts with ?error=not_configured.
export async function GET(request: Request) {
  const guard = await requirePlatformAdmin()
  if (!guard.ok) return guard.response

  const { origin } = new URL(request.url)
  const accounts = `${origin}/admin/social-autopilot/accounts`

  if (!instagramConfigured()) {
    return NextResponse.redirect(`${accounts}?error=not_configured`)
  }

  const state = crypto.randomUUID()
  const redirectUri = instagramRedirectUri(origin)
  const authorizeUrl = instagramAuthorizeUrl(redirectUri, state)

  const jar = await cookies()
  jar.set("ig_oauth_state", state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  })

  return NextResponse.redirect(authorizeUrl)
}
