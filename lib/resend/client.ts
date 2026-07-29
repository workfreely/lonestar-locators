import { Resend } from "resend"

const apiKey = process.env.RESEND_API_KEY

if (!apiKey) {
  // Guarded exactly like lib/stripe/client.ts: a non-empty placeholder key lets
  // the app BUILD and deploy when RESEND_API_KEY is unset, instead of throwing
  // "Missing API key" at module evaluation (which fails `next build` when Next
  // collects page data for the email routes). Routes check `resendConfigured`
  // and return a clear error at runtime rather than attempting a real send.
  console.warn("RESEND_API_KEY is not set — email routes will no-op until it is.")
}

// True only when a real key is present; false under the build-safe placeholder.
export const resendConfigured = !!apiKey

export const resend = new Resend(apiKey || "re_placeholder")
