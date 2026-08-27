import { NextResponse } from "next/server"
import type Stripe from "stripe"
import { stripe } from "@/lib/stripe/client"
import { supabaseAdmin } from "@/lib/supabase/admin"
import {
  handleCheckoutCompleted,
  handleInvoicePaid,
  handleInvoicePaymentFailed,
  handleSubscriptionCreated,
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
    // This endpoint is PUBLIC — the signature IS the gate, so this branch is
    // reachable by anyone. Stripe's verification error is a paragraph of library
    // guidance; echoing it told an anonymous caller how the check works and
    // confirmed the secret is configured. Stripe itself only needs the 400.
    console.error("[stripe/webhook] signature verification failed:", (err as Error).message)
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 })
  }

  // Idempotency — Stripe retries deliveries, so skip anything already fully
  // processed rather than double-applying a status change. We check FIRST and
  // only record the event as processed AFTER it succeeds (below), so a transient
  // failure returns 500 and Stripe safely retries instead of the event being
  // permanently deduped and lost. The handlers themselves are idempotent
  // (they write Stripe's reported status), so the small check→mark window is
  // harmless even under a rare concurrent duplicate delivery.
  const { data: existing } = await supabaseAdmin
    .from("processed_stripe_events")
    .select("event_id")
    .eq("event_id", event.id)
    .maybeSingle()

  if (existing) {
    return NextResponse.json({ received: true, deduped: true })
  }

  try {
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
      case "customer.subscription.created":
        await handleSubscriptionCreated(event, supabaseAdmin)
        break
      case "customer.subscription.updated":
        await handleSubscriptionUpdated(event, supabaseAdmin)
        break
      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(event, supabaseAdmin)
        break
      default:
        // Unhandled event type — record it as processed (below) so Stripe
        // stops retrying, but take no action.
        break
    }
  } catch (err) {
    // Let Stripe retry — do NOT mark the event processed. The 500 IS the retry
    // signal; Stripe does not read the body, and the message can carry Supabase
    // or Stripe-API internals, so it stays in the server log.
    console.error(`[stripe/webhook] handler failed for ${event.type}:`, (err as Error).message)
    return NextResponse.json({ error: "Handler failed" }, { status: 500 })
  }

  // Success — record the event so retries are deduped. A unique-violation race
  // here just means a concurrent delivery already recorded it; that's fine.
  await supabaseAdmin.from("processed_stripe_events").insert({ event_id: event.id })

  return NextResponse.json({ received: true })
}
