// Placeholder identity for this milestone — usernames aren't implemented
// yet, so this stands in for what will eventually be the locator's own
// chosen slug. Swapping this for real per-user data later doesn't change
// anything downstream (SharePanel, the QR code) since they only ever read
// PUBLIC_PAGE_URL.
export const DEMO_USERNAME = "jaymorris"
export const PUBLIC_URL_HOST = "locatorbeast.com"
export const PUBLIC_PAGE_PATH = `${PUBLIC_URL_HOST}/${DEMO_USERNAME}`
export const PUBLIC_PAGE_URL = `https://${PUBLIC_PAGE_PATH}`

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

export function buildShareUrl(utmSource: string) {
  return `${PUBLIC_PAGE_URL}?utm_source=${utmSource}`
}
