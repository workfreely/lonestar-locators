import { NextResponse, type NextRequest } from "next/server"
import { requirePlatformAdmin, type PlatformAdminGuardOk } from "@/lib/auth/requirePlatformAdmin"
import { signMedia } from "@/lib/social/signedMedia"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { isValidPostType } from "@/lib/social/postTypes"
import { normalizeHashtag, hashtagLimitForPlatform } from "@/lib/social/hashtags"
import { isOverlayTemplate } from "@/lib/social/composePost"
import { renderAffectingChanges, valueChanged } from "@/lib/social/renderInvalidation"
import { resolvePresenterClip, type PresenterClipStatus } from "@/lib/social/presenterClipCache"
import { isSocialDestination } from "@/lib/social/destinations"
import { ensureStoryCompanion } from "@/lib/social/storyCompanion"
import { hasRender, isRenderedReady, type LaneFacts } from "@/lib/social/postLane"
import { resolveSourcePath } from "@/lib/social/sourcePath"

// One post: GET (composer load), PATCH (save fields / schedule / unschedule), DELETE.
// Platform-admin ONLY + RLS owner-scoping. PROTECTED fields (owner_user_id, source_content_id,
// platform, published_at, external_post_id/url, error_message, rendered_storage_path,
// render_status) are NEVER mutable via client payloads — only the whitelist below. Editing the
// overlay text, audio choice or source video invalidates any existing render (render_status →
// 'none') — but ONLY when the value actually CHANGES, not merely because the editor posted the
// key. See lib/social/renderInvalidation.
const SELECT =
  "id, platform, destination, post_type, post_name, caption, social_special, on_video_text, on_video_config, " +
  "overlay_headline, overlay_subheadline, overlay_mode, overlay_template, cover_thumb_offset_ms, cover_storage_path, cover_render_version, hashtags, audio_choice, audio_track_id, voice_hook_id, voice_cta_id, rendered_storage_path, render_status, render_error, render_version, " +
  "status, scheduled_at, published_at, external_post_id, external_post_url, created_at, updated_at, source_content_id, source_storage_path, approved_at, draft_saved_at, needs_review_at, needs_review_reason, " +
  "presenter_id, presenter_intro_seconds, presenter_side, presenter_width_px, presenter_clip_storage_path, presenter_audio_storage_path, " +
  // area_neighborhood and district are INTERNAL editing metadata — the broader area and the
  // specific district, the two finest of Social Beast's four geographic layers. Both are read here
  // for EDITING only: both stay deliberately absent from SourceMeta (lib/social/composePost.ts),
  // so neither can reach a caption, headline or overlay.
  "source:source_content_id(display_name, property_name, property_type, place_id, market, area_neighborhood, district, special, budget_range, price_label_mode, amenities, storage_path, thumb_storage_path, original_filename, kind, overlay_mode)"
const AUDIO_CHOICES = new Set(["original", "none", "lb_track"])

/**
 * The matched property's full street address, read from the catalog.
 *
 * social_content stores no address — only place_id — so this is a lookup, never a
 * stored duplicate. property_catalog.address already holds the COMPLETE formatted
 * address ("5004 Memorial Dr, Houston, TX 77007, USA"); city/state/zip are
 * redundant with it and appending them would read "…TX 77007, USA, Houston, TX".
 *
 * Deliberately NOT the Google Places formattedAddress PropertySearchField sees at
 * match time: that exists only in that moment and is discarded, so it would show
 * on match and vanish on reload.
 *
 * There is no FK between the tables, so PostgREST cannot embed it — hence one
 * small separate query. A place the catalog has not ingested yet simply returns
 * null and the editor renders no address row.
 */
async function catalogAddress(placeId: string | null | undefined): Promise<string | null> {
  if (!placeId) return null
  // SERVICE ROLE, like every other property_catalog reader in this codebase.
  // The table has RLS enabled and — in this database — NO policies at all: the
  // `property_catalog_read` policy declared in migration 20260901000002 was never
  // applied here, so an authenticated client reads zero rows. Reading through the
  // caller's RLS client therefore returned null for every property, which looked
  // exactly like "this place has no address". Nothing is escalated: the route is
  // already platform-admin gated and this returns one address for a property the
  // operator has already matched to this video.
  const { data, error } = await supabaseAdmin
    .from("property_catalog")
    .select("address")
    .eq("place_id", placeId)
    .maybeSingle()
  // Never swallow the failure — a silent null here is indistinguishable from a
  // property that genuinely has no address, which is what hid the bug above.
  if (error) {
    console.error("[posts/:id] catalog address lookup failed:", error.message)
    return null
  }
  const raw = (data as { address?: string | null } | null)?.address ?? null
  if (!raw) return null
  return raw.replace(/,\s*USA\s*$/i, "").trim() || null
}

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
    market: string | null; area_neighborhood: string | null; district: string | null; special: string | null; budget_range: string | null; price_label_mode: string | null; amenities: string | null
    storage_path: string | null; thumb_storage_path: string | null; original_filename: string | null; kind: string | null
  } | null
  // THREE-STATE, not null-or-not. "absent" (no such object) and "failed" (it exists, signing broke)
  // are reported separately so the editor can offer Retry instead of claiming the video is missing.
  // signMedia re-uses a still-valid URL for this owner+path, so re-opening the same post hands the
  // browser the SAME url and it can serve from cache / revalidate instead of re-downloading.
  const [preview, renderedPreview, thumb, cover] = await Promise.all([
    // THE POST'S OWN FOOTAGE WINS — the same rule the renderer applies, from the same helper.
    // Signing src.storage_path unconditionally is what made a replaced video render correctly and
    // play back as the original: Replace Video writes social_posts.source_storage_path, and this
    // line never looked at it.
    signMedia(supabase, resolveSourcePath(r.source_storage_path as string | null, src?.storage_path ?? null), guard.userId),
    signMedia(supabase, (r.rendered_storage_path as string | null) ?? null, guard.userId),
    // The library thumbnail — a ~20KB JPEG the editor paints immediately while the video loads.
    signMedia(supabase, src?.thumb_storage_path ?? null, guard.userId),
    // The post's own Instagram/TikTok COVER. Which frame is chosen, and everything about how it is
    // used, is untouched — only how its URL is signed, which now retries and re-uses like the rest.
    signMedia(supabase, (r.cover_storage_path as string | null) ?? null, guard.userId),
  ])
  const previewUrl = preview.url
  const renderedPreviewUrl = renderedPreview.url

  return NextResponse.json({
    // Why the video is not showing, when it is not showing. "failed" means the object is there and
    // signing broke — the editor shows Retry. Absent stays silent, as it always did.
    previewUrlFailed: preview.status === "failed",
    renderedPreviewUrlFailed: renderedPreview.status === "failed",
    thumbUrl: thumb.url,
    id: r.id,
    platform: r.platform,
    // The SURFACE. The editor resolves its preview geometry from this, exactly as renderPost does,
    // so the preview and the burned-in frame cannot disagree about which safe area applies.
    destination: (r.destination as string | null) ?? null,
    postType: r.post_type,
    postName: r.post_name,
    caption: r.caption,
    socialSpecial: (r.social_special as string | null) ?? null,
    onVideoText: r.on_video_text,
    onVideoConfig: r.on_video_config,
    overlayHeadline: r.overlay_headline,
    overlaySubheadline: r.overlay_subheadline,
    overlayMode: (r.overlay_mode as string) === "existing" ? "existing" : "generate",
    overlayTemplate: (r.overlay_template as string | null) ?? "market_type",
    hashtags: Array.isArray(r.hashtags) ? r.hashtags : [],
    coverThumbOffsetMs: (r.cover_thumb_offset_ms as number | null) ?? null,
    coverStoragePath: (r.cover_storage_path as string | null) ?? null,
    // Signed so the editor can SHOW the chosen custom cover without a second round trip.
    coverPreviewUrl: cover.url,
    // Advisory: the chosen frame refers to a DIFFERENT render than the current one.
    coverMayHaveShifted:
      r.cover_thumb_offset_ms != null &&
      r.cover_render_version != null &&
      r.cover_render_version !== r.render_version,
    audioChoice: (r.audio_choice as string) || "original",
    audioTrackId: r.audio_track_id,
    voiceHookId: r.voice_hook_id,
    voiceCtaId: r.voice_cta_id,
    // AI Presenter. presenterId null ⇒ the feature is off, which is the state of every post that
    // predates it. The editor hydrates its control from exactly these.
    presenterId: r.presenter_id,
    presenterIntroSeconds: r.presenter_intro_seconds === null || r.presenter_intro_seconds === undefined ? null : Number(r.presenter_intro_seconds),
    presenterSide: r.presenter_side,
    presenterWidthPx: r.presenter_width_px === null || r.presenter_width_px === undefined ? null : Number(r.presenter_width_px),
    renderStatus: (r.render_status as string) || "none",
    renderError: r.render_error,
    renderVersion: r.render_version,
    // Does a usable artifact exist RIGHT NOW? The editor locks the render-affecting controls on
    // this, and the library puts the post in the Rendered tab on this — one predicate, both places.
    hasRender: hasRender(r as LaneFacts),
    approvedAt: (r.approved_at as string | null) ?? null,
    draftSavedAt: (r.draft_saved_at as string | null) ?? null,
    isRenderedReady: isRenderedReady(r as LaneFacts),
    status: r.status,
    publishedAt: r.published_at,
    externalPostUrl: r.external_post_url,
    // Published footage is frozen (DB trigger + a 409 from PATCH); the editor greys the swap control.
    isPublished: !!(r.published_at || r.external_post_id),
    scheduledAt: r.scheduled_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    sourceContentId: r.source_content_id,
    // The post's OWN footage, when it overrides the property's. Null = render from the property's
    // own video (social_content.storage_path) — true of every row before this feature existed.
    sourceStoragePath: (r.source_storage_path as string | null) ?? null,
    // Informational today: the editor shows a warning, nothing is blocked. See lib/social/publishHold.
    needsReviewAt: r.needs_review_at,
    needsReviewReason: r.needs_review_reason,
    source: src
      ? {
          displayName: src.display_name,
          propertyName: src.property_name,
          propertyType: src.property_type,
          placeId: src.place_id,
          market: src.market,
          areaNeighborhood: src.area_neighborhood,
          district: src.district,
          special: src.special,
          budgetRange: src.budget_range,
          address: await catalogAddress(src.place_id),
          priceLabelMode: src.price_label_mode,
          amenities: src.amenities,
          originalFilename: src.original_filename,
          kind: src.kind,
          // The PROPERTY's own video. Shown so the operator can see what the post falls back to
          // when its override is cleared.
          storagePath: src.storage_path,
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

  // THE STORED ROW, READ ONCE.
  //
  // Needed to decide whether this edit actually changes the burned-in video (see
  // lib/social/renderInvalidation). It also replaces two separate single-column reads that used to
  // sit further down — one for render_version when stamping a cover, one for platform when capping
  // hashtags — so this is one query where there were two.
  const { data: storedRow } = await supabase
    .from("social_posts")
    .select("id, platform, destination, published_at, external_post_id, render_version, source_storage_path, overlay_headline, overlay_subheadline, overlay_mode, overlay_template, audio_choice, audio_track_id, voice_hook_id, voice_cta_id, presenter_id, presenter_audio_storage_path, presenter_clip_storage_path")
    .eq("id", id)
    .maybeSingle()
  const stored = (storedRow ?? null) as Record<string, unknown> | null
  const isPublished = !!(stored?.published_at || stored?.external_post_id)

  const str = (v: unknown, max = 2200) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null)
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  // THE SURFACE this post is laid out for. It resolves the safe area, so it decides the geometry —
  // which is why it is in RENDER_AFFECTING_COLUMNS and why changing it invalidates the render.
  //
  // REFUSED ON A PUBLISHED POST. Re-pointing a post that is already live on Instagram would
  // invalidate the very MP4 Instagram is serving, so a published post keeps its destination and
  // a new post is the way to target another surface. `isPublished` is already computed above for
  // the footage lock and means exactly the same thing here.
  if ("destination" in body && isSocialDestination(body.destination) && !isPublished) {
    patch.destination = body.destination
    // The legacy `platform` column is deliberately NOT written alongside it. It is a protected
    // column (owner, source, platform, published_at, render pointers are never patched here), and
    // it does not need to follow: destinationFromLegacyPlatform is consulted only when destination
    // is NULL, so once a destination exists every geometry path — renderPost, the TikTok publish
    // guard, the editor preview — reads the destination and ignores platform entirely. The one
    // other reader, the stored-hashtag cap, does not affect TikTok, whose hashtags are generated
    // separately by buildTikTokCaptionPayload rather than taken from the stored set.
  }
  if ("postName" in body) patch.post_name = str(body.postName, 300)
  if (typeof body.postType === "string" && isValidPostType("instagram", body.postType)) patch.post_type = body.postType
  if ("caption" in body) patch.caption = str(body.caption)
  // Per-post Social Special (explicit public offer). Null clears it → generated copy falls back to
  // the normalized raw Current Special. Not render-affecting (caption/overlay text only).
  if ("socialSpecial" in body) patch.social_special = str(body.socialSpecial, 80)
  if ("onVideoText" in body) patch.on_video_text = str(body.onVideoText, 500)
  if ("onVideoConfig" in body && body.onVideoConfig && typeof body.onVideoConfig === "object") patch.on_video_config = body.onVideoConfig

  // Composer fields. Overlay text + audio are burned into the MP4; caption/hashtags are the IG
  // caption and never are. Assignment here only STAGES the value — whether it invalidates the
  // existing render is decided at the end by comparing against the stored row, not by the key
  // being present. See lib/social/renderInvalidation for why that distinction matters.
  if ("overlayHeadline" in body) patch.overlay_headline = str(body.overlayHeadline, 200)
  if ("overlaySubheadline" in body) patch.overlay_subheadline = str(body.overlaySubheadline, 200)
  // Overlay MODE ('generate' | 'existing') is a post-level override; switching it changes what the
  // renderer draws, so it invalidates any existing derivative.
  if ("overlayMode" in body && (body.overlayMode === "generate" || body.overlayMode === "existing")) patch.overlay_mode = body.overlayMode
  // Validated against the CANONICAL OVERLAY_TEMPLATES via isOverlayTemplate, never a
  // list kept here. This line previously tested a hard-coded Set of five keys that
  // was never updated as templates were added, so 11 of the 16 the editor offers —
  // including "market_type_centered" (2) and everything from "apartment_standards"
  // (7) on — were silently discarded: the PATCH returned 200, the headline saved,
  // and the template did not. Deriving the check from the single source of truth is
  // what stops a 17th template breaking the same way.
  if ("overlayTemplate" in body && isOverlayTemplate(body.overlayTemplate)) patch.overlay_template = body.overlayTemplate
  if ("audioChoice" in body && typeof body.audioChoice === "string" && AUDIO_CHOICES.has(body.audioChoice)) patch.audio_choice = body.audioChoice
  // Voice Clips (Hook = start, CTA = end). A uuid selects; null clears. Render-affecting.
  const VOICE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if ("voiceHookId" in body && (body.voiceHookId === null || (typeof body.voiceHookId === "string" && VOICE_UUID.test(body.voiceHookId)))) patch.voice_hook_id = body.voiceHookId
  if ("voiceCtaId" in body && (body.voiceCtaId === null || (typeof body.voiceCtaId === "string" && VOICE_UUID.test(body.voiceCtaId)))) patch.voice_cta_id = body.voiceCtaId

  // ── AI PRESENTER ──────────────────────────────────────────────────────────────────────────
  // OWNERSHIP IS RE-ESTABLISHED HERE, not trusted from the client. The editor only ever offers
  // presenters the list endpoint returned, but a PATCH is a plain HTTP request and can name any
  // uuid. So a supplied presenter_id is looked up through the CALLER'S RLS client: another agent's
  // presenter simply does not resolve, and the field is rejected rather than written.
  //
  // Every one of these is render-affecting and belongs inside the renderAffecting set, because a
  // finished render shows a specific avatar at a specific size for a specific duration.
  if ("presenterId" in body) {
    if (body.presenterId === null) {
      patch.presenter_id = null
      // Turning the feature off clears its whole configuration, so a later re-enable starts from
      // the product defaults rather than silently resurrecting old settings.
      patch.presenter_intro_seconds = null
      patch.presenter_side = null
      patch.presenter_width_px = null
      patch.presenter_audio_storage_path = null
    } else if (typeof body.presenterId === "string" && VOICE_UUID.test(body.presenterId)) {
      const { data: pres } = await supabase
        .from("social_presenters")
        .select("id, clip_storage_path, enabled")
        .eq("id", body.presenterId)
        .maybeSingle()
      if (!pres) return NextResponse.json({ error: "presenter_not_found" }, { status: 404 })
      if ((pres as { enabled?: boolean }).enabled === false) {
        return NextResponse.json({ error: "presenter_disabled" }, { status: 409 })
      }
      patch.presenter_id = body.presenterId
      // Cache the presenter's clip on the post so the renderer reads one row, and so changing the
      // presenter's clip later cannot silently alter an already-rendered post.
      patch.presenter_clip_storage_path = (pres as { clip_storage_path?: string | null }).clip_storage_path ?? null
    }
  }
  if ("presenterIntroSeconds" in body) {
    const v = body.presenterIntroSeconds
    patch.presenter_intro_seconds = typeof v === "number" && Number.isFinite(v)
      ? Math.min(5, Math.max(3, v))   // the DB CHECK enforces the same range; this avoids a 400
      : null
  }
  if ("presenterSide" in body) {
    patch.presenter_side = body.presenterSide === "right" ? "right" : null // null ⇒ the default (left)
  }
  if ("presenterWidthPx" in body) {
    const v = body.presenterWidthPx
    patch.presenter_width_px = typeof v === "number" && Number.isFinite(v)
      ? Math.round(Math.min(520, Math.max(240, v)))
      : null
  }
  // Narration: a Voice Clip id resolves to its storage path, which is then the ONE audio used for
  // both the HeyGen lip-sync and the final mix. Resolved server-side so a client cannot point the
  // renderer at an arbitrary storage key.
  if ("presenterVoiceClipId" in body) {
    if (body.presenterVoiceClipId === null || typeof body.presenterVoiceClipId !== "string") {
      patch.presenter_audio_storage_path = null
    } else if (VOICE_UUID.test(body.presenterVoiceClipId)) {
      const { data: clip } = await supabase
        .from("social_voice_clips").select("storage_path").eq("id", body.presenterVoiceClipId).maybeSingle()
      patch.presenter_audio_storage_path = (clip as { storage_path?: string | null } | null)?.storage_path ?? null
    }
  }

  // ── LIP-SYNC CLIP REUSE ───────────────────────────────────────────────────────────────────
  // THE BUG THIS BLOCK EXISTS TO PREVENT: presenter_clip_storage_path was only ever written when
  // the PRESENTER changed. Change the voice hook alone and the post kept the clip from the
  // previous hook — an avatar lip-synced to recording A speaking recording B. It renders cleanly,
  // publishes cleanly, and looks like a broken product.
  //
  // So whenever either half of the pair is touched, the clip is RECOMPUTED from the cache against
  // the EFFECTIVE presenter and the EFFECTIVE audio — patch value if this request set it, stored
  // value otherwise. resolvePresenterClip has no "keep what was there" branch, and this writes
  // whatever it returns, including the fallback.
  //
  // ADDITIVE: it only runs when presenterId or presenterVoiceClipId is in the body, and with an
  // empty cache it resolves to the presenter's own clip — byte-identical to the behaviour above.
  if (("presenterId" in body || "presenterVoiceClipId" in body) && patch.presenter_id !== null) {
    const effectivePresenterId = ("presenter_id" in patch
      ? (patch.presenter_id as string | null)
      : ((stored as { presenter_id?: string | null } | null)?.presenter_id ?? null))
    if (effectivePresenterId) {
      const effectiveAudio = ("presenter_audio_storage_path" in patch
        ? (patch.presenter_audio_storage_path as string | null)
        : ((stored as { presenter_audio_storage_path?: string | null } | null)?.presenter_audio_storage_path ?? null))

      const { data: presRow } = await supabase
        .from("social_presenters")
        .select("clip_storage_path")
        .eq("id", effectivePresenterId)
        .maybeSingle()
      const { data: clipRows } = await supabase
        .from("social_presenter_clips")
        .select("id, presenter_id, voice_clip_id, audio_storage_path, clip_storage_path, status")
        .eq("presenter_id", effectivePresenterId)

      const resolution = resolvePresenterClip({
        presenterClipStoragePath: (presRow as { clip_storage_path?: string | null } | null)?.clip_storage_path ?? null,
        selectedAudioStoragePath: effectiveAudio,
        rows: (clipRows ?? []).map((r) => {
          const x = r as Record<string, unknown>
          return {
            id: x.id as string,
            presenterId: (x.presenter_id as string | null) ?? null,
            voiceClipId: (x.voice_clip_id as string | null) ?? null,
            audioStoragePath: (x.audio_storage_path as string) ?? "",
            clipStoragePath: (x.clip_storage_path as string | null) ?? null,
            status: x.status as PresenterClipStatus,
          }
        }),
      })
      patch.presenter_clip_storage_path = resolution.clipStoragePath
    }
  }
  // ── REEL COVER ────────────────────────────────────────────────────────────────────────────
  // Which frame Instagram SHOWS, never what the MP4 contains — so these are deliberately set
  // OUTSIDE the renderAffecting block. Choosing a cover must not invalidate a finished render.
  if ("coverThumbOffsetMs" in body) {
    const v = body.coverThumbOffsetMs
    if (v === null) patch.cover_thumb_offset_ms = null
    else {
      const n = Math.round(Number(v))
      if (!Number.isFinite(n) || n < 0) return NextResponse.json({ error: "invalid coverThumbOffsetMs" }, { status: 400 })
      patch.cover_thumb_offset_ms = n
      // Stamp WHICH render this frame refers to, so a later re-render can be detected and warned
      // about rather than silently invalidating a deliberate choice.
      patch.cover_render_version = (stored?.render_version as number | null) ?? null
    }
    if (body.coverThumbOffsetMs === null) patch.cover_render_version = null
  }
  if ("coverStoragePath" in body) {
    const v = body.coverStoragePath
    if (v === null) patch.cover_storage_path = null
    else if (typeof v === "string" && v.trim()) patch.cover_storage_path = v.trim().slice(0, 400)
    else return NextResponse.json({ error: "invalid coverStoragePath" }, { status: 400 })
  }

  if ("hashtags" in body && Array.isArray(body.hashtags)) {
    // The cap is the PLATFORM's product rule, read from the one shared table. This used to be a
    // local `const MAX_HASHTAGS = 30` that shadowed the canonical export: the name made the line
    // look like it honoured the 5-tag rule while actually storing up to 30, and it was the real
    // ceiling on every stored post. Server-side enforcement matters because the editor's cap is
    // only a React render condition.
    const cap = hashtagLimitForPlatform((stored?.platform as string | null) ?? null)
    const seen = new Set<string>()
    const tags: string[] = []
    for (const raw of body.hashtags as unknown[]) {
      const t = typeof raw === "string" ? normalizeHashtag(raw) : ""
      if (!t || seen.has(t.toLowerCase())) continue
      seen.add(t.toLowerCase())
      tags.push(t)
      if (tags.length >= cap) break
    }
    patch.hashtags = tags
  }
  // ── THE SOURCE VIDEO OVERRIDE ─────────────────────────────────────────────────────────────
  // Lets one property/source record serve several creatives shot from different footage, without
  // duplicating the property metadata onto a second social_content row. Null clears it, falling
  // back to the property's own video.
  //
  // REFUSED OUTRIGHT ON A PUBLISHED POST. The database enforces this too (trigger
  // social_posts_freeze_published_source_trg), but failing here gives the operator an explanation
  // instead of a raw constraint violation. New footage on a published post means a new VARIATION
  // sharing the same source_content_id — the published row's artifact and external_post_id are a
  // historical record and must stay exactly as they went out.
  if ("sourceStoragePath" in body) {
    const v = body.sourceStoragePath
    const next = v === null ? null : str(v, 400)
    if (isPublished && valueChanged(stored?.source_storage_path, next)) {
      return NextResponse.json({
        error: "published_source_immutable",
        detail: "This post is already published, so its footage cannot be swapped.",
        hint: "Use Create Variation to build a new creative from the same property with the new video.",
      }, { status: 409 })
    }
    patch.source_storage_path = next
  }

  // ── RENDER INVALIDATION — CHANGE-BASED, NOT KEY-PRESENCE-BASED ────────────────────────────
  // The editor posts every composer field on every save, so "the key is present" was true for a
  // schedule-only or caption-only edit and silently threw away a valid MP4. Compare what is about
  // to be written against what is stored, and invalidate only on a real difference.
  const changed = renderAffectingChanges(stored, patch)
  if (changed.length > 0) {
    patch.render_status = "none"
    patch.render_error = null
    // A changed creative un-approves itself. Approval is of a SPECIFIC rendered video, so letting
    // it survive an edit would leave a post looking signed-off that nobody has actually reviewed —
    // the precise failure the approval flag exists to prevent. (The database enforces the same
    // thing on re-render; this covers the edit that precedes it.)
    patch.approved_at = null
  }

  // ── APPROVAL — "this content is verified and ready to go out" ─────────────────────────────
  // Explicit and human. Deliberately NOT inferred from a render succeeding: most rendered posts
  // here are test renders whose pricing/specials/amenities/notes have not been checked, and
  // treating an artifact as a sign-off is what wrongly promoted them to production inventory.
  //
  // Applied AFTER the invalidation block so that approving and editing in the same request cannot
  // approve a creative that this very request changed.
  let approvedNow = false
  if ("approved" in body) {
    if (body.approved === true) {
      const willHaveRender = patch.render_status === undefined
        ? stored?.render_status === "ready" && !!stored?.rendered_storage_path
        : false
      if (!willHaveRender) {
        return NextResponse.json({
          error: "nothing_to_approve",
          detail: "This post has no current rendered video to approve.",
          hint: "Render it first, then mark it ready.",
        }, { status: 409 })
      }
      patch.approved_at = new Date().toISOString()
      approvedNow = true
    } else if (body.approved === false) {
      patch.approved_at = null
    }
  }

  const intent = typeof body.intent === "string" ? body.intent : null
  // EXPLICIT SAVE DRAFT — the ONLY thing that stamps draft_saved_at, which drives the green DRAFT
  // badge. Not scheduling (that has its own SCHEDULED state), not rendering, publishing, approving
  // or autopilot writes: status='draft' is auto-assigned at creation and updated_at is bumped by
  // background work, so neither can express "the operator actually set this up".
  if (intent === "save_draft") patch.draft_saved_at = new Date().toISOString()
  if (intent === "schedule") {
    const raw = typeof body.scheduledAt === "string" ? body.scheduledAt : ""
    const when = raw ? new Date(raw) : null
    if (!when || isNaN(when.getTime())) return NextResponse.json({ error: "valid scheduledAt required" }, { status: 400 })
    // ── APPROVAL GATE ───────────────────────────────────────────────────────────────────────
    // Scheduling is the real entrance to publishing: the cron worker takes anything that is
    // status='scheduled' and due. This was the live hole — an operator could schedule a post the
    // library itself labels "RENDERED · NOT APPROVED" and it would go out.
    //
    // Read fresh rather than trusting `existing`, because approval may have been revoked by a
    // re-render since this request began.
    const { data: appr } = await supabase.from("social_posts").select("approved_at").eq("id", id).maybeSingle()
    if (!(appr as { approved_at?: string | null } | null)?.approved_at) {
      return NextResponse.json({
        error: "not_approved",
        detail: "This post has not been approved. Approve it before scheduling.",
      }, { status: 409 })
    }
    patch.scheduled_at = when.toISOString()
    patch.status = "scheduled"
  } else if (intent === "unschedule") {
    patch.scheduled_at = null
    patch.status = "draft"
  } else if (intent === "clear_review") {
    // "I looked at it and it is fine." The post is otherwise untouched — same status, same slot,
    // same render — so reviewing something can never move a schedule.
    patch.needs_review_at = null
    patch.needs_review_reason = null
  } else if ("scheduledAt" in body) {
    const raw = typeof body.scheduledAt === "string" ? body.scheduledAt : ""
    if (raw) {
      const when = new Date(raw)
      if (isNaN(when.getTime())) return NextResponse.json({ error: "invalid scheduledAt" }, { status: 400 })
      // Same gate as intent:"schedule". This bare path sets a date WITHOUT touching status, so on
      // its own it cannot publish anything — but a post already at status='scheduled' would have
      // its slot moved, and gating both keeps "a date is only ever set on an approved post" true
      // without anyone having to reason about which path they took.
      const { data: appr } = await supabase.from("social_posts").select("approved_at").eq("id", id).maybeSingle()
      if (!(appr as { approved_at?: string | null } | null)?.approved_at) {
        return NextResponse.json({ error: "not_approved", detail: "This post has not been approved." }, { status: 409 })
      }
      patch.scheduled_at = when.toISOString()
    } else patch.scheduled_at = null   // UNSCHEDULING is always allowed — it only ever removes risk
  }

  const { data, error } = await supabase.from("social_posts").update(patch).eq("id", id).select("id, status, scheduled_at, render_status").maybeSingle()
  if (error) return NextResponse.json({ error: "update_failed" }, { status: 500 })
  if (!data) return NextResponse.json({ error: "not_found" }, { status: 404 })
  const out = data as { id: string; status: string; scheduled_at: string | null; render_status: string }

  // ── COMPANION STORY ───────────────────────────────────────────────────────────────────────
  // Approving a Reel creates its companion Story, unscheduled. It is released 45 minutes after the
  // Reel actually publishes, by releaseStoryForReel — never from here.
  //
  // Deliberately after the main update and deliberately non-fatal: a missing companion is a
  // degraded feature, whereas failing the response would undo the approval the operator just made,
  // which is the more important act. The outcome is returned so the UI can say what happened.
  let companion: { created: boolean; reason?: string; storyId?: string } | undefined
  if (approvedNow) {
    try {
      const r = await ensureStoryCompanion(supabase as never, id)
      companion = r.created ? { created: true, storyId: r.storyId } : { created: false, reason: r.reason, storyId: r.storyId }
    } catch {
      companion = { created: false, reason: "companion_error" }
    }
  }
  return NextResponse.json({ id: out.id, status: out.status, scheduledAt: out.scheduled_at, renderStatus: out.render_status, ...(companion ? { companionStory: companion } : {}) })
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
