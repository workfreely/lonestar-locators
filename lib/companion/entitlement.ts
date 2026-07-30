import { supabaseAdmin } from "@/lib/supabase/admin"
import { getAccessState } from "@/lib/billing/access"

// Minimum Companion version the server will accept — the kill-switch for
// forcing an update when Apple changes chat.db (bump on a breaking release).
export const MIN_COMPANION_VERSION = "1.0.0"

// Feature-based entitlement (NOT plan-name based) so we can enable/disable
// specific capabilities per plan later without touching call sites. V1 gates
// one feature; add keys here as the surface grows.
export type Feature = "messages_sync"

// Reason is a stable machine string the client maps to copy. Covers all the
// states the Companion must recognize.
export type EntitlementReason =
  | "trialing"
  | "subscribed"
  | "trial_expired"
  | "canceled"
  | "past_due"
  | "suspended"
  | "admin_disabled"
  | "no_subscription"

export type EntitlementResult = {
  entitled: boolean
  reason: EntitlementReason
}

// The single server-side source of truth for whether a workspace may use a
// feature right now. The Companion NEVER decides this locally — it calls this
// (via /status and on every ingest) and pauses when entitled=false.
//
// Order of authority: workspace status (admin/suspension) first, then billing
// access (active subscription OR live trial). `feature` is threaded through for
// future per-plan gating; today every active-access workspace gets every
// feature.
export async function getFeatureEntitlement(
  ownerUserId: string,
  workspaceId: string,
  _feature: Feature
): Promise<EntitlementResult> {
  // 1. Admin / operational status of the workspace itself.
  const { data: workspace } = await supabaseAdmin
    .from("workspaces")
    .select("status")
    .eq("id", workspaceId)
    .maybeSingle()

  if (workspace?.status === "suspended") {
    return { entitled: false, reason: "suspended" }
  }
  if (workspace?.status === "cancelled") {
    return { entitled: false, reason: "admin_disabled" }
  }

  // 2. Billing access (reuses the shared trial/subscription rules).
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("subscription_status, trial_ends_at")
    .eq("id", ownerUserId)
    .maybeSingle()

  if (!profile) {
    return { entitled: false, reason: "no_subscription" }
  }

  const access = getAccessState({
    subscription_status: profile.subscription_status ?? null,
    trial_ends_at: profile.trial_ends_at ?? null,
  })

  return { entitled: access.allowed, reason: access.reason as EntitlementReason }
}
