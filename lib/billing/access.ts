export type BillingProfile = {
  subscription_status: string | null
  trial_ends_at: string | null
}

export type AccessState =
  | { allowed: true; reason: "trialing"; trialEndsAt: string }
  | { allowed: true; reason: "subscribed" }
  | { allowed: false; reason: "trial_expired" }
  | { allowed: false; reason: "canceled" }
  | { allowed: false; reason: "past_due" }
  | { allowed: false; reason: "no_subscription" }

// Pure — no I/O. Used by the billing page to decide what to render, and
// intended to be reused unchanged by /admin's access gate once this is
// connected to the CRM in a future milestone. Deliberately binary (trial
// active OR subscription active) per spec — no grace periods, no partial
// access.
export function getAccessState(profile: BillingProfile): AccessState {
  const now = Date.now()

  if (profile.subscription_status === "active") {
    return { allowed: true, reason: "subscribed" }
  }

  if (
    profile.subscription_status === "trialing" &&
    profile.trial_ends_at &&
    new Date(profile.trial_ends_at).getTime() > now
  ) {
    return { allowed: true, reason: "trialing", trialEndsAt: profile.trial_ends_at }
  }

  if (profile.subscription_status === "canceled") {
    return { allowed: false, reason: "canceled" }
  }

  if (profile.subscription_status === "past_due") {
    return { allowed: false, reason: "past_due" }
  }

  if (profile.trial_ends_at && new Date(profile.trial_ends_at).getTime() <= now) {
    return { allowed: false, reason: "trial_expired" }
  }

  return { allowed: false, reason: "no_subscription" }
}
