// TikTok Login Kit (Web) OAuth helpers — Social Beast connection (Sandbox).
//
// Follows TikTok's current official v2 endpoints (verified against developers.tiktok.com):
//   authorize   https://www.tiktok.com/v2/auth/authorize/         ?client_key&response_type=code&scope&redirect_uri&state
//   code→token  POST https://open.tiktokapis.com/v2/oauth/token/  (x-www-form-urlencoded)  → { access_token, refresh_token, expires_in(24h), refresh_expires_in(365d), open_id, scope, token_type }
//   refresh     POST https://open.tiktokapis.com/v2/oauth/token/  grant_type=refresh_token
//   user info   GET  https://open.tiktokapis.com/v2/user/info/    ?fields=open_id,display_name,avatar_url   (Bearer)
//
// Credentials come from env (TIKTOK_CLIENT_KEY / TIKTOK_CLIENT_SECRET) — never hardcoded,
// never sent to the browser. Use the SANDBOX client key + secret for this test. The Client
// Secret is read ONLY here (server-side route handlers) and never returned to the client.

const AUTHORIZE_URL = "https://www.tiktok.com/v2/auth/authorize/"
const TOKEN_URL = "https://open.tiktokapis.com/v2/oauth/token/"
const USERINFO_URL = "https://open.tiktokapis.com/v2/user/info/"

// Minimum scopes for the current Direct Post proof: basic identity + Direct Post publishing.
// video.upload (draft/inbox uploads) is intentionally NOT requested — Direct Post uses
// video.publish. The token is scoped at authorization time, so changing scopes here requires
// a re-connect (disconnect → connect) before the new grant applies.
export const TIKTOK_SCOPES = ["user.info.basic", "video.publish"] as const

// The registered redirect URI. TikTok requires the redirect_uri in BOTH the authorize step
// and the token exchange to EXACTLY match one registered in the app — here the Sandbox Web
// redirect URI. It is therefore a fixed production URL (env-overridable), which means the
// OAuth callback only functions on the deployed https host, not on localhost.
const DEFAULT_REDIRECT_URI = "https://locatorbeast.com/api/integrations/tiktok/callback"

function clientKey(): string {
  return (process.env.TIKTOK_CLIENT_KEY ?? "").trim()
}
function clientSecret(): string {
  return (process.env.TIKTOK_CLIENT_SECRET ?? "").trim()
}

/** True only when a client key + secret are present — drives the "Not configured" UI. */
export function tiktokConfigured(): boolean {
  return clientKey().length > 0 && clientSecret().length > 0
}

/** The exact redirect URI (must match the one registered in the TikTok app). Fixed to the
 *  production callback by default; overridable via TIKTOK_REDIRECT_URI for a differently
 *  registered host. Both authorize + token exchange call this so they always match. */
export function tiktokRedirectUri(): string {
  return (process.env.TIKTOK_REDIRECT_URI ?? DEFAULT_REDIRECT_URI).trim()
}

/** CSRF state check: the value echoed back by TikTok must match the one we stored, and both
 *  must be present. Pure so it can be unit-tested directly. */
export function isValidOAuthState(received: string | null | undefined, expected: string | null | undefined): boolean {
  return !!received && !!expected && received === expected
}

/** TikTok authorization-window URL. `state` is our CSRF nonce; scopes are comma-separated. */
export function tiktokAuthorizeUrl(redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_key: clientKey(),
    response_type: "code",
    scope: TIKTOK_SCOPES.join(","),
    redirect_uri: redirectUri,
    state,
  })
  return `${AUTHORIZE_URL}?${params.toString()}`
}

export type TikTokTokenResponse = {
  access_token: string
  refresh_token: string
  expires_in: number
  refresh_expires_in: number
  open_id: string
  scope: string
  token_type: string
  error?: string
  error_description?: string
}

/** Exchange the authorization code for the token bundle. Server-side ONLY (uses the secret).
 *  redirect_uri MUST equal the one used at authorization. */
export async function exchangeCodeForToken(code: string, redirectUri: string): Promise<TikTokTokenResponse> {
  const body = new URLSearchParams({
    client_key: clientKey(),
    client_secret: clientSecret(),
    code,
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
  })
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "Cache-Control": "no-cache" },
    body,
  })
  const json = (await res.json()) as TikTokTokenResponse
  if (!res.ok || json.error || !json.access_token) {
    // Do NOT include token material in the error; only the coarse status/error code.
    throw new Error(`tiktok token exchange failed: ${res.status} ${json.error ?? ""}`)
  }
  return json
}

/** Refresh the access token (server-side only; foundation for unattended operation). */
export async function refreshTikTokToken(refreshToken: string): Promise<TikTokTokenResponse> {
  const body = new URLSearchParams({
    client_key: clientKey(),
    client_secret: clientSecret(),
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  })
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  })
  const json = (await res.json()) as TikTokTokenResponse
  if (!res.ok || json.error || !json.access_token) {
    throw new Error(`tiktok token refresh failed: ${res.status} ${json.error ?? ""}`)
  }
  return json
}

export type TikTokUserInfo = { open_id?: string; display_name?: string; avatar_url?: string }

/** Fetch the connected account's basic identity (user.info.basic → open_id, display_name,
 *  avatar_url). Server-side only. Never throws token material into logs. */
export async function fetchTikTokUserInfo(accessToken: string): Promise<TikTokUserInfo> {
  const url = `${USERINFO_URL}?${new URLSearchParams({ fields: "open_id,display_name,avatar_url" }).toString()}`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })
  const json = (await res.json()) as { data?: { user?: TikTokUserInfo }; error?: { code?: string } }
  if (!res.ok) throw new Error(`tiktok user info failed: ${res.status}`)
  return json.data?.user ?? {}
}

/** now + `expiresInSeconds` as an ISO timestamp (for token_expires_at). */
export function expiryFromExpiresIn(expiresInSeconds: number | undefined): string {
  const seconds = typeof expiresInSeconds === "number" && expiresInSeconds > 0 ? expiresInSeconds : 0
  return new Date(Date.now() + seconds * 1000).toISOString()
}

/** Build the JSON token bundle persisted (encrypted) in Vault. Keeps the refresh token +
 *  its expiry alongside the access token so a future server-side refresh has everything it
 *  needs; the access-token expiry is ALSO stored in the row's token_expires_at column. */
export function buildTokenBundle(t: TikTokTokenResponse): string {
  return JSON.stringify({
    access_token: t.access_token,
    refresh_token: t.refresh_token,
    refresh_expires_at: expiryFromExpiresIn(t.refresh_expires_in),
  })
}

/**
 * Sanitized one-line description of a Supabase/Postgres error, safe to log.
 *
 * WHY THIS EXISTS. The connect callback discarded the RPC error entirely — `if (error)
 * return redirect(?error=store)` — so the reconnect failure that blocked TikTok app review
 * produced a user-visible message and NOT ONE server log line. The cause had to be found by
 * reproducing it against the database by hand. A single sanitized line would have named it
 * immediately: `23505 duplicate key value violates unique constraint "secrets_name_idx"`.
 *
 * WHY IT IS NOT JUST `error.message`. A Postgres uniqueness error quotes the offending KEY
 * back in its detail, and for this flow that key is the Vault secret NAME — which embeds the
 * admin's user id and the TikTok open_id. Neither is a token, but neither belongs in a log.
 * So:
 *   • Vault secret names collapse to `social:<provider>:<redacted>`.
 *   • Anything resembling a bearer/JWT/act.* token, or a long opaque blob, is dropped.
 *   • The result is truncated, because a Postgres DETAIL can carry a whole row.
 * The error CODE is preserved verbatim, which is the part that actually identifies the fault.
 */
export function sanitizeDbError(error: { code?: string | null; message?: string | null } | null): string {
  if (!error) return "unknown"
  const code = (error.code ?? "").trim() || "no_code"
  let message = (error.message ?? "").trim()
  message = message
    // Vault secret names: keep the shape, drop the identifiers inside it.
    .replace(/social:[a-z]+:[^\s"')]+/gi, "social:<provider>:<redacted>")
    // JWTs and act.* / bearer-looking tokens.
    .replace(/\b(?:act\.)?[A-Za-z0-9_-]{24,}\.[A-Za-z0-9_-]{8,}(?:\.[A-Za-z0-9_-]+)?/g, "<redacted>")
    // Any remaining long opaque run that could be a token or code.
    .replace(/\b[A-Za-z0-9_-]{40,}\b/g, "<redacted>")
  if (message.length > 300) message = `${message.slice(0, 300)}…`
  return message ? `${code} ${message}` : code
}
