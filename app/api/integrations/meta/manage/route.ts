export const runtime = "nodejs"

import { NextResponse } from "next/server"
import { requireWorkspaceMember } from "@/lib/auth/requireWorkspaceMember"
import { isMetaAdsBetaAllowed } from "@/lib/meta/beta"

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

  if (!data) return NextResponse.json({ betaAllowed: allowed, connection: null })

  const maskedAdAccount = data.ad_account_id ? `••••${String(data.ad_account_id).replace(/\D/g, "").slice(-4)}` : null
  return NextResponse.json({
    betaAllowed: allowed,
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
