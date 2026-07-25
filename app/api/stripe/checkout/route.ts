import { NextResponse } from "next/server"
import { stripe } from "@/lib/stripe/client"
import { createClient } from "@/lib/supabase/server"

export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  const priceId = process.env.STRIPE_PRICE_ID
  if (!priceId) {
    return NextResponse.json({ error: "Billing is not configured yet" }, { status: 500 })
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("stripe_customer_id")
    .eq("id", user.id)
    .single()

  let customerId = profile?.stripe_customer_id as string | null | undefined

  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email ?? undefined,
      metadata: { supabase_user_id: user.id },
    })
    customerId = customer.id

    await supabase.from("profiles").update({ stripe_customer_id: customerId }).eq("id", user.id)
  }

  const origin = new URL(request.url).origin

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    client_reference_id: user.id,
    line_items: [{ price: priceId, quantity: 1 }],
    subscription_data: { metadata: { supabase_user_id: user.id } },
    success_url: `${origin}/billing?checkout=success`,
    cancel_url: `${origin}/billing?checkout=canceled`,
  })

  return NextResponse.json({ url: session.url })
}
