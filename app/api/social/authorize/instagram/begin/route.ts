export const runtime = "nodejs"

import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { instagramConfigured, instagramAuthorizeRedirectUri, instagramAuthorizeUrl } from "@/lib/social/instagram"
import { hashInviteToken, looksLikeInviteToken, destinationInvitePath } from "@/lib/social/destinationInvite"

// GET ?token=<raw> → begin the recipient's Instagram destination-authorization. PUBLIC (no session,
// no Locator Beast account). Validates the invitation by hash (unexpired/unused/unrevoked) via a
// service-role RPC, then stores the invite HASH + a fresh CSRF state nonce in short-lived httpOnly
// cookies and redirects to Instagram. The raw token never leaves this request; nothing about the
// owner is exposed. On any problem the recipient is bounced back to the authorize page with a
// status the page can explain.
export async function GET(request: Request) {
  const { origin, searchParams } = new URL(request.url)
  const rawToken = searchParams.get("token")

  const back = (status: string) =>
    NextResponse.redirect(
      `${origin}${looksLikeInviteToken(rawToken) ? destinationInvitePath(rawToken) : "/authorize/instagram/invalid"}?status=${status}`,
    )

  if (!looksLikeInviteToken(rawToken)) return back("invalid")
  if (!instagramConfigured()) return back("not_configured")

  const tokenHash = hashInviteToken(rawToken)
  const { data, error } = await supabaseAdmin.rpc("sa_validate_destination_invitation", { p_token_hash: tokenHash })
  const row = Array.isArray(data) ? data[0] : data
  const status = (row as { status?: string } | null)?.status
  if (error || status !== "valid") return back(status ?? "invalid")

  const state = crypto.randomUUID()
  const jar = await cookies()
  const cookieOpts = { httpOnly: true, secure: true, sameSite: "lax" as const, path: "/", maxAge: 600 }
  jar.set("ig_invite_state", state, cookieOpts)
  jar.set("ig_invite_hash", tokenHash, cookieOpts)

  const authorizeUrl = instagramAuthorizeUrl(instagramAuthorizeRedirectUri(origin), state)
  return NextResponse.redirect(authorizeUrl)
}
