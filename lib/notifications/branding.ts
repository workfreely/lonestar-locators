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

// ─── Sender identities ───────────────────────────────────────────────────────
// Every Locator Beast email is sent under ONE of four sender identities, chosen
// by the notification's category. All send from the verified `send.locatorbeast.com`
// subdomain (via the single RESEND_API_KEY account); replies route to the real
// Zoho mailbox admin@locatorbeast.com. Fixed business addresses (not secrets), so
// they live in code — only the API key comes from the environment.
//
//   leads         → lead notifications to a locator (notification-only, no reply-to)
//   transactional → account/auth/trial lifecycle
//   billing       → money/subscription lifecycle
//   marketing     → announcements/newsletters (no templates yet; sender is ready)
export type SenderCategory = "leads" | "transactional" | "billing" | "marketing"

const REPLY_TO = "admin@locatorbeast.com"

export const SENDERS: Record<SenderCategory, { from: string; replyTo?: string }> = {
  leads: { from: "Locator Beast Leads <leads@send.locatorbeast.com>" },
  transactional: { from: "Locator Beast <notifications@send.locatorbeast.com>", replyTo: REPLY_TO },
  billing: { from: "Locator Beast Billing <billing@send.locatorbeast.com>", replyTo: REPLY_TO },
  marketing: { from: "Locator Beast <news@send.locatorbeast.com>", replyTo: REPLY_TO },
}

// Safe fallback when a caller/template doesn't declare a category.
export const DEFAULT_SENDER: SenderCategory = "transactional"

export function resolveSender(category?: SenderCategory) {
  return SENDERS[category ?? DEFAULT_SENDER]
}

// Absolute URL helper — email clients need fully-qualified links, never
// root-relative paths.
export function absoluteUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path
  return `${BRAND.siteUrl}${path.startsWith("/") ? "" : "/"}${path}`
}
