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
import { OVERLAY_SPEC, wrapHeadline, headlineBlockPx } from "@/lib/social/overlaySpec"

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

/** Build the -vf filtergraph: fill to 1080×1920 (9:16), then optional headline/sub drawtext.
 *  `headLineCount` is the number of wrapped headline lines — the sub is placed below the whole
 *  block so a two-line headline pushes it down (shares geometry with the on-screen preview). */
export function buildVideoFilter(fontPath: string, headFile: string | null, subFile: string | null, headLineCount = 1): string {
  const font = escFilterPath(fontPath)
  const parts = ["scale=1080:1920:force_original_aspect_ratio=increase", "crop=1080:1920"]
  const yHead = `h*${OVERLAY_SPEC.headline.yFrac}`
  if (headFile) {
    parts.push(
      `drawtext=fontfile='${font}':textfile='${escFilterPath(headFile)}':fontcolor=white:fontsize=${OVERLAY_SPEC.headline.fontPx}` +
        `:line_spacing=${OVERLAY_SPEC.headline.lineSpacing}:box=1:boxcolor=black@${OVERLAY_SPEC.headline.boxAlpha}` +
        `:boxborderw=${OVERLAY_SPEC.headline.boxBorderPx}:x=(w-text_w)/2:y=${yHead}`,
    )
  }
  if (subFile) {
    // Sub y = headline top + full headline block height + a consistent gap (0 when no headline).
    const subOffset = headFile ? headlineBlockPx(headLineCount) + OVERLAY_SPEC.sub.gapPx : 0
    parts.push(
      `drawtext=fontfile='${font}':textfile='${escFilterPath(subFile)}':fontcolor=white:fontsize=${OVERLAY_SPEC.sub.fontPx}` +
        `:box=1:boxcolor=black@${OVERLAY_SPEC.sub.boxAlpha}:boxborderw=${OVERLAY_SPEC.sub.boxBorderPx}` +
        `:x=(w-text_w)/2:y=${yHead}+${subOffset}`,
    )
  }
  return parts.join(",")
}

/** Full ffmpeg argument list. audioChoice 'none' mutes; 'lb_track' currently falls back to the
 *  source audio (the Locator Beast Music library ships in a later checkpoint). */
export function buildFfmpegArgs(input: { sourcePath: string; outputPath: string; filter: string; audioChoice: AudioChoice }): string[] {
  const args = ["-y", "-i", input.sourcePath, "-vf", input.filter, "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", "-r", "30"]
  if (input.audioChoice === "none") args.push("-an")
  else args.push("-c:a", "aac", "-b:a", "128k")
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
  if (head) {
    // Wrap the headline the SAME way the preview does, so the burned-in geometry matches.
    const lines = wrapHeadline(head)
    headLineCount = Math.max(1, lines.length)
    headFile = path.join(input.workDir, "head.txt")
    await fs.writeFile(headFile, lines.join("\n"), "utf8")
  }
  if (sub) {
    subFile = path.join(input.workDir, "sub.txt")
    await fs.writeFile(subFile, sub, "utf8")
  }
  const filter = buildVideoFilter(input.fontPath, headFile, subFile, headLineCount)
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
