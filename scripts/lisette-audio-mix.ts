// LISETTE'S SOUTH SIDE LIVING MIX — using Social Beast's own approved audio treatment.
//
// Run: npx tsx scripts/lisette-audio-mix.ts
//
// ── WHY THIS IMPORTS THE PIPELINE INSTEAD OF COPYING ITS NUMBERS ────────────────────────────
// The operator asked for the SAME treatment his own videos get, and said his settings are
// read-only for this task. So this script READS them — it imports VOICE_NORMALIZE, VOICE_MIX,
// MASTER_LOUDNESS and the filter builders and uses whatever they currently say. Nothing is
// re-typed, so there is no second copy of the numbers to drift, and if the pipeline is retuned
// later this script follows it. It writes nothing back and touches no pipeline file.
//
// ── WHAT THE APPROVED TREATMENT IS ──────────────────────────────────────────────────────────
//   VOICE   acompressor (only above a 16 dB crest), then two-pass loudnorm to VOICE_NORMALIZE
//   BED     aformat to the mix format, then a time-based gain envelope: full level normally,
//           falling to VOICE_MIX.duckLevel while a voice window is active, with
//           VOICE_MIX.rampSeconds ramps either side
//   MIX     amix with normalize=0, because amix's default divides by the input count
//   MASTER  two-pass loudnorm to MASTER_LOUDNESS over the finished mix
// There is deliberately NO limiter anywhere in it: the TP ask plus the delivered-peak ceiling is
// how this pipeline protects against clipping, so adding one would not be the same treatment.
//
// ── THE ONE THING THAT IS NOT IDENTICAL, AND WHY ────────────────────────────────────────────
// The renderer ducks around a Hook at the start and a CTA at the end — two windows it already
// knows, because it placed them. Lisette's voiceover is continuous speech with pauses in it, so
// there are no given windows. They are MEASURED from her audio with silencedetect and fed to the
// pipeline's own duckVolumeExpr, which then produces the same curve it always produces. The duck
// level, the ramp and the envelope maths are untouched; only where the windows come from differs.
import { spawnSync } from "node:child_process"
import { writeFileSync } from "node:fs"
import ffmpegPath from "ffmpeg-static"
import {
  VOICE_NORMALIZE, measureFilter, applyFilter, parseLoudnorm, crestFactorDb, needsCompression,
} from "../lib/social/voiceNormalize"
import { VOICE_MIX, duckVolumeExpr, MASTER_LOUDNESS, masterMeasureFilter, masterApplyFilter, type VoiceWindow } from "../lib/social/renderVideo"

const FF = ffmpegPath as unknown as string
const DIR = "/Users/jaymorris/Desktop/Social Beast Properties/Lisette's (South Side Living) "
const VOICE = `${DIR}/Lisette Video Voiceover.MOV`
const MUSIC = `${DIR}/Lisette Video Music.MOV`
const OUT = "/Users/jaymorris/Desktop/Lisette - Southside Living - Final V2.mp4"

// ffmpeg writes EVERYTHING of interest — loudnorm's JSON, silencedetect's lines, the stream
// summary — to stderr, and exits 0. execFileSync hands back stdout only, which is why the first
// attempt at this read every measurement as empty. spawnSync gives both streams.
const run = (args: string[]): string => {
  const r = spawnSync(FF, ["-hide_banner", "-nostats", ...args], { encoding: "utf8", maxBuffer: 128 * 1024 * 1024 })
  return `${r.stdout ?? ""}\n${r.stderr ?? ""}`
}
const runOrThrow = (args: string[]): string => {
  const r = spawnSync(FF, ["-hide_banner", "-nostats", ...args], { encoding: "utf8", maxBuffer: 128 * 1024 * 1024 })
  if (r.status !== 0) {
    console.error((r.stderr ?? "").split("\n").slice(-12).join("\n"))
    throw new Error(`ffmpeg exited ${r.status}`)
  }
  return `${r.stdout ?? ""}\n${r.stderr ?? ""}`
}

console.log("THE APPROVED TREATMENT, as the pipeline currently defines it")
console.log(`  voice target        I=${VOICE_NORMALIZE.targetLufs} LUFS  TP=${VOICE_NORMALIZE.truePeakDb}  LRA=${VOICE_NORMALIZE.loudnessRange}`)
console.log(`  voice compressor    ${VOICE_NORMALIZE.compressor}`)
console.log(`  compress above      ${VOICE_NORMALIZE.compressAboveCrestDb} dB crest`)
console.log(`  duck level          ${VOICE_MIX.duckLevel}  (bed falls to ${(VOICE_MIX.duckLevel * 100).toFixed(0)}% while she speaks)`)
console.log(`  ramp                ${VOICE_MIX.rampSeconds} s each way`)
console.log(`  mix format          ${VOICE_MIX.sampleRate} Hz ${VOICE_MIX.channelLayout}`)
console.log(`  master              enabled=${MASTER_LOUDNESS.enabled}  I=${MASTER_LOUDNESS.targetLufs} LUFS  TP=${MASTER_LOUDNESS.truePeakDb}  LRA=${MASTER_LOUDNESS.loudnessRange}`)
console.log(`  delivered peak must measure <= ${MASTER_LOUDNESS.maxEncodedTruePeakDb} dBTP`)

// ── HER SPEECH WINDOWS, MEASURED ────────────────────────────────────────────────────────────
// silencedetect reports the GAPS; the windows are what is left between them. -45 dB / 0.3 s is
// chosen to find real pauses rather than the space between words.
const sd = run(["-i", VOICE, "-map", "0:a", "-af", "silencedetect=noise=-45dB:d=0.3", "-f", "null", "-"])
const dm = /Duration: (\d+):(\d+):([\d.]+)/.exec(sd)
const dur = dm ? Number(dm[1]) * 3600 + Number(dm[2]) * 60 + Number(dm[3]) : 0
const gaps: { start: number; end: number }[] = []
const re = /silence_start: ([\d.]+)[\s\S]*?silence_end: ([\d.]+)/g
let m: RegExpExecArray | null
while ((m = re.exec(sd)) !== null) gaps.push({ start: Number(m[1]), end: Number(m[2]) })

const windows: VoiceWindow[] = []
let cursor = 0
for (const g of gaps) {
  if (g.start > cursor + 0.05) windows.push({ startSeconds: cursor, endSeconds: g.start })
  cursor = g.end
}
if (cursor < dur - 0.05) windows.push({ startSeconds: cursor, endSeconds: dur })

console.log(`\nHER SPEECH, measured (video ${dur.toFixed(2)} s)`)
for (const w of windows) console.log(`  speaks  ${w.startSeconds.toFixed(2)} - ${w.endSeconds.toFixed(2)} s`)
for (const g of gaps) console.log(`  pause   ${g.start.toFixed(2)} - ${g.end.toFixed(2)} s  (${(g.end - g.start).toFixed(2)} s)`)

// ── VOICE STAGE, PASS ONE ───────────────────────────────────────────────────────────────────
// Measured first WITHOUT compression so the crest decision uses her untouched audio, exactly as
// needsCompression is meant to be asked.
const probe = parseLoudnorm(run(["-i", VOICE, "-map", "0:a", "-af", measureFilter(false), "-f", "null", "-"]))
if (!probe) { console.error("could not measure her voiceover"); process.exit(1) }
const crest = crestFactorDb(probe)
const compress = needsCompression(probe)
console.log(`\nHER VOICE, as recorded`)
console.log(`  integrated  ${probe.inputI} LUFS`)
console.log(`  true peak   ${probe.inputTp} dBTP`)
console.log(`  crest       ${crest.toFixed(1)} dB  ->  compressor ${compress ? "APPLIES" : "does not apply"} (threshold ${VOICE_NORMALIZE.compressAboveCrestDb} dB)`)

// Re-measure through the chain she will actually get, which is what applyFilter's numbers must
// describe — the same reason the pipeline measures with its `pre` attached.
const voiceMeasure = compress ? parseLoudnorm(run(["-i", VOICE, "-map", "0:a", "-af", measureFilter(true), "-f", "null", "-"])) : probe
if (!voiceMeasure) { console.error("could not measure her voiceover through the compressor"); process.exit(1) }
const voiceChain = applyFilter(voiceMeasure, compress)

// ── THE MIX GRAPH ───────────────────────────────────────────────────────────────────────────
const fmt = `aformat=sample_fmts=fltp:sample_rates=${VOICE_MIX.sampleRate}:channel_layouts=${VOICE_MIX.channelLayout}`

// ── WHY THE ENVELOPE IS REBUILT HERE RATHER THAN TAKEN FROM duckVolumeExpr ──────────────────
// duckVolumeExpr joins every window into ONE max(...) call. ffmpeg's max() takes exactly two
// arguments, so with three windows it emits max(a,b,c) and the filter graph fails to initialise:
//
//   Error when evaluating the volume expression '1-0.800*max(min(...),min(...),min(...))'
//
// That is dormant in the renderer, which only ever has a Hook and a CTA — two windows, and
// max(a,b) is valid. Lisette's continuous voiceover has three. The operator's settings are
// read-only for this task, so the pipeline is left exactly as it is and the fold is done here,
// nesting the calls as max(a, max(b, c)).
//
// EVERY NUMBER STILL COMES FROM THEIRS: duckLevel, rampSeconds and the envelope maths are
// VOICE_MIX's. The assertion below proves it — for the window counts duckVolumeExpr handles
// correctly, this builder must produce a byte-identical string.
const envelope = (w: VoiceWindow): string => {
  const R = VOICE_MIX.rampSeconds
  const a = w.startSeconds.toFixed(3)
  const b = (w.endSeconds + R).toFixed(3)
  return `min(clip((t-${a})/${R}\\,0\\,1)\\,clip((${b}-t)/${R}\\,0\\,1))`
}
const foldMax = (xs: string[]): string => xs.length === 1 ? xs[0] : `max(${xs[0]}\\,${foldMax(xs.slice(1))})`
const buildDuckExpr = (ws: VoiceWindow[]): string =>
  `1-${(1 - VOICE_MIX.duckLevel).toFixed(3)}*${foldMax(ws.map(envelope))}`

for (const sample of [[windows[0]], [windows[0], windows[1]]] as VoiceWindow[][]) {
  if (buildDuckExpr(sample) !== duckVolumeExpr(sample)) {
    console.error(`REFUSING: this builder disagrees with the pipeline's duckVolumeExpr at ${sample.length} window(s).`)
    console.error(`  pipeline: ${duckVolumeExpr(sample)}`)
    console.error(`  here:     ${buildDuckExpr(sample)}`)
    process.exit(1)
  }
}
console.log(`\n  verified: this envelope matches the pipeline's duckVolumeExpr byte-for-byte at 1 and 2 windows`)

const duckExpr = buildDuckExpr(windows)
// ── THE MIX, AS THE PIPELINE BUILDS IT ───────────────────────────────────────────────────────
// V1 of this file had the audio stop 2.95 s before the last frame. Two deviations from the
// renderer caused it, both mine:
//
//   1. amix duration=FIRST instead of LONGEST. The voice chain ends in loudnorm, which buffers
//      ahead; amix took the first input's end as the mix's end and cut roughly a lookahead's
//      worth off the tail. Measured: duration=first gave 16.99 s, duration=longest 20.21 s.
//   2. The apad,atrim stage was missing entirely. The renderer's own comment is exact about what
//      it is for — "apad then atrim pins the audio to EXACTLY the video duration in both
//      directions" — extending a short mix with silence and hard-cutting a long one.
//
// Both are now what renderVideo does. The trim end is the video's container duration, so the
// audio covers the final frame rather than stopping a few milliseconds inside it.
const mixGraph =
  `[0:a]${fmt},${voiceChain}[avoice];` +
  `[1:a]${fmt},volume=eval=frame:volume='${duckExpr}'[abed];` +
  `[avoice][abed]amix=inputs=2:duration=longest:normalize=0[amix];` +
  `[amix]apad,atrim=end=${dur.toFixed(3)},asetpts=N/SR/TB[amixed]`

console.log(`\nTHE BED ENVELOPE (the pipeline's own duckVolumeExpr)\n  ${duckExpr}`)

// ── MASTER, PASS ONE: measure the finished mix ──────────────────────────────────────────────
const masterRaw = run([
  "-i", VOICE, "-i", MUSIC, "-filter_complex", `${mixGraph};[amixed]${masterMeasureFilter()}[aout]`,
  "-map", "[aout]", "-f", "null", "-",
])
const masterProbe = parseLoudnorm(masterRaw)
if (!masterProbe) {
  console.error("could not measure the mix — ffmpeg said:")
  console.error(masterRaw.split("\n").filter((l) => /error|Error|Invalid|No such|Unable/.test(l)).slice(0, 8).join("\n") || masterRaw.split("\n").slice(-12).join("\n"))
  process.exit(1)
}
console.log(`\nTHE MIX BEFORE MASTERING\n  integrated ${masterProbe.inputI} LUFS   true peak ${masterProbe.inputTp} dBTP`)

// ── MASTER, PASS TWO: render ────────────────────────────────────────────────────────────────
// -c:v copy: her footage is passed through untouched, so resolution, quality and duration are
// bit-identical to what she shot. -tag:v hvc1 so QuickTime will open the HEVC it contains.
const finalGraph = `${mixGraph};[amixed]${masterApplyFilter(masterProbe)}[aout]`
console.log(`\nrendering ${OUT}`)
runOrThrow([
  "-y", "-i", VOICE, "-i", MUSIC,
  "-filter_complex", finalGraph,
  "-map", "0:v", "-map", "[aout]",
  "-c:v", "copy", "-tag:v", "hvc1",
  "-c:a", "aac", "-b:a", "192k", "-ar", String(VOICE_MIX.sampleRate),
  "-movflags", "+faststart",
  OUT,
])
console.log("rendered")

writeFileSync("/tmp/lisette_mix_graph.txt", finalGraph)
