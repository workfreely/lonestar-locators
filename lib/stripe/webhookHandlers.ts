import type Stripe from "stripe"
import type { SupabaseClient } from "@supabase/supabase-js"
import { stripe } from "./client"

// Every handler resolves the customer id from its event, then RECONCILES the DB
// against Stripe's authoritative current state (see reconcileCustomerSubscription).
// Nothing is inferred from the event payload or event ordering — we always write
// what Stripe reports *right now*, so a late/out-of-order delivery can never
// reactivate a canceled subscription or clobber a newer one. profiles is matched
// by stripe_customer_id, written proactively at checkout, so it's always present.

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

// Higher rank = "more live". When picking which subscription represents the
// customer's effective state, prefer active > trialing > past_due > … so a new
// active sub always wins over an older canceled one (handles reactivation and
// the rare multi-subscription case correctly).
const STATUS_RANK: Record<string, number> = {
  active: 7,
  trialing: 6,
  past_due: 5,
  unpaid: 4,
  paused: 3,
  incomplete: 2,
  canceled: 1,
  incomplete_expired: 0,
}

// Authoritative sync: re-fetch the customer's CURRENT subscriptions from Stripe
// and write the effective status to the DB. Immune to webhook ordering. Returns
// the status written, or null if the customer has no subscriptions at all.
export async function reconcileCustomerSubscription(
  customerId: string,
  supabaseAdmin: SupabaseClient
): Promise<string | null> {
  const list = await stripe.subscriptions.list({
    customer: customerId,
    status: "all",
    limit: 20,
  })

  if (list.data.length === 0) return null

  let best = list.data[0]
  for (const sub of list.data) {
    const rank = STATUS_RANK[sub.status] ?? -1
    const bestRank = STATUS_RANK[best.status] ?? -1
    if (rank > bestRank || (rank === bestRank && sub.created > best.created)) {
      best = sub
    }
  }

  await updateByCustomerId(supabaseAdmin, customerId, {
    stripe_subscription_id: best.id,
    subscription_status: best.status,
  })

  return best.status
}

export async function handleCheckoutCompleted(
  event: Stripe.CheckoutSessionCompletedEvent,
  supabaseAdmin: SupabaseClient
) {
  const customerId = customerIdOf(event.data.object.customer)
  if (!customerId) return
  await reconcileCustomerSubscription(customerId, supabaseAdmin)
}

export async function handleInvoicePaid(event: Stripe.InvoicePaidEvent, supabaseAdmin: SupabaseClient) {
  const customerId = customerIdOf(event.data.object.customer)
  if (!customerId) return
  await reconcileCustomerSubscription(customerId, supabaseAdmin)
}

export async function handleInvoicePaymentFailed(
  event: Stripe.InvoicePaymentFailedEvent,
  supabaseAdmin: SupabaseClient
) {
  const customerId = customerIdOf(event.data.object.customer)
  if (!customerId) return
  await reconcileCustomerSubscription(customerId, supabaseAdmin)
}

export async function handleSubscriptionCreated(
  event: Stripe.CustomerSubscriptionCreatedEvent,
  supabaseAdmin: SupabaseClient
) {
  const customerId = customerIdOf(event.data.object.customer)
  if (!customerId) return
  await reconcileCustomerSubscription(customerId, supabaseAdmin)
}

export async function handleSubscriptionUpdated(
  event: Stripe.CustomerSubscriptionUpdatedEvent,
  supabaseAdmin: SupabaseClient
) {
  const customerId = customerIdOf(event.data.object.customer)
  if (!customerId) return
  await reconcileCustomerSubscription(customerId, supabaseAdmin)
}

export async function handleSubscriptionDeleted(
  event: Stripe.CustomerSubscriptionDeletedEvent,
  supabaseAdmin: SupabaseClient
) {
  const customerId = customerIdOf(event.data.object.customer)
  if (!customerId) return
  const effective = await reconcileCustomerSubscription(customerId, supabaseAdmin)
  // Defensive: if Stripe already aged the canceled subscription out of the list,
  // still reflect the deletion rather than leaving a stale status behind.
  if (effective === null) {
    await updateByCustomerId(supabaseAdmin, customerId, { subscription_status: "canceled" })
  }
}
