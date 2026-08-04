// Locator Beast — centralized email notification system.
//
// USAGE (this is the whole API surface for sending):
//
//   import { sendNotification, newLeadEmail } from "@/lib/notifications"
//   await sendNotification({ to, ...newLeadEmail({ locatorName, leadUrl, lead }) })
//
// Adding a new notification:
//   1. Add a builder in ./templates.ts returning { subject, html }.
//   2. Call sendNotification({ to, ...yourEmail(params) }) at the trigger site.
// No new Resend code is ever needed — send.ts is the only file that touches the
// provider.
//
// Files:
//   send.ts      — sendNotification() (the only Resend touchpoint; never throws)
//   layout.ts    — renderEmail() + reusable pieces: paragraph(), button(), infoTable()
//   branding.ts  — colors, wordmark, from/reply-to, absolute URL helper
//   templates.ts — one builder per notification (title + body + CTA + branding + footer)
//   billing.ts   — maps Stripe webhook events → the right billing template
//
// NOTE on auth emails (password reset, email verification): these are sent by
// Supabase Auth today, not by this system. The branded passwordResetEmail() /
// emailVerificationEmail() builders exist so the HTML is centralized and ready.
// To use them, either paste their HTML into Supabase Dashboard → Authentication →
// Email Templates (pass "{{ .ConfirmationURL }}" as actionUrl to get paste-ready
// markup), or wire them here if auth emails ever move fully in-app.

export { sendNotification } from "./send"
export type { NotificationEmail, SendResult } from "./send"

export {
  newLeadEmail,
  welcomeEmail,
  trialStartedEmail,
  trialEndingEmail,
  subscriptionSuccessfulEmail,
  paymentFailedEmail,
  subscriptionCanceledEmail,
  subscriptionReactivatedEmail,
  passwordResetEmail,
  emailVerificationEmail,
} from "./templates"
export type { BuiltEmail, NewLeadEmailParams } from "./templates"

export { sendBillingNotification } from "./billing"
export type { BillingNotificationKind } from "./billing"

export { sendAccountStartedEmails } from "./lifecycle"

export { BRAND, absoluteUrl } from "./branding"
