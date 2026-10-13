// Organization-Included status mirrors network_members.status (Beast Network).
// Kept as a string-literal union here so lib/billing has no dependency on the
// network module.
export type OrganizationStatus = "pending" | "active" | "inactive"

export type BillingProfile = {
  subscription_status: string | null
  trial_ends_at: string | null
  // Beast Network (Phase 1): the THIRD access source. Optional and defaulting to
  // absent, so every existing caller that omits it behaves EXACTLY as before —
  // only an 'active' value grants complimentary access. Never derived from
  // Stripe; resolved separately from network_members.
  organization_status?: OrganizationStatus | null
  // INTERNAL COMPLIMENTARY ACCESS (lb_complimentary_access): the FOURTH access source.
  // Optional and defaulting to absent, so every existing caller behaves exactly as before.
  // Only an explicit `true` grants access. Never derived from Stripe, never from a licence —
  // it mirrors one owner-granted row keyed on the user id, and it has no expiry.
  complimentary_access?: boolean | null
}

export type AccessState =
  | { allowed: true; reason: "trialing"; trialEndsAt: string }
  | { allowed: true; reason: "subscribed" }
  | { allowed: true; reason: "organization" }
  | { allowed: true; reason: "complimentary" }
  | { allowed: false; reason: "trial_expired" }
  | { allowed: false; reason: "canceled" }
  | { allowed: false; reason: "past_due" }
  | { allowed: false; reason: "no_subscription" }

// Pure — no I/O. Used by the billing page to decide what to render, and by
// /admin's server-side access gate. Deliberately binary per source (no grace
// periods, no partial access): access is granted when a paid subscription OR a
// live trial OR an active organization membership is present.
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

  // Organization Included — checked BEFORE the denial branches so an active
  // member with a lapsed/absent subscription still gets access. Independent of
  // Stripe: a member with status 'active' is entitled regardless of
  // subscription_status ('canceled', null, expired trial, etc.).
  if (profile.organization_status === "active") {
    return { allowed: true, reason: "organization" }
  }

  // Internal complimentary — checked alongside Organization Included and for the same reason:
  // an owner-granted free account has no subscription and no trial, so it must be read BEFORE the
  // denial branches or a null subscription_status would deny it. Independent of licence state, so
  // the grant survives the holder becoming licensed.
  if (profile.complimentary_access === true) {
    return { allowed: true, reason: "complimentary" }
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
