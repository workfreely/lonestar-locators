export const TRIAL_LENGTH_DAYS = 30

// The live membership price — this is the Founding Member Rate that new members
// subscribe at and that active members keep for as long as their subscription
// stays continuously active. It matches the price behind STRIPE_PRICE_ID (the
// price the checkout subscription is actually created with), so the amount shown
// and the amount billed are the same $99.
export const MONTHLY_PRICE_USD = 99

// The future standard price, shown struck-through on the pricing card to frame
// the $99 as a founding rate. NOTHING is billed at this amount today — it is
// display copy only. When the standard price actually goes live, create a new
// $149 Stripe Price and point STRIPE_PRICE_ID at it for NEW checkouts; existing
// founding subscriptions keep $99 automatically (Stripe never re-prices a live
// subscription, and no code changes an existing subscription's price).
export const STANDARD_PRICE_USD = 149

export function computeTrialWindow(startedAt: Date = new Date()) {
  const trialStartedAt = startedAt
  const trialEndsAt = new Date(startedAt)
  trialEndsAt.setDate(trialEndsAt.getDate() + TRIAL_LENGTH_DAYS)
  return { trialStartedAt, trialEndsAt }
}
