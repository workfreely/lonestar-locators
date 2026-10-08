export const runtime = "nodejs"

import { shouldHoldForReview } from "@/lib/social/publishHold"
import { NextResponse, type NextRequest } from "next/server"
import { requirePlatformAdmin } from "@/lib/auth/requirePlatformAdmin"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { instagramConfigured, createReelContainer } from "@/lib/social/instagram"
import { buildInstagramCaptionPayload, isOverlayTemplate } from "@/lib/social/composePost"
import { chooseCover, resolveReelCover } from "@/lib/social/reelCover"

// POST /posts/[id]/publish — Instagram Reels publish PHASE 1 (single post → single selected
// destination). This STARTS the async flow: it validates everything, retrieves the token
// server-side (Vault), signs ONLY the rendered derivative, and creates the Reels CONTAINER. It
// does NOT block for processing — the client then polls /publish/status to finalize. Nothing is
// published to Instagram until /publish/status calls media_publish on a FINISHED container.
export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requirePlatformAdmin()
  if (!guard.ok) return guard.response
  const { supabase, userId } = guard

  const { id } = await ctx.params
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 })
  if (!instagramConfigured()) return NextResponse.json({ error: "not_configured" }, { status: 400 })

  // Ownership is enforced by RLS (owner-scoped): the admin can only read their own post.
  const { data: post } = await supabase
    .from("social_posts")
    .select("id, needs_review_at, needs_review_reason, status, render_status, rendered_storage_path, render_version, connection_id, caption, hashtags, external_post_id, platform, social_special, overlay_template, cover_thumb_offset_ms, cover_storage_path, source_content_id, source:source_content_id(market, property_type, special, budget_range, amenities)")
    .eq("id", id)
    .maybeSingle()
  if (!post) return NextResponse.json({ error: "not_found" }, { status: 404 })
  // Same review hold the cron worker applies, enforced here too: the manual button must not be a
  // way around it. The post is NOT changed — it keeps its status and its slot.
  // Same gate the cron worker applies, so the manual button cannot route around it — and equally
  // OFF by default, so today a flagged post publishes from here exactly as before.
  const review = post as unknown as { needs_review_at: string | null; needs_review_reason: string | null }
  if (shouldHoldForReview(review.needs_review_at)) {
    return NextResponse.json({
      error: "needs_review",
      detail: review.needs_review_reason ?? "the price or special behind this post changed after it was scheduled",
      hint: "Re-render the post, or clear the review flag, then publish.",
    }, { status: 409 })
  }
  const p = post as {
    id: string; status: string; render_status: string; rendered_storage_path: string | null; render_version: number | null
    connection_id: string | null; caption: string | null; hashtags: string[] | null; external_post_id: string | null; platform: string; overlay_template: string | null; cover_thumb_offset_ms: number | null; cover_storage_path: string | null
    social_special: string | null; source_content_id: string | null
    source: { market: string | null; property_type: string | null; special: string | null; budget_range: string | null; amenities: string | null } | { market: string | null; property_type: string | null; special: string | null; budget_range: string | null; amenities: string | null }[] | null
  }

  // Duplicate-publish protection.
  if (p.external_post_id || p.status === "published") return NextResponse.json({ error: "already_published" }, { status: 409 })
  if (p.platform !== "instagram") return NextResponse.json({ error: "unsupported_platform" }, { status: 400 })
  // Must have a CURRENT, non-stale render (editing overlay/audio resets render_status to 'none').
  if (p.render_status !== "ready" || !p.rendered_storage_path) return NextResponse.json({ error: "not_ready" }, { status: 409 })
  if (!p.connection_id) return NextResponse.json({ error: "no_destination" }, { status: 400 })

  // Resolve the EXACT selected destination + its token, server-side (service_role; never exposed).
  const { data: destRows, error: destErr } = await supabaseAdmin.rpc("sa_get_instagram_token_by_connection", { p_connection_id: p.connection_id })
  const dest = (Array.isArray(destRows) ? destRows[0] : destRows) as
    | { token: string; token_expires_at: string | null; external_account_id: string | null; status: string; posting_paused: boolean; owner_user_id: string }
    | null
  if (destErr || !dest) return NextResponse.json({ error: "destination_unavailable" }, { status: 409 })
  // Ownership: the connection must belong to this admin.
  if (dest.owner_user_id !== userId) return NextResponse.json({ error: "forbidden" }, { status: 403 })
  const expired = !!dest.token_expires_at && new Date(dest.token_expires_at).getTime() < Date.now()
  if (dest.status !== "connected" || dest.posting_paused || expired || !dest.token || !dest.external_account_id) {
    return NextResponse.json({ error: "destination_unavailable", reason: dest.posting_paused ? "paused" : expired ? "expired" : dest.status }, { status: 409 })
  }

  // Atomic guard: only transition READY → PUBLISHING, and only when not already published. A second
  // click sees status != 'ready' and updates 0 rows → we abort (no duplicate container).
  const { data: claimed } = await supabase
    .from("social_posts")
    .update({ status: "publishing", publish_attempted_at: new Date().toISOString(), ig_container_id: null, error_message: null, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "ready")
    .is("external_post_id", null)
    .select("id")
    .maybeSingle()
  if (!claimed) return NextResponse.json({ error: "not_claimable" }, { status: 409 })

  try {
    // Sign ONLY the rendered derivative (1h). The immutable source and the Library are never signed.
    const { data: signed, error: signErr } = await supabaseAdmin.storage.from("social-media").createSignedUrl(p.rendered_storage_path, 3600)
    if (signErr || !signed?.signedUrl) throw new Error("signed url failed")

    // The EXACT outgoing caption payload — built by the SINGLE shared source of truth
    // (buildInstagramCaptionPayload), identical to what the dry-run preview reports, so the two
    // can never drift. Canonicalizes a generator-owned caption + appends hashtags.
    const caption = buildInstagramCaptionPayload({
      caption: p.caption,
      hashtags: p.hashtags,
      socialSpecial: p.social_special,
      sourceContentId: p.source_content_id,
      overlayTemplate: isOverlayTemplate(p.overlay_template) ? p.overlay_template : null,
      source: Array.isArray(p.source) ? p.source[0] : p.source,
    })
    // The cover is resolved from the SAME shared chooser the worker and the dry run use, so what
    // the preview promised is what Meta is asked for. A custom cover that cannot be signed fails
    // the publish rather than quietly falling back to a different frame.
    const choice = chooseCover(p.cover_storage_path, p.cover_thumb_offset_ms)
    const cover = await resolveReelCover(choice, async (path) => {
      const { data } = await supabaseAdmin.storage.from("social-media").createSignedUrl(path, 3600)
      return data?.signedUrl ?? null
    })
    if (choice.kind === "custom" && !cover) throw new Error("custom cover could not be signed")

    const containerId = await createReelContainer(dest.external_account_id, signed.signedUrl, caption, dest.token, cover)

    await supabase
      .from("social_posts")
      .update({ ig_container_id: containerId, published_render_version: p.render_version, updated_at: new Date().toISOString() })
      .eq("id", id)

    // Container created & processing — the client polls /publish/status to finalize. Not yet live.
    return NextResponse.json({ status: "publishing", containerId })
  } catch (e) {
    const message = e instanceof Error ? e.message.slice(0, 400) : "publish error"
    // Record failure WITHOUT destroying the post; leave it in needs_attention for retry.
    await supabase.from("social_posts").update({ status: "needs_attention", error_message: message, updated_at: new Date().toISOString() }).eq("id", id)
    return NextResponse.json({ status: "failed", error: "container_failed" }, { status: 502 })
  }
}
