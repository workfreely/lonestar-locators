// ONE render implementation, used by BOTH the interactive admin route and the queue worker.
//
// It was extracted from app/api/admin/social-autopilot/posts/[id]/render/route.ts rather than
// reimplemented, because a second renderer is exactly how this project has drifted before: two
// overlay paths once disagreed for a whole release. The route is now a thin wrapper over this.
//
// NOTHING ABOUT THE RENDER CHANGED. Same renderReel, same template resolution, same voice-clip
// handling, same storage path, same post-state transitions, same platform pass-through.
import { promises as fs } from "node:fs"
import path from "node:path"
import ffmpegPath from "ffmpeg-static"
import { renderReel, makeWorkDir, type AudioChoice } from "@/lib/social/renderVideo"
import { DESTINATIONS, isSocialDestination, destinationFromLegacyPlatform } from "@/lib/social/destinations"
import { RENDERER_VERSION, renderFingerprint, type RenderSpec } from "@/lib/social/renderSpec"
// ONE overlay font: Libre Baskerville Bold (OFL, wght 700), headline AND detail. The same bytes
// the browser preview loads via @font-face, so preview and burned-in render measure identically.
// Moved here verbatim with the render body — not re-pointed, not re-chosen.
const OVERLAY_FONT_PATH = path.join(process.cwd(), "assets/social/fonts/LibreBaskerville-Head.ttf")

const extOf = (p: string) => (p.split(".").pop() || "mp4").toLowerCase().replace(/[^a-z0-9]/g, "") || "mp4"

// Imported AND re-exported: a bare `export { x } from` does not bind the name locally, and this
// module calls it too. Existing importers of renderPost keep working unchanged.
import { resolveSourcePath } from "./sourcePath"
export { resolveSourcePath }

export type RenderPostResult =
  | { ok: true; renderVersion: number; outputPath: string; platform: string; destination: string; safeAreaId: string; fingerprint: string }
  | { ok: false; code: string; message: string }

/**
 * THE LAST MILE, and the reason the spec exists: this function queries NOTHING.
 *
 * Everything that can change the output arrives in `spec`. The only other thing it touches is
 * the map from a spec's storage paths to the local files a caller already downloaded — a
 * lookup, not a source of new inputs. So an input that is absent from the spec cannot reach
 * ffmpeg, which is what makes renderFingerprint(spec) an honest content address rather than a
 * hash of whichever fields somebody remembered to include.
 *
 * renderSpec.test.ts asserts this body contains no query, no storage call and no fetch.
 */
export async function renderFromSpec(
  ffmpeg: string,
  spec: RenderSpec,
  deps: {
    /** Local file already downloaded for a storage path in the spec. */
    localFor: (storagePath: string) => string
    fontPath: string
    workDir: string
    outputPath: string
  },
): Promise<void> {
  const at = (p: string | null) => (p ? deps.localFor(p) : null)
  await renderReel(ffmpeg, {
    sourcePath: deps.localFor(spec.media.source),
    outputPath: deps.outputPath,
    fontPath: deps.fontPath,
    template: spec.template,
    headline: spec.headline,
    subheadline: spec.subheadline,
    audioChoice: spec.audioChoice,
    platform: spec.safeAreaId,
    workDir: deps.workDir,
    hookPath: at(spec.media.hook),
    ctaPath: at(spec.media.cta),
    presenterPath: at(spec.media.presenter),
    presenterCtaPath: at(spec.media.presenterCta),
    presenterIntroSeconds: spec.presenterIntroSeconds,
    presenterSide: spec.presenterSide,
    presenterWidthPx: spec.presenterWidthPx,
  })
}

/** Render one post and write the artifact + post state. `supabase` must be privileged enough to
 *  write social_posts — an RLS-denied update here would look like a successful render. */
export async function renderPostToStorage(args: {
  supabase: SupabaseLike
  id: string
  userId: string
}): Promise<RenderPostResult> {
  const { supabase, id, userId } = args
  const { data: post, error: readErr } = await supabase
    .from("social_posts")
    .select("id, platform, destination, source_content_id, source_storage_path, overlay_headline, overlay_subheadline, overlay_mode, overlay_template, audio_choice, voice_hook_id, voice_cta_id, render_version, presenter_id, presenter_intro_seconds, presenter_clip_storage_path, presenter_cta_clip_storage_path, presenter_audio_storage_path, presenter_side, presenter_width_px, source:source_content_id(storage_path)")
    .eq("id", id)
    .maybeSingle()
  if (readErr) return { ok: false as const, code: "read_failed", message: readErr.message }
  if (!post) return { ok: false as const, code: "not_found", message: "post not found" }
  const p = post as Record<string, unknown>
  const source = (p.source ?? null) as { storage_path?: string } | null
  // THE POST'S OWN FOOTAGE WINS, when it has any.
  //
  // social_content carries both the property facts and a source video. A post that needs different
  // footage for the same property sets source_storage_path on ITSELF rather than forcing a second
  // content row — which would be a second, independently-editable copy of the property data (two
  // such pairs already exist in this database and have drifted to different prices).
  //
  // Resolution is deliberately "override ?? content", never a merge: the override is the whole
  // answer when present, so a post renders from exactly one file and there is no case where part
  // of the video comes from one place and part from another.
  const sourcePath = resolveSourcePath(p.source_storage_path as string | null, source?.storage_path ?? null)
  const contentId = p.source_content_id as string | null
  if (!sourcePath || !contentId) return { ok: false as const, code: "missing_source", message: "the post has no source video" }
  if (!ffmpegPath) return { ok: false as const, code: "renderer_unavailable", message: "ffmpeg is not available in this runtime" }

  await supabase.from("social_posts").update({ render_status: "rendering", render_error: null, updated_at: new Date().toISOString() }).eq("id", id)

  const work = await makeWorkDir()
  // WHERE EACH SPEC PATH LANDED. The spec names inputs by immutable storage path; the renderer
  // needs the local file. This map is the only bridge between them, and it is populated at the
  // moment of download, so a file that was never fetched cannot be handed to ffmpeg.
  const localByStorage = new Map<string, string>()
  try {
    // Download the immutable source via a short-lived signed URL (never made public).
    const { data: signed, error: signErr } = await supabase.storage.from("social-media").createSignedUrl(sourcePath, 600)
    if (signErr || !signed?.signedUrl) throw new Error("source signed url failed")
    const res = await fetch(signed.signedUrl)
    if (!res.ok) throw new Error(`source fetch ${res.status}`)
    const srcLocal = path.join(work, `source.${extOf(sourcePath)}`)
    await fs.writeFile(srcLocal, Buffer.from(await res.arrayBuffer()))
    localByStorage.set(sourcePath, srcLocal)

    // VOICE CLIPS — resolve the selected Hook/CTA to their private storage paths and download them
    // into the SAME work dir, using the same signed-URL pattern as the source. The renderer then adds
    // them as extra ffmpeg inputs and ducks the music bed while each one plays. A selected clip that
    // cannot be resolved or fetched FAILS the render: silently rendering without the locator's voice
    // would ship a different video than they asked for.
    // Returns the STORAGE path it chose as well as the local file. The choice between the
    // normalised derivative and the original changes the mix, so it is part of what identifies
    // this render and has to reach the spec — not just the temp filename it landed in.
    const voiceLocal = async (clipId: string | null, role: "Hook" | "CTA"): Promise<{ storagePath: string; local: string } | null> => {
      if (!clipId) return null
      const { data: clip } = await supabase.from("social_voice_clips")
        .select("storage_path, normalized_storage_path").eq("id", clipId).maybeSingle()
      const row = clip as { storage_path?: string; normalized_storage_path?: string } | null
      // ── THE NORMALISED DERIVATIVE WHEN THERE IS ONE ──────────────────────────────────────
      // The originals span 8.3 dB (−16.7 to −25.1 LUFS) while the property footage spans 3.3
      // (−15.5 to −18.8), so a quiet recording arrives BELOW the bed it is meant to speak over
      // and a 14 dB duck cannot rescue it. Measured on real footage with a hook and a CTA: the
      // originals put the voice 2.2 dB UNDER the music passage; the −16 LUFS derivatives put it
      // 2.5 dB over, and within 0.4 dB of each other across quiet, average and loud clips.
      //
      // The ORIGINAL is never touched — it stays at storage_path and is still what the library
      // uploaded. A clip imported before normalisation, or one whose derivative failed, falls
      // back to it rather than failing the render.
      const clipPath = row?.normalized_storage_path || row?.storage_path
      if (!clipPath) throw new Error(`voice clips: the selected ${role} clip no longer exists`)
      const { data: clipSigned, error: clipErr } = await supabase.storage.from("social-media").createSignedUrl(clipPath, 600)
      if (clipErr || !clipSigned?.signedUrl) throw new Error(`voice clips: could not read the selected ${role} clip`)
      const clipRes = await fetch(clipSigned.signedUrl)
      if (!clipRes.ok) throw new Error(`voice clips: the selected ${role} clip failed to download (${clipRes.status})`)
      const local = path.join(work, `voice-${role.toLowerCase()}.${extOf(clipPath)}`)
      await fs.writeFile(local, Buffer.from(await clipRes.arrayBuffer()))
      localByStorage.set(clipPath, local)
      return { storagePath: clipPath, local }
    }
    // 'existing' mode draws no overlay, but it is still the locator's post — voice clips apply there too.
    const hookClip = await voiceLocal((p.voice_hook_id as string | null) ?? null, "Hook")
    const ctaClip = await voiceLocal((p.voice_cta_id as string | null) ?? null, "CTA")

    // ── AI PRESENTER ──────────────────────────────────────────────────────────────────────────
    // Entirely opt-in: no presenter_id ⇒ nothing below runs and the render is exactly what it was.
    //
    // Downloading by storage path, the same read-only signed-URL pattern as the source and voice
    // clips. The presenter clip is a DERIVATIVE under presenters/ — no source.* key is read here,
    // and nothing is uploaded.
    let presenterStorage: string | null = null
    let presenterCtaStorage: string | null = null
    let presenterAudioStorage: string | null = null
    /** Both avatar clips arrive the same way, so the download is written once. */
    const avatarLocal = async (clipPath: string | null, role: "presenter" | "presenter-cta"): Promise<string | null> => {
      if (!clipPath) return null
      const { data: sg, error: sgErr } = await supabase.storage.from("social-media").createSignedUrl(clipPath, 600)
      if (sgErr || !sg?.signedUrl) throw new Error("AI Presenter: could not read the avatar clip")
      const r = await fetch(sg.signedUrl)
      if (!r.ok) throw new Error(`AI Presenter: the avatar clip failed to download (${r.status})`)
      const local = path.join(work, `${role}.${extOf(clipPath)}`)
      await fs.writeFile(local, Buffer.from(await r.arrayBuffer()))
      localByStorage.set(clipPath, local)
      return local
    }
    if (p.presenter_id) {
      const presenterPath = (p.presenter_clip_storage_path as string | null) ?? null
      if (await avatarLocal(presenterPath, "presenter")) presenterStorage = presenterPath
      // ── THE CTA AVATAR IS WRITTEN ONLY ON A VERIFIED MATCH ────────────────────────────────
      // presenter_cta_clip_storage_path is set by the editor's save path ONLY when a clip
      // lip-synced to the selected CTA exists (see the posts route). So there is no fallback to
      // decide here: a null means no avatar during the CTA, which is the audio-only behaviour this
      // feature started from. The alternative — showing the intro clip again — would put the
      // hook's mouth on the CTA's words for five seconds at the end of every video.
      const presenterCtaPath = (p.presenter_cta_clip_storage_path as string | null) ?? null
      if (await avatarLocal(presenterCtaPath, "presenter-cta")) presenterCtaStorage = presenterCtaPath
      const audioPath = (p.presenter_audio_storage_path as string | null) ?? null
      if (audioPath) {
        const { data: ag, error: agErr } = await supabase.storage.from("social-media").createSignedUrl(audioPath, 600)
        if (agErr || !ag?.signedUrl) throw new Error("AI Presenter: could not read the presenter audio")
        const ar = await fetch(ag.signedUrl)
        if (!ar.ok) throw new Error(`AI Presenter: the presenter audio failed to download (${ar.status})`)
        const presenterAudioLocal = path.join(work, `presenter-audio.${extOf(audioPath)}`)
        await fs.writeFile(presenterAudioLocal, Buffer.from(await ar.arrayBuffer()))
        localByStorage.set(audioPath, presenterAudioLocal)
        presenterAudioStorage = audioPath
      }
    }
    // ONE audio file drives both the avatar's lip-sync and the final mix. It rides the EXISTING
    // Voice Clip hook path — same ducking, same timing, already tested — rather than introducing a
    // second audio chain that could drift out of sync with the mouth. An explicitly chosen Hook
    // still wins: the operator's selection is never silently replaced.
    const effectiveHook = hookClip?.storagePath ?? presenterAudioStorage

    const outLocal = path.join(work, "out.mp4")
    // 'existing' mode = the uploaded video already has burned-in text: draw NO Beast Social overlay
    // (empty headline/subheadline → no drawtext) and keep the original audio. 'generate' = the
    // normal Template 1 overlay. Either way the derivative is a 9:16 mp4 (source is never modified).
    const destination = isSocialDestination(p.destination) ? p.destination : destinationFromLegacyPlatform(p.platform as string | null)
    const safeAreaId = DESTINATIONS[destination].safeAreaId
    const existingText = (p.overlay_mode as string) === "existing"

    // THE SPEC. Every value that reaches ffmpeg is decided here and nowhere else, including the
    // 'existing' overrides — a post whose footage already carries burned-in text draws no
    // overlay and keeps its original audio, and that is a property of the RENDER, so it belongs
    // in the thing that describes the render rather than being applied further down.
    const spec: RenderSpec = {
      rendererVersion: RENDERER_VERSION,
      // THE DESTINATION'S GEOMETRY, not the bare platform. An Instagram Reel and an Instagram
      // Story share a provider but not necessarily a safe area, so passing "instagram" for both
      // would fit a Story headline into the Reel box and leave it under the Story reply bar. The
      // layout engine takes a safe-area id; the destination is what resolves it.
      safeAreaId,
      template: existingText ? "market_type" : ((p.overlay_template as string | null) ?? "market_type"),
      headline: existingText ? "" : ((p.overlay_headline as string | null) ?? ""),
      subheadline: existingText ? "" : ((p.overlay_subheadline as string | null) ?? ""),
      audioChoice: existingText ? "original" : (((p.audio_choice as string) || "original") as AudioChoice),
      media: {
        source: sourcePath,
        hook: effectiveHook,
        cta: ctaClip?.storagePath ?? null,
        presenter: presenterStorage,
        presenterCta: presenterCtaStorage,
      },
      presenterIntroSeconds: typeof p.presenter_intro_seconds === "number" ? p.presenter_intro_seconds : null,
      presenterSide: (p.presenter_side as string | null) ?? null,
      presenterWidthPx: typeof p.presenter_width_px === "number" ? p.presenter_width_px : null,
    }
    const fingerprint = renderFingerprint(spec)

    await renderFromSpec(ffmpegPath as unknown as string, spec, {
      // A spec path with no downloaded file is a bug in THIS function, not a missing asset —
      // every path in the spec was put there by a download above. Throwing names which one.
      localFor: (storagePath: string) => {
        const local = localByStorage.get(storagePath)
        if (!local) throw new Error(`render spec references a file that was never downloaded: ${storagePath}`)
        return local
      },
      fontPath: OVERLAY_FONT_PATH,
      workDir: work,
      outputPath: outLocal,
    })

    const nextVersion = (typeof p.render_version === "number" ? p.render_version : 0) + 1
    // The path carries the SAFE-AREA id so two destinations of one post cannot overwrite each
    // other's artifact. Reel keeps the historic un-suffixed shape, so every render already in
    // storage keeps its exact path and nothing moves.
    const suffix = safeAreaId === "instagram" ? "" : `-${safeAreaId}`
    const derivativePath = `${userId}/${contentId}/renders/${id}-${nextVersion}${suffix}.mp4`
    const bytes = await fs.readFile(outLocal)
    const up = await supabase.storage.from("social-media").upload(derivativePath, bytes, { contentType: "video/mp4", upsert: true })
    if (up.error) throw new Error(`upload: ${up.error.message}`)

    // ── THE ARTIFACT BECOMES A ROW ──────────────────────────────────────────────────────────
    // Phase B. A MIRROR, not a replacement: rendered_storage_path below is still what every
    // publisher, planner and screen reads, and nothing reads render_id yet.
    //
    // NON-FATAL BY CONSTRUCTION. A render that produced a real MP4 and wrote it to storage has
    // succeeded; failing it because a bookkeeping row did not land would make this phase a
    // reliability regression in exchange for nothing. On failure render_id stays null and the
    // post is exactly what it would have been before Phase B.
    const renderId = await recordRender(supabase, {
      ownerUserId: userId,
      contentId,
      storagePath: derivativePath,
      safeAreaId,
      fingerprint,
      spec,
    })

    await supabase
      .from("social_posts")
      // A finished render rebuilds the overlay from the CURRENT source data, which is exactly what a
      // review asks for — so the flag clears itself here rather than needing a second manual step.
      .update({ render_status: "ready", rendered_storage_path: derivativePath, render_version: nextVersion, render_error: null, needs_review_at: null, needs_review_reason: null, render_id: renderId, updated_at: new Date().toISOString() })
      .eq("id", id)

    // ── THE READY TRANSITION ────────────────────────────────────────────────────────────────
    // render_status and status are DIFFERENT axes and stay that way: render_status describes the
    // MP4, status describes where the post is in its lifecycle. A finished render makes a post
    // publishable, so a DRAFT becomes 'ready' — which is exactly what the manual publish route has
    // always claimed on, and what nothing ever wrote.
    //
    // A SCHEDULED post is deliberately left alone. Its eligibility is (scheduled + due +
    // render_status='ready'), evaluated by the worker at its scheduled time; promoting it to
    // 'ready' here would drop its scheduled_at out of the worker's selection and publish it the
    // moment it finished rendering. Rendering must never cause publication.
    //
    // Guarded on status='draft' so a re-render of a published/publishing/needs_attention post
    // cannot walk it backwards into a publishable state.
    await supabase
      .from("social_posts")
      .update({ status: "ready", updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("status", "draft")

    return { ok: true as const, renderVersion: nextVersion, outputPath: derivativePath, platform: (p.platform as string | null) ?? "instagram", destination, safeAreaId, fingerprint }
  } catch (e) {
    const message = e instanceof Error ? e.message.slice(0, 400) : "render error"
    await supabase.from("social_posts").update({ render_status: "error", render_error: message, updated_at: new Date().toISOString() }).eq("id", id)
    return { ok: false as const, code: "render_failed", message }
  } finally {
    await fs.rm(work, { recursive: true, force: true }).catch(() => {})
  }
}

/**
 * Record a finished artifact as a social_renders row and return its id, or null.
 *
 * ── WHY IT CAN RETURN NULL ────────────────────────────────────────────────────────────────
 * Every failure here is swallowed on purpose. The artifact exists, it is in storage, and the
 * post is about to point at it by path exactly as it always has. A row in a table nothing reads
 * yet is not worth failing a render over, and throwing would send a successful render down the
 * catch branch and mark it render_status='error' — turning a bookkeeping problem into a lost
 * video. renderSpec.test.ts asserts this stays non-fatal.
 *
 * ── WHY identity_state IS NEVER 'clean' ───────────────────────────────────────────────────
 * An absent presenter and absent voice clips prove only that the RENDERER added no identity.
 * They say nothing about whether the operator is on camera in the source footage — measured on
 * this database, every post built from the operator's own Personal videos has all three fields
 * null. 'clean' requires a person certifying the source, which arrives in a later phase. Until
 * then the honest answer is 'unknown'.
 */
async function recordRender(
  supabase: SupabaseLike,
  r: { ownerUserId: string; contentId: string; storagePath: string; safeAreaId: string; fingerprint: string; spec: RenderSpec },
): Promise<string | null> {
  const carriesIdentity = Boolean(r.spec.media.presenter || r.spec.media.presenterCta || r.spec.media.hook || r.spec.media.cta)
  try {
    const { data, error } = await supabase
      .from("social_renders")
      .upsert(
        {
          owner_user_id: r.ownerUserId,
          source_content_id: r.contentId,
          storage_path: r.storagePath,
          safe_area_id: r.safeAreaId,
          fingerprint: r.fingerprint,
          renderer_version: r.spec.rendererVersion,
          spec: r.spec,
          identity_state: carriesIdentity ? "owned" : "unknown",
          identity_owner_user_id: carriesIdentity ? r.ownerUserId : null,
        },
        // A re-render writes a new version to a new path, so a conflict here means the same
        // artifact was recorded before — update it rather than erroring on the unique index.
        { onConflict: "storage_path" },
      )
      .select("id")
      .maybeSingle()
    if (error || !data) return null
    return (data as { id: string }).id
  } catch {
    return null
  }
}

/** Minimal shape of the client this module needs, so callers can pass either the RLS server client
 *  or the service-role admin client without this file importing either. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SupabaseLike = any
