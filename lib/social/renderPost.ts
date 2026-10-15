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
  | { ok: true; renderVersion: number; outputPath: string; platform: string; destination: string; safeAreaId: string }
  | { ok: false; code: string; message: string }

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
    .select("id, platform, destination, source_content_id, source_storage_path, overlay_headline, overlay_subheadline, overlay_mode, overlay_template, audio_choice, voice_hook_id, voice_cta_id, render_version, presenter_id, presenter_intro_seconds, presenter_clip_storage_path, presenter_audio_storage_path, presenter_side, presenter_width_px, source:source_content_id(storage_path)")
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
  try {
    // Download the immutable source via a short-lived signed URL (never made public).
    const { data: signed, error: signErr } = await supabase.storage.from("social-media").createSignedUrl(sourcePath, 600)
    if (signErr || !signed?.signedUrl) throw new Error("source signed url failed")
    const res = await fetch(signed.signedUrl)
    if (!res.ok) throw new Error(`source fetch ${res.status}`)
    const srcLocal = path.join(work, `source.${extOf(sourcePath)}`)
    await fs.writeFile(srcLocal, Buffer.from(await res.arrayBuffer()))

    // VOICE CLIPS — resolve the selected Hook/CTA to their private storage paths and download them
    // into the SAME work dir, using the same signed-URL pattern as the source. The renderer then adds
    // them as extra ffmpeg inputs and ducks the music bed while each one plays. A selected clip that
    // cannot be resolved or fetched FAILS the render: silently rendering without the locator's voice
    // would ship a different video than they asked for.
    const voiceLocal = async (clipId: string | null, role: "Hook" | "CTA"): Promise<string | null> => {
      if (!clipId) return null
      const { data: clip } = await supabase.from("social_voice_clips").select("storage_path").eq("id", clipId).maybeSingle()
      const clipPath = (clip as { storage_path?: string } | null)?.storage_path
      if (!clipPath) throw new Error(`voice clips: the selected ${role} clip no longer exists`)
      const { data: clipSigned, error: clipErr } = await supabase.storage.from("social-media").createSignedUrl(clipPath, 600)
      if (clipErr || !clipSigned?.signedUrl) throw new Error(`voice clips: could not read the selected ${role} clip`)
      const clipRes = await fetch(clipSigned.signedUrl)
      if (!clipRes.ok) throw new Error(`voice clips: the selected ${role} clip failed to download (${clipRes.status})`)
      const local = path.join(work, `voice-${role.toLowerCase()}.${extOf(clipPath)}`)
      await fs.writeFile(local, Buffer.from(await clipRes.arrayBuffer()))
      return local
    }
    // 'existing' mode draws no overlay, but it is still the locator's post — voice clips apply there too.
    const hookLocal = await voiceLocal((p.voice_hook_id as string | null) ?? null, "Hook")
    const ctaLocal = await voiceLocal((p.voice_cta_id as string | null) ?? null, "CTA")

    // ── AI PRESENTER ──────────────────────────────────────────────────────────────────────────
    // Entirely opt-in: no presenter_id ⇒ nothing below runs and the render is exactly what it was.
    //
    // Downloading by storage path, the same read-only signed-URL pattern as the source and voice
    // clips. The presenter clip is a DERIVATIVE under presenters/ — no source.* key is read here,
    // and nothing is uploaded.
    let presenterLocal: string | null = null
    let presenterAudioLocal: string | null = null
    if (p.presenter_id) {
      const clipPath = (p.presenter_clip_storage_path as string | null) ?? null
      if (clipPath) {
        const { data: sg, error: sgErr } = await supabase.storage.from("social-media").createSignedUrl(clipPath, 600)
        if (sgErr || !sg?.signedUrl) throw new Error("AI Presenter: could not read the avatar clip")
        const r = await fetch(sg.signedUrl)
        if (!r.ok) throw new Error(`AI Presenter: the avatar clip failed to download (${r.status})`)
        presenterLocal = path.join(work, `presenter.${extOf(clipPath)}`)
        await fs.writeFile(presenterLocal, Buffer.from(await r.arrayBuffer()))
      }
      const audioPath = (p.presenter_audio_storage_path as string | null) ?? null
      if (audioPath) {
        const { data: ag, error: agErr } = await supabase.storage.from("social-media").createSignedUrl(audioPath, 600)
        if (agErr || !ag?.signedUrl) throw new Error("AI Presenter: could not read the presenter audio")
        const ar = await fetch(ag.signedUrl)
        if (!ar.ok) throw new Error(`AI Presenter: the presenter audio failed to download (${ar.status})`)
        presenterAudioLocal = path.join(work, `presenter-audio.${extOf(audioPath)}`)
        await fs.writeFile(presenterAudioLocal, Buffer.from(await ar.arrayBuffer()))
      }
    }
    // ONE audio file drives both the avatar's lip-sync and the final mix. It rides the EXISTING
    // Voice Clip hook path — same ducking, same timing, already tested — rather than introducing a
    // second audio chain that could drift out of sync with the mouth. An explicitly chosen Hook
    // still wins: the operator's selection is never silently replaced.
    const effectiveHook = hookLocal ?? presenterAudioLocal

    const outLocal = path.join(work, "out.mp4")
    // 'existing' mode = the uploaded video already has burned-in text: draw NO Beast Social overlay
    // (empty headline/subheadline → no drawtext) and keep the original audio. 'generate' = the
    // normal Template 1 overlay. Either way the derivative is a 9:16 mp4 (source is never modified).
    const destination = isSocialDestination(p.destination) ? p.destination : destinationFromLegacyPlatform(p.platform as string | null)
    const safeAreaId = DESTINATIONS[destination].safeAreaId
    const existingText = (p.overlay_mode as string) === "existing"
    await renderReel(ffmpegPath as unknown as string, {
      sourcePath: srcLocal,
      outputPath: outLocal,
      fontPath: OVERLAY_FONT_PATH,
      template: existingText ? "market_type" : ((p.overlay_template as string | null) ?? "market_type"),
      headline: existingText ? "" : ((p.overlay_headline as string | null) ?? ""),
      subheadline: existingText ? "" : ((p.overlay_subheadline as string | null) ?? ""),
      audioChoice: existingText ? "original" : (((p.audio_choice as string) || "original") as AudioChoice),
        // THE DESTINATION'S GEOMETRY, not the bare platform. An Instagram Reel and an Instagram
        // Story share a provider but not a safe area, so passing "instagram" for both would fit a
        // Story headline into the Reel box and leave it under the Story reply bar. The layout
        // engine takes a safe-area id; the destination is what resolves it.
        platform: safeAreaId,
      workDir: work,
      hookPath: effectiveHook,
      ctaPath: ctaLocal,
      presenterPath: presenterLocal,
      presenterIntroSeconds: typeof p.presenter_intro_seconds === "number" ? p.presenter_intro_seconds : null,
      presenterSide: (p.presenter_side as string | null) ?? null,
      presenterWidthPx: typeof p.presenter_width_px === "number" ? p.presenter_width_px : null,
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

    await supabase
      .from("social_posts")
      // A finished render rebuilds the overlay from the CURRENT source data, which is exactly what a
      // review asks for — so the flag clears itself here rather than needing a second manual step.
      .update({ render_status: "ready", rendered_storage_path: derivativePath, render_version: nextVersion, render_error: null, needs_review_at: null, needs_review_reason: null, updated_at: new Date().toISOString() })
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

    return { ok: true as const, renderVersion: nextVersion, outputPath: derivativePath, platform: (p.platform as string | null) ?? "instagram", destination, safeAreaId }
  } catch (e) {
    const message = e instanceof Error ? e.message.slice(0, 400) : "render error"
    await supabase.from("social_posts").update({ render_status: "error", render_error: message, updated_at: new Date().toISOString() }).eq("id", id)
    return { ok: false as const, code: "render_failed", message }
  } finally {
    await fs.rm(work, { recursive: true, force: true }).catch(() => {})
  }
}

/** Minimal shape of the client this module needs, so callers can pass either the RLS server client
 *  or the service-role admin client without this file importing either. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SupabaseLike = any
