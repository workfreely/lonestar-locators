/**
 * END-TO-END LOUDNESS CHECK — render a real post and measure what came out.
 *
 *   npx tsx scripts/social/voiceRenderCheck.ts --source <footage.mp4> --hook <a.m4a> --cta <b.m4a>
 *
 * Runs the ACTUAL renderReel path — the same overlay, the same mix, the same ducking, the same
 * master pass a production render uses — then measures the finished file and prints the numbers
 * that decide whether the audio is right: integrated loudness, true peak, loudness range, and
 * the level of each section against the others.
 *
 * It exists because every loudness decision in this pipeline was made from a measurement rather
 * than an opinion, and the only way to keep it that way is to be able to re-measure cheaply
 * after any change to the mix, the duck level, or the target.
 *
 * Writes to a temp directory and touches nothing in the library.
 */
import { execFile } from "node:child_process"
import { promises as fs } from "node:fs"
import path from "node:path"
import os from "node:os"
import ffmpegStatic from "ffmpeg-static"
import { renderReel, MASTER_LOUDNESS, VOICE_MIX } from "@/lib/social/renderVideo"
import { parseLoudnorm } from "@/lib/social/voiceNormalize"

const FF = (ffmpegStatic as unknown as string) || "ffmpeg"
const arg = (n: string) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] ?? null : null }

function run(args: string[]): Promise<string> {
  return new Promise((r) => execFile(FF, ["-nostdin", ...args], { maxBuffer: 1024 * 1024 * 32 }, (_e, _o, se) => r(String(se))))
}
const dur = (se: string) => { const m = /Duration:\s*(\d+):(\d\d):(\d\d(?:\.\d+)?)/.exec(se); return m ? +m[1] * 3600 + +m[2] * 60 + +m[3] : null }

async function measure(file: string, ss?: number, t?: number) {
  const seek = ss !== undefined ? ["-ss", String(ss), "-t", String(t ?? 5)] : []
  // A segment is extracted to PCM first: loudnorm's measurement of a mid-file slice is only
  // trustworthy when the decoder starts clean at the slice boundary.
  const tmp = path.join(os.tmpdir(), `seg-${Date.now()}.wav`)
  if (ss !== undefined) {
    await run(["-hide_banner", "-loglevel", "error", "-y", ...seek, "-i", file, "-vn", "-c:a", "pcm_s16le", tmp])
    const m = parseLoudnorm(await run(["-hide_banner", "-nostats", "-i", tmp, "-af", "loudnorm=print_format=json", "-f", "null", "-"]))
    await fs.rm(tmp, { force: true })
    return m
  }
  return parseLoudnorm(await run(["-hide_banner", "-nostats", "-i", file, "-af", "loudnorm=print_format=json", "-f", "null", "-"]))
}

async function main() {
  const source = arg("source"), hook = arg("hook"), cta = arg("cta")
  if (!source) { console.error("--source <footage.mp4> is required"); process.exit(1) }
  const work = await fs.mkdtemp(path.join(os.tmpdir(), "render-check-"))
  const out = path.join(work, "out.mp4")

  const srcInfo = await run(["-hide_banner", "-i", source])
  const vdur = dur(srcInfo) ?? 0
  const hdur = hook ? dur(await run(["-hide_banner", "-i", hook])) ?? 0 : 0
  const cdur = cta ? dur(await run(["-hide_banner", "-i", cta])) ?? 0 : 0

  console.log(`source   ${path.basename(source)}  ${vdur.toFixed(2)}s`)
  const srcM = await measure(source)
  console.log(`         its own audio (the bed that gets ducked): ${srcM?.inputI ?? "n/a"} LUFS\n`)
  console.log(`settings duck ${VOICE_MIX.duckLevel}  ramp ${VOICE_MIX.rampSeconds}s  |  master ${MASTER_LOUDNESS.enabled ? `${MASTER_LOUDNESS.targetLufs} LUFS / ${MASTER_LOUDNESS.truePeakDb} dBTP` : "OFF"}\n`)

  await renderReel(FF, {
    sourcePath: source, outputPath: out, workDir: work,
    fontPath: process.env.OVERLAY_FONT_PATH ?? "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    template: "market_type", headline: "SAN ANTONIO", subheadline: "LUXURY APARTMENTS",
    audioChoice: "original", platform: "tiktok",
    hookPath: hook, ctaPath: cta,
    presenterPath: null, presenterIntroSeconds: null, presenterSide: null, presenterWidthPx: null,
  } as never)

  const m = await measure(out)
  console.log("FINISHED VIDEO")
  console.log(`  integrated  ${m?.inputI} LUFS`)
  console.log(`  true peak   ${m?.inputTp} dBTP   ${(m?.inputTp ?? 0) > MASTER_LOUDNESS.truePeakDb + 0.3 ? "← ABOVE CEILING" : "ok"}`)
  console.log(`  range       ${m?.inputLra} LU`)

  if (hook || cta) {
    const ctaStart = +(vdur - cdur - 0.5).toFixed(3)
    console.log("\nSECTIONS")
    if (hook) { const s = await measure(out, 0, hdur); console.log(`  hook      0.00-${hdur.toFixed(2)}   ${s?.inputI} LUFS  TP ${s?.inputTp}  LRA ${s?.inputLra}`) }
    const gapStart = hdur + 1, gapLen = Math.max(1, ctaStart - gapStart - 1)
    if (gapLen > 1) { const s = await measure(out, gapStart, gapLen); console.log(`  bed only  ${gapStart.toFixed(2)}-${(gapStart + gapLen).toFixed(2)}  ${s?.inputI} LUFS`) }
    if (cta) { const s = await measure(out, ctaStart, cdur); console.log(`  CTA       ${ctaStart.toFixed(2)}-${(ctaStart + cdur).toFixed(2)}  ${s?.inputI} LUFS  TP ${s?.inputTp}  LRA ${s?.inputLra}`) }
  }

  // Flat samples are what clipping looks like after the fact. Zero is the only acceptable answer.
  const st = await run(["-hide_banner", "-nostats", "-i", out, "-af", "astats=metadata=1:reset=0", "-f", "null", "-"])
  const peak = /Peak level dB:\s*(-?[\d.]+)/.exec(st)?.[1]
  const flat = /Flat factor:\s*([\d.]+)/.exec(st)?.[1]
  console.log(`\nCLIPPING  peak ${peak} dBFS   flat factor ${flat}   ${Number(flat) === 0 ? "no clipped samples" : "← CLIPPING"}`)
  console.log(`\noutput: ${out}`)
}

main().catch((e) => { console.error("failed:", e.message); process.exit(1) })
