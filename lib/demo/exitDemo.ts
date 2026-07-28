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
