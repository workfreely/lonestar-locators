// DISPLAY ONLY. The trial is actually granted inside the lb_verify_license() RPC, which carries
// its own interval — NOT by grant_trial_on_signup(), which Pass 8 neutralised, and not by this
// constant, which never computes a stored trial_ends_at. Both must be changed together or the UI
// will advertise a length the database does not honour.
export const TRIAL_LENGTH_DAYS = 7

// The live membership price — the Founding Member Rate that new members subscribe at and keep for
// as long as their subscription stays continuously active.
//
// DISPLAY ONLY, and it must be kept in step with Stripe by hand. The amount actually charged is
// the unit_amount of the Price behind STRIPE_PRICE_ID; a Stripe Price's amount is IMMUTABLE, so
// moving to $299 required a NEW Price object rather than an edit. Changing this number without
// repointing STRIPE_PRICE_ID would advertise one price and charge another.
export const MONTHLY_PRICE_USD = 299

// The FUTURE standard price. Nothing is billed at this amount today and no Stripe Price exists for
// it — it frames the current rate as a founding one.
//
// It is rendered with an explicit "Future standard price" label, never as a bare struck-through
// figure: an unlabelled strike-through next to a live price reads as a discount off a price that
// was once charged, which would not be true.
//
// When it does go live: create a NEW Stripe Price and repoint STRIPE_PRICE_ID for new checkouts.
// Existing founding subscriptions keep their rate automatically — Stripe never re-prices a live
// subscription, and nothing in this codebase changes an existing subscription's price.
export const STANDARD_PRICE_USD = 599

export function computeTrialWindow(startedAt: Date = new Date()) {
  const trialStartedAt = startedAt
  const trialEndsAt = new Date(startedAt)
  trialEndsAt.setDate(trialEndsAt.getDate() + TRIAL_LENGTH_DAYS)
  return { trialStartedAt, trialEndsAt }
}
