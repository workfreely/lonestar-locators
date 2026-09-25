import { ensurePlatformAdminPage } from "@/lib/auth/ensurePlatformAdminPage"
import SettingsShell, { SettingsCard } from "@/components/crm/settings/SettingsShell"
import ConflictReview from "./_ConflictReview"

export const dynamic = "force-dynamic"

export default async function PropertyIntelConflictsPage() {
  await ensurePlatformAdminPage()
  return (
    <SettingsShell
      title="Property Intelligence — Conflict Review"
      description="Legitimate source disagreements between curated research and official-site data. Existing curated values are preserved until you decide. Every resolution is audited with admin provenance."
    >
      <SettingsCard>
        <ConflictReview />
      </SettingsCard>
    </SettingsShell>
  )
}
