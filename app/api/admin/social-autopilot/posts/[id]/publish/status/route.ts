export const runtime = "nodejs"

import { NextResponse, type NextRequest } from "next/server"
import { requirePlatformAdmin } from "@/lib/auth/requirePlatformAdmin"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { getContainerStatus, publishReelContainer, getMediaPermalink } from "@/lib/social/instagram"

// POST /posts/[id]/publish/status — the async FINALIZE step. The client polls this after /publish.
// It checks the Reels container's processing status and, only once FINISHED, calls media_publish
// (the single real "publish" call) exactly once, then records the media id + permalink. Keeps the
// request short (one status check + at most one publish) so no browser request is held for minutes.
export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requirePlatformAdmin()
  if (!guard.ok) return guard.response
  const { supabase, userId } = guard

  const { id } = await ctx.params
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 })

  // Ownership via RLS.
  const { data: post } = await supabase
    .from("social_posts")
    .select("id, status, ig_container_id, connection_id, external_post_id, external_post_url")
    .eq("id", id)
    .maybeSingle()
  if (!post) return NextResponse.json({ error: "not_found" }, { status: 404 })
  const p = post as { id: string; status: string; ig_container_id: string | null; connection_id: string | null; external_post_id: string | null; external_post_url: string | null }

  // Already published → idempotent success.
  if (p.external_post_id) return NextResponse.json({ status: "published", mediaId: p.external_post_id, url: p.external_post_url })
  // Nothing to finalize unless a container is processing.
  if (p.status !== "publishing" || !p.ig_container_id || !p.connection_id) return NextResponse.json({ status: p.status })

  // Resolve the destination token server-side (never exposed) + confirm ownership.
  const { data: destRows } = await supabaseAdmin.rpc("sa_get_instagram_token_by_connection", { p_connection_id: p.connection_id })
  const dest = (Array.isArray(destRows) ? destRows[0] : destRows) as
    | { token: string; external_account_id: string | null; owner_user_id: string }
    | null
  if (!dest || dest.owner_user_id !== userId || !dest.token || !dest.external_account_id) {
    return NextResponse.json({ error: "destination_unavailable" }, { status: 409 })
  }

  try {
    const containerStatus = await getContainerStatus(p.ig_container_id, dest.token)

    if (containerStatus === "IN_PROGRESS" || containerStatus === "UNKNOWN") {
      return NextResponse.json({ status: "publishing", containerStatus })
    }
    if (containerStatus === "ERROR" || containerStatus === "EXPIRED") {
      await supabase.from("social_posts").update({ status: "needs_attention", error_message: `container ${containerStatus}`, updated_at: new Date().toISOString() }).eq("id", id)
      return NextResponse.json({ status: "failed", containerStatus })
    }

    // FINISHED (or already PUBLISHED). Claim the finalize atomically to prevent a concurrent poll
    // from calling media_publish twice: move status out of 'publishing' guarded by external_post_id
    // still null. If we don't win the claim, someone else is finalizing → report current state.
    const { data: claim } = await supabase
      .from("social_posts")
      .update({ status: "published", updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("status", "publishing")
      .is("external_post_id", null)
      .select("id")
      .maybeSingle()
    if (!claim) {
      const { data: fresh } = await supabase.from("social_posts").select("status, external_post_id, external_post_url").eq("id", id).maybeSingle()
      const f = fresh as { status: string; external_post_id: string | null; external_post_url: string | null } | null
      return NextResponse.json({ status: f?.external_post_id ? "published" : (f?.status ?? "publishing"), mediaId: f?.external_post_id, url: f?.external_post_url })
    }

    try {
      const mediaId = await publishReelContainer(dest.external_account_id, p.ig_container_id, dest.token)
      const url = await getMediaPermalink(mediaId, dest.token)
      await supabase
        .from("social_posts")
        .update({ external_post_id: mediaId, external_post_url: url, published_at: new Date().toISOString(), status: "published", error_message: null, updated_at: new Date().toISOString() })
        .eq("id", id)
      return NextResponse.json({ status: "published", mediaId, url })
    } catch (e) {
      // media_publish failed after the claim — revert to needs_attention (post preserved).
      const message = e instanceof Error ? e.message.slice(0, 400) : "publish error"
      await supabase.from("social_posts").update({ status: "needs_attention", error_message: message, updated_at: new Date().toISOString() }).eq("id", id)
      return NextResponse.json({ status: "failed", error: "publish_failed" }, { status: 502 })
    }
  } catch (e) {
    const message = e instanceof Error ? e.message.slice(0, 400) : "status error"
    await supabase.from("social_posts").update({ status: "needs_attention", error_message: message, updated_at: new Date().toISOString() }).eq("id", id)
    return NextResponse.json({ status: "failed", error: "status_failed" }, { status: 502 })
  }
}
