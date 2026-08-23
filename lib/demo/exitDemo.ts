import { supabase } from "@/lib/supabase/client"
import {
  writeDemoBannerDismissed,
  writeChecklistDismissed,
  writeChecklistDone,
} from "@/lib/preferences"

// Single source of truth for leaving the demo workspace ("Delete Demo
// Workspace" / "Start Fresh"). Flips the profile's demo_mode off — which is
// all it takes, since demo data is client-side fixtures, never rows in the
// leads table — and clears the demo-only UI state (welcome banner + first-run
// checklist) so it never reappears. Callers should router.refresh() (or
// navigate) afterward so the server re-renders the real, clean CRM.
export async function exitDemoWorkspace(): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (user) {
    await supabase.from("profiles").update({ demo_mode: false }).eq("id", user.id)
  }
  writeDemoBannerDismissed(true)
  writeChecklistDismissed(true)
  writeChecklistDone([])
}

/**
 * Turn the demo workspace back ON.
 *
 * Symmetric with exitDemoWorkspace and safe by construction: the demo roster is
 * CLIENT-SIDE FIXTURES (lib/demo/demoWorkspace.ts) that are passed to the CRM in
 * place of real data — nothing is ever written to the leads table. So enabling
 * demo mode cannot create, overwrite, delete or mix with a user's real leads; it
 * only changes which dataset the CRM renders. Turning it off reveals the real
 * data again, untouched.
 */
export async function enterDemoWorkspace(): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (user) {
    await supabase.from("profiles").update({ demo_mode: true }).eq("id", user.id)
  }
}

/**
 * Reset the demo workspace to its first-run state.
 *
 * The fixtures themselves are static and cannot drift, so "reset" means restoring
 * the demo-only UI state that first-run clears: the welcome banner and the
 * Getting Started checklist. Demo mode is (re)enabled in the same call so Reset
 * works whether or not it was previously on. Real leads are untouched for the
 * same structural reason described above.
 */
export async function resetDemoWorkspace(): Promise<void> {
  await enterDemoWorkspace()
  writeDemoBannerDismissed(false)
  writeChecklistDismissed(false)
  writeChecklistDone([])
}
