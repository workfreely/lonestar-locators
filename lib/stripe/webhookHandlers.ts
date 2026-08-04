import type Stripe from "stripe"
import type { SupabaseClient } from "@supabase/supabase-js"
import { stripe } from "./client"

// One function per event type, each given the raw event and a service-role
// Supabase client. profiles.stripe_customer_id is the join key for every
// handler here — it's written proactively when a checkout session is created
// (see app/api/stripe/checkout/route.ts), so it's always present by the time
// any of these fire. Stripe is the source of truth: these handlers only ever
// write what Stripe reports (subscription id + status), never local guesses.

function customerIdOf(
  ref: string | { id: string } | null | undefined
): string | null {
  if (!ref) return null
  return typeof ref === "string" ? ref : ref.id
}

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

// Shared sync for any subscription lifecycle event (created / updated). Mirrors
// Stripe's reported status verbatim so the DB stays in lockstep — one place to
// change if additional fields ever need persisting (plan, quantity, etc.).
async function syncSubscription(
  subscription: Stripe.Subscription,
  supabaseAdmin: SupabaseClient
) {
  const customerId = customerIdOf(subscription.customer)
  if (!customerId) return

  await updateByCustomerId(supabaseAdmin, customerId, {
    stripe_subscription_id: subscription.id,
    subscription_status: subscription.status,
  })
}

export async function handleCheckoutCompleted(
  event: Stripe.CheckoutSessionCompletedEvent,
  supabaseAdmin: SupabaseClient
) {
  const session = event.data.object
  const customerId = customerIdOf(session.customer)
  const subscriptionId =
    typeof session.subscription === "string" ? session.subscription : session.subscription?.id

  if (!customerId || !subscriptionId) return

  // Re-fetch the subscription so we persist Stripe's authoritative status
  // rather than inferring it from the checkout session.
  const subscription = await stripe.subscriptions.retrieve(subscriptionId)
  await syncSubscription(subscription, supabaseAdmin)
}

export async function handleInvoicePaid(event: Stripe.InvoicePaidEvent, supabaseAdmin: SupabaseClient) {
  const invoice = event.data.object
  const customerId = customerIdOf(invoice.customer)
  if (!customerId) return

  await updateByCustomerId(supabaseAdmin, customerId, { subscription_status: "active" })
}

export async function handleInvoicePaymentFailed(
  event: Stripe.InvoicePaymentFailedEvent,
  supabaseAdmin: SupabaseClient
) {
  const invoice = event.data.object
  const customerId = customerIdOf(invoice.customer)
  if (!customerId) return

  await updateByCustomerId(supabaseAdmin, customerId, { subscription_status: "past_due" })
}

export async function handleSubscriptionCreated(
  event: Stripe.CustomerSubscriptionCreatedEvent,
  supabaseAdmin: SupabaseClient
) {
  await syncSubscription(event.data.object, supabaseAdmin)
}

export async function handleSubscriptionUpdated(
  event: Stripe.CustomerSubscriptionUpdatedEvent,
  supabaseAdmin: SupabaseClient
) {
  await syncSubscription(event.data.object, supabaseAdmin)
}

export async function handleSubscriptionDeleted(
  event: Stripe.CustomerSubscriptionDeletedEvent,
  supabaseAdmin: SupabaseClient
) {
  const subscription = event.data.object
  const customerId = customerIdOf(subscription.customer)
  if (!customerId) return

  await updateByCustomerId(supabaseAdmin, customerId, {
    subscription_status: "canceled",
  })
}
