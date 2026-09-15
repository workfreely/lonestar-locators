export const runtime = "nodejs"

import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { requireWorkspaceMember } from "@/lib/auth/requireWorkspaceMember"
import { isMetaAdsBetaAllowed } from "@/lib/meta/beta"
import { isValidMetaState, META_PHASE1_SCOPES } from "@/lib/meta/config"
import { exchangeCodeForToken, exchangeForLongLivedToken, metaExpiryFromExpiresIn, MetaError } from "@/lib/meta/client"
import { discoverAssets, autoMatch, publicAssets } from "@/lib/meta/assets"
import { syncWorkspaceInsights } from "@/lib/meta/sync"

// GET → Meta OAuth callback. Validates CSRF state, exchanges the code for a long-lived user token,
// discovers assets, and either auto-connects (one obvious setup) or stores a PENDING connection with
// the ambiguity options for a minimal picker. All failures redirect back to Integrations with a
// friendly ?meta_error code — never a raw Meta payload. Connection-only: no leads, no insights.
export async function GET(request: Request) {
  const url = new URL(request.url)
  const { origin } = url
  const integrations = `${origin}/admin/integrations`
  const back = (q: string) => NextResponse.redirect(`${integrations}?${q}`)

  // Meta returned an error / user denied consent.
  if (url.searchParams.get("error")) return back("meta_error=declined")

  const guard = await requireWorkspaceMember()
  if (!guard.ok) return back("meta_error=unauthorized")
  if (!(await isMetaAdsBetaAllowed(guard.supabase, guard.userId))) return back("meta_error=beta")

  const jar = await cookies()
  const expected = jar.get("meta_oauth_state")?.value
  const received = url.searchParams.get("state")
  jar.delete("meta_oauth_state")
  if (!isValidMetaState(received, expected)) return back("meta_error=state")

  const code = url.searchParams.get("code")
  if (!code) return back("meta_error=no_code")

  try {
    const short = await exchangeCodeForToken(code, origin)
    const long = await exchangeForLongLivedToken(short.access_token)
    const token = long.access_token
    const expiresAt = metaExpiryFromExpiresIn(long.expires_in)

    const assets = await discoverAssets(token)
    const match = autoMatch(assets)

    if (match.status === "missing") return back(`meta_error=${match.reason}`)

    const scopes = [...META_PHASE1_SCOPES]
    if (match.status === "auto") {
      const { business, page, adAccount } = match.chosen
      const { data, error } = await guard.supabase.rpc("meta_connect", {
        p_workspace_id: guard.workspaceId,
        p_owner_scope: "locator",
        p_status: "connected",
        p_scopes: scopes,
        p_business_id: business?.id ?? null,
        p_business_name: business?.name ?? null,
        p_page_id: page?.id ?? null,
        p_page_name: page?.name ?? null,
        p_ad_account_id: adAccount?.id ?? null,
        p_ad_account_name: adAccount?.name ?? null,
        p_instagram_account_id: page?.instagramId ?? null,
        p_instagram_username: page?.instagramUsername ?? null,
        p_user_token: token,
        p_page_token: page?.token ?? null,
        p_token_expires_at: expiresAt,
        p_discovered: null,
      })
      if (error) return back("meta_error=save")
      // Best-effort backfill of ad performance so Sales Analytics has data on first view. Never blocks
      // the connect redirect (a sync failure just leaves an empty cache until the next daily sync).
      const connId = Array.isArray(data) ? (data[0] as { id?: string } | undefined)?.id ?? null : null
      if (adAccount?.id) { try { await syncWorkspaceInsights(guard.workspaceId, connId, adAccount.id) } catch { /* ignore */ } }
      return back("meta=connected")
    }

    // Ambiguous: persist a PENDING connection (token in Vault) + the options (no tokens) for the picker.
    const { error } = await guard.supabase.rpc("meta_connect", {
      p_workspace_id: guard.workspaceId,
      p_owner_scope: "locator",
      p_status: "pending",
      p_scopes: scopes,
      p_business_id: null,
      p_business_name: null,
      p_page_id: null,
      p_page_name: null,
      p_ad_account_id: null,
      p_ad_account_name: null,
      p_instagram_account_id: null,
      p_instagram_username: null,
      p_user_token: token,
      p_page_token: null,
      p_token_expires_at: expiresAt,
      p_discovered: publicAssets(match.options) as unknown as Record<string, unknown>,
    })
    if (error) return back("meta_error=save")
    return back("meta=choose")
  } catch (e) {
    const code = e instanceof MetaError ? e.code : "unknown"
    return back(`meta_error=${code === "not_configured" ? "not_configured" : "auth_failed"}`)
  }
}
