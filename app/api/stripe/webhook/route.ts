import { NextResponse } from "next/server"
import type Stripe from "stripe"
import { stripe } from "@/lib/stripe/client"
import { supabaseAdmin } from "@/lib/supabase/admin"
import {
  handleCheckoutCompleted,
  handleInvoicePaid,
  handleInvoicePaymentFailed,
  handleSubscriptionUpdated,
  handleSubscriptionDeleted,
} from "@/lib/stripe/webhookHandlers"

export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature")
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET

  if (!signature || !webhookSecret) {
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 })
  }

  const rawBody = await request.text()

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret)
  } catch (err) {
    return NextResponse.json({ error: `Invalid signature: ${(err as Error).message}` }, { status: 400 })
  }

  // Idempotency — Stripe retries deliveries, so skip anything already
  // processed rather than double-applying a status change.
  const { error: insertError } = await supabaseAdmin
    .from("processed_stripe_events")
    .insert({ event_id: event.id })

  if (insertError) {
    // Unique violation means we've already handled this event.
    return NextResponse.json({ received: true, deduped: true })
  }

  switch (event.type) {
    case "checkout.session.completed":
      await handleCheckoutCompleted(event, supabaseAdmin)
      break
    case "invoice.paid":
      await handleInvoicePaid(event, supabaseAdmin)
      break
    case "invoice.payment_failed":
      await handleInvoicePaymentFailed(event, supabaseAdmin)
      break
    case "customer.subscription.updated":
      await handleSubscriptionUpdated(event, supabaseAdmin)
      break
    case "customer.subscription.deleted":
      await handleSubscriptionDeleted(event, supabaseAdmin)
      break
    default:
      break
  }

  return NextResponse.json({ received: true })
}
