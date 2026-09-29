// Social Autopilot — server-side FFmpeg render (Option A). Produces a 9:16, H.264/yuv420p +
// AAC + faststart Reel from an immutable source video + overlay text + audio choice. The
// exact filter/encoder args below were validated against ffmpeg 6.0 (ffmpeg-static). Text is
// passed via textfile= so arbitrary caption characters never need filter-escaping.
//
// Server-only (uses node fs / child_process). Never imported by client code.
import { execFile } from "node:child_process"
import { promises as fs } from "node:fs"
import path from "node:path"
import os from "node:os"
import { OVERLAY_TEXT, computeOverlayLayout, type OverlayLayout, type OverlayFace } from "@/lib/social/overlaySpec"

export type AudioChoice = "original" | "none" | "lb_track"

export type RenderInput = {
  sourcePath: string // local path to the downloaded immutable source
  outputPath: string // local path to write the rendered derivative
  fontPath: string // bundled TTF for the HEAD face (Libre Baskerville Bold) — headlines + conversational detail
  detailFontPath?: string // bundled TTF for the DETAIL face (Bodoni text cut) — HERO detail only; falls back to fontPath
  template?: string | null // overlay template (drives the layout family); defaults to market_type
  headline?: string | null
  subheadline?: string | null // the template's detail line
  audioChoice: AudioChoice
  workDir: string // dir for temp textfiles
  // Local paths to the selected Voice Clips, already downloaded by the render route. Either may be
  // omitted. When present the source music bed ducks while the clip plays (see VOICE_MIX).
  hookPath?: string | null
  ctaPath?: string | null
}

// One drawtext item: pre-wrapped text file + its font size, top Y (canvas px), line spacing, and an
// OPTIONAL per-item font path, chosen from the block's `face`. Falls back to the
// buildVideoFilter fontPath when omitted.
export type DrawItem = { file: string; fontPx: number; topPx: number; lineSpacing: number; font?: string }

// FFmpeg filter path escaping: backslash-escape ':' and '\' inside filtergraph option values.
function escFilterPath(p: string): string {
  return p.replace(/\\/g, "\\\\").replace(/:/g, "\\:")
}

/** Build the -filter_complex graph (final label [v]): fill to 1080×1920 (9:16), then draw each
 *  overlay text ITEM (headline, optional detail) at its computed top-Y with a localized drop shadow
 *  + light edge (no background band/box). Items come from computeOverlayLayout, so Hero / Center
 *  Hook / Center Hook + Detail all render from the same geometry the preview uses. NOTE: FFmpeg
 *  drawtext has no letter-spacing (tracking) or shadow blur, so the burned-in text omits the subtle
 *  tracking and uses a hard-offset shadow; the preview carries the full treatment. */
export function buildVideoFilter(fontPath: string, items: DrawItem[]): string {
  const depth = (fontPx: number) => {
    const edge = Math.max(1, Math.round(OVERLAY_TEXT.edgeEm * fontPx))
    const dy = Math.max(1, Math.round(OVERLAY_TEXT.shadowDyEm * fontPx))
    const dx = Math.round(OVERLAY_TEXT.shadowDxEm * fontPx)
    return `:borderw=${edge}:bordercolor=black@${OVERLAY_TEXT.edgeAlpha}:shadowcolor=black@${OVERLAY_TEXT.shadowAlpha}:shadowx=${dx}:shadowy=${dy}`
  }

  const graph: string[] = [`[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920[bg]`]
  let label = "bg"
  items.forEach((it, i) => {
    const next = i === items.length - 1 ? "v" : `t${i}`
    const font = escFilterPath(it.font ?? fontPath) // per-item font (Bodoni-Head vs Bodoni-Detail)
    graph.push(
      `[${label}]drawtext=fontfile='${font}':textfile='${escFilterPath(it.file)}':fontcolor=white:fontsize=${it.fontPx}` +
        `:line_spacing=${it.lineSpacing}${depth(it.fontPx)}:x=(w-text_w)/2:y=${Math.round(it.topPx)}[${next}]`,
    )
    label = next
  })
  if (label !== "v") graph.push(`[${label}]null[v]`) // no overlay text → expose the cover-fit output
  return graph.join(";")
}

/** Full ffmpeg argument list. audioChoice 'none' mutes; 'lb_track' currently falls back to the
 *  source audio (the Locator Beast Music library ships in a later checkpoint). */
export function buildFfmpegArgs(input: {
  sourcePath: string
  outputPath: string
  filter: string
  audioChoice: AudioChoice
  /** Voice-clip files, appended as inputs 1..n in the SAME order buildAudioFilter indexed them. */
  extraInputs?: string[]
  /** The audio half of the graph, ending in [aout]. Null ⇒ no audio processing (unchanged behaviour). */
  audioFilter?: string | null
}): string[] {
  // The graph is a labelled -filter_complex ending in [v]; map that plus the source audio through.
  const args = ["-y", "-i", input.sourcePath]
  for (const extra of input.extraInputs ?? []) args.push("-i", extra)
  // The VIDEO graph is untouched. When an audio graph exists it is appended as further chains in the
  // same -filter_complex, so there is still exactly ONE graph and one render invocation.
  const filter = input.audioFilter ? `${input.filter};${input.audioFilter}` : input.filter
  args.push("-filter_complex", filter, "-map", "[v]", "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", "-r", "30")
  if (input.audioFilter) {
    // Voice clips present: map the mixed result. Same codec/bitrate as before, so the container and
    // TikTok's FILE_UPLOAD expectations are unchanged.
    args.push("-map", "[aout]", "-c:a", "aac", "-b:a", "128k")
  } else if (input.audioChoice === "none") {
    args.push("-an")
  } else {
    args.push("-map", "0:a?", "-c:a", "aac", "-b:a", "128k")
  }
  args.push("-movflags", "+faststart", input.outputPath)
  return args
}

/** PURE layout → draw plan. Each entry is one drawtext: its TEXT (already cased), size, top-Y, and
 *  face. Split out of renderReel so the per-line branch below is unit-testable without running ffmpeg
 *  or touching the filesystem — it is the only place that decides how many drawtext calls a block
 *  becomes, and a silent regression there is invisible in the preview. */
export type DrawPlanItem = { name: string; text: string; fontPx: number; topPx: number; lineSpacing: number; face: OverlayFace }
export function buildDrawPlan(layout: OverlayLayout): DrawPlanItem[] {
  const plan: DrawPlanItem[] = []
  const h = layout.headline
  if (h.lines.length) {
    const cased = (s: string) => (h.uppercase ? s.toUpperCase() : s)
    if (h.linePx && h.lineTopPx) {
      // COMPOUND two-line hero: each line carries its OWN size, so it needs its own drawtext at its
      // own explicit y — a single multi-line text file cannot express two sizes. FFmpeg centres every
      // item independently with x=(w-text_w)/2 (the canvas centre), so both lines land on the same
      // axis with no padding, exactly as the CSS preview centres them.
      h.lines.forEach((line, i) => plan.push({
        name: `head_${i}`, text: cased(line), fontPx: h.linePx![i], topPx: h.lineTopPx![i], lineSpacing: h.lineSpacing, face: h.face,
      }))
    } else {
      plan.push({ name: "head", text: cased(h.lines.join("\n")), fontPx: h.fontPx, topPx: h.topPx, lineSpacing: h.lineSpacing, face: h.face })
    }
  }
  const d = layout.detail
  if (d && d.lines.length) {
    plan.push({ name: "sub", text: d.lines.join("\n"), fontPx: d.fontPx, topPx: d.topPx, lineSpacing: d.lineSpacing, face: d.face })
  }
  return plan
}

// ── VOICE CLIPS + AUTOMATIC DUCKING ───────────────────────────────────────────────────────────
// A Hook plays at the START and a CTA at the END; the source music bed ducks smoothly while either
// speaks and returns to full afterwards. Everything below is an extension of the SAME render call —
// extra `-i` inputs and one audio chain appended to the existing (untouched) video filter graph.

/** The one place the mix is tuned. `duckLevel` is the gain the music bed falls to while a voice clip
 *  plays; `rampSeconds` is how long the fall/return takes. The mix format exists only so inputs of
 *  differing layout/rate combine deterministically — it is NOT loudness normalization. */
export const VOICE_MIX = { duckLevel: 0.2, rampSeconds: 0.25, sampleRate: 48000, channelLayout: "stereo" } as const

/** Duration (seconds) + audio-stream presence, parsed from `ffmpeg -i <file>` stderr. We have no
 *  ffprobe dependency (and adding one would mean a new binary to trace into the lambda), and ffmpeg
 *  already prints both facts — the render regression has parsed this same output for audio presence
 *  since the pipeline shipped. */
export function parseProbe(stderr: string): { durationSeconds: number | null; hasAudio: boolean } {
  const m = /Duration:\s*(\d+):(\d\d):(\d\d(?:\.\d+)?)/.exec(stderr)
  const durationSeconds = m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : null
  return { durationSeconds, hasAudio: /Stream #\d+:\d+.*:\s*Audio:/.test(stderr) }
}

export type VoiceWindow = { startSeconds: number; endSeconds: number }

/** Where each selected clip sits on the timeline. Hook is anchored at 0; CTA is anchored to the END
 *  (`videoDuration - ctaDuration`, floored at 0). Both windows are clamped INTO the video, so a clip
 *  longer than the source simply covers the whole video instead of extending it. Overlap on a very
 *  short video is allowed and left alone — the envelope below takes the max of both windows, so the
 *  bed is ducked wherever EITHER clip is active. No clip is ever moved to avoid an overlap. */
export function computeVoiceWindows(videoDurationSeconds: number, hookDurationSeconds: number | null, ctaDurationSeconds: number | null): { hook: VoiceWindow | null; cta: VoiceWindow | null } {
  const D = Math.max(0, videoDurationSeconds)
  const hook = hookDurationSeconds === null ? null : { startSeconds: 0, endSeconds: Math.min(hookDurationSeconds, D) }
  const cta = ctaDurationSeconds === null ? null : { startSeconds: Math.max(0, D - ctaDurationSeconds), endSeconds: D }
  return { hook, cta }
}

// One duck window as an FFmpeg expression returning 0 (bed at full) → 1 (bed fully ducked):
//   env(t) = min(clip((t-a)/R, 0, 1), clip((b+R-t)/R, 0, 1))
// It ramps UP across [a, a+R] (the fall begins as the clip begins, which is the only option for a Hook
// at t=0), holds while the clip plays, and ramps DOWN across [b, b+R] (the return happens after the
// clip finishes). When b+R runs past the end of the video the return is simply trimmed away.
function envelopeExpr(w: VoiceWindow): string {
  const R = VOICE_MIX.rampSeconds
  const a = w.startSeconds.toFixed(3)
  const b = (w.endSeconds + R).toFixed(3)
  return `min(clip((t-${a})/${R}\\,0\\,1)\\,clip((${b}-t)/${R}\\,0\\,1))`
}

/** The music-bed gain expression: full (1.0) everywhere, falling to `duckLevel` across whichever
 *  windows are active. Taking the MAX of the windows means an overlap ducks once, not twice. */
export function duckVolumeExpr(windows: VoiceWindow[]): string {
  const env = windows.length === 1 ? envelopeExpr(windows[0]) : `max(${windows.map(envelopeExpr).join("\\,")})`
  return `1-${(1 - VOICE_MIX.duckLevel).toFixed(3)}*${env}`
}

export type AudioMixPlan = {
  /** Source video has a usable audio stream AND the post keeps it (audioChoice !== "none"). */
  useSourceAudio: boolean
  /** ffmpeg input index for each selected clip, or null when not selected. */
  hookInput: number | null
  ctaInput: number | null
  hook: VoiceWindow | null
  cta: VoiceWindow | null
  videoDurationSeconds: number
}

/** Build the AUDIO half of the filter graph, or null when no audio processing is needed at all.
 *  Returning null is what preserves branch A (source audio, no voice clips) byte-for-byte: the caller
 *  then falls back to the original straight `-map 0:a?` copy-through with no volume touched. */
export function buildAudioFilter(plan: AudioMixPlan): string | null {
  const voices = [
    plan.hook && plan.hookInput !== null ? { input: plan.hookInput, w: plan.hook } : null,
    plan.cta && plan.ctaInput !== null ? { input: plan.ctaInput, w: plan.cta } : null,
  ].filter(Boolean) as { input: number; w: VoiceWindow }[]
  if (voices.length === 0) return null // no voice clips → nothing to mix; leave the source audio alone
  // Every branch resamples/relayouts to ONE format first so mono clips, 44.1k clips and stereo beds
  // mix deterministically. aformat only converts; it changes no levels.
  const fmt = `aformat=sample_fmts=fltp:sample_rates=${VOICE_MIX.sampleRate}:channel_layouts=${VOICE_MIX.channelLayout}`
  const parts: string[] = []
  const labels: string[] = []
  if (plan.useSourceAudio) {
    // eval=frame re-evaluates the gain every frame, which is what makes the ramp smooth rather than a
    // single hard step at filter-init time.
    parts.push(`[0:a]${fmt},volume=eval=frame:volume='${duckVolumeExpr(voices.map((v) => v.w))}'[abed]`)
    labels.push("[abed]")
  }
  voices.forEach((v, i) => {
    const label = `[av${i}]`
    // Voice stays at its own full level — no gain is applied to it, ever. adelay places the CTA; a
    // Hook at 0 needs no delay at all.
    const delayMs = Math.round(v.w.startSeconds * 1000)
    parts.push(`[${v.input}:a]${fmt}${delayMs > 0 ? `,adelay=${delayMs}:all=1` : ""}${label}`)
    labels.push(label)
  })
  // normalize=0 is REQUIRED: amix's default divides every input by the input count, which would quietly
  // halve both the bed and the voice.
  const mixed = labels.length === 1 ? labels[0] : `${labels.join("")}amix=inputs=${labels.length}:duration=longest:normalize=0[amix]`
  if (labels.length > 1) parts.push(mixed)
  const preTrim = labels.length === 1 ? labels[0] : "[amix]"
  // apad then atrim pins the audio to EXACTLY the video duration in both directions: apad extends a
  // short mix (e.g. a 2s Hook over a 10s silent video) with silence so the MP4 carries a full-length
  // audio track rather than one that stops early, and atrim hard-cuts a long one so a voice clip can
  // never extend the video.
  parts.push(`${preTrim}apad,atrim=end=${plan.videoDurationSeconds.toFixed(3)},asetpts=N/SR/TB[aout]`)
  return parts.join(";")
}

/** Compute the template layout, write each text block to a temp file, run ffmpeg. Throws on failure. */
export async function renderReel(ffmpegPath: string, input: RenderInput): Promise<void> {
  const layout = computeOverlayLayout(input.template ?? "market_type", (input.headline ?? "").trim(), (input.subheadline ?? "").trim())
  const detailFont = input.detailFontPath ?? input.fontPath
  const items: DrawItem[] = []
  for (const it of buildDrawPlan(layout)) {
    const file = path.join(input.workDir, `${it.name}.txt`)
    await fs.writeFile(file, it.text, "utf8")
    // Face comes from the LAYOUT, not the element role: the conversational detail renders in the head
    // face (Libre Baskerville Bold), the hero detail stays on the Bodoni text cut.
    items.push({ file, fontPx: it.fontPx, topPx: it.topPx, lineSpacing: it.lineSpacing, font: it.face === "head" ? input.fontPath : detailFont })
  }
  const filter = buildVideoFilter(input.fontPath, items)

  // The traced static binary can lose its exec bit in the serverless bundle — restore it. Moved above
  // the probes because probing runs the same binary.
  try {
    await fs.chmod(ffmpegPath, 0o755)
  } catch {
    /* best effort */
  }

  // ── Voice clips: probe real durations, then build the audio graph ───────────────────────────
  const hookPath = input.hookPath ?? null
  const ctaPath = input.ctaPath ?? null
  const extraInputs: string[] = []
  let audioFilter: string | null = null
  if (hookPath || ctaPath) {
    const source = await probeMedia(ffmpegPath, input.sourcePath)
    if (source.durationSeconds === null || source.durationSeconds <= 0) {
      throw new Error("voice clips: could not determine the source video duration")
    }
    // A selected clip that cannot be fetched, decoded or probed FAILS the render loudly — rendering a
    // silent-but-different video than the locator asked for would be worse than an error.
    let hookDuration: number | null = null
    let ctaDuration: number | null = null
    if (hookPath) {
      const p = await probeMedia(ffmpegPath, hookPath)
      if (!p.hasAudio || p.durationSeconds === null || p.durationSeconds <= 0) throw new Error("voice clips: the selected Hook clip is missing, unreadable, or has no audio")
      hookDuration = p.durationSeconds
      extraInputs.push(hookPath)
    }
    if (ctaPath) {
      const p = await probeMedia(ffmpegPath, ctaPath)
      if (!p.hasAudio || p.durationSeconds === null || p.durationSeconds <= 0) throw new Error("voice clips: the selected CTA clip is missing, unreadable, or has no audio")
      ctaDuration = p.durationSeconds
      extraInputs.push(ctaPath)
    }
    const windows = computeVoiceWindows(source.durationSeconds, hookDuration, ctaDuration)
    audioFilter = buildAudioFilter({
      // "No Music" drops the BED, not the voice — so the bed is used only when the source actually has
      // audio AND the post kept it.
      useSourceAudio: source.hasAudio && input.audioChoice !== "none",
      hookInput: hookPath ? 1 : null,
      ctaInput: ctaPath ? (hookPath ? 2 : 1) : null,
      hook: windows.hook,
      cta: windows.cta,
      videoDurationSeconds: source.durationSeconds,
    })
  }

  const args = buildFfmpegArgs({ sourcePath: input.sourcePath, outputPath: input.outputPath, filter, audioChoice: input.audioChoice, extraInputs, audioFilter })

  await new Promise<void>((resolve, reject) => {
    execFile(ffmpegPath, args, { maxBuffer: 1024 * 1024 * 16 }, (err, _stdout, stderr) => {
      if (err) reject(new Error(`ffmpeg failed: ${String(stderr).split("\n").slice(-4).join(" ").slice(0, 500)}`))
      else resolve()
    })
  })
}

/** Run `ffmpeg -i <file>` purely to read its stderr banner (duration + stream list). ffmpeg exits
 *  non-zero when given no output file, which is expected — the banner is still on stderr. */
export async function probeMedia(ffmpegPath: string, filePath: string): Promise<{ durationSeconds: number | null; hasAudio: boolean }> {
  return new Promise((resolve) => {
    execFile(ffmpegPath, ["-hide_banner", "-i", filePath], { maxBuffer: 1024 * 1024 * 8 }, (_err, _stdout, stderr) => {
      resolve(parseProbe(String(stderr ?? "")))
    })
  })
}

/** A private temp working dir for one render. */
export async function makeWorkDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "sa-render-"))
}
