export const dynamic = "force-dynamic"

import { redirect } from "next/navigation"
import type Stripe from "stripe"
import { createClient } from "@/lib/supabase/server"
import { stripe } from "@/lib/stripe/client"
import { getAccessState } from "@/lib/billing/access"
import BillingSettingsClient, {
  type PaymentMethod,
  type Invoice,
} from "@/components/crm/billing/BillingSettingsClient"

export default async function BillingSettingsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect("/login")

  const { data: profile } = await supabase
    .from("profiles")
    .select("trial_started_at, trial_ends_at, subscription_status, stripe_customer_id, stripe_subscription_id")
    .eq("id", user.id)
    .single()

  const access = getAccessState({
    subscription_status: profile?.subscription_status ?? null,
    trial_ends_at: profile?.trial_ends_at ?? null,
  })

  // Best-effort live Stripe data — the page still renders sensibly if Stripe
  // isn't configured or a call fails. Stripe stays the source of truth for what
  // we display (renewal date, cancel state, card, invoices); the DB is the
  // source of truth for access.
  let subscriptionDetails: { currentPeriodEnd: string | null; cancelAtPeriodEnd: boolean } | null = null
  let paymentMethod: PaymentMethod | null = null
  let invoices: Invoice[] = []

  if (profile?.stripe_subscription_id) {
    try {
      const subscription = await stripe.subscriptions.retrieve(profile.stripe_subscription_id)
      const item = subscription.items.data[0]
      subscriptionDetails = {
        currentPeriodEnd: item?.current_period_end ? new Date(item.current_period_end * 1000).toISOString() : null,
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
      }
    } catch {
      subscriptionDetails = null
    }
  }

  if (profile?.stripe_customer_id) {
    try {
      const customer = await stripe.customers.retrieve(profile.stripe_customer_id, {
        expand: ["invoice_settings.default_payment_method"],
      })
      if (!("deleted" in customer)) {
        const pm = customer.invoice_settings?.default_payment_method as Stripe.PaymentMethod | null
        if (pm && typeof pm !== "string" && pm.card) {
          paymentMethod = {
            brand: pm.card.brand,
            last4: pm.card.last4,
            expMonth: pm.card.exp_month,
            expYear: pm.card.exp_year,
          }
        }
      }
    } catch {
      paymentMethod = null
    }

    try {
      const invoiceList = await stripe.invoices.list({ customer: profile.stripe_customer_id, limit: 12 })
      invoices = invoiceList.data.map((invoice) => ({
        id: invoice.id ?? invoice.number ?? "",
        amount: invoice.amount_paid,
        date: new Date(invoice.created * 1000).toISOString(),
        url: invoice.hosted_invoice_url ?? null,
        status: invoice.status ?? "unknown",
      }))
    } catch {
      invoices = []
    }
  }

  return (
    <BillingSettingsClient
      access={access}
      trialStartedAt={profile?.trial_started_at ?? null}
      trialEndsAt={profile?.trial_ends_at ?? null}
      subscriptionDetails={subscriptionDetails}
      paymentMethod={paymentMethod}
      invoices={invoices}
      hasStripeCustomer={Boolean(profile?.stripe_customer_id)}
    />
  )
}
