export const dynamic = "force-dynamic"

import { ensurePlatformAdminPage } from "@/lib/auth/ensurePlatformAdminPage"
import SocialAutopilotClient from "@/components/crm/social/SocialAutopilotClient"

// Social Autopilot → Library (default tab). Server-gated (defense in depth alongside
// the shared layout). The Content Library UI (SA1) lives here, inside the native shell.
export default async function SocialAutopilotLibraryPage() {
  await ensurePlatformAdminPage()
  return <SocialAutopilotClient />
}
