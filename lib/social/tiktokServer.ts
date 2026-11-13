// Server-side TikTok token resolution, PER CONNECTION.
//
// Reuses the EXISTING Vault architecture — never redesigns OAuth/storage. Reads the encrypted token
// bundle through a service-role-only RPC, refreshes the access token through the existing refresh
// path when expired, and persists the rotated bundle. The access/refresh tokens NEVER leave the
// server: only the resolved access token is returned to other server code, never to the
// browser/URLs/logs.
//
// ── WHY A CONNECTION ID AND NOT AN OWNER ID ────────────────────────────────────────────────────
// A publishing destination is a social_connections ROW. One owner may hold several TikTok
// destinations — Real Estate Pro and Locator Beast — and "the owner's TikTok token" then names no
// particular credential. The old resolver asked the database for it anyway, and the RPC answered
// with an unordered `limit 1`: an arbitrary account's token, with nothing to indicate a choice had
// been made. Publishing one brand's video from the other brand's account is the failure that
// causes, and it is silent.
//
// So the unit here is the CONNECTION, exactly as Instagram has done since 20260913000002. The
// owner-scoped entry point survives for the request-time routes, but it now resolves to a
// connection first and REFUSES when that is ambiguous, rather than picking.
import "server-only"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { refreshTikTokToken, buildTokenBundle, expiryFromExpiresIn } from "@/lib/social/tiktok"
// THE DECISIONS, in a module with no server-only guard so they are unit-testable. This file keeps
// the I/O and the secrets; which account, and whether its token is still good, are answered there.
import {
  soleConnectionId, tokenNeedsRefresh, connectionBelongsToOwner,
} from "@/lib/social/tiktokConnectionChoice"

/**
 * The narrow slice of the service-role client these functions use.
 *
 * Declared so a caller can INJECT one, which is the only way the two properties that matter here
 * are testable without a database: that a connection id resolves to its OWN token, and that an
 * owner cannot reach a connection that is not theirs. The same shape loadPostingHistory and
 * resolveAreaDriveTimes already use. Production passes nothing and gets supabaseAdmin.
 */
export type TikTokTokenClient = {
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message?: string } | null }>
  from: (table: string) => {
    select: (cols: string) => {
      eq: (c: string, v: unknown) => {
        eq: (c: string, v: unknown) => {
          order: (c: string, o: { ascending: boolean }) => Promise<{ data: unknown; error: { message?: string } | null }>
        }
      }
    }
  }
}

type StoredBundle = { access_token?: string; refresh_token?: string; refresh_expires_at?: string }

/** What one TikTok destination's row says about itself, alongside its usable access token. */
export type TikTokConnectionToken = {
  accessToken: string
  /** TikTok open_id — the account this token actually posts as. */
  openId: string | null
  connectionId: string
  username: string | null
  status: string | null
  /** The destination's own pause switch. Returned so a caller can honour it without a second read. */
  postingPaused: boolean
  ownerUserId: string | null
}

/**
 * THE resolver: a currently-valid access token for ONE destination, refreshing in place if needed.
 *
 * Returns null when the connection does not exist, is not TikTok, has no stored bundle, or has no
 * refresh token to recover with. Null is always "no usable credential for THIS destination" — never
 * another destination's credential.
 */
export async function getValidTikTokAccessTokenForConnection(
  connectionId: string,
  client?: TikTokTokenClient,
): Promise<TikTokConnectionToken | null> {
  if (!connectionId) return null
  const db = client ?? (supabaseAdmin as unknown as TikTokTokenClient)
  const { data, error } = await db.rpc("sa_get_tiktok_token_by_connection", {
    p_connection_id: connectionId,
  })
  const row = (Array.isArray(data) ? data[0] : data) as
    | {
        token_bundle: string | null
        token_expires_at: string | null
        external_account_id: string | null
        username: string | null
        status: string | null
        posting_paused: boolean | null
        owner_user_id: string | null
      }
    | null
  if (error || !row?.token_bundle) return null

  let bundle: StoredBundle
  try {
    bundle = JSON.parse(row.token_bundle) as StoredBundle
  } catch {
    return null
  }

  const base = {
    connectionId,
    openId: row.external_account_id,
    username: row.username,
    status: row.status,
    postingPaused: row.posting_paused === true,
    ownerUserId: row.owner_user_id,
  }

  if (!tokenNeedsRefresh(row.token_expires_at) && bundle.access_token) {
    return { ...base, accessToken: bundle.access_token }
  }

  // Expired/expiring → refresh through the existing mechanism and persist the rotated bundle
  // against THIS connection. The RPC locks the row, so two overlapping refreshes of the same
  // destination serialise instead of each orphaning the other's secret; and because it writes by
  // id, a refresh here can never touch the other brand's row.
  if (!bundle.refresh_token) return null
  const refreshed = await refreshTikTokToken(bundle.refresh_token)
  await db.rpc("sa_update_tiktok_token_by_connection", {
    p_connection_id: connectionId,
    // The previous bundle is passed so a response without a rotated refresh_token keeps the one we
    // already hold, rather than writing a bundle that cannot be refreshed again.
    p_token_bundle: buildTokenBundle(refreshed, bundle),
    p_expires_at: expiryFromExpiresIn(refreshed.expires_in),
  })
  return { ...base, accessToken: refreshed.access_token }
}

/**
 * The owner's ONE TikTok connection id, or null when they have none — or more than one.
 *
 * More than one is deliberately null rather than a choice. The callers are request-time routes
 * acting for a signed-in operator, and "which of your two accounts did you mean?" is a question
 * only the operator can answer; they pass a connection id once they can.
 */
export async function resolveSoleTikTokConnectionId(
  ownerId: string,
  client?: TikTokTokenClient,
): Promise<string | null> {
  if (!ownerId) return null
  const db = client ?? (supabaseAdmin as unknown as TikTokTokenClient)
  const { data, error } = await db
    .from("social_connections")
    .select("id")
    .eq("owner_user_id", ownerId)
    .eq("provider", "tiktok")
    .order("created_at", { ascending: true })
  if (error) return null
  return soleConnectionId((data ?? []) as { id: string }[])
}

/**
 * Owner-scoped entry point, kept for the request-time routes.
 *
 * SAME SIGNATURE AS BEFORE plus an optional connection id, so every existing call site compiles
 * and behaves identically while exactly one TikTok account is connected. What changed is the
 * answer when there are two: null, not a guess.
 *
 * When `connectionId` is supplied it is verified to belong to `ownerId` before use — a route must
 * not become a way to borrow another owner's credential by passing an id.
 */
export async function getValidTikTokAccessToken(
  ownerId: string,
  connectionId?: string | null,
  client?: TikTokTokenClient,
): Promise<{ accessToken: string; openId: string | null } | null> {
  const id = connectionId || (await resolveSoleTikTokConnectionId(ownerId, client))
  if (!id) return null
  const tok = await getValidTikTokAccessTokenForConnection(id, client)
  if (!tok) return null
  // Ownership, asserted rather than assumed. Only meaningful for an id that arrived from a caller;
  // a resolved one is already the owner's by construction, and checking both costs one comparison.
  if (!connectionBelongsToOwner(tok.ownerUserId, ownerId)) return null
  return { accessToken: tok.accessToken, openId: tok.openId }
}
