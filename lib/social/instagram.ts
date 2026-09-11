// Instagram API with Instagram Login (graph.instagram.com) — OAuth helpers.
//
// The MODERN direct-Instagram path: a Professional (Business/Creator) account authenticates
// on Instagram itself — NO Facebook Page, NO Facebook login, NO config_id. Connection-only
// here: we request the minimum scope (instagram_business_basic); the publishing scope
// (instagram_business_content_publish) is added in a later checkpoint. Credentials come from
// env (INSTAGRAM_APP_ID / INSTAGRAM_APP_SECRET) — never hardcoded. The access token is
// handled server-side only and never returned to the browser.
//
// Endpoints (Meta official):
//   authorize   https://www.instagram.com/oauth/authorize
//   code→token  POST https://api.instagram.com/oauth/access_token    → { access_token, user_id }
//   long-lived  GET  https://graph.instagram.com/access_token?grant_type=ig_exchange_token  (~60d)
//   refresh     GET  https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token
//   profile     GET  https://graph.instagram.com/me?fields=user_id,username,account_type

const AUTHORIZE_URL = "https://www.instagram.com/oauth/authorize"
const TOKEN_URL = "https://api.instagram.com/oauth/access_token"
const GRAPH_BASE = "https://graph.instagram.com"

/** Connection-only scope. Publishing scope is added in the later checkpoint. */
export const INSTAGRAM_SCOPES = ["instagram_business_basic"] as const

/** True only when both credentials are present — drives the "Not configured" UI. */
export function instagramConfigured(): boolean {
  return !!process.env.INSTAGRAM_APP_ID && !!process.env.INSTAGRAM_APP_SECRET
}

/** The exact redirect URI, derived from the request origin (must be registered in Meta). */
export function instagramRedirectUri(origin: string): string {
  return `${origin}/admin/social-autopilot/accounts/instagram/callback`
}

/** CSRF state check: the value echoed back by Instagram must match the one we stored, and
 *  both must be present. Pure so it can be unit-tested directly. */
export function isValidOAuthState(received: string | null | undefined, expected: string | null | undefined): boolean {
  return !!received && !!expected && received === expected
}

/** Instagram authorization-window URL. `state` is our CSRF nonce. */
export function instagramAuthorizeUrl(redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.INSTAGRAM_APP_ID ?? "",
    redirect_uri: redirectUri,
    response_type: "code",
    scope: INSTAGRAM_SCOPES.join(","),
    state,
  })
  return `${AUTHORIZE_URL}?${params.toString()}`
}

type ShortToken = { access_token: string; user_id: string | number; permissions?: string[] }
type LongToken = { access_token: string; token_type?: string; expires_in?: number }
export type InstagramProfile = { user_id?: string; username?: string; account_type?: string }

/** Exchange the authorization code for a SHORT-lived token (+ the IG-scoped user id). */
export async function exchangeCodeForShortToken(code: string, redirectUri: string): Promise<ShortToken> {
  const body = new URLSearchParams({
    client_id: process.env.INSTAGRAM_APP_ID ?? "",
    client_secret: process.env.INSTAGRAM_APP_SECRET ?? "",
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
    code,
  })
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  })
  if (!res.ok) throw new Error(`ig short-token exchange failed: ${res.status}`)
  return (await res.json()) as ShortToken
}

/** Exchange a short-lived token for a LONG-lived (~60 day) token. */
export async function exchangeForLongLivedToken(shortToken: string): Promise<LongToken> {
  const params = new URLSearchParams({
    grant_type: "ig_exchange_token",
    client_secret: process.env.INSTAGRAM_APP_SECRET ?? "",
    access_token: shortToken,
  })
  const res = await fetch(`${GRAPH_BASE}/access_token?${params.toString()}`)
  if (!res.ok) throw new Error(`ig long-lived exchange failed: ${res.status}`)
  return (await res.json()) as LongToken
}

/** Refresh a long-lived token (foundation for unattended operation; token must be ≥24h old,
 *  <60 days). Server-side only. Returns the new token + its lifetime. */
export async function refreshLongLivedToken(longToken: string): Promise<LongToken> {
  const params = new URLSearchParams({ grant_type: "ig_refresh_token", access_token: longToken })
  const res = await fetch(`${GRAPH_BASE}/refresh_access_token?${params.toString()}`)
  if (!res.ok) throw new Error(`ig token refresh failed: ${res.status}`)
  return (await res.json()) as LongToken
}

/** Fetch the connected account's public identity (username / type / id). */
export async function fetchInstagramProfile(longToken: string): Promise<InstagramProfile> {
  const params = new URLSearchParams({ fields: "user_id,username,account_type", access_token: longToken })
  const res = await fetch(`${GRAPH_BASE}/me?${params.toString()}`)
  if (!res.ok) throw new Error(`ig profile fetch failed: ${res.status}`)
  return (await res.json()) as InstagramProfile
}

/** ISO expiry from an `expires_in` (seconds); defaults to ~60 days when absent. */
export function expiryFromExpiresIn(expiresIn: number | undefined | null): string {
  const secs = typeof expiresIn === "number" && expiresIn > 0 ? expiresIn : 60 * 24 * 60 * 60
  return new Date(Date.now() + secs * 1000).toISOString()
}
