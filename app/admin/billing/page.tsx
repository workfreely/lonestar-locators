export const dynamic = "force-dynamic"

import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { stripe } from "@/lib/stripe/client"
import { getAccessState } from "@/lib/billing/access"
import BillingSettingsClient from "@/components/crm/billing/BillingSettingsClient"

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
  // isn't configured or a call fails.
  let subscriptionDetails: { currentPeriodEnd: string | null; cancelAtPeriodEnd: boolean } | null = null
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

  return (
    <BillingSettingsClient
      access={access}
      trialStartedAt={profile?.trial_started_at ?? null}
      trialEndsAt={profile?.trial_ends_at ?? null}
      subscriptionDetails={subscriptionDetails}
    />
  )
}
