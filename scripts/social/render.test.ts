// Render regression: the FFmpeg overlay pipeline must PRESERVE the source's existing audio (map it
// through unchanged), mute only when explicitly asked, and never fabricate audio for a silent
// source. Uses ffmpeg-static to actually render short clips and inspects the output streams.
// Run: npx tsx scripts/social/render.test.ts   (skips cleanly if ffmpeg-static is unavailable)
import { execFileSync } from "node:child_process"
import { mkdtempSync, writeFileSync, existsSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import ffmpegPath from "ffmpeg-static"
import { buildVideoFilter, buildFfmpegArgs } from "@/lib/social/renderVideo"
import { OVERLAY_SPEC } from "@/lib/social/overlaySpec"

let pass = 0, fail = 0
const ok = (l: string, c: boolean) => { if (c) { pass++; console.log(`  ✓ ${l}`) } else { fail++; console.log(`  ✗ ${l}`) } }

const FF = ffmpegPath as string | null
if (!FF || !existsSync(FF)) {
  console.log("render.test: ffmpeg-static unavailable — SKIPPED")
  process.exit(0)
}
const FONT = "assets/social/fonts/BodoniModa-Head.ttf"
const dir = mkdtempSync(path.join(tmpdir(), "sa-render-test-"))
writeFileSync(path.join(dir, "head.txt"), "HOUSTON TOWNHOMES", "utf8")
writeFileSync(path.join(dir, "sub.txt"), "Starting at $1,495/mo", "utf8")

// Build a synthetic source. withAudio=true → video + a sine tone; false → video only (silent).
function makeSource(name: string, withAudio: boolean): string {
  const out = path.join(dir, name)
  const args = ["-y", "-f", "lavfi", "-i", "testsrc=size=720x1280:rate=30:d=1"]
  if (withAudio) args.push("-f", "lavfi", "-i", "sine=frequency=440:duration=1")
  args.push("-c:v", "libx264", "-t", "1")
  if (withAudio) args.push("-c:a", "aac", "-shortest")
  args.push(out)
  execFileSync(FF!, args, { stdio: "pipe" })
  return out
}
// Probe stream kinds via `ffmpeg -i` (no ffprobe needed): stderr lists "Audio:" when present.
function hasAudio(file: string): boolean {
  try { execFileSync(FF!, ["-i", file], { stdio: "pipe" }) } catch (e: any) {
    return /Stream #\d+:\d+.*: Audio:/.test(String(e.stderr ?? ""))
  }
  return false
}
function render(src: string, out: string, audioChoice: "original" | "none"): void {
  const filter = buildVideoFilter(FONT, [
    { file: path.join(dir, "head.txt"), fontPx: OVERLAY_SPEC.headline.fontPx, topPx: 250, lineSpacing: 8 },
    { file: path.join(dir, "sub.txt"), fontPx: OVERLAY_SPEC.sub.fontPx, topPx: 420, lineSpacing: 6 },
  ])
  const args = buildFfmpegArgs({ sourcePath: src, outputPath: out, filter, audioChoice })
  execFileSync(FF!, args, { stdio: "pipe" })
}

console.log("audio preservation through overlay render:")
try {
  const withAudio = makeSource("src_audio.mp4", true)
  ok("source fixture has audio", hasAudio(withAudio))
  const outKeep = path.join(dir, "out_keep.mp4")
  render(withAudio, outKeep, "original")
  ok("rendered output PRESERVES the source audio stream", existsSync(outKeep) && hasAudio(outKeep))

  const outMute = path.join(dir, "out_mute.mp4")
  render(withAudio, outMute, "none")
  ok("audioChoice 'none' mutes (no audio stream)", existsSync(outMute) && !hasAudio(outMute))

  const silent = makeSource("src_silent.mp4", false)
  ok("silent source fixture has no audio", !hasAudio(silent))
  const outSilent = path.join(dir, "out_silent.mp4")
  render(silent, outSilent, "original")
  ok("silent source stays silent (no fabricated audio)", existsSync(outSilent) && !hasAudio(outSilent))
} catch (e: any) {
  ok("render pipeline ran without error", false)
  console.error(String(e.stderr ?? e).split("\n").slice(-6).join("\n"))
}

console.log(`\nRender regression: ${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
