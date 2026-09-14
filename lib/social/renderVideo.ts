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
import { OVERLAY_TEXT, computeOverlayLayout } from "@/lib/social/overlaySpec"

export type AudioChoice = "original" | "none" | "lb_track"

export type RenderInput = {
  sourcePath: string // local path to the downloaded immutable source
  outputPath: string // local path to write the rendered derivative
  fontPath: string // bundled TTF for drawtext
  template?: string | null // overlay template (drives the layout family); defaults to market_type
  headline?: string | null
  subheadline?: string | null // the template's detail line
  audioChoice: AudioChoice
  workDir: string // dir for temp textfiles
}

// One drawtext item: pre-wrapped text file + its font size, top Y (canvas px), and line spacing.
export type DrawItem = { file: string; fontPx: number; topPx: number; lineSpacing: number }

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
  const font = escFilterPath(fontPath)
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
export function buildFfmpegArgs(input: { sourcePath: string; outputPath: string; filter: string; audioChoice: AudioChoice }): string[] {
  // The graph is a labelled -filter_complex ending in [v]; map that plus the source audio through.
  const args = ["-y", "-i", input.sourcePath, "-filter_complex", input.filter, "-map", "[v]", "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", "-r", "30"]
  if (input.audioChoice === "none") args.push("-an")
  else args.push("-map", "0:a?", "-c:a", "aac", "-b:a", "128k")
  args.push("-movflags", "+faststart", input.outputPath)
  return args
}

/** Compute the template layout, write each text block to a temp file, run ffmpeg. Throws on failure. */
export async function renderReel(ffmpegPath: string, input: RenderInput): Promise<void> {
  const layout = computeOverlayLayout(input.template ?? "market_type", (input.headline ?? "").trim(), (input.subheadline ?? "").trim())
  const items: DrawItem[] = []
  if (layout.headline.lines.length) {
    const headFile = path.join(input.workDir, "head.txt")
    await fs.writeFile(headFile, (layout.headline.uppercase ? layout.headline.lines.join("\n").toUpperCase() : layout.headline.lines.join("\n")), "utf8")
    items.push({ file: headFile, fontPx: layout.headline.fontPx, topPx: layout.headline.topPx, lineSpacing: layout.headline.lineSpacing })
  }
  if (layout.detail && layout.detail.lines.length) {
    const subFile = path.join(input.workDir, "sub.txt")
    await fs.writeFile(subFile, layout.detail.lines.join("\n"), "utf8")
    items.push({ file: subFile, fontPx: layout.detail.fontPx, topPx: layout.detail.topPx, lineSpacing: layout.detail.lineSpacing })
  }
  const filter = buildVideoFilter(input.fontPath, items)
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
