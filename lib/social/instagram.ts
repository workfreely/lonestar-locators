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

import type { ReelCover } from "@/lib/social/reelCover"

const AUTHORIZE_URL = "https://www.instagram.com/oauth/authorize"
const TOKEN_URL = "https://api.instagram.com/oauth/access_token"
const GRAPH_BASE = "https://graph.instagram.com"

/** Requested scopes: basic identity + content publish (Reels/Feed/Story publishing). The
 *  token is scoped at authorization time, so adding a scope here requires the user to
 *  RE-CONNECT (disconnect → connect) before the granted token can publish. */
export const INSTAGRAM_SCOPES = ["instagram_business_basic", "instagram_business_content_publish"] as const

/**
 * Scopes for OUR OWN account (the platform-admin Connect/Reconnect flow only).
 *
 * WHY THIS IS SEPARATE FROM INSTAGRAM_SCOPES. The invite flow above authorizes OTHER PEOPLE's
 * accounts. Meta grants a permission at Standard Access only to "app users who have a role on the
 * requesting app", and comment reading on an account we do not own or manage needs ADVANCED Access,
 * which needs App Review and Business Verification. So asking a client for the comments scope would
 * at best be refused and at worst break an authorization that works today. The comments scope is
 * therefore requested ONLY where it is actually usable: our own account.
 *
 * ADDITIVE BY CONSTRUCTION. Spreading INSTAGRAM_SCOPES rather than re-typing it means the publishing
 * scope cannot be dropped here by editing one list and forgetting the other — a reconnect that lost
 * instagram_business_content_publish would silently break Social Beast publishing.
 */
export const INSTAGRAM_ADMIN_SCOPES = [...INSTAGRAM_SCOPES, "instagram_business_manage_comments"] as const

/**
 * What the provider says it actually GRANTED, falling back to what we asked for.
 *
 * The token exchange may report a `permissions` array. When it does, that is the truth and the
 * requested list is only an intention — storing the intention would let a partial grant look
 * complete, so a later publish would fail with no record of why. When it does not report anything,
 * the requested list is the best available answer and is stored as before.
 */
export function grantedScopes(requested: readonly string[], reported: readonly string[] | undefined): string[] {
  const seen = (reported ?? []).map((p) => p.trim()).filter(Boolean)
  return seen.length > 0 ? seen : [...requested]
}

/** Requested scopes the provider did NOT report as granted. Empty when nothing is missing, or when
 *  the provider reported nothing at all (in which case we know nothing, rather than nothing missing). */
export function missingScopes(requested: readonly string[], reported: readonly string[] | undefined): string[] {
  const seen = (reported ?? []).map((p) => p.trim()).filter(Boolean)
  if (seen.length === 0) return []
  return requested.filter((r) => !seen.includes(r))
}

// Read env values defensively: trim stray whitespace so a copy/paste artifact never leaks
// into the OAuth URL. The Instagram App ID is always numeric.
function appId(): string {
  return (process.env.INSTAGRAM_APP_ID ?? "").trim()
}
function appSecret(): string {
  return (process.env.INSTAGRAM_APP_SECRET ?? "").trim()
}

/** True only when a PLAUSIBLE App ID (all digits) + a secret are present — drives the "Not
 *  configured" UI. Requiring digits means a masked/placeholder value (e.g. bullet chars
 *  pasted from a masked field) shows "Not configured" instead of building a broken authorize
 *  URL with client_id=•••. */
export function instagramConfigured(): boolean {
  return /^[0-9]+$/.test(appId()) && appSecret().length > 0
}

/** The exact redirect URI, derived from the request origin (must be registered in Meta).
 *  This MUST point at the API ROUTE handler (/api/…/callback) — not the /admin page path —
 *  since that is where the GET handler lives; the non-/api path has no page and 404s. Both
 *  the Connect authorize step and the callback token exchange call this, so they always match
 *  (the token exchange requires the SAME redirect_uri as the authorize request). */
export function instagramRedirectUri(origin: string): string {
  return `${origin}/api/admin/social-autopilot/accounts/instagram/callback`
}

/** CSRF state check: the value echoed back by Instagram must match the one we stored, and
 *  both must be present. Pure so it can be unit-tested directly. */
export function isValidOAuthState(received: string | null | undefined, expected: string | null | undefined): boolean {
  return !!received && !!expected && received === expected
}

/** Instagram authorization-window URL. `state` is our CSRF nonce.
 *
 *  `scopes` DEFAULTS TO THE INVITE SET so that adding a scope for our own account cannot change what
 *  a client is asked to approve: the admin flow passes INSTAGRAM_ADMIN_SCOPES explicitly, every
 *  other caller keeps the behaviour it already had. */
export function instagramAuthorizeUrl(
  redirectUri: string,
  state: string,
  scopes: readonly string[] = INSTAGRAM_SCOPES,
): string {
  const params = new URLSearchParams({
    client_id: appId(),
    redirect_uri: redirectUri,
    response_type: "code",
    scope: scopes.join(","),
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
    client_id: appId(),
    client_secret: appSecret(),
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
    client_secret: appSecret(),
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

/** The redirect URI for the DESTINATION-AUTHORIZATION (recipient) flow. Distinct from the admin
 *  connect callback so the unauthenticated recipient path shares NO code with the admin route.
 *  This URI must be registered in the Meta app alongside the admin callback. */
export function instagramAuthorizeRedirectUri(origin: string): string {
  return `${origin}/api/social/authorize/instagram/callback`
}

// ─── Reels publishing (Instagram API with Instagram Login) ───────────────────────────────────
// Meta's async flow: (1) create a media CONTAINER for the video, (2) poll its status until
// FINISHED (video processing is async), (3) media_publish the container. The node is the IG user
// id (external_account_id). The token is passed server-side only; it never reaches the browser and
// is never placed in a logged string here. `video_url` must be a publicly fetchable HTTPS URL —
// we pass a SHORT-LIVED SIGNED URL of the RENDERED derivative only (never the source/library).

const PUBLISH_BASE = `${GRAPH_BASE}/v21.0`

async function igError(res: Response): Promise<string> {
  try {
    const j = (await res.json()) as { error?: { message?: string; code?: number } }
    return (j.error?.message || `ig ${res.status}`).slice(0, 400)
  } catch {
    return `ig ${res.status}`
  }
}

/** (1) Create a REELS container. Returns the creation_id (container id).
 *
 *  `cover` is optional and carries EXACTLY ONE cover parameter — the ReelCover union makes sending
 *  both cover_url and thumb_offset unrepresentable, so precedence is decided by the caller (see
 *  lib/social/reelCover.ts) rather than by Meta's tie-break. Omitting it keeps the pre-existing
 *  behaviour: Instagram picks the frame. */
export async function createReelContainer(
  igUserId: string,
  videoUrl: string,
  caption: string,
  token: string,
  cover?: ReelCover | null,
): Promise<string> {
  const body = new URLSearchParams({ media_type: "REELS", video_url: videoUrl, caption, access_token: token })
  if (cover?.kind === "url") body.set("cover_url", cover.url)
  else if (cover?.kind === "offset") body.set("thumb_offset", String(cover.ms))
  const res = await fetch(`${PUBLISH_BASE}/${encodeURIComponent(igUserId)}/media`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  })
  if (!res.ok) throw new Error(`container: ${await igError(res)}`)
  const j = (await res.json()) as { id?: string }
  if (!j.id) throw new Error("container: no id returned")
  return j.id
}

/** (1b) Create a STORIES container. Returns the creation_id.
 *
 *  A SIBLING of createReelContainer rather than a flag on it, so the Reel path is untouched by
 *  construction — the launch-critical surface cannot regress because a Story branch was added.
 *
 *  Steps (2) and (3) are deliberately NOT duplicated: getContainerStatus and publishReelContainer
 *  take only a container id, so a Story is polled and published through exactly the same calls a
 *  Reel is. Only the container differs.
 *
 *  NO CAPTION, NO COVER. A Story has neither — Instagram ignores `caption` on a STORIES container,
 *  and there is no cover frame to choose. They are not accepted here rather than being sent and
 *  silently dropped, so a caller cannot believe it published a captioned Story.
 *
 *  Stories expire after 24 hours. That is Instagram's behaviour, not something this code manages.
 */
export async function createStoryContainer(
  igUserId: string,
  videoUrl: string,
  token: string,
): Promise<string> {
  const body = new URLSearchParams({ media_type: "STORIES", video_url: videoUrl, access_token: token })
  const res = await fetch(`${PUBLISH_BASE}/${encodeURIComponent(igUserId)}/media`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  })
  if (!res.ok) throw new Error(`story container: ${await igError(res)}`)
  const j = (await res.json()) as { id?: string }
  if (!j.id) throw new Error("story container: no id returned")
  return j.id
}

export type ContainerStatus = "IN_PROGRESS" | "FINISHED" | "ERROR" | "EXPIRED" | "PUBLISHED" | "UNKNOWN"

/** (2) Poll a container's processing status. */
export async function getContainerStatus(containerId: string, token: string): Promise<ContainerStatus> {
  const params = new URLSearchParams({ fields: "status_code", access_token: token })
  const res = await fetch(`${PUBLISH_BASE}/${encodeURIComponent(containerId)}?${params.toString()}`)
  if (!res.ok) throw new Error(`status: ${await igError(res)}`)
  const j = (await res.json()) as { status_code?: string }
  return (j.status_code as ContainerStatus) ?? "UNKNOWN"
}

/** (3) Publish a FINISHED container. Returns the published media id. */
export async function publishReelContainer(igUserId: string, creationId: string, token: string): Promise<string> {
  const body = new URLSearchParams({ creation_id: creationId, access_token: token })
  const res = await fetch(`${PUBLISH_BASE}/${encodeURIComponent(igUserId)}/media_publish`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  })
  if (!res.ok) throw new Error(`publish: ${await igError(res)}`)
  const j = (await res.json()) as { id?: string }
  if (!j.id) throw new Error("publish: no id returned")
  return j.id
}

/** The public permalink of a published media (best-effort; null if unavailable). */
export async function getMediaPermalink(mediaId: string, token: string): Promise<string | null> {
  try {
    const params = new URLSearchParams({ fields: "permalink", access_token: token })
    const res = await fetch(`${PUBLISH_BASE}/${encodeURIComponent(mediaId)}?${params.toString()}`)
    if (!res.ok) return null
    const j = (await res.json()) as { permalink?: string }
    return j.permalink ?? null
  } catch {
    return null
  }
}

export type InstagramOAuthResult = {
  externalId: string
  username: string | null
  accountType: string | null
  token: string
  expiresAt: string
}

/** SHARED server-side OAuth completion used by BOTH the admin connect callback and the recipient
 *  destination-authorization callback: exchange code → short token → long-lived token, fetch the
 *  account identity, and derive the stable external id + expiry. The token stays server-side; the
 *  caller decides how to persist it (Vault, under which owner). Throws on any exchange failure. */
export async function completeInstagramOAuth(code: string, redirectUri: string): Promise<InstagramOAuthResult> {
  const short = await exchangeCodeForShortToken(code, redirectUri)
  const long = await exchangeForLongLivedToken(short.access_token)
  const profile = await fetchInstagramProfile(long.access_token)
  const externalId = String(profile.user_id ?? short.user_id ?? "")
  return {
    externalId,
    username: profile.username ?? null,
    accountType: profile.account_type ?? null,
    token: long.access_token,
    expiresAt: expiryFromExpiresIn(long.expires_in),
  }
}
