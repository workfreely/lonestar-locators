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
import { OVERLAY_SPEC, OVERLAY_TEXT, wrapSub, headlineBlockPx, headlineFit } from "@/lib/social/overlaySpec"

export type AudioChoice = "original" | "none" | "lb_track"

export type RenderInput = {
  sourcePath: string // local path to the downloaded immutable source
  outputPath: string // local path to write the rendered derivative
  fontPath: string // bundled TTF for drawtext
  headline?: string | null
  subheadline?: string | null
  audioChoice: AudioChoice
  workDir: string // dir for temp textfiles
}

// FFmpeg filter path escaping: backslash-escape ':' and '\' inside filtergraph option values.
function escFilterPath(p: string): string {
  return p.replace(/\\/g, "\\\\").replace(/:/g, "\\:")
}

/** Build the -filter_complex graph (final label [v]): fill to 1080×1920 (9:16), lay a SOFT
 *  translucent dark gradient scrim behind the text group (readability — replaces the old hard box;
 *  a full-width band with a raised-cosine vertical fade that follows the text, never full-screen),
 *  then draw the headline/detail with a light drop shadow. `headLineCount` is the number of wrapped
 *  headline lines — the detail is placed below the whole block so a two-line headline pushes it
 *  down (shares geometry with the on-screen preview). `subLineCount` sizes the scrim band. */
export function buildVideoFilter(fontPath: string, headFile: string | null, subFile: string | null, headLineCount = 1, headlineFontPx: number = OVERLAY_SPEC.headline.fontPx, subLineCount = subFile ? 1 : 0): string {
  const font = escFilterPath(fontPath)
  const yHead = `h*${OVERLAY_SPEC.headline.yFrac}`
  // Letter-hugging readability: a subtle dark OUTLINE (border) around each glyph + a small soft drop
  // shadow. NO background band/box — the footage between letters is untouched.
  const shadow = `:shadowcolor=black@${OVERLAY_TEXT.shadowAlpha}:shadowx=${OVERLAY_TEXT.shadowDx}:shadowy=${OVERLAY_TEXT.shadowDy}`
  const hug = (borderPx: number) => `:borderw=${borderPx}:bordercolor=black@${OVERLAY_TEXT.borderAlpha}${shadow}`

  // 1) Cover-fit the source to the 9:16 canvas.
  const graph: string[] = [`[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920[bg]`]
  let label = "bg"

  // 2) Headline.
  if (headFile) {
    const next = subFile ? "h" : "v"
    graph.push(
      `[${label}]drawtext=fontfile='${font}':textfile='${escFilterPath(headFile)}':fontcolor=white:fontsize=${headlineFontPx}` +
        `:line_spacing=${OVERLAY_SPEC.headline.lineSpacing}${hug(OVERLAY_TEXT.headlineBorderPx)}:x=(w-text_w)/2:y=${yHead}[${next}]`,
    )
    label = next
  }
  // 3) Detail — y = headline top + full headline block height (at the FIT font size) + a gap.
  if (subFile) {
    const subOffset = headFile ? headlineBlockPx(headLineCount, headlineFontPx) + OVERLAY_SPEC.sub.gapPx : 0
    graph.push(
      `[${label}]drawtext=fontfile='${font}':textfile='${escFilterPath(subFile)}':fontcolor=white:fontsize=${OVERLAY_SPEC.sub.fontPx}` +
        `:line_spacing=${OVERLAY_SPEC.sub.lineSpacing}${hug(OVERLAY_TEXT.subBorderPx)}:x=(w-text_w)/2:y=${yHead}+${subOffset}[v]`,
    )
    label = "v"
  }

  // No overlay text → expose the cover-fit output as [v].
  if (label !== "v") graph.push(`[${label}]null[v]`)
  return graph.join(";")
}

/** Full ffmpeg argument list. audioChoice 'none' mutes; 'lb_track' currently falls back to the
 *  source audio (the Locator Beast Music library ships in a later checkpoint). */
export function buildFfmpegArgs(input: { sourcePath: string; outputPath: string; filter: string; audioChoice: AudioChoice }): string[] {
  // The scrim requires a generated (color) source, so the graph is a -filter_complex ending in [v].
  const args = ["-y", "-i", input.sourcePath, "-filter_complex", input.filter, "-map", "[v]", "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", "-r", "30"]
  if (input.audioChoice === "none") args.push("-an")
  else args.push("-map", "0:a?", "-c:a", "aac", "-b:a", "128k")
  args.push("-movflags", "+faststart", input.outputPath)
  return args
}

/** Write headline/sub to temp textfiles, run ffmpeg, resolve on success. Throws on failure. */
export async function renderReel(ffmpegPath: string, input: RenderInput): Promise<void> {
  const head = (input.headline ?? "").trim()
  const sub = (input.subheadline ?? "").trim()
  let headFile: string | null = null
  let subFile: string | null = null
  let headLineCount = 1
  // Fit the headline to ONE line at the largest safe size (shared with the preview via headlineFit);
  // custom text falls back to the multi-line char-wrap inside headlineFit.
  const fit = headlineFit(head)
  const headlineFontPx = fit.fontPx
  if (head) {
    const lines = fit.lines
    headLineCount = Math.max(1, lines.length)
    headFile = path.join(input.workDir, "head.txt")
    await fs.writeFile(headFile, lines.join("\n"), "utf8")
  }
  let subLineCount = 0
  if (sub) {
    // Wrap the sub the SAME way the preview does → a compact centered multi-line block that stays
    // inside the safe area, instead of one edge-to-edge line.
    const subLines = wrapSub(sub)
    subLineCount = Math.max(1, subLines.length)
    subFile = path.join(input.workDir, "sub.txt")
    await fs.writeFile(subFile, subLines.join("\n"), "utf8")
  }
  const filter = buildVideoFilter(input.fontPath, headFile, subFile, headLineCount, headlineFontPx, subLineCount)
  const args = buildFfmpegArgs({ sourcePath: input.sourcePath, outputPath: input.outputPath, filter, audioChoice: input.audioChoice })

  // The traced static binary can lose its exec bit in the serverless bundle — restore it.
  try {
    await fs.chmod(ffmpegPath, 0o755)
  } catch {
    /* best effort */
  }

  await new Promise<void>((resolve, reject) => {
    execFile(ffmpegPath, args, { maxBuffer: 1024 * 1024 * 16 }, (err, _stdout, stderr) => {
      if (err) reject(new Error(`ffmpeg failed: ${String(stderr).split("\n").slice(-4).join(" ").slice(0, 500)}`))
      else resolve()
    })
  })
}

/** A private temp working dir for one render. */
export async function makeWorkDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "sa-render-"))
}
