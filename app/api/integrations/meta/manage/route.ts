export const runtime = "nodejs"

import { NextResponse } from "next/server"
import { requireWorkspaceMember } from "@/lib/auth/requireWorkspaceMember"
import { isMetaAdsBetaAllowed } from "@/lib/meta/beta"
import { buildAdDestinationUrl } from "@/lib/meta/adLink"

// GET → the current workspace's Meta connection (friendly, NON-SECRET fields only) + ambiguity
// options while pending. Never returns tokens or Vault ids. Used by the Integrations card + Manage UI.
export async function GET() {
  const guard = await requireWorkspaceMember()
  if (!guard.ok) return guard.response
  const allowed = await isMetaAdsBetaAllowed(guard.supabase, guard.userId)

  const { data } = await guard.supabase
    .from("meta_connections")
    .select(
      "connection_status, business_name, page_name, ad_account_id, ad_account_name, instagram_username, token_expires_at, discovered, updated_at",
    )
    .eq("workspace_id", guard.workspaceId)
    .eq("provider", "meta")
    .maybeSingle()

  // The workspace's public Smart Form slug → the ad-destination URL the locator pastes into their ad.
  const { data: ws } = await guard.supabase.from("workspaces").select("slug").eq("id", guard.workspaceId).maybeSingle()
  const slug = ws?.slug ?? null
  const adLink = slug ? buildAdDestinationUrl(slug, "instagram") : null
  const adLinkFacebook = slug ? buildAdDestinationUrl(slug, "facebook") : null

  if (!data) return NextResponse.json({ betaAllowed: allowed, connection: null, adLink, adLinkFacebook })

  const maskedAdAccount = data.ad_account_id ? `••••${String(data.ad_account_id).replace(/\D/g, "").slice(-4)}` : null
  return NextResponse.json({
    betaAllowed: allowed,
    adLink,
    adLinkFacebook,
    connection: {
      status: data.connection_status,
      instagramUsername: data.instagram_username,
      pageName: data.page_name,
      businessName: data.business_name,
      adAccountName: data.ad_account_name,
      adAccountMasked: maskedAdAccount,
      tokenExpiresAt: data.token_expires_at,
      // Ambiguity options (only while pending) so the card can render the minimal picker.
      options: data.connection_status === "pending" ? data.discovered : null,
    },
  })
}
