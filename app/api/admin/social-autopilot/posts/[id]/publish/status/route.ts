export const runtime = "nodejs"

import { NextResponse, type NextRequest } from "next/server"
import { requirePlatformAdmin } from "@/lib/auth/requirePlatformAdmin"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { finalizeInstagramPublish } from "@/lib/social/instagramFinalize"

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

  // The container check, the exactly-once claim, the media_publish call and the result write all
  // live in finalizeInstagramPublish — shared verbatim with the cron worker, so the manual path and
  // the automatic path cannot drift in the one place a duplicate Reel could originate.
  const outcome = await finalizeInstagramPublish({
    db: supabase,
    postId: id,
    containerId: p.ig_container_id,
    igUserId: dest.external_account_id,
    token: dest.token,
  })

  if (outcome.state === "published") {
    return NextResponse.json({ status: "published", mediaId: outcome.mediaId, url: outcome.url, recovered: outcome.recovered ?? false })
  }
  if (outcome.state === "pending") return NextResponse.json({ status: "publishing", containerStatus: outcome.containerStatus })
  if (outcome.state === "failed") return NextResponse.json({ status: "failed", error: "publish_failed" }, { status: 502 })

  // Lost the claim → another poll (or the worker) is finalizing. Report the row's current truth
  // rather than guessing; this is a normal race outcome, not an error.
  const { data: fresh } = await supabase.from("social_posts").select("status, external_post_id, external_post_url").eq("id", id).maybeSingle()
  const f = fresh as { status: string; external_post_id: string | null; external_post_url: string | null } | null
  return NextResponse.json({ status: f?.status ?? "publishing", mediaId: f?.external_post_id ?? null, url: f?.external_post_url ?? null })
}
