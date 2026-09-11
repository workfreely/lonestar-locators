export const dynamic = "force-dynamic"

import { redirect, notFound } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import SocialAutopilotClient from "@/components/crm/social/SocialAutopilotClient"

// Social Autopilot — PLATFORM-ADMIN-ONLY internal beta (SA1: Content Library).
//
// Server-enforced access: unauthenticated → /login; authenticated non-admin →
// notFound() (404) so the feature is not discoverable by normal users. This mirrors
// the same is_platform_admin() gate used by every Social Autopilot API + RLS policy;
// the profile-dropdown entry is UX only, never the security boundary.
export default async function SocialAutopilotPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: isAdmin } = await supabase.rpc("is_platform_admin")
  if (isAdmin !== true) notFound()

  return (
    <div className="min-h-full bg-[var(--crm-workspace)] px-4 py-6 md:px-8">
      <SocialAutopilotClient />
    </div>
  )
}
