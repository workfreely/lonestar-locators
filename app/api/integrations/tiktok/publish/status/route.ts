export const runtime = "nodejs"

import { NextResponse, type NextRequest } from "next/server"
import { requirePlatformAdmin } from "@/lib/auth/requirePlatformAdmin"
import { getValidTikTokAccessToken } from "@/lib/social/tiktokServer"
import { fetchTikTokPostStatus } from "@/lib/social/tiktokPublish"

// POST /api/integrations/tiktok/publish/status — check one Direct Post's status by publish_id.
// Platform-admin ONLY. Called on demand by the confirmation UI after posting (a couple of checks,
// never a tight loop). Resolves the token server-side; returns only the coarse status/fail reason.
export async function POST(req: NextRequest) {
  const guard = await requirePlatformAdmin()
  if (!guard.ok) return guard.response
  const { userId } = guard

  let body: { publishId?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 })
  }
  if (!body.publishId) return NextResponse.json({ error: "publishId required" }, { status: 400 })

  const tok = await getValidTikTokAccessToken(userId)
  if (!tok) return NextResponse.json({ error: "not_connected" }, { status: 409 })

  try {
    const status = await fetchTikTokPostStatus(tok.accessToken, body.publishId)
    return NextResponse.json({ status: status.status, failReason: status.fail_reason ?? null })
  } catch {
    return NextResponse.json({ error: "status_failed" }, { status: 502 })
  }
}
