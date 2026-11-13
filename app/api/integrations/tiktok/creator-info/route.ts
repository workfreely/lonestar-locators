export const runtime = "nodejs"

import { NextResponse, type NextRequest } from "next/server"
import { requirePlatformAdmin } from "@/lib/auth/requirePlatformAdmin"
import { getValidTikTokAccessToken } from "@/lib/social/tiktokServer"
import { fetchTikTokCreatorInfo } from "@/lib/social/tiktokPublish"

// GET /api/integrations/tiktok/creator-info — Query Creator Info for the connected TikTok account,
// called by the confirmation UI right before a Direct Post. Platform-admin ONLY. Resolves the token
// server-side (Vault; refreshed if expired) and returns ONLY non-sensitive creator/capability fields
// (never the access token). Capabilities are TikTok's live values — the UI must not hard-code them.
export async function GET(req: NextRequest) {
  const guard = await requirePlatformAdmin()
  if (!guard.ok) return guard.response
  const { userId } = guard

  // OPTIONAL ?connectionId= — which TikTok destination to ask about. The resolver verifies the
  // connection belongs to this operator before using it, so passing an id cannot borrow another
  // owner's credential. Omitted, it resolves the operator's sole TikTok account and returns null
  // when they have more than one: a 409 the UI can act on, rather than the previous behaviour of
  // answering confidently about an arbitrary account.
  const connectionId = req.nextUrl.searchParams.get("connectionId")
  const tok = await getValidTikTokAccessToken(userId, connectionId)
  if (!tok) return NextResponse.json({ error: "not_connected" }, { status: 409 })

  try {
    const info = await fetchTikTokCreatorInfo(tok.accessToken)
    // Whitelist exactly the display/capability fields the UI needs. No token, no open_id echo.
    return NextResponse.json({
      creatorUsername: info.creator_username,
      creatorNickname: info.creator_nickname,
      creatorAvatarUrl: info.creator_avatar_url,
      privacyLevelOptions: info.privacy_level_options,
      commentDisabled: info.comment_disabled,
      duetDisabled: info.duet_disabled,
      stitchDisabled: info.stitch_disabled,
      maxVideoPostDurationSec: info.max_video_post_duration_sec,
    })
  } catch {
    // No token material in the error path.
    return NextResponse.json({ error: "creator_info_failed" }, { status: 502 })
  }
}
