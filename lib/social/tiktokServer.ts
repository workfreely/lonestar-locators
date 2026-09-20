// Server-side TikTok token resolution. Reuses the EXISTING Vault architecture — never redesigns
// OAuth/storage. Reads the encrypted token bundle via the service-role-only RPC, refreshes the
// access token through the existing refresh path when expired, and persists the rotated bundle.
// The access/refresh tokens NEVER leave the server: only the resolved access token is returned to
// other server code, never to the browser/URLs/logs.
import "server-only"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { refreshTikTokToken, buildTokenBundle, expiryFromExpiresIn } from "@/lib/social/tiktok"

type StoredBundle = { access_token?: string; refresh_token?: string; refresh_expires_at?: string }

/**
 * Resolve a currently-valid TikTok access token for `ownerId`, refreshing in place if the stored
 * access token is expired (or within 60s of expiry). Returns null when there is no connection or
 * no usable token. Server-only.
 */
export async function getValidTikTokAccessToken(
  ownerId: string,
): Promise<{ accessToken: string; openId: string | null } | null> {
  const { data, error } = await supabaseAdmin.rpc("sa_get_tiktok_token", { p_owner: ownerId })
  const row = (Array.isArray(data) ? data[0] : data) as
    | { token_bundle: string | null; token_expires_at: string | null; external_account_id: string | null }
    | null
  if (error || !row?.token_bundle) return null

  let bundle: StoredBundle
  try {
    bundle = JSON.parse(row.token_bundle) as StoredBundle
  } catch {
    return null
  }

  const expiresSoon = !!row.token_expires_at && new Date(row.token_expires_at).getTime() < Date.now() + 60_000
  if (!expiresSoon && bundle.access_token) {
    return { accessToken: bundle.access_token, openId: row.external_account_id }
  }

  // Expired/expiring → refresh via the existing mechanism and persist the rotated bundle.
  if (!bundle.refresh_token) return null
  const refreshed = await refreshTikTokToken(bundle.refresh_token)
  await supabaseAdmin.rpc("sa_update_tiktok_token", {
    p_owner: ownerId,
    p_token_bundle: buildTokenBundle(refreshed),
    p_expires_at: expiryFromExpiresIn(refreshed.expires_in),
  })
  return { accessToken: refreshed.access_token, openId: row.external_account_id }
}
