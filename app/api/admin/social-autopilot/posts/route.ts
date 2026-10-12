import { NextResponse, type NextRequest } from "next/server"
import { hasRender, isRenderedReady, workingReason, type LaneFacts } from "@/lib/social/postLane"
import { requirePlatformAdmin, type PlatformAdminGuardOk } from "@/lib/auth/requirePlatformAdmin"
import { signMedia, mapWithConcurrency, SIGN_CONCURRENCY } from "@/lib/social/signedMedia"
import { QUEUE_STATUSES, isPostStatus } from "@/lib/social/postStatus"
import { defaultPostType, isValidPostType } from "@/lib/social/postTypes"
import { preparePost, priceLabelMode } from "@/lib/social/composePost"

// Social Autopilot post variations API — platform-admin ONLY (requirePlatformAdmin gates
// every method); RLS on social_posts is the second layer. A post references an immutable
// social_content source and NEVER modifies it. No external publishing anywhere here.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const SELECT =
  "id, platform, post_type, post_name, caption, on_video_text, on_video_config, " +
  "overlay_headline, overlay_subheadline, overlay_mode, overlay_template, hashtags, audio_choice, audio_track_id, rendered_storage_path, render_status, render_error, render_version, source_storage_path, approved_at, draft_saved_at, " +
  "status, scheduled_at, published_at, external_post_url, created_at, updated_at, source_content_id, recurring_rule_id, recurrence_slot, " +
  "source:source_content_id(display_name, property_name, property_type, market, special, budget_range, amenities, storage_path, thumb_storage_path, original_filename, kind)"

type SourceEmbed = {
  display_name: string | null
  property_name: string | null
  property_type: string | null
  market: string | null
  special: string | null
  budget_range: string | null
  amenities: string | null
  storage_path: string | null
  // INTERNAL library preview JPEG on the SOURCE row. Not a cover: the post's own Instagram/TikTok
  // cover is cover_storage_path on social_posts and is read and written elsewhere, untouched.
  thumb_storage_path: string | null
  original_filename: string | null
  kind: string | null
}

// BOUNDED: up to three signings per post, previously fired for every post at once (252 for 84
// posts). The ceiling bounds the burst; signMedia's re-use makes a repeat load nearly free.
async function shape(supabase: PlatformAdminGuardOk["supabase"], rows: Record<string, unknown>[], userId: string) {
  return mapWithConcurrency(rows, SIGN_CONCURRENCY, async (r) => {
      const src = (r.source ?? null) as SourceEmbed | null
      const previewUrl = (await signMedia(supabase, src?.storage_path ?? null, userId)).url // source video (editing view)
      const thumbUrl = (await signMedia(supabase, src?.thumb_storage_path ?? null, userId)).url // internal library grid preview
      const renderedPreviewUrl = (await signMedia(supabase, (r.rendered_storage_path as string | null) ?? null, userId)).url // rendered derivative
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
        // The two fields the LIST route was missing. /posts/[id] already returned
        // them; without them a caller can read a draft's text but cannot rebuild
        // its overlay, because computeOverlayLayout is keyed on the template and
        // "existing" mode means the video already has its text burned in.
        overlayMode: r.overlay_mode,
        overlayTemplate: r.overlay_template,
        hashtags: Array.isArray(r.hashtags) ? r.hashtags : [],
        audioChoice: (r.audio_choice as string) || "original",
        audioTrackId: r.audio_track_id,
        renderStatus: (r.render_status as string) || "none",
        renderError: r.render_error,
        renderVersion: r.render_version,
        // THE TAB PREDICATE, computed server-side from the ONE shared definition so the library,
        // the editor and the tests cannot disagree. Rendered/Ready needs BOTH a usable artifact
        // AND human approval — an MP4 alone is a test render, not production inventory.
        hasRender: hasRender(r as LaneFacts),
        approvedAt: (r.approved_at as string | null) ?? null,
        draftSavedAt: (r.draft_saved_at as string | null) ?? null,
        isRenderedReady: isRenderedReady(r as LaneFacts),
        workingReason: workingReason(r as LaneFacts),
        sourceStoragePath: (r.source_storage_path as string | null) ?? null,
        status: r.status,
        scheduledAt: r.scheduled_at,
        publishedAt: r.published_at,
        externalPostUrl: r.external_post_url,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
        sourceContentId: r.source_content_id,
        recurring: !!r.recurring_rule_id, // this instance was auto-placed by a Repeat rule
        recurringRuleId: (r.recurring_rule_id as string | null) ?? null,
        recurrenceSlot: (r.recurrence_slot as string | null) ?? null,
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
        thumbUrl,
        renderedPreviewUrl,
      }
  })
}

// GET → this admin's posts. ?status=<one> filters to a single status; ?scope=queue
// returns everything not yet published (Queue); ?scope=scheduled returns scheduled posts
// (Calendar). Default returns all, newest first.
export async function GET(req: NextRequest) {
  const guard = await requirePlatformAdmin()
  if (!guard.ok) return guard.response
  const { supabase, userId } = guard

  const { searchParams } = new URL(req.url)
  const status = searchParams.get("status")
  const scope = searchParams.get("scope")

  let query = supabase.from("social_posts").select(SELECT).order("created_at", { ascending: false })
  if (status && isPostStatus(status)) query = query.eq("status", status)
  else if (scope === "queue") query = query.in("status", QUEUE_STATUSES)
  else if (scope === "scheduled") query = query.eq("status", "scheduled")

  const { data, error } = await query
  if (error) return NextResponse.json({ error: "list_failed" }, { status: 500 })
  const items = await shape(supabase, (data ?? []) as unknown as Record<string, unknown>[], userId)
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

  // ── IMPLICIT (Edit) vs DELIBERATE (+ New) CREATION ───────────────────────────────────────
  //
  // Edit is MEANT to be idempotent: "open this source's post, making one only if none exists".
  // The library decided that from a client-side rollup that createPost never refreshed, so a
  // second click during the navigation gap created a second post — three in 11.6s for Peregrine.
  //
  // `intent: "new"` is the deliberate path ("+ New" in the >1 picker). It always inserts.
  // Create Variation is a DIFFERENT route (/duplicate) and is untouched by any of this.
  const explicitNew = body.intent === "new"

  // THE IDEMPOTENT READ. Any existing unpublished post for this source means Edit should OPEN
  // something rather than create — which is the stated workflow, and is also right when the
  // source already has deliberate variations (the client picker chooses among them; this is the
  // fallback when its rollup is stale). Newest first so a just-created draft wins the race below.
  if (!explicitNew) {
    const { data: existing } = await supabase
      .from("social_posts")
      .select("id")
      .eq("source_content_id", sourceContentId)
      .is("published_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    const found = (existing as { id?: string } | null)?.id
    if (found) return NextResponse.json({ id: found, reused: true })
  }

  // The source must exist AND be visible to this admin under RLS (owned by them). Pull the
  // PUBLIC-safe metadata used for auto-preparation (notes/placeId are intentionally excluded).
  const { data: src, error: srcErr } = await supabase
    .from("social_content")
    .select("id, display_name, property_name, property_type, market, special, budget_range, price_label_mode, amenities, details, overlay_mode")
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
  const prepared = preparePost(
    {
      market: s.market as string | null,
      propertyType: s.property_type as string | null,
      special: s.special as string | null,
      budgetRange: s.budget_range as string | null,
      priceLabelMode: priceLabelMode(s.price_label_mode),
      amenities: s.amenities as string | null,
    },
    // Deterministic hook rotation seed: the source video id — one source always gets the same
    // approved hook, while different sources rotate across the four variations.
    sourceContentId,
  )
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
      // New posts inherit the source's default overlay mode ('generate' unless the source is
      // flagged 'existing'); the Post Editor can override it per post.
      overlay_mode: s.overlay_mode === "existing" ? "existing" : "generate",
      audio_choice: "original",
      render_status: "none",
      status: "draft",
      // PROVENANCE — what makes the uniqueness guarantee possible without touching variations.
      // Only the implicit Edit path is constrained (one per source while unpublished, via
      // social_posts_one_initial_draft_uidx); "+ New" is marked a variation and never is.
      created_via: explicitNew ? "variation" : "edit_initial",
    })
    .select("id")
    .single()
  if (error) {
    // 23505 = the one-initial-draft index refused. Two Edit clicks raced and the other won, so
    // return ITS row: both clicks then open the SAME post, which is the whole point. The read
    // above is not atomic on its own — this is the guarantee, not a nicety.
    if ((error as { code?: string }).code === "23505") {
      const { data: winner } = await supabase
        .from("social_posts")
        .select("id")
        .eq("source_content_id", sourceContentId)
        .eq("created_via", "edit_initial")
        .is("published_at", null)
        .maybeSingle()
      const id = (winner as { id?: string } | null)?.id
      if (id) return NextResponse.json({ id, reused: true })
    }
    return NextResponse.json({ error: "create_failed" }, { status: 500 })
  }
  return NextResponse.json({ id: (data as { id: string }).id })
}
