// Public URL helpers for the Smart Lead Form. The username IS the workspace slug
// (already hyphenated by the DB `slugify`, e.g. "Jay Morris" → "jay-morris"), so
// these just format it — they never re-derive or concatenate a name. SharePanel
// passes the real slug in; FALLBACK_USERNAME stands in only until one is assigned
// (kept hyphenated so it matches the real format).
export const PUBLIC_URL_HOST = "locatorbeast.com"
export const FALLBACK_USERNAME = "your-username"

export function publicPagePath(username: string) {
  return `${PUBLIC_URL_HOST}/${username}`
}

export function publicPageUrl(username: string) {
  return `https://${publicPagePath(username)}`
}

export type SharePlatform = {
  id: string
  label: string
  utmSource: string
}

// The one thing a locator has to know is "which button to click" — the
// utm_source mapping happens here, invisibly, per the spec's explicit
// instruction not to expose UTM parameters in the UI.
export const SHARE_PLATFORMS: SharePlatform[] = [
  { id: "instagram", label: "Instagram", utmSource: "instagram" },
  { id: "facebook", label: "Facebook", utmSource: "facebook" },
  { id: "tiktok", label: "TikTok", utmSource: "tiktok" },
  { id: "youtube", label: "YouTube", utmSource: "youtube" },
  { id: "google", label: "Google Business", utmSource: "google" },
  { id: "email", label: "Email", utmSource: "email" },
]

export function buildShareUrl(username: string, utmSource: string) {
  return `${publicPageUrl(username)}?utm_source=${utmSource}`
}
