export const runtime = "nodejs"

import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { requireWorkspaceMember } from "@/lib/auth/requireWorkspaceMember"
import { isMetaAdsBetaAllowed } from "@/lib/meta/beta"
import { metaConfigured, metaRedirectUri, metaAuthorizeUrl } from "@/lib/meta/config"

// GET → begin the Meta Ads (Instagram & Facebook Ads) OAuth via Facebook Login for Business.
// Workspace-scoped + beta-gated. Generates a CSRF state nonce (httpOnly cookie) and redirects to
// Meta's consent screen. Never exposes raw Meta errors; bounces back to Integrations with a friendly
// ?meta_error code when it can't proceed. SEPARATE from Social Beast's Instagram Login flow.
export async function GET(request: Request) {
  const { origin } = new URL(request.url)
  const integrations = `${origin}/admin/integrations`

  const guard = await requireWorkspaceMember()
  if (!guard.ok) return NextResponse.redirect(`${integrations}?meta_error=unauthorized`)

  if (!(await isMetaAdsBetaAllowed(guard.supabase, guard.userId))) {
    return NextResponse.redirect(`${integrations}?meta_error=beta`)
  }
  if (!metaConfigured()) {
    return NextResponse.redirect(`${integrations}?meta_error=not_configured`)
  }

  const state = crypto.randomUUID()
  const authorizeUrl = metaAuthorizeUrl(metaRedirectUri(origin), state)

  const jar = await cookies()
  jar.set("meta_oauth_state", state, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 600 })

  return NextResponse.redirect(authorizeUrl)
}
