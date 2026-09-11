export const dynamic = "force-dynamic"

import { ensurePlatformAdminPage } from "@/lib/auth/ensurePlatformAdminPage"
import QueueClient from "@/components/crm/social/QueueClient"

// Social Autopilot → Queue. Real post model (social_posts) with status filters. Holds
// posts that have not yet published; History holds completed publications (separate tab).
// Platform-admin gated here and in the API. No sample data.
export default async function SocialAutopilotQueuePage() {
  await ensurePlatformAdminPage()
  return <QueueClient />
}
