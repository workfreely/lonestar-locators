// Central branding for every Locator Beast notification email. Kept in one place
// so the look (colors, wordmark, footer, sender identity) stays consistent and a
// rebrand is a one-file change. These mirror the Locator Beast brand tokens in
// app/locator-beast/beast.css and the site constants in app/locator-beast/_lib/site.ts.

export const BRAND = {
  name: "Locator Beast",
  siteUrl: "https://locatorbeast.com",
  // The only real Locator Beast mailbox (Zoho) — where replies + support
  // requests land. Shown in the email footer and used as the Reply-To below.
  supportEmail: "admin@locatorbeast.com",

  // Palette (hex only — email clients don't support CSS variables).
  ink: "#05070d", // near-black, primary text + dark header band
  inkSoft: "#4b5162", // secondary text
  blue: "#2f6bff", // primary CTA / accent
  blueBright: "#5b8bff",
  border: "#e8e9ee",
  pageBg: "#f4f4f4", // outer canvas, matches the existing Lone Star layout
  cardBg: "#ffffff",
} as const

// Sender identity for ALL Locator Beast transactional email. Fixed business
// addresses (not secrets), so they live in code, not env — only RESEND_API_KEY
// comes from the environment. Sends from the verified locatorbeast.com domain;
// replies are routed to the real Zoho mailbox (admin@locatorbeast.com).
export const FROM_EMAIL = "Locator Beast <notifications@locatorbeast.com>"

export const REPLY_TO_EMAIL = BRAND.supportEmail // admin@locatorbeast.com

// Absolute URL helper — email clients need fully-qualified links, never
// root-relative paths.
export function absoluteUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path
  return `${BRAND.siteUrl}${path.startsWith("/") ? "" : "/"}${path}`
}
