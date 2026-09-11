import { redirect, notFound } from "next/navigation"
import { createClient } from "@/lib/supabase/server"

// Server-side gate for PLATFORM-ADMIN-ONLY *pages* (Social Autopilot). Mirrors the
// requirePlatformAdmin() API guard but for RSC pages/layouts: unauthenticated →
// /login; authenticated non-admin → notFound() (404) so the feature is not
// discoverable. Reuses the existing is_platform_admin() mechanism; no hard-coded
// identity. Called by the Social Autopilot layout AND every child page so a normal
// user manually entering any Social Autopilot URL is denied server-side.
export async function ensurePlatformAdminPage(): Promise<void> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: isAdmin } = await supabase.rpc("is_platform_admin")
  if (isAdmin !== true) notFound()
}
