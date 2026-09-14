import { NextResponse, type NextRequest } from "next/server"
import { requirePlatformAdmin } from "@/lib/auth/requirePlatformAdmin"
import { isValidPostType } from "@/lib/social/postTypes"
import { normalizeHashtag } from "@/lib/social/hashtags"

// One post: GET (composer load), PATCH (save fields / schedule / unschedule), DELETE.
// Platform-admin ONLY + RLS owner-scoping. PROTECTED fields (owner_user_id, source_content_id,
// platform, published_at, external_post_id/url, error_message, rendered_storage_path,
// render_status) are NEVER mutable via client payloads — only the whitelist below. Editing the
// overlay text or audio choice invalidates any existing render (render_status → 'none').
const SELECT =
  "id, platform, post_type, post_name, caption, on_video_text, on_video_config, " +
  "overlay_headline, overlay_subheadline, overlay_mode, hashtags, audio_choice, audio_track_id, rendered_storage_path, render_status, render_error, render_version, " +
  "status, scheduled_at, published_at, external_post_url, created_at, updated_at, source_content_id, " +
  "source:source_content_id(display_name, property_name, property_type, place_id, market, special, budget_range, amenities, storage_path, original_filename, kind, overlay_mode)"
const SIGNED_URL_TTL = 60 * 30
const AUDIO_CHOICES = new Set(["original", "none", "lb_track"])
const MAX_HASHTAGS = 30

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requirePlatformAdmin()
  if (!guard.ok) return guard.response
  const { supabase } = guard
  const { id } = await ctx.params
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 })

  const { data, error } = await supabase.from("social_posts").select(SELECT).eq("id", id).maybeSingle()
  if (error) return NextResponse.json({ error: "load_failed" }, { status: 500 })
  if (!data) return NextResponse.json({ error: "not_found" }, { status: 404 })

  const r = data as unknown as Record<string, unknown>
  const src = (r.source ?? null) as {
    display_name: string | null; property_name: string | null; property_type: string | null; place_id: string | null
    market: string | null; special: string | null; budget_range: string | null; amenities: string | null
    storage_path: string | null; original_filename: string | null; kind: string | null
  } | null
  const sign = async (p: string | null) => (p ? (await supabase.storage.from("social-media").createSignedUrl(p, SIGNED_URL_TTL)).data?.signedUrl ?? null : null)
  const previewUrl = await sign(src?.storage_path ?? null)
  const renderedPreviewUrl = await sign((r.rendered_storage_path as string | null) ?? null)

  return NextResponse.json({
    id: r.id,
    platform: r.platform,
    postType: r.post_type,
    postName: r.post_name,
    caption: r.caption,
    onVideoText: r.on_video_text,
    onVideoConfig: r.on_video_config,
    overlayHeadline: r.overlay_headline,
    overlaySubheadline: r.overlay_subheadline,
    overlayMode: (r.overlay_mode as string) === "existing" ? "existing" : "generate",
    hashtags: Array.isArray(r.hashtags) ? r.hashtags : [],
    audioChoice: (r.audio_choice as string) || "original",
    audioTrackId: r.audio_track_id,
    renderStatus: (r.render_status as string) || "none",
    renderError: r.render_error,
    renderVersion: r.render_version,
    status: r.status,
    scheduledAt: r.scheduled_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    sourceContentId: r.source_content_id,
    source: src
      ? {
          displayName: src.display_name,
          propertyName: src.property_name,
          propertyType: src.property_type,
          placeId: src.place_id,
          market: src.market,
          special: src.special,
          budgetRange: src.budget_range,
          amenities: src.amenities,
          originalFilename: src.original_filename,
          kind: src.kind,
        }
      : null,
    previewUrl,
    renderedPreviewUrl,
  })
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requirePlatformAdmin()
  if (!guard.ok) return guard.response
  const { supabase } = guard
  const { id } = await ctx.params
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 })

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    body = {}
  }

  const str = (v: unknown, max = 2200) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null)
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if ("postName" in body) patch.post_name = str(body.postName, 300)
  if (typeof body.postType === "string" && isValidPostType("instagram", body.postType)) patch.post_type = body.postType
  if ("caption" in body) patch.caption = str(body.caption)
  if ("onVideoText" in body) patch.on_video_text = str(body.onVideoText, 500)
  if ("onVideoConfig" in body && body.onVideoConfig && typeof body.onVideoConfig === "object") patch.on_video_config = body.onVideoConfig

  // Composer fields. Overlay text + audio affect the RENDER, so changing them invalidates any
  // existing derivative (render_status → 'none'); caption/hashtags are the IG caption (not
  // burned in) and never invalidate the render.
  let renderAffecting = false
  if ("overlayHeadline" in body) { patch.overlay_headline = str(body.overlayHeadline, 200); renderAffecting = true }
  if ("overlaySubheadline" in body) { patch.overlay_subheadline = str(body.overlaySubheadline, 200); renderAffecting = true }
  // Overlay MODE ('generate' | 'existing') is a post-level override; switching it changes what the
  // renderer draws, so it invalidates any existing derivative.
  if ("overlayMode" in body && (body.overlayMode === "generate" || body.overlayMode === "existing")) { patch.overlay_mode = body.overlayMode; renderAffecting = true }
  if ("audioChoice" in body && typeof body.audioChoice === "string" && AUDIO_CHOICES.has(body.audioChoice)) { patch.audio_choice = body.audioChoice; renderAffecting = true }
  if ("hashtags" in body && Array.isArray(body.hashtags)) {
    const seen = new Set<string>()
    const tags: string[] = []
    for (const raw of body.hashtags as unknown[]) {
      const t = typeof raw === "string" ? normalizeHashtag(raw) : ""
      if (!t || seen.has(t.toLowerCase())) continue
      seen.add(t.toLowerCase())
      tags.push(t)
      if (tags.length >= MAX_HASHTAGS) break
    }
    patch.hashtags = tags
  }
  if (renderAffecting) { patch.render_status = "none"; patch.render_error = null }

  const intent = typeof body.intent === "string" ? body.intent : null
  if (intent === "schedule") {
    const raw = typeof body.scheduledAt === "string" ? body.scheduledAt : ""
    const when = raw ? new Date(raw) : null
    if (!when || isNaN(when.getTime())) return NextResponse.json({ error: "valid scheduledAt required" }, { status: 400 })
    patch.scheduled_at = when.toISOString()
    patch.status = "scheduled"
  } else if (intent === "unschedule") {
    patch.scheduled_at = null
    patch.status = "draft"
  } else if ("scheduledAt" in body) {
    const raw = typeof body.scheduledAt === "string" ? body.scheduledAt : ""
    if (raw) {
      const when = new Date(raw)
      if (isNaN(when.getTime())) return NextResponse.json({ error: "invalid scheduledAt" }, { status: 400 })
      patch.scheduled_at = when.toISOString()
    } else patch.scheduled_at = null
  }

  const { data, error } = await supabase.from("social_posts").update(patch).eq("id", id).select("id, status, scheduled_at, render_status").maybeSingle()
  if (error) return NextResponse.json({ error: "update_failed" }, { status: 500 })
  if (!data) return NextResponse.json({ error: "not_found" }, { status: 404 })
  const out = data as { id: string; status: string; scheduled_at: string | null; render_status: string }
  return NextResponse.json({ id: out.id, status: out.status, scheduledAt: out.scheduled_at, renderStatus: out.render_status })
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requirePlatformAdmin()
  if (!guard.ok) return guard.response
  const { supabase } = guard
  const { id } = await ctx.params
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 })

  // Deletes only the post variation — the immutable source video is untouched.
  const { error } = await supabase.from("social_posts").delete().eq("id", id)
  if (error) return NextResponse.json({ error: "delete_failed" }, { status: 500 })
  return NextResponse.json({ ok: true })
}
