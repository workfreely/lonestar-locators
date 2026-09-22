export const dynamic = "force-dynamic"

import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import SettingsShell, { SettingsCard } from "@/components/crm/settings/SettingsShell"
import ApprovedAgentsPanel from "./_components/ApprovedAgentsPanel"

// Admin-only Approved Agents management for Automated Texting. Platform-admin ONLY
// (is_platform_admin, backed by platform_admins with no write policy). Non-admins
// are redirected — agents can never reach or self-serve authorization. All grant/
// revoke mutations go through the protected /api/admin/automated-texting route
// (service role). Canonical authorization key is auth.users.id, so approving any
// future Locator Beast agent is a row insert here — no migration, no deployment.
export default async function AutomatedTextingAdminPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: isAdmin } = await supabase.rpc("is_platform_admin")
  if (!isAdmin) redirect("/admin/leads")

  return (
    <SettingsShell
      title="Automated Texting — Approved Agents"
      description="Grant or revoke Automated Texting access per Locator Beast account. Authorization only lets an agent use the feature; each client's Automated Texts still default Off and must be enabled per client."
    >
      <SettingsCard>
        <ApprovedAgentsPanel />
      </SettingsCard>
    </SettingsShell>
  )
}
