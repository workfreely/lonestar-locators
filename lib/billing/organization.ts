import type { SupabaseClient } from "@supabase/supabase-js"
import type { OrganizationStatus } from "@/lib/billing/access"

// Resolves a user's Beast Network membership status (the Organization-Included
// entitlement source) so it can be folded into getAccessState().
//
// Fail-SAFE by design: any error (missing table pre-migration, transient DB
// hiccup, RLS) resolves to null — i.e. "not an org member" — so the paid/trial
// paths are never disturbed by a network lookup. A member who is genuinely
// active but hits a transient error simply falls back to their subscription/
// trial state (and the /admin middleware gate additionally fails open).
//
// Works with any client: the session server client (RLS lets a user read their
// OWN network_members row) and the service-role admin client (reads any row).
export async function getOrganizationStatus(
  supabase: SupabaseClient,
  userId: string
): Promise<OrganizationStatus | null> {
  try {
    const { data, error } = await supabase
      .from("network_members")
      .select("status")
      .eq("user_id", userId)
      .maybeSingle()
    if (error) return null
    return (data?.status as OrganizationStatus | undefined) ?? null
  } catch {
    return null
  }
}
