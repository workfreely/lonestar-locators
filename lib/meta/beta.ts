// Meta Ads beta gate — controls who sees/uses the Connect flow during rollout. No hardcoded
// identities: allow via (a) the META_ADS_BETA_USER_IDS env allowlist (comma-separated auth user ids,
// e.g. the Real Estate Pro TX test account), or (b) platform admins (is_platform_admin RPC).
import type { SupabaseClient } from "@supabase/supabase-js"

/** PURE: is this user id in the env allowlist? (unit-testable) */
export function inMetaAdsBetaAllowlist(userId: string, raw = process.env.META_ADS_BETA_USER_IDS): boolean {
  if (!userId || !raw) return false
  return raw.split(",").map((s) => s.trim()).filter(Boolean).includes(userId)
}

/** Allowed if in the env allowlist OR a platform admin. `supabase` is the RLS-enforced session client. */
export async function isMetaAdsBetaAllowed(supabase: SupabaseClient, userId: string): Promise<boolean> {
  if (inMetaAdsBetaAllowlist(userId)) return true
  try {
    const { data } = await supabase.rpc("is_platform_admin")
    return data === true
  } catch {
    return false
  }
}
