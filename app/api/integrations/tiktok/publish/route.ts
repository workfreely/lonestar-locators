export const runtime = "nodejs"

import { NextResponse, type NextRequest } from "next/server"
import { requirePlatformAdmin } from "@/lib/auth/requirePlatformAdmin"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { buildTikTokCaptionPayload } from "@/lib/social/composePost"
import { getValidTikTokAccessToken } from "@/lib/social/tiktokServer"
import {
  fetchTikTokCreatorInfo,
  resolveDirectPostSelection,
  resolveContentDisclosure,
  planSingleChunk,
  initTikTokDirectPost,
  uploadTikTokVideoSingleChunk,
  fetchTikTokPostStatus,
  type TikTokPrivacyLevel,
} from "@/lib/social/tiktokPublish"
import { truncateToRunes } from "@/lib/social/tiktok"

// TikTok's Direct Post title limit (UTF-16 runes). The TikTok title is the Social Beast caption
// BODY (same structure/spacing as Instagram, manual edits preserved) plus TikTok-specific hashtags
// (generated separately, capped at 5) — buildTikTokCaptionPayload. Truncated to this limit.
const TIKTOK_TITLE_MAX = 2200

// Unaudited Sandbox client: TikTok only accepts SELF_ONLY (private). Kept as a constant so the one
// place that enforces it is obvious; flip to false only after the app passes TikTok audit.
const UNAUDITED = true

// POST /api/integrations/tiktok/publish — Direct Post a Social Beast rendered video to the connected
// TikTok account via FILE_UPLOAD. Platform-admin ONLY.
//
// SAFETY: this only fires a REAL post when body.mode === "post". Any other value (default) runs a
// DRY RUN: it does everything EXCEPT init/upload (resolve token, Creator Info, validate selection,
// download the rendered bytes, plan the chunk, build the caption) and reports readiness — so the
// full pre-post pipeline can be verified without creating a TikTok post.
export async function POST(req: NextRequest) {
  const guard = await requirePlatformAdmin()
  if (!guard.ok) return guard.response
  const { supabase, userId } = guard

  let body: {
    postId?: string
    privacyLevel?: TikTokPrivacyLevel
    disableComment?: boolean
    disableDuet?: boolean
    disableStitch?: boolean
    disclosureOn?: boolean
    disclosureYourBrand?: boolean
    disclosureBrandedContent?: boolean
    mode?: "dry_run" | "post"
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 })
  }
  const isRealPost = body.mode === "post"
  if (!body.postId) return NextResponse.json({ error: "postId required" }, { status: 400 })
  // Default privacy to SELF_ONLY (the only value an unaudited client can post).
  const requestedPrivacy: TikTokPrivacyLevel = body.privacyLevel ?? "SELF_ONLY"

  // Reuse an existing, currently-rendered Social Beast post's video + caption (RLS owner-scoped).
  const { data: post } = await supabase
    .from("social_posts")
    .select("id, render_status, rendered_storage_path, caption, hashtags, social_special, source_content_id, source:source_content_id(market, property_type, special, budget_range, amenities)")
    .eq("id", body.postId)
    .maybeSingle()
  if (!post) return NextResponse.json({ error: "not_found" }, { status: 404 })
  const p = post as {
    id: string; render_status: string; rendered_storage_path: string | null
    caption: string | null; hashtags: string[] | null; social_special: string | null; source_content_id: string | null
    source: { market: string | null; property_type: string | null; special: string | null; budget_range: string | null; amenities: string | null } | { market: string | null; property_type: string | null; special: string | null; budget_range: string | null; amenities: string | null }[] | null
  }
  if (p.render_status !== "ready" || !p.rendered_storage_path) {
    return NextResponse.json({ error: "not_ready" }, { status: 409 })
  }

  // Token (Vault; refreshed if expired) — server-only, never returned to the client.
  const tok = await getValidTikTokAccessToken(userId)
  if (!tok) return NextResponse.json({ error: "not_connected" }, { status: 409 })

  try {
    // Creator Info now (required immediately before the post) → validate the selection against it.
    const info = await fetchTikTokCreatorInfo(tok.accessToken)
    const selection = resolveDirectPostSelection(
      info,
      { privacyLevel: requestedPrivacy, disableComment: body.disableComment, disableDuet: body.disableDuet, disableStitch: body.disableStitch },
      { unaudited: UNAUDITED },
    )

    // Commercial Content Disclosure (TikTok Content Sharing Guidelines): off by default; Branded
    // Content is never allowed alongside SELF_ONLY. Server-side backstop behind the confirmation
    // UI's own guard — resolved against the SAME creator-validated privacy above.
    const disclosure = resolveContentDisclosure(
      { on: !!body.disclosureOn, yourBrand: !!body.disclosureYourBrand, brandedContent: !!body.disclosureBrandedContent },
      selection.privacyLevel,
    )

    // The TikTok caption: same Social Beast body (manual edits preserved) + TikTok hashtags (≤5,
    // generated separately from Instagram). NOT the Instagram payload.
    const fullCaption = buildTikTokCaptionPayload({
      caption: p.caption,
      socialSpecial: p.social_special,
      sourceContentId: p.source_content_id,
      source: Array.isArray(p.source) ? p.source[0] : p.source,
    })
    const title = truncateToRunes(fullCaption, TIKTOK_TITLE_MAX)

    // Download the rendered MP4 bytes server-side (private bucket; never a public URL).
    const { data: blob, error: dlErr } = await supabaseAdmin.storage.from("social-media").download(p.rendered_storage_path)
    if (dlErr || !blob) throw new Error("render download failed")
    const bytes = await blob.arrayBuffer()
    const chunk = planSingleChunk(bytes.byteLength)

    // A DRY RUN stops here — everything needed for the post is proven, nothing is created on TikTok.
    if (!isRealPost) {
      return NextResponse.json({
        dryRun: true,
        ready: true,
        transferMethod: "FILE_UPLOAD",
        // Everything the confirmation UI needs, from this SINGLE creator_info call: identity,
        // live capabilities (never hard-coded), the exact caption/title, and the video size.
        creator: {
          username: info.creator_username,
          nickname: info.creator_nickname,
          avatarUrl: info.creator_avatar_url,
        },
        capabilities: {
          privacyLevelOptions: info.privacy_level_options,
          commentDisabled: info.comment_disabled,
          duetDisabled: info.duet_disabled,
          stitchDisabled: info.stitch_disabled,
          maxVideoPostDurationSec: info.max_video_post_duration_sec,
        },
        unaudited: UNAUDITED,
        selection,
        disclosure,
        title,
        titleLength: title.length,
        videoSize: bytes.byteLength,
        chunk,
      })
    }

    // REAL POST (mode === "post"): init → upload the single chunk → one status check.
    const { publishId, uploadUrl } = await initTikTokDirectPost(tok.accessToken, {
      title,
      privacyLevel: selection.privacyLevel,
      disableComment: selection.disableComment,
      disableDuet: selection.disableDuet,
      disableStitch: selection.disableStitch,
      brandOrganicToggle: disclosure.brandOrganicToggle,
      brandContentToggle: disclosure.brandContentToggle,
      videoSize: bytes.byteLength,
      chunkSize: chunk.chunkSize,
      totalChunkCount: chunk.totalChunkCount,
    })
    await uploadTikTokVideoSingleChunk(uploadUrl, bytes)
    // Single status read (no tight loop) — the UI can re-check via /publish/status if still processing.
    const status = await fetchTikTokPostStatus(tok.accessToken, publishId)
    return NextResponse.json({ dryRun: false, publishId, status: status.status, failReason: status.fail_reason ?? null })
  } catch (e) {
    const message = e instanceof Error ? e.message.slice(0, 300) : "publish error"
    return NextResponse.json({ error: "tiktok_publish_failed", detail: message }, { status: 502 })
  }
}
