import { NextResponse, type NextRequest } from "next/server"
import { requirePlatformAdmin, type PlatformAdminGuardOk } from "@/lib/auth/requirePlatformAdmin"
import { QUEUE_STATUSES, isPostStatus } from "@/lib/social/postStatus"

// Social Autopilot post variations API — platform-admin ONLY (requirePlatformAdmin gates
// every method); RLS on social_posts is the second layer. A post references an immutable
// social_content source and NEVER modifies it. No external publishing anywhere here.
const SIGNED_URL_TTL = 60 * 30
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Embed the source's non-secret identity fields via the FK (source_content_id).
const SELECT =
  "id, platform, post_name, caption, on_video_text, on_video_config, status, scheduled_at, published_at, external_post_url, created_at, updated_at, source_content_id, " +
  "source:source_content_id(display_name, property_name, market, storage_path, original_filename, kind)"

type SourceEmbed = {
  display_name: string | null
  property_name: string | null
  market: string | null
  storage_path: string | null
  original_filename: string | null
  kind: string | null
}

async function shape(supabase: PlatformAdminGuardOk["supabase"], rows: Record<string, unknown>[]) {
  return Promise.all(
    rows.map(async (r) => {
      const src = (r.source ?? null) as SourceEmbed | null
      let previewUrl: string | null = null
      const path = src?.storage_path ?? null
      if (path) {
        const { data: signed } = await supabase.storage.from("social-media").createSignedUrl(path, SIGNED_URL_TTL)
        previewUrl = signed?.signedUrl ?? null
      }
      return {
        id: r.id,
        platform: r.platform,
        postName: r.post_name,
        caption: r.caption,
        onVideoText: r.on_video_text,
        onVideoConfig: r.on_video_config,
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
              market: src.market,
              originalFilename: src.original_filename,
              kind: src.kind,
            }
          : null,
        previewUrl,
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

// POST → create ONE draft post from a source video. owner_user_id comes from the SESSION;
// source_content_id is validated to belong to this admin (resolved under RLS) so a post
// can never reference another owner's source. Starts as a Draft — no Instagram needed.
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

  // The source must exist AND be visible to this admin under RLS (i.e. owned by them).
  const { data: src, error: srcErr } = await supabase
    .from("social_content")
    .select("id, display_name")
    .eq("id", sourceContentId)
    .maybeSingle()
  if (srcErr) return NextResponse.json({ error: "create_failed" }, { status: 500 })
  if (!src) return NextResponse.json({ error: "source_not_found" }, { status: 404 })

  const str = (v: unknown, max = 2200) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null)
  // Default the internal post name from the source's display name (a private, editable
  // convenience — NOT the public caption, which stays empty until the admin writes one).
  const postName = str(body.postName, 300) ?? (typeof (src as { display_name?: string }).display_name === "string" ? (src as { display_name: string }).display_name : null)

  const { data, error } = await supabase
    .from("social_posts")
    .insert({
      owner_user_id: userId,
      source_content_id: sourceContentId,
      platform: "instagram",
      post_name: postName,
      caption: str(body.caption),
      on_video_text: str(body.onVideoText, 500),
      status: "draft",
    })
    .select("id")
    .single()
  if (error) return NextResponse.json({ error: "create_failed" }, { status: 500 })
  return NextResponse.json({ id: (data as { id: string }).id })
}
