export const dynamic = "force-dynamic"

import { ensurePlatformAdminPage } from "@/lib/auth/ensurePlatformAdminPage"
import PostEditor from "@/components/crm/social/PostEditor"

// Social Autopilot → Post editor (a draft/post detail page under the shared layout, so
// the title + tab bar persist above it). Platform-admin gated. Reached from Library
// (Create Post), Queue, and Calendar. No publishing — scheduling is internal only.
export default async function SocialAutopilotPostPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await ensurePlatformAdminPage()
  const { id } = await params
  const sp = await searchParams
  const fromRaw = Array.isArray(sp.from) ? sp.from[0] : sp.from
  const from = fromRaw === "library" || fromRaw === "queue" || fromRaw === "calendar" ? fromRaw : null
  return <PostEditor postId={id} from={from} />
}
