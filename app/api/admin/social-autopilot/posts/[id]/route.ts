import { NextResponse, type NextRequest } from "next/server"
import { requirePlatformAdmin } from "@/lib/auth/requirePlatformAdmin"
import { isValidPostType } from "@/lib/social/postTypes"

// One post: GET (editor load), PATCH (save draft / schedule / unschedule), DELETE.
// Platform-admin ONLY + RLS owner-scoping. PROTECTED fields (owner_user_id,
// source_content_id, platform, published_at, external_post_id/url, error_message) are
// NEVER mutable via client payloads here — only the whitelist below. Scheduling is
// INTERNAL persistence only; nothing is ever published externally.
const SELECT =
  "id, platform, post_type, post_name, caption, on_video_text, on_video_config, status, scheduled_at, published_at, external_post_url, created_at, updated_at, source_content_id, " +
  "source:source_content_id(display_name, property_name, market, storage_path, original_filename, kind)"
const SIGNED_URL_TTL = 60 * 30

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
  const src = (r.source ?? null) as { display_name: string | null; property_name: string | null; market: string | null; storage_path: string | null; original_filename: string | null; kind: string | null } | null
  let previewUrl: string | null = null
  if (src?.storage_path) {
    const { data: signed } = await supabase.storage.from("social-media").createSignedUrl(src.storage_path, SIGNED_URL_TTL)
    previewUrl = signed?.signedUrl ?? null
  }
  return NextResponse.json({
    id: r.id,
    platform: r.platform,
    postType: r.post_type,
    postName: r.post_name,
    caption: r.caption,
    onVideoText: r.on_video_text,
    onVideoConfig: r.on_video_config,
    status: r.status,
    scheduledAt: r.scheduled_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    sourceContentId: r.source_content_id,
    source: src
      ? { displayName: src.display_name, propertyName: src.property_name, market: src.market, originalFilename: src.original_filename, kind: src.kind }
      : null,
    previewUrl,
  })
}

// PATCH: save editable fields, and optionally transition state via `intent`.
//  - intent 'schedule'   → requires a valid future-or-any scheduledAt; sets status='scheduled'.
//  - intent 'unschedule' → clears scheduled_at; sets status='draft'.
//  - no intent           → field save only; status left unchanged (stays Draft while editing).
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
  // post_type is validated for the post's platform (Instagram); invalid values are ignored.
  if (typeof body.postType === "string" && isValidPostType("instagram", body.postType)) patch.post_type = body.postType
  if ("caption" in body) patch.caption = str(body.caption)
  if ("onVideoText" in body) patch.on_video_text = str(body.onVideoText, 500)
  if ("onVideoConfig" in body && body.onVideoConfig && typeof body.onVideoConfig === "object") patch.on_video_config = body.onVideoConfig

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
    // Plain edit of the date/time without changing state (e.g. adjusting a draft).
    const raw = typeof body.scheduledAt === "string" ? body.scheduledAt : ""
    if (raw) {
      const when = new Date(raw)
      if (isNaN(when.getTime())) return NextResponse.json({ error: "invalid scheduledAt" }, { status: 400 })
      patch.scheduled_at = when.toISOString()
    } else {
      patch.scheduled_at = null
    }
  }

  const { data, error } = await supabase.from("social_posts").update(patch).eq("id", id).select("id, status, scheduled_at").maybeSingle()
  if (error) return NextResponse.json({ error: "update_failed" }, { status: 500 })
  if (!data) return NextResponse.json({ error: "not_found" }, { status: 404 })
  const out = data as { id: string; status: string; scheduled_at: string | null }
  return NextResponse.json({ id: out.id, status: out.status, scheduledAt: out.scheduled_at })
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
