export const runtime = "nodejs"

import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { requirePlatformAdmin } from "@/lib/auth/requirePlatformAdmin"
import { tiktokConfigured, tiktokRedirectUri, tiktokAuthorizeUrl } from "@/lib/social/tiktok"

// GET → begin TikTok (Login Kit, Web) OAuth. Platform-admin ONLY. Generates a
// cryptographically-secure state nonce, stores it in a short-lived httpOnly cookie, and
// redirects to TikTok's authorization window requesting only the scopes needed for the
// Direct Post test (user.info.basic, video.publish). When credentials are missing it bounces
// back to the Integrations page with ?error=not_configured.
//
// NOTE: the redirect_uri is the FIXED registered Sandbox callback (tiktokRedirectUri), not
// derived from the request origin — TikTok requires it to exactly match a registered URI, so
// this flow only completes on the deployed https host.
export async function GET(request: Request) {
  const guard = await requirePlatformAdmin()
  if (!guard.ok) return guard.response

  const { origin } = new URL(request.url)
  const accounts = `${origin}/admin/social-autopilot/accounts`

  if (!tiktokConfigured()) {
    return NextResponse.redirect(`${accounts}?error=not_configured`)
  }

  const state = crypto.randomUUID()
  const authorizeUrl = tiktokAuthorizeUrl(tiktokRedirectUri(), state)

  const jar = await cookies()
  jar.set("tt_oauth_state", state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  })

  return NextResponse.redirect(authorizeUrl)
}
