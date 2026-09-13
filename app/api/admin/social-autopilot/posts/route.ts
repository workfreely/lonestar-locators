import { NextResponse, type NextRequest } from "next/server"
import { requirePlatformAdmin, type PlatformAdminGuardOk } from "@/lib/auth/requirePlatformAdmin"
import { QUEUE_STATUSES, isPostStatus } from "@/lib/social/postStatus"
import { defaultPostType, isValidPostType } from "@/lib/social/postTypes"
import { preparePost } from "@/lib/social/composePost"

// Social Autopilot post variations API — platform-admin ONLY (requirePlatformAdmin gates
// every method); RLS on social_posts is the second layer. A post references an immutable
// social_content source and NEVER modifies it. No external publishing anywhere here.
const SIGNED_URL_TTL = 60 * 30
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const SELECT =
  "id, platform, post_type, post_name, caption, on_video_text, on_video_config, " +
  "overlay_headline, overlay_subheadline, hashtags, audio_choice, audio_track_id, rendered_storage_path, render_status, render_error, render_version, " +
  "status, scheduled_at, published_at, external_post_url, created_at, updated_at, source_content_id, " +
  "source:source_content_id(display_name, property_name, property_type, market, special, budget_range, amenities, storage_path, original_filename, kind)"

type SourceEmbed = {
  display_name: string | null
  property_name: string | null
  property_type: string | null
  market: string | null
  special: string | null
  budget_range: string | null
  amenities: string | null
  storage_path: string | null
  original_filename: string | null
  kind: string | null
}

async function shape(supabase: PlatformAdminGuardOk["supabase"], rows: Record<string, unknown>[]) {
  return Promise.all(
    rows.map(async (r) => {
      const src = (r.source ?? null) as SourceEmbed | null
      const sign = async (p: string | null) => (p ? (await supabase.storage.from("social-media").createSignedUrl(p, SIGNED_URL_TTL)).data?.signedUrl ?? null : null)
      const previewUrl = await sign(src?.storage_path ?? null) // source video (editing view)
      const renderedPreviewUrl = await sign((r.rendered_storage_path as string | null) ?? null) // rendered derivative (final preview)
      return {
        id: r.id,
        platform: r.platform,
        postType: r.post_type,
        postName: r.post_name,
        caption: r.caption,
        onVideoText: r.on_video_text,
        onVideoConfig: r.on_video_config,
        overlayHeadline: r.overlay_headline,
        overlaySubheadline: r.overlay_subheadline,
        hashtags: Array.isArray(r.hashtags) ? r.hashtags : [],
        audioChoice: (r.audio_choice as string) || "original",
        audioTrackId: r.audio_track_id,
        renderStatus: (r.render_status as string) || "none",
        renderError: r.render_error,
        renderVersion: r.render_version,
        status: r.status,
        scheduledAt: r.scheduled_at,
        publishedAt: r.published_at,
        externalPostUrl: r.external_post_url,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
        sourceContentId: r.source_content_id,
        source: src
          ? {
              displayName: src.display_name,
              propertyName: src.property_name,
              propertyType: src.property_type,
              market: src.market,
              originalFilename: src.original_filename,
              kind: src.kind,
            }
          : null,
        previewUrl,
        renderedPreviewUrl,
      }
    }),
  )
}

// GET → this admin's posts. ?status=<one> filters to a single status; ?scope=queue
// returns everything not yet published (Queue); ?scope=scheduled returns scheduled posts
// (Calendar). Default returns all, newest first.
export async function GET(req: NextRequest) {
  const guard = await requirePlatformAdmin()
  if (!guard.ok) return guard.response
  const { supabase } = guard

  const { searchParams } = new URL(req.url)
  const status = searchParams.get("status")
  const scope = searchParams.get("scope")

  let query = supabase.from("social_posts").select(SELECT).order("created_at", { ascending: false })
  if (status && isPostStatus(status)) query = query.eq("status", status)
  else if (scope === "queue") query = query.in("status", QUEUE_STATUSES)
  else if (scope === "scheduled") query = query.eq("status", "scheduled")

  const { data, error } = await query
  if (error) return NextResponse.json({ error: "list_failed" }, { status: 500 })
  const items = await shape(supabase, (data ?? []) as unknown as Record<string, unknown>[])
  return NextResponse.json({ items })
}

// POST → create ONE draft post from a source video, AUTO-PREPARING public-safe suggested copy
// (overlay headline/subheadline, caption, hashtags) from the source's internal metadata. Every
// suggestion is editable before rendering. owner_user_id comes from the SESSION; the source is
// validated under RLS (owned by this admin). Starts as a Draft — no Instagram needed.
export async function POST(req: NextRequest) {
  const guard = await requirePlatformAdmin()
  if (!guard.ok) return guard.response
  const { supabase, userId } = guard

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    body = {}
  }

  const sourceContentId = typeof body.sourceContentId === "string" ? body.sourceContentId.trim() : ""
  if (!UUID_RE.test(sourceContentId)) return NextResponse.json({ error: "valid sourceContentId required" }, { status: 400 })

  // The source must exist AND be visible to this admin under RLS (owned by them). Pull the
  // PUBLIC-safe metadata used for auto-preparation (notes/placeId are intentionally excluded).
  const { data: src, error: srcErr } = await supabase
    .from("social_content")
    .select("id, display_name, property_name, property_type, market, special, budget_range, amenities, details")
    .eq("id", sourceContentId)
    .maybeSingle()
  if (srcErr) return NextResponse.json({ error: "create_failed" }, { status: 500 })
  if (!src) return NextResponse.json({ error: "source_not_found" }, { status: 404 })
  const s = src as Record<string, unknown>

  const str = (v: unknown, max = 2200) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null)
  const postName = str(body.postName, 300) ?? (typeof s.display_name === "string" ? (s.display_name as string) : null)

  const platform = "instagram"
  const requestedType = typeof body.postType === "string" ? body.postType : ""
  const postType = isValidPostType(platform, requestedType) ? requestedType : defaultPostType(platform)

  // Only PUBLIC-SAFE facts flow into prepared copy. property_name / area_neighborhood / notes are
  // INTERNAL references and are intentionally NOT passed — they never appear in public copy.
  const prepared = preparePost({
    market: s.market as string | null,
    propertyType: s.property_type as string | null,
    special: s.special as string | null,
    budgetRange: s.budget_range as string | null,
    amenities: s.amenities as string | null,
  })
  // Prefer the operator's SAVED prepared post (from Edit Details → details.preparedPost) over the
  // freshly auto-prepared copy, per field. Falls back to auto-preparation whenever none is saved.
  const stored = s.details && typeof s.details === "object" && !Array.isArray(s.details) ? ((s.details as Record<string, unknown>).preparedPost as Record<string, unknown> | undefined) : undefined
  const storedStr = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null)
  const storedTags = Array.isArray(stored?.hashtags) ? (stored!.hashtags as unknown[]).filter((t): t is string => typeof t === "string" && t.trim().length > 0) : []
  const effectiveHeadline = storedStr(stored?.overlayHeadline) ?? prepared.overlayHeadline
  const effectiveSub = storedStr(stored?.overlaySubheadline) ?? prepared.overlaySubheadline
  const effectiveCaption = storedStr(stored?.caption) ?? prepared.caption
  const effectiveHashtags = storedTags.length ? storedTags : prepared.hashtags

  const { data, error } = await supabase
    .from("social_posts")
    .insert({
      owner_user_id: userId,
      source_content_id: sourceContentId,
      platform,
      post_type: postType,
      post_name: postName,
      caption: str(body.caption) ?? effectiveCaption,
      overlay_headline: effectiveHeadline,
      overlay_subheadline: effectiveSub,
      hashtags: effectiveHashtags,
      audio_choice: "original",
      render_status: "none",
      status: "draft",
    })
    .select("id")
    .single()
  if (error) return NextResponse.json({ error: "create_failed" }, { status: 500 })
  return NextResponse.json({ id: (data as { id: string }).id })
}
