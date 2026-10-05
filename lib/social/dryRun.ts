// Social Beast — SAFE DRY-RUN preview of an Instagram publish.
//
// HARD BOUNDARY (fail-closed): this module runs EVERY production composition step for a post —
// source → metadata → caption/hashtags payload → the final rendered MP4 — UP TO but NEVER INCLUDING
// the external publish. It deliberately does NOT import createReelContainer / publishReelContainer /
// getContainerStatus / media_publish (from lib/social/instagram), and it NEVER retrieves the
// destination access token. There is therefore no callable path from here to any external Instagram
// operation. The caption/hashtags payload is built by the SAME single source of truth the real
// publish uses (buildInstagramCaptionPayload), so the dry run is byte-identical to what production
// would send. Enforced by scripts/social/dryRun.test.ts (static source assertions).
import type { SupabaseClient } from "@supabase/supabase-js"
import { buildInstagramCaptionPayload, isOverlayTemplate } from "@/lib/social/composePost"

export type PublishPreview = {
  postId: string
  alreadyPublished: boolean
  /** The EXACT outgoing Instagram caption text (caption body + hashtag block) production would send. */
  caption: string
  hashtags: string[]
  /** Signed URL (1h) of the FINAL rendered MP4 — the exact video createReelContainer WOULD receive. */
  videoUrl: string
  renderPath: string
  renderVersion: number | null
  /** Destination identity only (never the token); null when no connection is attached yet. */
  igUserId: string | null
  destUsername: string | null
  destStatus: string | null
}

export type DryRunResult =
  | { ok: true; preview: PublishPreview }
  | { ok: false; status: number; error: string; reason?: string }

/** Build the dry-run preview. `supabase` is the RLS (owner-scoped) client — ownership of the post
 *  and connection is enforced by RLS; `supabaseAdmin` (service role) is used ONLY to sign the
 *  rendered derivative for inspection. No mutation, no publish. */
export async function buildPublishPreview(deps: {
  supabase: SupabaseClient
  supabaseAdmin: SupabaseClient
  postId: string
}): Promise<DryRunResult> {
  const { supabase, supabaseAdmin, postId } = deps

  const { data: post } = await supabase
    .from("social_posts")
    .select("id, platform, render_status, rendered_storage_path, render_version, caption, hashtags, social_special, overlay_template, source_content_id, connection_id, external_post_id, source:source_content_id(market, property_type, special, budget_range, amenities)")
    .eq("id", postId)
    .maybeSingle()
  if (!post) return { ok: false, status: 404, error: "not_found" }
  const p = post as {
    id: string; platform: string; render_status: string; rendered_storage_path: string | null; render_version: number | null
    caption: string | null; hashtags: string[] | null; social_special: string | null; overlay_template: string | null; source_content_id: string | null
    connection_id: string | null; external_post_id: string | null
    source: { market: string | null; property_type: string | null; special: string | null; budget_range: string | null; amenities: string | null } | { market: string | null; property_type: string | null; special: string | null; budget_range: string | null; amenities: string | null }[] | null
  }

  if (p.platform !== "instagram") return { ok: false, status: 400, error: "unsupported_platform" }
  if (p.render_status !== "ready" || !p.rendered_storage_path) {
    return { ok: false, status: 409, error: "not_ready", reason: "no current rendered MP4 — render the post first" }
  }

  // Caption/hashtags payload — the SAME shared source of truth the real publish uses.
  const caption = buildInstagramCaptionPayload({
    caption: p.caption,
    hashtags: p.hashtags,
    socialSpecial: p.social_special,
    sourceContentId: p.source_content_id,
    overlayTemplate: isOverlayTemplate(p.overlay_template) ? p.overlay_template : null,
    source: Array.isArray(p.source) ? p.source[0] : p.source,
  })

  // Sign ONLY the rendered derivative — the exact MP4 the publish would hand to Meta. 1h.
  const { data: signed, error: signErr } = await supabaseAdmin.storage.from("social-media").createSignedUrl(p.rendered_storage_path, 3600)
  if (signErr || !signed?.signedUrl) return { ok: false, status: 500, error: "render_url_failed" }

  // Destination IDENTITY only (best-effort, RLS-owned) — external_account_id, NEVER the token.
  let igUserId: string | null = null, destUsername: string | null = null, destStatus: string | null = null
  if (p.connection_id) {
    const { data: conn } = await supabase
      .from("social_connections")
      .select("external_account_id, username, status")
      .eq("id", p.connection_id)
      .maybeSingle()
    const c = conn as { external_account_id: string | null; username: string | null; status: string | null } | null
    igUserId = c?.external_account_id ?? null
    destUsername = c?.username ?? null
    destStatus = c?.status ?? null
  }

  return {
    ok: true,
    preview: {
      postId: p.id,
      alreadyPublished: !!p.external_post_id,
      caption,
      hashtags: Array.isArray(p.hashtags) ? p.hashtags.filter(Boolean) : [],
      videoUrl: signed.signedUrl,
      renderPath: p.rendered_storage_path,
      renderVersion: p.render_version ?? null,
      igUserId,
      destUsername,
      destStatus,
    },
  }
}
