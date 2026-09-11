import { ensurePlatformAdminPage } from "@/lib/auth/ensurePlatformAdminPage"
import AppHeader from "@/components/crm/AppHeader"
import SocialAutopilotNav from "@/components/crm/social/SocialAutopilotNav"

// Shared Social Autopilot shell — makes the feature feel native to Locator Beast:
// the SAME application header (logo + profile menu) as the CRM, then the Social
// Autopilot title/tab bar, then the active section. Platform-admin gated here AND in
// every child page (defense in depth). Nested route segments keep the tab bar
// persistent while moving between sections.
export default async function SocialAutopilotLayout({ children }: { children: React.ReactNode }) {
  await ensurePlatformAdminPage()

  return (
    <div className="h-full flex flex-col bg-[var(--crm-background)]">
      <AppHeader variant="dark" zClass="z-40" fullBleed />
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-[1200px] mx-auto px-4 md:px-8 py-6">
          <SocialAutopilotNav />
          <div className="mt-6">{children}</div>
        </div>
      </div>
    </div>
  )
}
