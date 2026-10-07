// VOICE CLIPS + AUTOMATIC DUCKING — real-FFmpeg verification of the mixed audio.
//
// The trick that makes ducking measurable: most fixtures use a SILENT voice clip (a real audio
// stream carrying silence). The output level in the voice window is then exactly the music bed times
// the duck gain, with nothing added on top — so RMS directly proves "bed at 20%". Separate fixtures
// use an AUDIBLE voice to prove the voice itself survives, especially under "No Music".
//
// Run: npx tsx scripts/social/voiceDucking.test.ts   (skips cleanly if ffmpeg-static is unavailable)
import { execFileSync } from "node:child_process"
import { mkdtempSync, existsSync, writeFileSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import ffmpegPath from "ffmpeg-static"
import {
  renderReel, buildAudioFilter, buildFfmpegArgs, computeVoiceWindows, duckVolumeExpr, parseProbe, VOICE_MIX,
} from "@/lib/social/renderVideo"

let pass = 0, fail = 0
const ok = (l: string, c: boolean) => { if (c) { pass++; console.log(`  ✓ ${l}`) } else { fail++; console.log(`  ✗ ${l}`) } }

const FF = ffmpegPath as string | null
if (!FF || !existsSync(FF)) { console.log("voiceDucking.test: ffmpeg-static unavailable — SKIPPED"); process.exit(0) }
const dir = mkdtempSync(path.join(tmpdir(), "sa-voice-test-"))
const FONT = "assets/social/fonts/LibreBaskerville-Head.ttf"
const DETAIL_FONT = "assets/social/fonts/BodoniModa-Detail.ttf"

// ── fixtures ─────────────────────────────────────────────────────────────────────────────────
/** Video with a CONSTANT full-scale tone as its "music bed" (amplitude 1.0 ⇒ easy level maths). */
function makeVideo(name: string, seconds: number, opts: { audio: boolean; rate?: number; channels?: number } = { audio: true }): string {
  const out = path.join(dir, name)
  const args = ["-y", "-f", "lavfi", "-i", `testsrc=size=360x640:rate=30:d=${seconds}`]
  if (opts.audio) args.push("-f", "lavfi", "-i", `sine=frequency=440:duration=${seconds}:sample_rate=${opts.rate ?? 48000}`)
  args.push("-c:v", "libx264", "-t", String(seconds))
  if (opts.audio) args.push("-c:a", "aac", "-ac", String(opts.channels ?? 2), "-shortest")
  args.push(out)
  execFileSync(FF!, args, { stdio: "pipe" })
  return out
}
/** A voice clip. silent=true ⇒ a real stream carrying silence (isolates the bed for measurement). */
function makeClip(name: string, seconds: number, opts: { silent: boolean; rate?: number; channels?: number }): string {
  const out = path.join(dir, name)
  const src = opts.silent
    ? `anullsrc=r=${opts.rate ?? 48000}:cl=${(opts.channels ?? 2) === 1 ? "mono" : "stereo"}`
    : `sine=frequency=1200:duration=${seconds}:sample_rate=${opts.rate ?? 48000}`
  execFileSync(FF!, ["-y", "-f", "lavfi", "-i", src, "-t", String(seconds), "-c:a", "aac", "-ac", String(opts.channels ?? 2), out], { stdio: "pipe" })
  return out
}

/** Decode the output's audio to mono 48k PCM and return per-sample amplitudes in [-1, 1]. */
function pcm(file: string): Float64Array {
  const raw = execFileSync(FF!, ["-v", "quiet", "-i", file, "-map", "0:a", "-f", "s16le", "-acodec", "pcm_s16le", "-ar", "48000", "-ac", "1", "-"], { maxBuffer: 1 << 28 })
  const n = Math.floor(raw.length / 2)
  const out = new Float64Array(n)
  for (let i = 0; i < n; i++) out[i] = raw.readInt16LE(i * 2) / 32768
  return out
}
/** RMS across [fromSeconds, toSeconds) of a 48k mono buffer. */
function rms(buf: Float64Array, fromSeconds: number, toSeconds: number): number {
  const a = Math.max(0, Math.floor(fromSeconds * 48000)), b = Math.min(buf.length, Math.floor(toSeconds * 48000))
  if (b <= a) return 0
  let s = 0
  for (let i = a; i < b; i++) s += buf[i] * buf[i]
  return Math.sqrt(s / (b - a))
}
function durationOf(file: string): number {
  try { execFileSync(FF!, ["-hide_banner", "-i", file], { stdio: "pipe" }) } catch (e: any) {
    return parseProbe(String(e.stderr ?? "")).durationSeconds ?? 0
  }
  return 0
}
function hasAudioStream(file: string): boolean {
  try { execFileSync(FF!, ["-hide_banner", "-i", file], { stdio: "pipe" }) } catch (e: any) {
    return parseProbe(String(e.stderr ?? "")).hasAudio
  }
  return false
}
async function render(name: string, src: string, o: { audioChoice?: "original" | "none"; hook?: string | null; cta?: string | null } = {}): Promise<string> {
  const out = path.join(dir, name)
  await renderReel(FF!, {
    sourcePath: src, outputPath: out, fontPath: FONT, detailFontPath: DETAIL_FONT,
    template: "market_type", headline: "SAN ANTONIO TOWNHOMES", subheadline: "Starting at $1,800/month",
    audioChoice: o.audioChoice ?? "original", workDir: dir, hookPath: o.hook ?? null, ctaPath: o.cta ?? null,
  })
  return out
}

// ── pure unit assertions ─────────────────────────────────────────────────────────────────────
console.log("timing + graph (pure):")
ok("duck level 0.2 and ramp 0.25s are centralized", VOICE_MIX.duckLevel === 0.2 && VOICE_MIX.rampSeconds === 0.25)
{
  const w = computeVoiceWindows(10, 2.5, 3)
  ok("Hook is anchored at 0", w.hook!.startSeconds === 0 && w.hook!.endSeconds === 2.5)
  ok("CTA is anchored to the end (duration - ctaDuration .. duration)", w.cta!.startSeconds === 7 && w.cta!.endSeconds === 10)
}
{
  const w = computeVoiceWindows(5, 9, 9) // both clips longer than the video
  ok("a clip longer than the video is clamped INTO it, never past it",
    w.hook!.endSeconds === 5 && w.cta!.startSeconds === 0 && w.cta!.endSeconds === 5)
}
ok("no voice clips ⇒ no audio graph at all (branch A stays byte-identical)",
  buildAudioFilter({ useSourceAudio: true, hookInput: null, ctaInput: null, hook: null, cta: null, videoDurationSeconds: 10 }) === null)
ok("amix never normalizes (its default would halve every input)",
  (buildAudioFilter({ useSourceAudio: true, hookInput: 1, ctaInput: 2, ...computeVoiceWindows(10, 2, 2), videoDurationSeconds: 10 }) ?? "").includes("normalize=0"))
ok("the mix is always trimmed to the video duration",
  (buildAudioFilter({ useSourceAudio: true, hookInput: 1, ctaInput: null, hook: computeVoiceWindows(10, 2, null).hook, cta: null, videoDurationSeconds: 10 }) ?? "").includes("atrim=end=10.000"))
ok("the voice chain carries no gain filter — clips play at their own level",
  !/\[1:a\][^;]*volume/.test(buildAudioFilter({ useSourceAudio: true, hookInput: 1, ctaInput: null, hook: computeVoiceWindows(10, 2, null).hook, cta: null, videoDurationSeconds: 10 }) ?? ""))
ok("overlapping windows duck ONCE (max, not multiplied)", duckVolumeExpr([{ startSeconds: 0, endSeconds: 2 }, { startSeconds: 1, endSeconds: 3 }]).startsWith("1-0.800*max("))
{
  const a = buildFfmpegArgs({ sourcePath: "s.mp4", outputPath: "o.mp4", filter: "[0:v]null[v]", audioChoice: "original" })
  ok("without voice the arg list is the ORIGINAL one (-map 0:a?, no extra inputs)",
    a.join(" ").includes("-map 0:a?") && a.filter((x) => x === "-i").length === 1)
  const b = buildFfmpegArgs({ sourcePath: "s.mp4", outputPath: "o.mp4", filter: "[0:v]null[v]", audioChoice: "original", extraInputs: ["h.m4a"], audioFilter: "[1:a]anull[aout]" })
  // A voice mix CANNOT be stream-copied, so this path always re-encodes. It was pinned at 128k only
  // because that was the pre-existing value; the bitrate is not a TikTok/Instagram requirement (both
  // accept well above it). Raised to 192k so the one unavoidable audio generation costs less — the
  // no-voice path now avoids re-encoding entirely via -c:a copy.
  ok("with voice: extra input added, [aout] mapped, re-encoded AAC at >=128k",
    b.filter((x) => x === "-i").length === 2 && b.join(" ").includes("-map [aout]") && /-b:a (1[2-9]\d|[2-9]\d\d)k/.test(b.join(" ")))
  ok("with voice the audio is NEVER stream-copied (a mix has to be encoded)", !b.join(" ").includes("-c:a copy"))
  ok("the approved VIDEO graph is passed through untouched", b[b.indexOf("-filter_complex") + 1].startsWith("[0:v]null[v];"))
}

// ── real FFmpeg ──────────────────────────────────────────────────────────────────────────────
async function main() {
  const V10 = makeVideo("v10.mp4", 10, { audio: true })
  // FFmpeg's lavfi `sine` is NOT full scale (~0.062 RMS), so every level assertion below is RELATIVE
  // to the fixtures' own measured levels rather than to an invented absolute threshold.
  const BED = rms(pcm(V10), 1, 9)
  ok(`fixture bed measured (${BED.toFixed(4)} RMS)`, BED > 0.01)
  const SILENT10 = makeVideo("v10s.mp4", 10, { audio: false })
  const HOOK = makeClip("hook.m4a", 2, { silent: true })
  const CTA = makeClip("cta.m4a", 2, { silent: true })
  const HOOK_LOUD = makeClip("hookL.m4a", 2, { silent: false })
  const CTA_LOUD = makeClip("ctaL.m4a", 2, { silent: false })
  const VOICE = rms(pcm(HOOK_LOUD), 0.3, 1.7)
  ok(`fixture voice measured (${VOICE.toFixed(4)} RMS)`, VOICE > 0.01)

  console.log("\nA. source audio, NO voice clips — current behaviour preserved:")
  {
    const out = await render("A.mp4", V10)
    const p = pcm(out)
    const mid = rms(p, 1, 9)
    ok("audio preserved and NOT ducked anywhere", mid > BED * 0.9)
    ok("level is flat across the whole clip", Math.abs(rms(p, 0.5, 2) - rms(p, 7, 9)) < BED * 0.1)
    ok("duration unchanged", Math.abs(durationOf(out) - 10) < 0.3)
  }

  console.log("\nB. source audio + HOOK — ducks only at the start:")
  {
    const out = await render("B.mp4", V10, { hook: HOOK })
    const p = pcm(out)
    const inHook = rms(p, 0.4, 1.9), after = rms(p, 4, 9)
    ok(`bed ≈20% during the Hook (ratio ${(inHook / after).toFixed(2)})`, inHook / after > 0.12 && inHook / after < 0.30)
    ok("bed back to full after the Hook", after > BED * 0.9)
    ok("output never exceeds the source duration", durationOf(out) <= 10.3)
  }

  console.log("\nC. source audio + CTA — ducks only at the end:")
  {
    const out = await render("C.mp4", V10, { cta: CTA })
    const p = pcm(out)
    const before = rms(p, 1, 7), inCta = rms(p, 8.3, 9.8)
    ok("bed full before the CTA", before > BED * 0.9)
    ok(`bed ≈20% during the CTA (ratio ${(inCta / before).toFixed(2)})`, inCta / before > 0.12 && inCta / before < 0.30)
    ok("the CTA ends with the video", Math.abs(durationOf(out) - 10) < 0.3)
  }

  console.log("\nD. source audio + HOOK + CTA — ducks independently around both:")
  {
    const out = await render("D.mp4", V10, { hook: HOOK, cta: CTA })
    const p = pcm(out)
    const inHook = rms(p, 0.4, 1.9), middle = rms(p, 4, 7), inCta = rms(p, 8.3, 9.8)
    ok("middle section is at full level", middle > BED * 0.9)
    ok(`Hook region ducked (ratio ${(inHook / middle).toFixed(2)})`, inHook / middle > 0.12 && inHook / middle < 0.30)
    ok(`CTA region ducked (ratio ${(inCta / middle).toFixed(2)})`, inCta / middle > 0.12 && inCta / middle < 0.30)
    ok("duration unchanged", Math.abs(durationOf(out) - 10) < 0.3)
  }

  console.log("\nI. No Music + voice — voice plays over SILENCE (bed removed, voice kept):")
  for (const [label, o] of [["Hook", { hook: HOOK_LOUD }], ["CTA", { cta: CTA_LOUD }], ["Hook+CTA", { hook: HOOK_LOUD, cta: CTA_LOUD }]] as const) {
    const out = await render(`I_${label}.mp4`, V10, { audioChoice: "none", ...o })
    const p = pcm(out)
    const voiceRegion = "hook" in o ? rms(p, 0.3, 1.7) : rms(p, 8.3, 9.7)
    const quietRegion = rms(p, 4, 6)
    ok(`No Music + ${label}: the voice is audible`, voiceRegion > VOICE * 0.5)
    ok(`No Music + ${label}: the music bed is gone (middle silent)`, quietRegion < BED * 0.05)
  }

  console.log("\nE-G. source video with NO audio stream + voice:")
  {
    const out = await render("E.mp4", SILENT10, { hook: HOOK_LOUD, cta: CTA_LOUD })
    const p = pcm(out)
    ok("Hook audible over silence", rms(p, 0.3, 1.7) > VOICE * 0.5)
    ok("CTA audible over silence", rms(p, 8.3, 9.7) > VOICE * 0.5)
    ok("nothing fabricated in between", rms(p, 4, 6) < VOICE * 0.05)
    ok("duration unchanged", Math.abs(durationOf(out) - 10) < 0.3)
    // apad: a 2s Hook over a 10s video must still yield a FULL-LENGTH audio track, not one that
    // stops at 2s and leaves players with a truncated stream.
    ok("audio track spans the whole video (apad)", Math.abs(p.length / 48000 - 10) < 0.3)
  }

  console.log("\nH. silent video, no voice — stays silent:")
  {
    const out = await render("H.mp4", SILENT10)
    ok("no audio stream fabricated", !hasAudioStream(out))
  }

  console.log("\nShort video: Hook and CTA OVERLAP:")
  {
    const V3 = makeVideo("v3.mp4", 3, { audio: true })
    const out = await render("OV.mp4", V3, { hook: HOOK, cta: CTA }) // 2s + 2s over a 3s video
    const p = pcm(out)
    ok("render succeeds and does not extend the video", Math.abs(durationOf(out) - 3) < 0.35)
    ok("bed stays ducked across the whole overlap", rms(p, 0.4, 2.6) / Math.max(1e-9, rms(p, 0, 0.05)) < 0.6)
  }

  console.log("\nVoice clip LONGER than the source video:")
  {
    const V3 = makeVideo("v3b.mp4", 3, { audio: true })
    const LONG = makeClip("long.m4a", 8, { silent: true })
    const out = await render("LONG.mp4", V3, { hook: LONG })
    ok("output is trimmed to the source duration, never extended", durationOf(out) <= 3.35)
  }

  console.log("\nMismatched mono / sample rate:")
  {
    const V = makeVideo("v44.mp4", 6, { audio: true, rate: 44100, channels: 1 })
    const MONO22 = makeClip("mono22.m4a", 2, { silent: false, rate: 22050, channels: 1 })
    const out = await render("MIX.mp4", V, { hook: MONO22 })
    ok("mono 22.05k voice over mono 44.1k bed renders", existsSync(out) && hasAudioStream(out))
    ok("duration unchanged", Math.abs(durationOf(out) - 6) < 0.35)
  }

  console.log("\nMissing / corrupt clip FAILS the render loudly:")
  for (const [label, file] of [["missing", path.join(dir, "nope.m4a")], ["corrupt", (() => { const f = path.join(dir, "bad.m4a"); writeFileSync(f, "not audio", "utf8"); return f })()]] as const) {
    let msg = ""
    try { await render(`BAD_${label}.mp4`, V10, { hook: file }) } catch (e: any) { msg = String(e.message ?? e) }
    ok(`${label} Hook rejects with a Voice Clip message`, /voice clips:/i.test(msg) && /hook/i.test(msg))
  }

  console.log("\nOutput container/codec unchanged (TikTok FILE_UPLOAD compatibility):")
  {
    const out = await render("TT.mp4", V10, { hook: HOOK, cta: CTA })
    let banner = ""
    try { execFileSync(FF!, ["-hide_banner", "-i", out], { stdio: "pipe" }) } catch (e: any) { banner = String(e.stderr ?? "") }
    ok("still an MP4 container", /Input #0, mov,mp4/.test(banner))
    ok("still H.264 video", /Video: h264/.test(banner))
    ok("still AAC audio", /Audio: aac/.test(banner))
  }

  // ── route plumbing (source-level, so a future refactor cannot silently unwire it) ───────────
  console.log("\nRoute plumbing:")
  {
    const read = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8")
    const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1")
    const renderRoute = strip(read("app/api/admin/social-autopilot/posts/[id]/render/route.ts"))
    ok("render route SELECTS both voice columns", /voice_hook_id/.test(renderRoute) && /voice_cta_id/.test(renderRoute))
    ok("render route PASSES both clip paths into the renderer", /hookPath:/.test(renderRoute) && /ctaPath:/.test(renderRoute))
    ok("render route resolves clips from social_voice_clips storage", /social_voice_clips/.test(renderRoute) && /createSignedUrl/.test(renderRoute))
    const dup = strip(read("app/api/admin/social-autopilot/posts/[id]/duplicate/route.ts"))
    ok("a variation SELECTS the voice columns from the original",
      /select\([^)]*voice_hook_id[^)]*voice_cta_id/.test(dup.replace(/\n/g, " ")))
    ok("a variation INSERTS both voice ids into the clone",
      /voice_hook_id:\s*o\.voice_hook_id/.test(dup) && /voice_cta_id:\s*o\.voice_cta_id/.test(dup))
  }

  console.log(`\nVoice ducking: ${pass} passed, ${fail} failed`)
  process.exit(fail === 0 ? 0 : 1)
}
main()
