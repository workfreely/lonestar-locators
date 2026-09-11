export const dynamic = "force-dynamic"

import { redirect } from "next/navigation"
import SentListsPanel from "@/components/crm/SentListsPanel"
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

  return (
    <div className="min-h-full bg-[var(--crm-workspace)] px-4 py-6 md:px-8">
      <SentListsPanel timeZone={timeZone || DEFAULT_TIMEZONE} />
    </div>
  )
}
