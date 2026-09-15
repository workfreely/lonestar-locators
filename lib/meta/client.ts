// Meta Graph API client — token exchange + typed GET, with friendly error normalization.
// Server-side only. Tokens are passed as arguments and never logged.
import { META_GRAPH_BASE, metaAppId, metaAppSecret, metaRedirectUri } from "@/lib/meta/config"

export type MetaErrorCode =
  | "auth_failed"    // code→token or graph auth failed
  | "not_configured" // app id/secret missing
  | "network"        // fetch/transport failure
  | "unknown"

export class MetaError extends Error {
  code: MetaErrorCode
  constructor(code: MetaErrorCode, message: string) {
    super(message)
    this.code = code
    this.name = "MetaError"
  }
}

type LongToken = { access_token: string; token_type?: string; expires_in?: number }

/** Exchange the OAuth `code` for a user access token (server-to-server). */
export async function exchangeCodeForToken(code: string, origin: string): Promise<LongToken> {
  const params = new URLSearchParams({
    client_id: metaAppId(),
    client_secret: metaAppSecret(),
    redirect_uri: metaRedirectUri(origin),
    code,
  })
  let res: Response
  try {
    res = await fetch(`${META_GRAPH_BASE}/oauth/access_token?${params.toString()}`)
  } catch {
    throw new MetaError("network", "meta token exchange transport error")
  }
  if (!res.ok) throw new MetaError("auth_failed", `meta token exchange failed: ${res.status}`)
  return (await res.json()) as LongToken
}

/** Exchange a short-lived user token for a long-lived (~60 day) one. Best-effort: returns the input
 *  token unchanged if the exchange fails (Phase-1 discovery still works with the short token). */
export async function exchangeForLongLivedToken(shortToken: string): Promise<LongToken> {
  const params = new URLSearchParams({
    grant_type: "fb_exchange_token",
    client_id: metaAppId(),
    client_secret: metaAppSecret(),
    fb_exchange_token: shortToken,
  })
  try {
    const res = await fetch(`${META_GRAPH_BASE}/oauth/access_token?${params.toString()}`)
    if (res.ok) return (await res.json()) as LongToken
  } catch {
    /* fall through */
  }
  return { access_token: shortToken }
}

/** Typed Graph GET. Throws MetaError('auth_failed') on a non-OK Meta response. */
export async function graphGet<T>(path: string, token: string, fields?: string): Promise<T> {
  const params = new URLSearchParams({ access_token: token })
  if (fields) params.set("fields", fields)
  let res: Response
  try {
    res = await fetch(`${META_GRAPH_BASE}/${path}?${params.toString()}`)
  } catch {
    throw new MetaError("network", "meta graph transport error")
  }
  if (!res.ok) throw new MetaError("auth_failed", `meta graph ${path} failed: ${res.status}`)
  return (await res.json()) as T
}

/** ISO expiry from `expires_in` (seconds); defaults to ~60 days when absent. */
export function metaExpiryFromExpiresIn(expiresIn: number | undefined | null): string {
  const secs = typeof expiresIn === "number" && expiresIn > 0 ? expiresIn : 60 * 24 * 60 * 60
  return new Date(Date.now() + secs * 1000).toISOString()
}
