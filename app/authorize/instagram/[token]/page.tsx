export const dynamic = "force-dynamic"

import { supabaseAdmin } from "@/lib/supabase/admin"
import { hashInviteToken, looksLikeInviteToken } from "@/lib/social/destinationInvite"
import { instagramConfigured } from "@/lib/social/instagram"
import AuthorizeShell from "../AuthorizeShell"

// PUBLIC recipient page (NO Locator Beast account, NO session). Given a private invitation link,
// it validates the token by hash and — if valid — offers a single "Authorize on Instagram" button
// that begins OAuth. It never reveals the owner, any Beast Social data, or a token. Every other
// state (expired / used / revoked / invalid) shows a plain explanation with no action.
export default async function AuthorizeInstagramPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { token } = await params
  const sp = await searchParams
  const backStatus = typeof sp.status === "string" ? sp.status : null

  if (!looksLikeInviteToken(token)) {
    return <AuthorizeShell state="invalid" />
  }
  if (!instagramConfigured()) {
    return <AuthorizeShell state="not_configured" />
  }

  // A status bounced back from the begin route (e.g. it became invalid between load and click)
  // takes precedence over a fresh validation.
  if (backStatus && backStatus !== "valid") {
    return <AuthorizeShell state={backStatus} />
  }

  const tokenHash = hashInviteToken(token)
  const { data } = await supabaseAdmin.rpc("sa_validate_destination_invitation", { p_token_hash: tokenHash })
  const row = Array.isArray(data) ? data[0] : data
  const status = (row as { status?: string; label?: string | null } | null)?.status ?? "invalid"
  const label = (row as { label?: string | null } | null)?.label ?? null

  if (status !== "valid") {
    return <AuthorizeShell state={status} label={label} />
  }

  const beginHref = `/api/social/authorize/instagram/begin?token=${encodeURIComponent(token)}`
  return <AuthorizeShell state="valid" label={label} beginHref={beginHref} />
}
