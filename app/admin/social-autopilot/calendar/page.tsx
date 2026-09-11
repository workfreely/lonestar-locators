export const dynamic = "force-dynamic"

import { ensurePlatformAdminPage } from "@/lib/auth/ensurePlatformAdminPage"
import CalendarShell from "@/components/crm/social/CalendarShell"

// Social Autopilot → Calendar (visual shell only).
export default async function SocialAutopilotCalendarPage() {
  await ensurePlatformAdminPage()
  return <CalendarShell />
}
