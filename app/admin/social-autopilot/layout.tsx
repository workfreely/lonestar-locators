import { ensurePlatformAdminPage } from "@/lib/auth/ensurePlatformAdminPage"
import AppHeader from "@/components/crm/AppHeader"
import BackToDashboard from "@/components/crm/BackToDashboard"
import SocialAutopilotNav from "@/components/crm/social/SocialAutopilotNav"

// Shared Social Autopilot shell — identical page structure to the other authenticated
// Locator Beast pages (Analytics, License Verification, Network): the shared AppHeader
// with the shared BackToDashboard pill, over the same workspace background, then the
// Social Autopilot title/badge + internal tab bar, then the active section. Nested route
// segments keep the tab bar persistent. Platform-admin gated here AND in every child page.
export default async function SocialAutopilotLayout({ children }: { children: React.ReactNode }) {
  await ensurePlatformAdminPage()

  return (
    <div className="sa-scope relative h-full w-full flex flex-col bg-gradient-to-b from-zinc-100 to-zinc-200 dark:from-[var(--crm-workspace)] dark:to-[var(--crm-workspace)]">
      <AppHeader variant="dark" fullBleed>
        <BackToDashboard />
      </AppHeader>

      <div className="beast-ai-clearance flex-1 overflow-y-auto p-5">
        <div className="max-w-[1200px] mx-auto">
          <SocialAutopilotNav />
          <div className="mt-6">{children}</div>
        </div>
      </div>
    </div>
  )
}
