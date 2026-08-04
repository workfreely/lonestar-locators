import Stripe from "stripe"

// Lazily construct the Stripe client. Importing this module never builds the
// client (or throws) at build/import time — it's created on first real use. If
// STRIPE_SECRET_KEY isn't configured yet, the first call throws a clear,
// catchable error which the billing routes surface as a "not configured"
// response. No fake/placeholder key is ever used.
let instance: Stripe | null = null

function getStripeClient(): Stripe {
  if (instance) return instance
  const secretKey = process.env.STRIPE_SECRET_KEY
  if (!secretKey) {
    throw new Error(
      "STRIPE_SECRET_KEY is not set — configure Stripe credentials before using billing."
    )
  }
  // apiVersion is the SDK's own pinned version (kept explicit for clarity).
  instance = new Stripe(secretKey, { apiVersion: "2026-06-24.dahlia" })
  return instance
}

// A transparent proxy so existing `import { stripe }` call sites keep working
// (`stripe.subscriptions.retrieve(...)`, `stripe.webhooks.constructEvent(...)`,
// etc.) while construction stays deferred until first access.
export const stripe = new Proxy({} as Stripe, {
  get(_target, prop) {
    const client = getStripeClient()
    const value = (client as unknown as Record<string | symbol, unknown>)[prop]
    return typeof value === "function" ? (value as (...args: unknown[]) => unknown).bind(client) : value
  },
})
