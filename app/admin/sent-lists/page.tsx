export const dynamic = "force-dynamic"

import { redirect } from "next/navigation"
import SentListsPanel from "@/components/crm/SentListsPanel"
import AppHeader from "@/components/crm/AppHeader"
import BackToDashboard from "@/components/crm/BackToDashboard"
import { createClient } from "@/lib/supabase/server"
import { resolveUserTimeZone } from "@/lib/timezone/server"
import { DEFAULT_TIMEZONE } from "@/lib/timezone"

// CP5 — Sent Lists management surface (Workspace → Client Tools → Sent Lists).
// Server component: auth is enforced by the /admin layout + middleware billing gate,
// and the SentListsPanel's data comes from the RLS-scoped /api/admin/client-shares
// endpoint (workspace-isolated). We resolve only the locator's display timezone here.
export default async function SentListsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: membership } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", user.id)
    .eq("status", "active")
    .limit(1)
    .maybeSingle()

  const timeZone = await resolveUserTimeZone(supabase, user.id, membership?.workspace_id ?? null).catch(
    () => DEFAULT_TIMEZONE,
  )

  // Same application shell as the Analytics page (PerformanceClient): the shared
  // Locator Beast header with a "Back to Dashboard" pill on the left, and a
  // scrollable body. Sent Lists is part of the admin app, not a standalone page.
  return (
    <div className="relative h-screen w-full flex flex-col bg-gradient-to-b from-zinc-100 to-zinc-200 dark:from-[var(--crm-workspace)] dark:to-[var(--crm-workspace)]">
      <AppHeader variant="dark" fullBleed>
        <BackToDashboard />
      </AppHeader>

      <div className="beast-ai-clearance flex-1 overflow-y-auto p-5">
        <SentListsPanel timeZone={timeZone || DEFAULT_TIMEZONE} />
      </div>
    </div>
  )
}
