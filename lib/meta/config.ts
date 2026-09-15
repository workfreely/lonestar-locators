// Meta Ads (Instagram & Facebook Ads) — Facebook Login for Business config + OAuth URL builder.
//
// This is the ADS connection, SEPARATE from Social Beast's Instagram Login (lib/social/instagram.ts):
// ads/leads/insights require Facebook Login for Business (graph.facebook.com), not Instagram Login.
// The existing Meta app can host BOTH products; this flow uses its OWN credentials + redirect URI +
// (preferably) a Business Login Configuration (config_id). Credentials come from env — never hardcoded.
//
// PHASE 1 = CONNECT / DISCOVER only. We request the minimum needed to authenticate and enumerate the
// user's Business, Pages, Ad Accounts, and linked Instagram professional account. We do NOT request
// ads_management or any create/edit permission. leads_retrieval + pages_manage_metadata (webhook
// subscribe) come in PHASE 2 and will require the user to re-connect (or a config_id update).
//
// IMPORTANT: Meta renames permissions/products often — verify these scope names against the current
// Meta developer docs before finalizing the app's Business Login Configuration.
export const META_GRAPH_VERSION = (process.env.META_GRAPH_VERSION ?? "v21.0").trim()
export const META_GRAPH_BASE = `https://graph.facebook.com/${META_GRAPH_VERSION}`
const OAUTH_DIALOG = `https://www.facebook.com/${META_GRAPH_VERSION}/dialog/oauth`

// Phase-1 (read/connect/discover) scopes. Used only when NO config_id is set (a Business Login
// Configuration encodes its own permissions). ads_read is read-only; no ads_management.
export const META_PHASE1_SCOPES = [
  "business_management",
  "ads_read",
  "pages_show_list",
  "pages_read_engagement",
  "instagram_basic",
] as const

const appId = () => (process.env.META_APP_ID ?? "").trim()
const appSecret = () => (process.env.META_APP_SECRET ?? "").trim()
export const metaLoginConfigId = () => (process.env.META_LOGIN_CONFIG_ID ?? "").trim()

/** True only when a plausible numeric App ID + secret are present (drives the "Not configured" UX). */
export function metaConfigured(): boolean {
  return /^[0-9]+$/.test(appId()) && appSecret().length > 0
}
export function metaAppId(): string { return appId() }
export function metaAppSecret(): string { return appSecret() }

/** Redirect URI — must point at the callback API route and be registered in the Meta app. */
export function metaRedirectUri(origin: string): string {
  return `${origin}/api/integrations/meta/callback`
}

/** CSRF state check (pure — unit-testable). */
export function isValidMetaState(received: string | null | undefined, expected: string | null | undefined): boolean {
  return !!received && !!expected && received === expected
}

/** Facebook Login for Business authorization URL. Prefers a Business Login Configuration (config_id)
 *  when set (Meta bundles asset selection + permissions into one consent screen); otherwise falls
 *  back to the explicit Phase-1 scope list. */
export function metaAuthorizeUrl(redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: appId(),
    redirect_uri: redirectUri,
    response_type: "code",
    state,
  })
  const cfg = metaLoginConfigId()
  if (cfg) params.set("config_id", cfg)
  else params.set("scope", META_PHASE1_SCOPES.join(","))
  return `${OAUTH_DIALOG}?${params.toString()}`
}
