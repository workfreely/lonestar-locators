export const dynamic = "force-dynamic"

import { ensurePlatformAdminPage } from "@/lib/auth/ensurePlatformAdminPage"
import PostEditor from "@/components/crm/social/PostEditor"

// Social Autopilot → Post editor (a draft/post detail page under the shared layout, so
// the title + tab bar persist above it). Platform-admin gated. Reached from Library
// (Create Post), Queue, and Calendar. No publishing — scheduling is internal only.
export default async function SocialAutopilotPostPage({ params }: { params: Promise<{ id: string }> }) {
  await ensurePlatformAdminPage()
  const { id } = await params
  return <PostEditor postId={id} />
}
