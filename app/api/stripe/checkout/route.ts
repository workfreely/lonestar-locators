import { NextResponse } from "next/server"
import { stripe } from "@/lib/stripe/client"
import { createClient } from "@/lib/supabase/server"
import { getPlan, resolvePriceId } from "@/lib/billing/plans"

// A subscription in any of these states is "live" — the customer is already on
// a billable plan, so a NEW Checkout Session must NOT be created (that would
// create a second subscription and double-charge). Note: our free trial is
// DB-only (no Stripe subscription), so trial users have NO live Stripe sub here
// and can subscribe normally.
const LIVE_SUBSCRIPTION_STATUSES = new Set([
  "active",
  "trialing",
  "past_due",
  "unpaid",
  "incomplete",
])

export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  // Optional plan selector (future: annual/team). Defaults to the one plan.
  // Body is optional — callers today POST with no body.
  let planKey: string | undefined
  try {
    const body = await request.json()
    planKey = typeof body?.plan === "string" ? body.plan : undefined
  } catch {
    planKey = undefined
  }

  const plan = getPlan(planKey)
  const priceId = resolvePriceId(plan)
  if (!priceId) {
    return NextResponse.json({ error: "Billing is not configured yet" }, { status: 500 })
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("stripe_customer_id")
    .eq("id", user.id)
    .single()

  let customerId = profile?.stripe_customer_id as string | null | undefined
  const origin = new URL(request.url).origin

  // ── Duplicate-subscription guard ──────────────────────────────────────────
  // If the customer already has a live subscription (active/past_due/etc.), do
  // NOT create a second Checkout Session. Send them to the Customer Portal to
  // manage the existing one instead. Stripe is the authoritative check here, so
  // this is resistant to a stale DB, stale tabs, and re-entry — once a live sub
  // exists, every checkout attempt is routed to the portal. (Two brand-new
  // attempts before any sub exists both open Checkout, but the user completes
  // only one; after that this guard blocks any further subscription.)
  if (customerId) {
    try {
      const existing = await stripe.subscriptions.list({
        customer: customerId,
        status: "all",
        limit: 20,
      })
      const hasLive = existing.data.some((s) => LIVE_SUBSCRIPTION_STATUSES.has(s.status))
      if (hasLive) {
        const portal = await stripe.billingPortal.sessions.create({
          customer: customerId,
          return_url: `${origin}/billing`,
        })
        return NextResponse.json({ url: portal.url, mode: "portal", alreadySubscribed: true })
      }
    } catch {
      // If the lookup fails we fall through to normal checkout rather than
      // blocking a legitimate subscribe. Stripe's own guard + the webhook keep
      // the DB correct.
    }
  }

  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email ?? undefined,
      metadata: { supabase_user_id: user.id },
    })
    customerId = customer.id

    await supabase.from("profiles").update({ stripe_customer_id: customerId }).eq("id", user.id)
  }

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    client_reference_id: user.id,
    line_items: [{ price: priceId, quantity: 1 }],
    subscription_data: { metadata: { supabase_user_id: user.id, plan: plan.key } },
    // Let Stripe collect promotion codes at checkout — ready for coupons/promos
    // with no code change when you create them in the dashboard.
    allow_promotion_codes: true,
    success_url: `${origin}/billing?checkout=success`,
    cancel_url: `${origin}/billing?checkout=canceled`,
  })

  return NextResponse.json({ url: session.url, mode: "checkout" })
}
