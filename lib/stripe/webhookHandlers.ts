import type Stripe from "stripe"
import type { SupabaseClient } from "@supabase/supabase-js"
import { stripe } from "./client"

// One function per event type, each given the raw event and a service-role
// Supabase client. profiles.stripe_customer_id is the join key for every
// handler here — it's written proactively when a checkout session is
// created (see app/api/stripe/checkout/route.ts), so it's always present
// by the time any of these fire.

async function updateByCustomerId(
  supabaseAdmin: SupabaseClient,
  customerId: string,
  patch: Record<string, unknown>
) {
  const { error } = await supabaseAdmin
    .from("profiles")
    .update(patch)
    .eq("stripe_customer_id", customerId)

  if (error) {
    throw new Error(`Failed to update profile for Stripe customer ${customerId}: ${error.message}`)
  }
}

export async function handleCheckoutCompleted(
  event: Stripe.CheckoutSessionCompletedEvent,
  supabaseAdmin: SupabaseClient
) {
  const session = event.data.object
  const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id
  const subscriptionId =
    typeof session.subscription === "string" ? session.subscription : session.subscription?.id

  if (!customerId || !subscriptionId) return

  const subscription = await stripe.subscriptions.retrieve(subscriptionId)

  await updateByCustomerId(supabaseAdmin, customerId, {
    stripe_subscription_id: subscription.id,
    subscription_status: subscription.status,
  })
}

export async function handleInvoicePaid(event: Stripe.InvoicePaidEvent, supabaseAdmin: SupabaseClient) {
  const invoice = event.data.object
  const customerId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id
  if (!customerId) return

  await updateByCustomerId(supabaseAdmin, customerId, { subscription_status: "active" })
}

export async function handleInvoicePaymentFailed(
  event: Stripe.InvoicePaymentFailedEvent,
  supabaseAdmin: SupabaseClient
) {
  const invoice = event.data.object
  const customerId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id
  if (!customerId) return

  await updateByCustomerId(supabaseAdmin, customerId, { subscription_status: "past_due" })
}

export async function handleSubscriptionUpdated(
  event: Stripe.CustomerSubscriptionUpdatedEvent,
  supabaseAdmin: SupabaseClient
) {
  const subscription = event.data.object
  const customerId =
    typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id
  if (!customerId) return

  await updateByCustomerId(supabaseAdmin, customerId, {
    stripe_subscription_id: subscription.id,
    subscription_status: subscription.status,
  })
}

export async function handleSubscriptionDeleted(
  event: Stripe.CustomerSubscriptionDeletedEvent,
  supabaseAdmin: SupabaseClient
) {
  const subscription = event.data.object
  const customerId =
    typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id
  if (!customerId) return

  await updateByCustomerId(supabaseAdmin, customerId, { subscription_status: "canceled" })
}
