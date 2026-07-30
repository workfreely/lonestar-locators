export const runtime = "nodejs"

import { NextResponse } from "next/server"
import { requireDeviceToken } from "@/lib/companion/auth"
import { getFeatureEntitlement, MIN_COMPANION_VERSION } from "@/lib/companion/entitlement"

// Lightweight heartbeat the Companion polls (on launch + on an interval + after
// pushes). Tells it whether the workspace is still entitled to Messages Sync
// and the minimum accepted app version. The Companion pauses syncing when
// entitled=false and prompts an update when its version < minVersion.
export async function GET(req: Request) {
  const auth = await requireDeviceToken(req)
  if (!auth.ok) return auth.response

  const entitlement = await getFeatureEntitlement(auth.userId, auth.workspaceId, "messages_sync")

  return NextResponse.json({
    entitled: entitlement.entitled,
    reason: entitlement.reason,
    minVersion: MIN_COMPANION_VERSION,
    serverTime: new Date().toISOString(),
  })
}
