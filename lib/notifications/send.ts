import { resend, resendConfigured } from "@/lib/resend/client"
import { resolveSender, type SenderCategory } from "./branding"

// ─────────────────────────────────────────────────────────────────────────────
// The ONE place the app talks to Resend for notifications.
//
// Everything else in the app builds a template and calls sendNotification() — no
// other module imports the Resend SDK for notifications. This keeps provider
// logic in a single file: swapping providers, changing the "from", adding
// logging/queuing, etc. is a one-file change.
//
// Contract: sendNotification NEVER throws. Callers (webhooks, API routes,
// after() hooks) can `await` it without try/catch and a mail failure will never
// crash the request or roll back the primary operation. Failures are logged and
// returned as { ok: false }.
// ─────────────────────────────────────────────────────────────────────────────

const EMAIL_RE = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/

export type NotificationEmail = {
  /** Single recipient. */
  to: string
  subject: string
  html: string
  /** Optional plain-text fallback. */
  text?: string
  /** Which sender identity to send under. Templates set this; defaults to transactional. */
  category?: SenderCategory
  /** Override the category's reply-to for this message. */
  replyTo?: string
}

export type SendResult =
  | { ok: true; id: string | null }
  | { ok: false; error: string; skipped?: boolean }

export async function sendNotification(email: NotificationEmail): Promise<SendResult> {
  try {
    const to = (email.to ?? "").trim()
    if (!EMAIL_RE.test(to)) {
      console.warn(`[notifications] Skipped send — invalid recipient: "${email.to}"`)
      return { ok: false, error: "invalid_recipient", skipped: true }
    }
    if (!email.subject?.trim() || !email.html?.trim()) {
      console.warn("[notifications] Skipped send — missing subject or body")
      return { ok: false, error: "invalid_payload", skipped: true }
    }

    // Fail gracefully when Resend isn't configured (e.g. RESEND_API_KEY unset in
    // a preview/build environment) — log and no-op instead of throwing.
    if (!resendConfigured) {
      console.warn(
        `[notifications] RESEND_API_KEY not set — skipped "${email.subject}" to ${to}`
      )
      return { ok: false, error: "not_configured", skipped: true }
    }

    // Pick the sender identity for this notification's category (leads /
    // transactional / billing / marketing). Reply-to is the category's default
    // unless the caller overrides it; the leads sender has none (notification-only).
    const sender = resolveSender(email.category)
    const replyTo = email.replyTo ?? sender.replyTo

    const { data, error } = await resend.emails.send({
      from: sender.from,
      to,
      subject: email.subject,
      html: email.html,
      ...(email.text ? { text: email.text } : {}),
      ...(replyTo ? { replyTo } : {}),
    })

    if (error) {
      console.error(`[notifications] Resend error sending "${email.subject}" to ${to}:`, error)
      return { ok: false, error: error.message ?? "provider_error" }
    }

    return { ok: true, id: data?.id ?? null }
  } catch (err) {
    // Absolute backstop — nothing from this function may ever escape to the caller.
    console.error("[notifications] Unexpected send failure:", err)
    return { ok: false, error: "unexpected_error" }
  }
}
