export const runtime = "nodejs"
export const maxDuration = 300 // FFmpeg render window (Vercel Fluid / Pro)

import { NextResponse, type NextRequest } from "next/server"
import { promises as fs } from "node:fs"
import path from "node:path"
import ffmpegPath from "ffmpeg-static"
import { requirePlatformAdmin } from "@/lib/auth/requirePlatformAdmin"
import { renderReel, makeWorkDir, type AudioChoice } from "@/lib/social/renderVideo"

// POST /posts/[id]/render — produce the 9:16 rendered derivative (overlay burned in + audio
// choice) from the IMMUTABLE source. Platform-admin + RLS. The source object is never
// modified; the derivative gets its OWN path {owner}/{contentId}/renders/{postId}-{v}.mp4 in
// the same private bucket. NO Instagram publishing here. Runs the render synchronously and
// returns the final status (short Reels complete well within maxDuration).
// Active overlay fonts: HEADLINES are Libre Baskerville Bold (OFL, wght 700); DETAIL is unchanged —
// Bodoni Moda's text cut. Both files are the same bytes the browser preview loads via @font-face in
// globals.css, so preview and burned-in render measure identically.
const HEAD_FONT_PATH = path.join(process.cwd(), "assets/social/fonts/LibreBaskerville-Head.ttf")
const DETAIL_FONT_PATH = path.join(process.cwd(), "assets/social/fonts/BodoniModa-Detail.ttf")
const extOf = (p: string) => (p.split(".").pop() || "mp4").toLowerCase().replace(/[^a-z0-9]/g, "") || "mp4"

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requirePlatformAdmin()
  if (!guard.ok) return guard.response
  const { supabase, userId } = guard

  const { id } = await ctx.params
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 })

  const { data: post, error: readErr } = await supabase
    .from("social_posts")
    .select("id, source_content_id, overlay_headline, overlay_subheadline, overlay_mode, overlay_template, audio_choice, voice_hook_id, voice_cta_id, render_version, source:source_content_id(storage_path)")
    .eq("id", id)
    .maybeSingle()
  if (readErr) return NextResponse.json({ error: "render_failed" }, { status: 500 })
  if (!post) return NextResponse.json({ error: "not_found" }, { status: 404 })
  const p = post as Record<string, unknown>
  const source = (p.source ?? null) as { storage_path?: string } | null
  const sourcePath = source?.storage_path
  const contentId = p.source_content_id as string | null
  if (!sourcePath || !contentId) return NextResponse.json({ error: "missing_source" }, { status: 400 })
  if (!ffmpegPath) return NextResponse.json({ error: "renderer_unavailable" }, { status: 500 })

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

    const outLocal = path.join(work, "out.mp4")
    // 'existing' mode = the uploaded video already has burned-in text: draw NO Beast Social overlay
    // (empty headline/subheadline → no drawtext) and keep the original audio. 'generate' = the
    // normal Template 1 overlay. Either way the derivative is a 9:16 mp4 (source is never modified).
    const existingText = (p.overlay_mode as string) === "existing"
    await renderReel(ffmpegPath as unknown as string, {
      sourcePath: srcLocal,
      outputPath: outLocal,
      fontPath: HEAD_FONT_PATH,
      detailFontPath: DETAIL_FONT_PATH,
      template: existingText ? "market_type" : ((p.overlay_template as string | null) ?? "market_type"),
      headline: existingText ? "" : ((p.overlay_headline as string | null) ?? ""),
      subheadline: existingText ? "" : ((p.overlay_subheadline as string | null) ?? ""),
      audioChoice: existingText ? "original" : (((p.audio_choice as string) || "original") as AudioChoice),
      workDir: work,
      hookPath: hookLocal,
      ctaPath: ctaLocal,
    })

    const nextVersion = (typeof p.render_version === "number" ? p.render_version : 0) + 1
    const derivativePath = `${userId}/${contentId}/renders/${id}-${nextVersion}.mp4`
    const bytes = await fs.readFile(outLocal)
    const up = await supabase.storage.from("social-media").upload(derivativePath, bytes, { contentType: "video/mp4", upsert: true })
    if (up.error) throw new Error(`upload: ${up.error.message}`)

    await supabase
      .from("social_posts")
      .update({ render_status: "ready", rendered_storage_path: derivativePath, render_version: nextVersion, render_error: null, updated_at: new Date().toISOString() })
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

    return NextResponse.json({ status: "ready", renderVersion: nextVersion })
  } catch (e) {
    const message = e instanceof Error ? e.message.slice(0, 400) : "render error"
    await supabase.from("social_posts").update({ render_status: "error", render_error: message, updated_at: new Date().toISOString() }).eq("id", id)
    return NextResponse.json({ status: "error", error: "render_failed" }, { status: 500 })
  } finally {
    await fs.rm(work, { recursive: true, force: true }).catch(() => {})
  }
}
