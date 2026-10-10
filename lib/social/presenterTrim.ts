// PRESENTER CLIPS ARRIVE PADDED. Trim to the figure before compositing.
//
// ── WHY ─────────────────────────────────────────────────────────────────────────────────────
// HeyGen centres the avatar inside a full canvas and fills the rest with transparency. Measured on
// the first real clip: a 1080x1920 WebM whose figure occupied only x124..952, y572..1396 — 43% of
// the frame height, with 524px of empty space below it.
//
// The renderer anchors the presenter BY ITS BOTTOM EDGE so a taller avatar grows upward instead of
// sliding into Instagram's caption. That anchoring assumes the clip's bottom edge IS the figure's
// bottom. With padding it is not, and the figure floats ~175px above its intended footing — the
// avatar silently sits in the wrong place, with no error.
//
// ── THE ORIGINAL IS NEVER MODIFIED ──────────────────────────────────────────────────────────
// This produces a DERIVATIVE in the render's temp work dir. The generated HeyGen clip is an input,
// read-only, exactly like the source walkthrough. The same discipline the source-video protocol
// established: inputs are never edited in place.
//
// ── WHY THE ALPHA PLANE AND NOT THE PICTURE ─────────────────────────────────────────────────
// Content is found from the ALPHA channel, not from luminance. A presenter in a black shirt
// against transparency has almost no luminance signal at the shoulders, and a luma threshold would
// crop into them. Alpha says exactly which pixels are the person.
import { execFile } from "node:child_process"
import { promises as fs } from "node:fs"
import path from "node:path"

export type TrimBox = { x: number; y: number; w: number; h: number }

/** Even dimensions and origins: yuv420p chroma is subsampled 2x2, and an odd crop shifts it. */
function makeEven(b: TrimBox): TrimBox {
  const x = b.x - (b.x % 2), y = b.y - (b.y % 2)
  return { x, y, w: Math.max(2, b.w + (b.x - x)) & ~1, h: Math.max(2, b.h + (b.y - y)) & ~1 }
}

/**
 * The tightest box containing visible pixels, or null when the clip is already tight (or unreadable
 * — in which case the caller must use the clip as-is rather than guess).
 *
 * `cropdetect` is applied to the ALPHA plane, promoted to luminance by alphaextract, so ffmpeg's
 * own detector does the work on exactly the right signal.
 */
export async function detectPresenterContentBox(
  ffmpegPath: string,
  clipPath: string,
  decoder: string | null,
): Promise<TrimBox | null> {
  const args: string[] = ["-hide_banner"]
  // The decoder flag must precede its input, and for WebM it is what makes alpha exist at all.
  if (decoder) args.push("-c:v", decoder)
  args.push("-i", clipPath,
    // limit=0 ⇒ only fully transparent pixels are croppable. round=2 keeps the box even.
    // reset_count=0 ⇒ one box across the WHOLE clip, so a presenter who gestures outward in a
    // later frame is not cropped based on the first frame alone.
    "-vf", "alphaextract,cropdetect=limit=0:round=2:reset_count=0",
    "-f", "null", "-")
  const stderr = await new Promise<string>((resolve) => {
    execFile(ffmpegPath, args, { maxBuffer: 1024 * 1024 * 16 }, (_e, _o, err) => resolve(String(err ?? "")))
  })
  // Take the LAST crop= line: cropdetect refines its box as it sees more frames.
  const matches = [...stderr.matchAll(/crop=(\d+):(\d+):(\d+):(\d+)/g)]
  const last = matches.at(-1)
  if (!last) return null
  const box = { w: Number(last[1]), h: Number(last[2]), x: Number(last[3]), y: Number(last[4]) }
  if (!Number.isFinite(box.w) || !Number.isFinite(box.h) || box.w < 2 || box.h < 2) return null
  return makeEven(box)
}

/**
 * Should this box actually be applied?
 *
 * A trim that barely changes anything costs a re-encode and a generation of quality for nothing,
 * and a trim that removes almost everything means detection went wrong — cropping to a sliver is
 * far worse than leaving the padding. Both are refused.
 */
export function shouldTrim(box: TrimBox, srcW: number, srcH: number): boolean {
  if (box.w >= srcW && box.h >= srcH) return false                       // already tight
  const area = (box.w * box.h) / (srcW * srcH)
  if (area < 0.02) return false                                          // implausible — distrust it
  const removed = 1 - area
  return removed > 0.05                                                  // worth a re-encode
}

/**
 * Trim a presenter clip to its visible content, writing a derivative beside it.
 *
 * Returns the path to use. On ANY failure it returns the ORIGINAL path: a presenter that is
 * positioned slightly high is a cosmetic problem, while a failed render is a broken post, so this
 * degrades rather than throws.
 *
 * ProRes 4444 output, deliberately: it carries alpha losslessly and needs no special decoder on the
 * way back in, so the trimmed derivative cannot repeat the silent-alpha-loss trap that WebM has.
 */
export async function trimPresenterClip(input: {
  ffmpegPath: string
  clipPath: string
  decoder: string | null
  workDir: string
  /** Probed dimensions of the clip. Omit to skip the size sanity checks. */
  width?: number | null
  height?: number | null
}): Promise<{ path: string; trimmed: boolean; box: TrimBox | null; reason?: string }> {
  const { ffmpegPath, clipPath, decoder, workDir } = input
  let box: TrimBox | null = null
  try {
    box = await detectPresenterContentBox(ffmpegPath, clipPath, decoder)
  } catch {
    return { path: clipPath, trimmed: false, box: null, reason: "detect_failed" }
  }
  if (!box) return { path: clipPath, trimmed: false, box: null, reason: "no_box_detected" }

  if (typeof input.width === "number" && typeof input.height === "number") {
    if (!shouldTrim(box, input.width, input.height)) {
      return { path: clipPath, trimmed: false, box, reason: "trim_not_worthwhile" }
    }
  }

  const out = path.join(workDir, "presenter-trimmed.mov")
  const args = ["-y", "-hide_banner", "-loglevel", "error"]
  if (decoder) args.push("-c:v", decoder)
  args.push("-i", clipPath,
    "-vf", `crop=${box.w}:${box.h}:${box.x}:${box.y},format=yuva444p10le`,
    "-c:v", "prores_ks", "-profile:v", "4444", "-pix_fmt", "yuva444p10le",
    "-an",                                   // the presenter's audio rides the Voice Clip path
    out)
  try {
    await new Promise<void>((resolve, reject) => {
      execFile(ffmpegPath, args, { maxBuffer: 1024 * 1024 * 16 }, (e, _o, err) =>
        e ? reject(new Error(String(err ?? e).slice(0, 300))) : resolve())
    })
    await fs.access(out)
  } catch {
    return { path: clipPath, trimmed: false, box, reason: "trim_failed" }
  }
  return { path: out, trimmed: true, box }
}
