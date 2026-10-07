// THE render. Preservation-first: the source video and audio are treated as masters, and the only
// thing deliberately supersampled is the typography.
import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { promises as fs } from "node:fs"
import path from "node:path"
import sharp from "sharp"
import { withContext } from "./browser.mjs"

const run = promisify(execFile)
export const SCALE = 4
export const CANVAS = { w: 1080, h: 1920 }
const FONT = process.env.OVERLAY_FONT ?? "/app/assets/social/fonts/LibreBaskerville-Head.ttf"

const sh = async (bin, args) => {
  try { const { stdout, stderr } = await run(bin, args, { maxBuffer: 1 << 26 }); return stdout + stderr }
  catch (e) { throw new Error(`${path.basename(bin)} exit=${e.code} signal=${e.signal}: ${String(e.stderr ?? e).slice(-400)}`) }
}

/** ffmpeg prints its banner to stderr and exits non-zero with no output file — that IS the probe. */
export async function probe(file) {
  try { await run("ffmpeg", ["-hide_banner", "-i", file], { maxBuffer: 1 << 24 }) } catch (e) { return String(e.stderr ?? "") }
  return ""
}

export function parseSource(stderr) {
  const v = /Stream #\d+:\d+.*:\s*Video:.*/.exec(stderr)?.[0] ?? ""
  const a = /Stream #\d+:\d+.*:\s*Audio:\s*([A-Za-z0-9_]+)/.exec(stderr)
  const dims = [...v.matchAll(/\b(\d{2,5})x(\d{2,5})\b/g)].pop()
  const fps = Number(/([\d.]+)\s*fps\b/.exec(v)?.[1])
  const transfer = /\b(arib-std-b67|smpte2084|bt709|bt470bg|smpte170m|linear)\b/i.exec(v)?.[1]?.toLowerCase() ?? null
  const depthM = /\byuva?\d{3}p(\d{1,2})(?:le|be)?\b/i.exec(v)
  const bitDepth = depthM ? Number(depthM[1]) : /\byuva?\d{3}p\b/i.test(v) ? 8 : null
  const width = dims ? Number(dims[1]) : null, height = dims ? Number(dims[2]) : null
  // Tone-mapping is destructive, so it needs corroborating evidence: an HDR transfer curve AND
  // >=10-bit. An 8-bit file claiming HLG is mis-tagged, and acting on it would wash out SDR footage.
  const isHdr = !!transfer && /^(arib-std-b67|smpte2084)$/.test(transfer) && bitDepth !== null && bitDepth >= 10
  return { width, height, fps: Number.isFinite(fps) && fps > 0 ? fps : null, colorTransfer: transfer, bitDepth, isHdr,
    audioCodec: a ? a[1].toLowerCase() : null,
    belowDelivery: width !== null && height !== null && (width < CANVAS.w || height < CANVAS.h) }
}

export function sourceChain(info) {
  const steps = []
  if (info.isHdr) steps.push("zscale=t=linear:npl=100", "tonemap=hable:desat=0", "zscale=p=bt709:t=bt709:m=bt709:r=tv")
  // Already the delivery canvas? Do not resample it at all.
  if (!(info.width === CANVAS.w && info.height === CANVAS.h)) {
    steps.push(`scale=${CANVAS.w}:${CANVAS.h}:force_original_aspect_ratio=increase:flags=lanczos`, `crop=${CANVAS.w}:${CANVAS.h}`)
  }
  steps.push("format=yuv420p")
  return steps.join(",")
}

/** Chromium renders the overlay at 4x, then ONE lanczos3 downsample to a lossless transparent PNG. */
export async function renderOverlay(markup, outPng) {
  const fontB64 = await fs.readFile(FONT, "base64")
  const page = `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:"OverlayHead";src:url(data:font/ttf;base64,${fontB64}) format("truetype");font-weight:100 900;font-display:block}
@font-face{font-family:"OverlayDetail";src:url(data:font/ttf;base64,${fontB64}) format("truetype");font-weight:100 900;font-display:block}
html,body{margin:0;padding:0;background:transparent}
.stage{position:relative;width:${CANVAS.w * SCALE}px;height:${CANVAS.h * SCALE}px;overflow:hidden}
.pointer-events-none{pointer-events:none}.absolute{position:absolute}.inset-0{top:0;right:0;bottom:0;left:0}
</style></head><body><div class="stage">${markup}</div></body></html>`

  const t = Date.now()
  const shot = await withContext({ width: CANVAS.w * SCALE, height: CANVAS.h * SCALE }, async (ctx) => {
    const p = await ctx.newPage()
    await p.setContent(page, { waitUntil: "load" })
    await p.evaluate(() => document.fonts.ready)
    // FONT GUARD. A silent fallback to a system serif is invisible in a thumbnail and would ship
    // the wrong typeface to every post, so refuse rather than render it.
    const fam = await p.evaluate(() => {
      const el = document.querySelector(".stage > div > div")
      return el ? getComputedStyle(el).fontFamily.split(",")[0].replace(/["']/g, "") : null
    })
    if (fam !== "OverlayHead") throw new Error(`overlay font did not load (computed "${fam}") — refusing to render with a fallback face`)
    return p.screenshot({ omitBackground: true })
  })
  const chromiumMs = Date.now() - t

  const d = Date.now()
  await sharp(shot).resize(CANVAS.w, CANVAS.h, { kernel: "lanczos3" }).png({ compressionLevel: 9 }).toFile(outPng)
  return { chromiumMs, downsampleMs: Date.now() - d, rawBytes: shot.length }
}

/** Composite + ONE delivery encode. Audio is stream-copied unless that is impossible. */
export async function composite({ srcPath, overlayPng, outPath, info }) {
  const args = ["-y", "-i", srcPath, "-i", overlayPng, "-filter_complex",
    `[0:v]${sourceChain(info)}[bg];[bg][1:v]overlay=0:0:format=auto[v]`, "-map", "[v]", "-map", "0:a?",
    "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-profile:v", "high", "-level", "4.2", "-pix_fmt", "yuv420p",
    "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709"]
  // Preserve source FPS up to 60: emit -r ONLY to correct an unreadable or out-of-range rate.
  if (info.fps === null) args.push("-r", "30")
  else if (info.fps > 60) args.push("-r", "60")
  // Audio: copy when the codec is valid in an MP4 and accepted by both platforms (allow-list).
  const copyAudio = info.audioCodec === "aac"
  args.push(...(copyAudio ? ["-c:a", "copy"] : ["-c:a", "aac", "-b:a", "256k"]))
  args.push("-movflags", "+faststart", outPath)
  const t = Date.now()
  await sh("ffmpeg", args)
  return { encodeMs: Date.now() - t, audioMode: copyAudio ? "stream-copy" : "re-encoded-aac-256k" }
}
