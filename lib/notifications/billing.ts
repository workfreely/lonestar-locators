import type { SupabaseClient } from "@supabase/supabase-js"
import { sendNotification } from "./send"
import {
  subscriptionSuccessfulEmail,
  paymentFailedEmail,
  subscriptionCanceledEmail,
  subscriptionReactivatedEmail,
} from "./templates"

// Bridges Stripe webhook events to the centralized notification service. The
// webhook handlers decide WHICH kind of email to send (based on status
// transitions); this helper owns looking up the recipient and firing the right
// template. Like sendNotification(), it NEVER throws — a mail/DB failure here
// must never turn a webhook into a 500 (which would make Stripe retry forever).

export type BillingNotificationKind = "successful" | "payment_failed" | "canceled" | "reactivated"

type ProfileContact = { email: string | null; name: string | null }

async function loadContactByCustomerId(
  supabaseAdmin: SupabaseClient,
  customerId: string
): Promise<ProfileContact | null> {
  try {
    const { data, error } = await supabaseAdmin
      .from("profiles")
      .select("email, first_name, full_name")
      .eq("stripe_customer_id", customerId)
      .maybeSingle()
    if (error || !data) return null
    return {
      email: data.email ?? null,
      name: data.full_name || data.first_name || null,
    }
  } catch {
    return null
  }
}

export async function sendBillingNotification(
  supabaseAdmin: SupabaseClient,
  customerId: string,
  kind: BillingNotificationKind
): Promise<void> {
  try {
    const contact = await loadContactByCustomerId(supabaseAdmin, customerId)
    if (!contact?.email) {
      console.warn(
        `[notifications] Billing ${kind}: no email on profile for customer ${customerId} — skipped`
      )
      return
    }

    const built =
      kind === "successful"
        ? subscriptionSuccessfulEmail({ name: contact.name })
        : kind === "payment_failed"
        ? paymentFailedEmail({ name: contact.name })
        : kind === "canceled"
        ? subscriptionCanceledEmail({ name: contact.name })
        : subscriptionReactivatedEmail({ name: contact.name })

    await sendNotification({ to: contact.email, ...built })
  } catch (err) {
    // Backstop — never let a billing notification break the webhook.
    console.error(`[notifications] Billing ${kind} notification failed:`, err)
  }
}
