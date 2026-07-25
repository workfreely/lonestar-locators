import Stripe from "stripe"

const secretKey = process.env.STRIPE_SECRET_KEY

if (!secretKey) {
  // Thrown lazily (import-time, not module-load-time of unrelated routes)
  // only where this client is actually used, so the rest of the app keeps
  // working before Stripe keys are configured.
  console.warn("STRIPE_SECRET_KEY is not set — Stripe routes will fail until it is.")
}

export const stripe = new Stripe(secretKey || "sk_test_placeholder", {
  apiVersion: "2026-06-24.dahlia",
})
