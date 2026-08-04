// Central branding for every Locator Beast notification email. Kept in one place
// so the look (colors, wordmark, footer, sender identity) stays consistent and a
// rebrand is a one-file change. These mirror the Locator Beast brand tokens in
// app/locator-beast/beast.css and the site constants in app/locator-beast/_lib/site.ts.

export const BRAND = {
  name: "Locator Beast",
  siteUrl: "https://locatorbeast.com",
  supportEmail: "support@locatorbeast.com",

  // Palette (hex only — email clients don't support CSS variables).
  ink: "#05070d", // near-black, primary text + dark header band
  inkSoft: "#4b5162", // secondary text
  blue: "#2f6bff", // primary CTA / accent
  blueBright: "#5b8bff",
  border: "#e8e9ee",
  pageBg: "#f4f4f4", // outer canvas, matches the existing Lone Star layout
  cardBg: "#ffffff",
} as const

// Sender identity. Overridable via env so the "from" can move to a verified
// locatorbeast.com address without a code change. The default uses the domain
// already verified in Resend (lonestarlocators.app) with the Locator Beast
// display name, so notifications deliver today; swap NOTIFICATIONS_FROM_EMAIL
// once a Locator Beast domain is verified in Resend.
export const FROM_EMAIL =
  process.env.NOTIFICATIONS_FROM_EMAIL || "Locator Beast <jay@lonestarlocators.app>"

export const REPLY_TO_EMAIL =
  process.env.NOTIFICATIONS_REPLY_TO || BRAND.supportEmail

// Absolute URL helper — email clients need fully-qualified links, never
// root-relative paths.
export function absoluteUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path
  return `${BRAND.siteUrl}${path.startsWith("/") ? "" : "/"}${path}`
}
