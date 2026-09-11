export const dynamic = "force-dynamic"

import { ensurePlatformAdminPage } from "@/lib/auth/ensurePlatformAdminPage"

// Social Autopilot → Analytics (visual shell only). Platform-admin gated like every
// other section. Deliberately empty until there is real publishing data to measure —
// NO Instagram insights, NO analytics engine here. The shared layout already renders
// the Social Autopilot title + tab bar, so this page adds no second header.
export default async function SocialAutopilotAnalyticsPage() {
  await ensurePlatformAdminPage()

  return (
    <div>
      <div className="rounded-2xl border border-[var(--crm-border)] bg-[var(--crm-panel)] px-6 py-12 text-center text-[13px] text-[var(--crm-text-secondary)]">
        Analytics will appear here once publishing data is available.
      </div>
    </div>
  )
}
