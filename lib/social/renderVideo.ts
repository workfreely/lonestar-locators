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
export function buildFfmpegArgs(input: { sourcePath: string; outputPath: string; filter: string; audioChoice: AudioChoice }): string[] {
  // The graph is a labelled -filter_complex ending in [v]; map that plus the source audio through.
  const args = ["-y", "-i", input.sourcePath, "-filter_complex", input.filter, "-map", "[v]", "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", "-r", "30"]
  if (input.audioChoice === "none") args.push("-an")
  else args.push("-map", "0:a?", "-c:a", "aac", "-b:a", "128k")
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
