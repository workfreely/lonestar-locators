import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { stripe } from "@/lib/stripe/client"
import { getAccessState } from "@/lib/billing/access"
import BillingClient from "./_components/BillingClient"

export default async function BillingPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select(
      "trial_started_at, trial_ends_at, subscription_status, stripe_customer_id, stripe_subscription_id"
    )
    .eq("id", user.id)
    .single()

  const access = getAccessState({
    subscription_status: profile?.subscription_status ?? null,
    trial_ends_at: profile?.trial_ends_at ?? null,
  })

  // Best-effort live Stripe data — the billing page still has to render a
  // sensible state even if Stripe isn't configured yet or a call fails.
  let subscriptionDetails: { currentPeriodEnd: string | null; cancelAtPeriodEnd: boolean } | null = null
  let invoices: { id: string; amount: number; date: string; url: string | null; status: string }[] = []

  if (profile?.stripe_subscription_id) {
    try {
      const subscription = await stripe.subscriptions.retrieve(profile.stripe_subscription_id)
      const item = subscription.items.data[0]
      subscriptionDetails = {
        currentPeriodEnd: item?.current_period_end
          ? new Date(item.current_period_end * 1000).toISOString()
          : null,
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
      }
    } catch {
      subscriptionDetails = null
    }
  }

  if (profile?.stripe_customer_id) {
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
    <BillingClient
      access={access}
      trialStarted={Boolean(profile?.trial_started_at)}
      subscriptionDetails={subscriptionDetails}
      invoices={invoices}
    />
  )
}
