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
import { OVERLAY_TEXT, computeOverlayLayout, overlayTextFor, type OverlayLayout, type OverlayFace, type OverlayTextStyle } from "@/lib/social/overlaySpec"
import { DELIVERY_SIZE } from "@/lib/social/deliverySize"
import { buildPresenterFilter, buildPresenterPlan, decoderForPresenterClip, type PresenterPlan } from "@/lib/social/presenterSpec"
import { trimPresenterClip } from "@/lib/social/presenterTrim"

export type AudioChoice = "original" | "none" | "lb_track"

export type RenderInput = {
  sourcePath: string // local path to the downloaded immutable source
  outputPath: string // local path to write the rendered derivative
  fontPath: string // the ONE bundled overlay TTF (Libre Baskerville Bold) — headline and detail alike
  /** Which platform's safe area the headline is fitted into. Defaults to Instagram. */
  platform?: string
  template?: string | null // overlay template (drives the layout family); defaults to market_type
  headline?: string | null
  subheadline?: string | null // the template's detail line
  audioChoice: AudioChoice
  workDir: string // dir for temp textfiles
  // Local paths to the selected Voice Clips, already downloaded by the render route. Either may be
  // omitted. When present the source music bed ducks while the clip plays (see VOICE_MIX).
  hookPath?: string | null
  ctaPath?: string | null
  /** AI PRESENTER — local path to a transparent avatar clip (WebM/VP9+alpha from HeyGen, or a
   *  ProRes 4444 / QTRLE stand-in). Omitted or null ⇒ the graph is exactly what it was, which is
   *  how every existing post keeps rendering identically. */
  presenterPath?: string | null
  /** Spoken intro length in seconds; clamped to the supported 3–5s range. */
  presenterIntroSeconds?: number | null
  /** Per-post placement overrides. Null/omitted ⇒ the approved default (lower-left, 360px). */
  presenterSide?: string | null
  presenterWidthPx?: number | null
  /** Calibration only — see buildPresenterPlan. Not set by the editor or any stored column. */
  presenterBottomInsetPx?: number | null
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
export function buildVideoFilter(
  fontPath: string,
  items: DrawItem[],
  sourceChain?: string,
  /** AI Presenter. Composited onto [bg] BEFORE the drawtext chain, so overlay text is always drawn
   *  ON TOP of the avatar and can never be occluded by it. Omit → the graph is byte-identical to
   *  what it was, which is what keeps every existing render reproducible. */
  presenter?: PresenterPlan | null,
  /** The template's text treatment. ONE object for the whole filter, because one filter is one post
   *  and one post is one template — which is also what guarantees the headline and the detail can
   *  never be given different shadows. Defaults to the baseline, so every existing caller (and every
   *  template without an override) produces the exact filter string it produced before. */
  textStyle: OverlayTextStyle = OVERLAY_TEXT,
): string {
  const depth = (fontPx: number) => {
    const edge = Math.max(1, Math.round(textStyle.edgeEm * fontPx))
    const dy = Math.max(1, Math.round(textStyle.shadowDyEm * fontPx))
    const dx = Math.round(textStyle.shadowDxEm * fontPx)
    return `:borderw=${edge}:bordercolor=black@${textStyle.edgeAlpha}:shadowcolor=black@${textStyle.shadowAlpha}:shadowx=${dx}:shadowy=${dy}`
  }

  // Source normalization runs FIRST and produces [bg]; the overlay is composited onto an already
  // tone-mapped, already-scaled canvas. Callers that have probed the source pass its chain; the
  // default keeps the historical behaviour for callers (and tests) that have not.
  const chain = sourceChain ?? `scale=${DELIVERY.w}:${DELIVERY.h}:force_original_aspect_ratio=increase,crop=${DELIVERY.w}:${DELIVERY.h}`
  const graph: string[] = [`[0:v]${chain}[bg]`]
  let label = "bg"
  if (presenter) {
    graph.push(buildPresenterFilter(presenter, "withpres"))
    label = "withpres"
  }
  items.forEach((it, i) => {
    const next = i === items.length - 1 ? "v" : `t${i}`
    const font = escFilterPath(it.font ?? fontPath) // per-item font, chosen from the block's face
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
  /** Probed source. Drives frame rate and whether the audio can be stream-copied. Omit to keep the
   *  historical fixed-30fps / always-re-encode behaviour. */
  source?: SourceInfo | null
  /** AI Presenter clip, appended as the LAST input so every voice-clip index above stays valid.
   *  `decoder` is emitted before its -i: FFmpeg's native vp9/vp8 decoders silently drop the alpha
   *  channel, so a transparent WebM composites as an opaque box without it. */
  presenterInput?: { path: string; decoder: string | null } | null
}): string[] {
  // The graph is a labelled -filter_complex ending in [v]; map that plus the source audio through.
  const args = ["-y", "-i", input.sourcePath]
  for (const extra of input.extraInputs ?? []) args.push("-i", extra)
  // LAST, and after the voice clips, so adding a presenter cannot renumber an existing audio input.
  // The decoder flag is per-input and must precede the -i it applies to.
  if (input.presenterInput) {
    if (input.presenterInput.decoder) args.push("-c:v", input.presenterInput.decoder)
    args.push("-i", input.presenterInput.path)
  }
  // The VIDEO graph is untouched. When an audio graph exists it is appended as further chains in the
  // same -filter_complex, so there is still exactly ONE graph and one render invocation.
  const filter = input.audioFilter ? `${input.filter};${input.audioFilter}` : input.filter
  // ONE encode, and it is the DELIVERY encode — the source is decoded, normalized, composited and
  // encoded in a single pass, so no intermediate generation exists to lose quality to.
  //
  // crf 18 / preset slow (was crf 20 / veryfast): these sources are already platform-compressed, so
  // the encoder is spending bits re-describing existing artifacts. A visually-transparent crf plus a
  // slower motion search is what stops THIS generation adding its own, before Instagram adds another.
  args.push("-filter_complex", filter, "-map", "[v]",
    "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-profile:v", "high", "-level", "4.2", "-pix_fmt", "yuv420p",
    // Tag the output as BT.709. The normalization chain has already converted to it; without the tag
    // players are left to guess, which is how correctly-converted footage still ends up looking wrong.
    "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709")
  // Frame rate: emit -r ONLY when the source needs correcting. Omitting it is the only way to
  // guarantee no resampling — a 60fps source stays 60fps.
  const fps = input.source ? outputFps(input.source) : 30
  if (fps !== null) args.push("-r", String(fps))

  args.push(...audioArgs({ audioChoice: input.audioChoice, audioFilter: input.audioFilter ?? null, source: input.source ?? null }))
  args.push("-movflags", "+faststart", input.outputPath)
  return args
}

// ── AUDIO: PRESERVE THE ORIGINAL UNLESS SOMETHING MAKES THAT IMPOSSIBLE ───────────────────────
//
// The pipeline does not change the audio, so by default it must not RE-ENCODE the audio either.
// Every re-encode is a generation of loss applied to a stream the render never touched, and these
// sources are already platform-compressed once.
//
// Copy is used whenever the source codec is valid in an MP4 and accepted by both platforms, which
// in practice means AAC — and a TikTok-downloaded file is AAC by construction, so the whole of the
// current library takes the copy path.
//
// `aacCompatible` is deliberately a allow-LIST, not a deny-list. An unrecognised codec re-encodes
// rather than being optimistically copied: a copy that produces an unplayable MP4 fails at UPLOAD,
// far from here, whereas an unnecessary re-encode is merely imperfect.

/** Source audio codecs that can be stream-copied into the delivery MP4 as-is. */
const COPYABLE_AUDIO = new Set(["aac"])

/**
 * Bitrate for the cases where re-encoding is unavoidable. AAC-LC stereo at 256k is comfortably
 * inside what both Instagram and TikTok accept while being high enough that the one forced
 * generation is not the weak link.
 *
 * NOT verified against either platform's current published spec — see the note in the handoff. If
 * one of them is ever found to cap lower, this is the single place to change.
 */
const FORCED_AAC_BITRATE = "256k"

export function audioArgs(input: { audioChoice: AudioChoice; audioFilter: string | null; source: SourceInfo | null }): string[] {
  // A mix exists only when voice clips are in play. Mixing two streams is decoding both and
  // producing a new one — there is no copy path, by definition.
  if (input.audioFilter) return ["-map", "[aout]", "-c:a", "aac", "-b:a", FORCED_AAC_BITRATE]
  if (input.audioChoice === "none") return ["-an"]

  // THE PRESERVATION PATH. No -b:a, no -ar, no -ac: bitrate, sample rate and channel layout are
  // whatever the source already had, bit-for-bit, because `copy` does not decode at all.
  if (input.source && input.source.audioCodec !== null && COPYABLE_AUDIO.has(input.source.audioCodec)) {
    return ["-map", "0:a?", "-c:a", "copy"]
  }

  // Unknown/incompatible codec, or no probe at all. Re-encode — but STILL do not resample or
  // remix: omitting -ar and -ac makes ffmpeg keep the source's rate and channel layout, so the only
  // thing that changes is the codec.
  return ["-map", "0:a?", "-c:a", "aac", "-b:a", FORCED_AAC_BITRATE]
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

// ── SOURCE NORMALIZATION ──────────────────────────────────────────────────────────────────────
// The practical source library is TikTok-downloaded files: already platform-compressed, frequently
// BELOW the 1080×1920 delivery size, often 60fps, and — on iPhone-shot clips — HLG/BT.2020 HDR.
// They are the masters we have, so the pipeline is tuned to lose as little as possible from them
// rather than to assume pristine input.

/** The delivery canvas. Re-exported from lib/social/deliverySize so the client-side source-quality
 *  badge can share the exact numbers without importing this server-only module. */
export const DELIVERY = DELIVERY_SIZE

export type SourceInfo = {
  width: number | null
  height: number | null
  fps: number | null
  /** Transfer characteristic exactly as ffmpeg names it, e.g. "arib-std-b67" (HLG), "smpte2084"
   *  (PQ), "bt709". Null when the banner does not state one. */
  colorTransfer: string | null
  /** Bits per component, read from the pixel format (yuv420p10le -> 10, yuv420p -> 8). */
  bitDepth: number | null
  /** TRUE only when the source is trustworthily HDR — see isTrustworthyHdr. */
  isHdr: boolean
  /** Audio codec name as ffmpeg reports it, e.g. "aac". Null when the source has no audio. */
  audioCodec: string | null
  /** Source is smaller than the delivery canvas, i.e. it will be UPSCALED and cannot gain detail. */
  belowDelivery: boolean
}

/**
 * Is this source HDR in a way we are willing to act on?
 *
 * Tone-mapping is a DESTRUCTIVE colour transform. Applying it to footage that is not really HDR
 * washes it out, and the failure is silent — so the bar is corroborating evidence, not a single
 * tag:
 *
 *  1. The TRANSFER function must itself be an HDR curve — HLG (arib-std-b67) or PQ (smpte2084).
 *     BT.2020 PRIMARIES alone are deliberately NOT enough: a file can carry wide-gamut primaries
 *     with an SDR transfer, and tone-mapping it would be pure damage.
 *  2. The source must be at least 10-bit. An 8-bit file claiming HLG/PQ is almost certainly
 *     mis-tagged — real HDR is not delivered in 8 bits — and mis-tagged metadata is exactly what
 *     this check exists to refuse.
 *
 * Anything that fails either test is passed through with its colour untouched.
 */
export function isTrustworthyHdr(info: Pick<SourceInfo, "colorTransfer" | "bitDepth">): boolean {
  const hdrCurve = info.colorTransfer !== null && /^(arib-std-b67|smpte2084)$/i.test(info.colorTransfer)
  return hdrCurve && info.bitDepth !== null && info.bitDepth >= 10
}

/** Pull geometry, frame rate, colour transfer and audio codec out of ffmpeg's stderr banner. */
export function parseSourceInfo(stderr: string): SourceInfo {
  const v = /Stream #\d+:\d+.*:\s*Video:.*/.exec(stderr)?.[0] ?? ""
  const a = /Stream #\d+:\d+.*:\s*Audio:\s*([A-Za-z0-9_]+)/.exec(stderr)
  // Take the LAST WxH on the video line: the codec tag can contain digits, but the resolution is
  // always printed after the pixel format.
  const dims = [...v.matchAll(/\b(\d{2,5})x(\d{2,5})\b/g)].pop()
  const fpsM = /([\d.]+)\s*fps\b/.exec(v)
  const fps = fpsM ? Number(fpsM[1]) : null
  const width = dims ? Number(dims[1]) : null
  const height = dims ? Number(dims[2]) : null
  // Transfer sits in the parenthesised colour group after the pixel format, e.g.
  // "yuv420p10le(tv, bt2020nc/bt2020/arib-std-b67)".
  const transfer = /\b(arib-std-b67|smpte2084|bt709|bt470bg|smpte170m|iec61966-2-1|linear)\b/i.exec(v)?.[1]?.toLowerCase() ?? null
  const depth = /\byuva?\d{3}p(\d{1,2})(?:le|be)?\b/i.exec(v)
  const bitDepth = depth ? Number(depth[1]) : /\byuva?\d{3}p\b/i.test(v) ? 8 : null
  const base = { colorTransfer: transfer, bitDepth }
  return {
    width, height,
    fps: fps && Number.isFinite(fps) && fps > 0 ? fps : null,
    ...base,
    isHdr: isTrustworthyHdr(base),
    audioCodec: a ? a[1].toLowerCase() : null,
    belowDelivery: width !== null && height !== null && (width < DELIVERY.w || height < DELIVERY.h),
  }
}

/**
 * The [0:v] chain that turns an arbitrary source into the delivery canvas, BEFORE any overlay is
 * composited. Order matters and is deliberate:
 *
 *   1. tone-map (HDR only) — done in LINEAR light, at the source's own resolution. Tone-mapping
 *      after scaling would blend HDR values with SDR-ish neighbours and shift hue.
 *   2. scale with LANCZOS — the upscale most of this library needs. swscale's default (bicubic) is
 *      softer; lanczos keeps edge definition without the ringing of sharper kernels.
 *   3. crop to the exact canvas.
 *   4. format=yuv420p LAST, so every earlier step works at the highest available precision.
 *
 * Deliberately NO sharpening/unsharp: these sources are already platform-compressed, and sharpening
 * compression artifacts makes them more visible, not less. If testing ever shows otherwise it can be
 * added here as one explicit step.
 */
export function buildSourceChain(info: Pick<SourceInfo, "isHdr" | "width" | "height">): string {
  const steps: string[] = []
  if (info.isHdr) {
    // hable preserves highlight roll-off without the flat look of `linear`; desat=0 keeps the
    // original saturation rather than the default desaturation of bright areas.
    steps.push("zscale=t=linear:npl=100", "tonemap=hable:desat=0", "zscale=p=bt709:t=bt709:m=bt709:r=tv")
  }

  // RESIZE ONLY WHEN THE SOURCE IS NOT ALREADY THE DELIVERY CANVAS. A source that is exactly
  // 1080×1920 is passed through untouched: running it through swscale would be a resample that
  // cannot improve anything and can only cost. Dimensions are only known when the probe read them —
  // an unreadable probe keeps the full scale+crop, because getting the canvas right matters more
  // than avoiding one redundant filter.
  const exact = info.width === DELIVERY.w && info.height === DELIVERY.h
  if (!exact) {
    // `increase` + crop is a COVER fit: scale until both axes cover the canvas, then trim the
    // overflow. For a source whose aspect already matches 9:16 the crop is a no-op; for anything
    // else it is what removes the letterboxing instead of adding bars.
    steps.push(
      `scale=${DELIVERY.w}:${DELIVERY.h}:force_original_aspect_ratio=increase:flags=lanczos`,
      `crop=${DELIVERY.w}:${DELIVERY.h}`,
    )
  }
  // Always last, and always present: the overlay and the encoder both need a known 8-bit pixel
  // format, and putting it at the end keeps every earlier step at the source's own precision.
  steps.push("format=yuv420p")
  return steps.join(",")
}

/**
 * Output frame rate. Source fps is PRESERVED — a 60fps TikTok clip stays 60fps instead of being
 * halved, which is what the old hard-coded `-r 30` did. Returns null to mean "emit no -r at all",
 * the only way to guarantee ffmpeg does not resample. A rate above 60 is capped (the platforms
 * re-encode above that anyway), and an unreadable rate falls back to 30 rather than to nothing.
 */
export function outputFps(info: Pick<SourceInfo, "fps">): number | null {
  if (info.fps === null) return 30
  if (info.fps > 60) return 60
  return null
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
  // The platform decides the text-safe box, so one source post can produce a separate Instagram
  // render and TikTok render from identical copy.
  // `!!input.presenterPath` is the SAME condition that decides whether a presenter is composited
  // below — one fact, read once — so the text can never move for a presenter that is not there, nor
  // stay centred under one that is.
  const layout = computeOverlayLayout(
    input.template ?? "market_type",
    (input.headline ?? "").trim(),
    (input.subheadline ?? "").trim(),
    input.platform ?? "instagram",
    !!input.presenterPath,
  )
  const items: DrawItem[] = []
  for (const it of buildDrawPlan(layout)) {
    const file = path.join(input.workDir, `${it.name}.txt`)
    await fs.writeFile(file, it.text, "utf8")
    // ONE face for every block. There is no per-item font choice to make any more — OverlayFace has
    // a single member — so there is no branch here for a wrong face to slip through.
    items.push({ file, fontPx: it.fontPx, topPx: it.topPx, lineSpacing: it.lineSpacing, font: input.fontPath })
  }
  // The traced static binary can lose its exec bit in the serverless bundle — restore it. Must come
  // before any probe, because probing runs the same binary.
  try {
    await fs.chmod(ffmpegPath, 0o755)
  } catch {
    /* best effort */
  }

  // Probe the SOURCE once, up front: its resolution, frame rate, colour transfer and audio codec all
  // feed decisions below (tone-map or not, which fps to emit, whether audio can be stream-copied).
  // A probe that reveals nothing degrades to the historical defaults rather than failing the render.
  const sourceInfo = parseSourceInfo(await probeStderr(ffmpegPath, input.sourcePath))

  // ── AI PRESENTER ────────────────────────────────────────────────────────────────────────────
  // Its input index is computed AFTER the voice clips are counted, because the presenter is
  // appended last precisely so it cannot renumber them. The plan is built here and consumed in two
  // places — the filter graph and the input list — from this one value.
  const voiceCount = (input.hookPath ? 1 : 0) + (input.ctaPath ? 1 : 0)

  // ── TRIM THE PRESENTER'S TRANSPARENT PADDING ────────────────────────────────────────────────
  // Generated avatars arrive centred in a full canvas with transparency around them, so the clip's
  // bottom edge is not the figure's. Bottom-anchoring would then float the presenter above its
  // intended footing — silently, with no error. Detection reads the ALPHA plane, so it works for
  // any avatar from any vendor, not just the one we tested.
  //
  // Degrades to the original clip on any failure: a presenter sitting slightly high is cosmetic,
  // a failed render is a broken post.
  let presenterLocal = input.presenterPath ?? null
  if (presenterLocal) {
    const pInfo = parseSourceInfo(await probeStderr(ffmpegPath, presenterLocal))
    const trim = await trimPresenterClip({
      ffmpegPath, clipPath: presenterLocal,
      decoder: decoderForPresenterClip(presenterLocal),
      workDir: input.workDir, width: pInfo.width, height: pInfo.height,
    })
    presenterLocal = trim.path
  }

  const presenterPlan = presenterLocal
    ? buildPresenterPlan({ inputIndex: 1 + voiceCount, introSeconds: input.presenterIntroSeconds ?? null, side: input.presenterSide ?? null, widthPx: input.presenterWidthPx ?? null, bottomInsetPxOverride: input.presenterBottomInsetPx ?? null, platform: input.platform })
    : null
  // Same template string the layout above was computed from, so the burned-in treatment and the
  // geometry can never come from two different templates.
  const filter = buildVideoFilter(input.fontPath, items, buildSourceChain(sourceInfo), presenterPlan, overlayTextFor(input.template ?? "market_type"))

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

  const args = buildFfmpegArgs({
    sourcePath: input.sourcePath, outputPath: input.outputPath, filter,
    audioChoice: input.audioChoice, extraInputs, audioFilter, source: sourceInfo,
    presenterInput: presenterLocal
      ? { path: presenterLocal, decoder: decoderForPresenterClip(presenterLocal) }
      : null,
  })

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
  return parseProbe(await probeStderr(ffmpegPath, filePath))
}

/** The raw stderr banner, for callers that need more than duration/audio (see parseSourceInfo). */
export async function probeStderr(ffmpegPath: string, filePath: string): Promise<string> {
  return new Promise((resolve) => {
    execFile(ffmpegPath, ["-hide_banner", "-i", filePath], { maxBuffer: 1024 * 1024 * 8 }, (_err, _stdout, stderr) => {
      resolve(String(stderr ?? ""))
    })
  })
}

/** A private temp working dir for one render. */
export async function makeWorkDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "sa-render-"))
}
