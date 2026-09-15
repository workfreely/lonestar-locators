import type { SupabaseClient } from "@supabase/supabase-js"

// Automatic "first real lead → leave the demo workspace" behavior for the lead
// submit route. Kept here (pure + mockable) so it can be unit-tested without a
// live database or real emails.
//
// IMPORTANT: this only changes which dataset the live CRM renders. Demo data is
// static client-side fixtures (lib/demo/demoWorkspace.ts) — never rows in the
// leads table — so flipping demo_mode off deletes nothing and leaves the
// Add / Reset / Remove Demo Workspace controls fully functional.

/**
 * Whether a submission should trigger the automatic demo exit. True ONLY for a
 * genuinely new, canonical lead attributed to a workspace owner (the public
 * Smart Lead Form path). A failed insert never reaches this (the caller returns
 * first); a validation/honeypot rejection returns even earlier; manual CRM adds
 * and the legacy Lone Star forms resolve no attributed owner, so they never
 * auto-exit anyone's demo.
 */
export function shouldExitDemoOnLead(
  isNewLead: boolean,
  attributedOwnerId: string | null | undefined,
): boolean {
  return isNewLead && !!attributedOwnerId
}

/**
 * Flip the owning agent OUT of demo mode after their first real lead — but only
 * if they are still in it. The `.eq("demo_mode", true)` guard makes this a
 * no-op for an already-live account (CASE C) and idempotent for the second real
 * lead (CASE D): the WHERE matches zero rows and nothing changes. Best-effort:
 * never throws, so it can never affect the saved lead or the response.
 *
 * @returns exited=true only when a row was actually flipped (owner was in demo).
 */
export async function exitDemoModeForOwner(
  client: SupabaseClient,
  ownerId: string,
): Promise<{ exited: boolean }> {
  try {
    const { data, error } = await client
      .from("profiles")
      .update({ demo_mode: false })
      .eq("id", ownerId)
      .eq("demo_mode", true)
      .select("id")
    if (error) {
      console.error("[demoExit] Failed to exit demo mode:", error)
      return { exited: false }
    }
    return { exited: (data?.length ?? 0) > 0 }
  } catch (err) {
    console.error("[demoExit] Exit-demo-mode threw:", err)
    return { exited: false }
  }
}
