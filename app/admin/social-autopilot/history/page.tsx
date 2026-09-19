export const dynamic = "force-dynamic"

import { ensurePlatformAdminPage } from "@/lib/auth/ensurePlatformAdminPage"
import { DEMO_HISTORY } from "@/components/crm/social/demoFixtures"
import HistoryTable from "@/components/crm/social/HistoryTable"

// Social Autopilot → History (visual shell). A published-post history table via
// isolated UI-only demo rows (never DB). Shows the reuse model: one source video →
// many published variations. No history persistence yet. The table (client) renders
// the VIDEO thumbnail column + shared preview lightbox.
export default async function SocialAutopilotHistoryPage() {
  await ensurePlatformAdminPage()

  return <HistoryTable items={DEMO_HISTORY} />
}
