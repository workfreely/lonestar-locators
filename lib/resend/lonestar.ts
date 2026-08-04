import { Resend } from "resend"

// ─────────────────────────────────────────────────────────────────────────────
// LONE STAR LOCATORS Resend client — completely independent from Locator Beast.
//
// Uses LONESTAR_RESEND_API_KEY, which belongs to the Lone Star Resend account
// (authorized to send from lonestarlocators.app). ONLY the legacy Lone Star
// marketing routes use this: app/api/send-email + app/api/sms/send-welcome.
//
// Hard rule: this file must NEVER read RESEND_API_KEY, and the Locator Beast
// notification service must NEVER import from here — so neither product can ever
// depend on the other's Resend account.
// ─────────────────────────────────────────────────────────────────────────────

const apiKey = process.env.LONESTAR_RESEND_API_KEY

if (!apiKey) {
  // Same build-safe placeholder pattern as the Locator Beast client: a non-empty
  // dummy key lets `next build` succeed when LONESTAR_RESEND_API_KEY is unset;
  // callers check `lonestarResendConfigured` and no-op rather than sending.
  console.warn(
    "LONESTAR_RESEND_API_KEY is not set — Lone Star marketing emails will no-op until it is."
  )
}

// True only when a real key is present; false under the build-safe placeholder.
export const lonestarResendConfigured = !!apiKey

export const lonestarResend = new Resend(apiKey || "re_placeholder")
