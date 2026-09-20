import { ensurePlatformAdminPage } from "@/lib/auth/ensurePlatformAdminPage"
import SocialAutopilotShell from "@/components/crm/social/SocialAutopilotShell"

// Shared Social Autopilot shell — identical page structure to the other authenticated
// Locator Beast pages (the shared AppHeader with the shared BackToDashboard pill, over the
// same workspace background, then the Social Beast title/tab bar, then the active section).
// Platform-admin gated here (server) AND in every child page. The visual shell + Focus Mode
// (a client presentation state) live in SocialAutopilotShell so the header can be hidden and
// the workspace expanded without touching auth. Nested route segments keep the shell — and
// therefore Focus Mode — persistent across Social Beast tabs.
export default async function SocialAutopilotLayout({ children }: { children: React.ReactNode }) {
  await ensurePlatformAdminPage()

  return <SocialAutopilotShell>{children}</SocialAutopilotShell>
}
