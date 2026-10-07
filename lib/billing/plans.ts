// Central plan catalog. Today there is one plan, but adding another (annual,
// team, promotional) should be a CONFIG change here + a Stripe Price + its env
// var — never a call-site refactor. Checkout and the UI resolve prices through
// this module rather than hardcoding a single STRIPE_PRICE_ID, so the system is
// ready for multiple plans, intervals, and coupons.

export type BillingInterval = "month" | "year"

export type Plan = {
  /** Stable internal id sent by checkout requests. */
  key: string
  /** Human-facing plan name. */
  name: string
  /** Display price in USD (whole dollars). */
  priceUsd: number
  interval: BillingInterval
  /** Name of the env var holding this plan's Stripe Price id. */
  priceIdEnv: string
}

export const PLANS: Record<string, Plan> = {
  locator_beast_monthly: {
    key: "locator_beast_monthly",
    name: "Locator Beast",
    // Display only — the charged amount is the Stripe Price behind priceIdEnv. Keep in step.
    priceUsd: 299,
    interval: "month",
    priceIdEnv: "STRIPE_PRICE_ID",
  },
  // Future examples (add the env var + Stripe Price, then uncomment):
  // locator_beast_annual: {
  //   key: "locator_beast_annual",
  //   name: "Locator Beast (Annual)",
  //   priceUsd: 990,
  //   interval: "year",
  //   priceIdEnv: "STRIPE_PRICE_ID_ANNUAL",
  // },
}

export const DEFAULT_PLAN_KEY = "locator_beast_monthly"

export function getPlan(key: string | null | undefined): Plan {
  return PLANS[key ?? DEFAULT_PLAN_KEY] ?? PLANS[DEFAULT_PLAN_KEY]
}

/** Resolve the live Stripe Price id for a plan (null if not configured yet). */
export function resolvePriceId(plan: Plan): string | null {
  return process.env[plan.priceIdEnv] ?? null
}
