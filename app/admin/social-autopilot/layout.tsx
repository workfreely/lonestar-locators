import { ensurePlatformAdminPage } from "@/lib/auth/ensurePlatformAdminPage"
import SocialAutopilotShell from "@/components/crm/social/SocialAutopilotShell"
import { createClient } from "@/lib/supabase/server"
import { loadAgentRoster } from "@/lib/social/agentRoster"

// Shared Social Autopilot shell — identical page structure to the other authenticated
// Locator Beast pages (the shared AppHeader with the shared BackToDashboard pill, over the
// same workspace background, then the Social Beast title/tab bar, then the active section).
// Platform-admin gated here (server) AND in every child page. The visual shell + Focus Mode
// (a client presentation state) live in SocialAutopilotShell so the header can be hidden and
// the workspace expanded without touching auth. Nested route segments keep the shell — and
// therefore Focus Mode — persistent across Social Beast tabs.
export default async function SocialAutopilotLayout({ children }: { children: React.ReactNode }) {
  await ensurePlatformAdminPage()

  // The agent roster is read HERE, in the persistent layout, so the selector is present on every
  // Social Beast section and keeps its options across a tab change. Read-only (two selects and
  // one RPC through the RLS-scoped client), and a failure degrades to no selector rather than a
  // broken page — the sections themselves do not depend on it.
  let roster: Awaited<ReturnType<typeof loadAgentRoster>> = []
  try {
    roster = await loadAgentRoster(await createClient())
  } catch {
    roster = []
  }

  return <SocialAutopilotShell roster={roster}>{children}</SocialAutopilotShell>
}
