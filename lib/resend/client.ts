import { Resend } from "resend"

// ─────────────────────────────────────────────────────────────────────────────
// LOCATOR BEAST Resend client.
//
// Uses RESEND_API_KEY, which belongs to the Locator Beast Resend account
// (authorized to send from locatorbeast.com). ONLY the Locator Beast notification
// service (lib/notifications/*) imports this. The Lone Star marketing routes use
// a SEPARATE, independent client + key — see lib/resend/lonestar.ts — so the two
// products never share a Resend account.
// ─────────────────────────────────────────────────────────────────────────────

const apiKey = process.env.RESEND_API_KEY

if (!apiKey) {
  // Guarded exactly like lib/stripe/client.ts: a non-empty placeholder key lets
  // the app BUILD and deploy when RESEND_API_KEY is unset, instead of throwing
  // "Missing API key" at module evaluation (which fails `next build`). Callers
  // check `resendConfigured` and no-op at runtime rather than attempting a send.
  console.warn("RESEND_API_KEY (Locator Beast) is not set — Locator Beast emails will no-op until it is.")
}

// True only when a real key is present; false under the build-safe placeholder.
export const resendConfigured = !!apiKey

export const resend = new Resend(apiKey || "re_placeholder")
