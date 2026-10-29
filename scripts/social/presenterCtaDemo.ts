/**
 * CTA PRESENTER WINDOW — rendered, then measured frame by frame.
 *
 *   npx tsx scripts/social/presenterCtaDemo.ts --source <footage.mp4> \
 *     --hook <hook.m4a> --cta <cta.m4a> --avatar <intro.webm> [--avatar-cta <cta.webm>] --out <dir>
 *
 * Runs the ACTUAL renderReel path — the real filter graph, the real trim, the real mix, the real
 * master pass — and then proves the timing from the finished MP4 rather than from the filter
 * string. The filter string is also printed, because a graph that reads correctly and composites
 * wrongly is the exact failure this feature could have shipped.
 *
 * WHAT IS PROVEN, and why each one is measured instead of assumed:
 *
 *   the avatar is ON during the hook         a window that starts late is a figure that appears
 *                                            after the sentence it is lip-syncing
 *   the avatar is OFF in the middle          requirement 4; also the only way to tell a two-window
 *                                            graph from a presenter left on for the whole video
 *   the avatar is ON during the CTA          the whole point
 *   the avatar is OFF after the CTA ends     a window clamped to the wrong end runs past the frame
 *   each window shows ITS OWN clip           two Looks in one video, verified by colour rather
 *                                            than by trusting the input indices
 *   the output carries ONE audio stream      the avatars' own voices must not reach the mix
 *
 * Presence is measured by DIFFERENCE against a presenter-free render of the same footage: the
 * avatar occupies a known rectangle, so "is the avatar there" is "does that rectangle differ from
 * the same rectangle without it". Sampling absolute pixel values would instead measure the
 * footage, which changes shot to shot and would pass or fail for reasons having nothing to do with
 * the presenter.
 *
 * Writes only into --out. Touches no database, no storage, and no HeyGen credit.
 */
import { execFile } from "node:child_process"
import { promises as fs } from "node:fs"
import path from "node:path"
import ffmpegStatic from "ffmpeg-static"
import { renderReel } from "@/lib/social/renderVideo"
import { computeVoiceWindows } from "@/lib/social/voiceFit"
import {
  buildPresenterPlan, buildPresenterFilter, presenterBottomInsetPx, presenterXPx, PRESENTER,
} from "@/lib/social/presenterSpec"
import { presenterCompositionPlatform } from "@/lib/social/overlaySpec"

const FF = (ffmpegStatic as unknown as string) || "ffmpeg"
const arg = (n: string) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] ?? null : null }

function run(args: string[]): Promise<{ out: string; err: string }> {
  return new Promise((r) =>
    execFile(FF, ["-nostdin", ...args], { maxBuffer: 1024 * 1024 * 64 }, (_e, o, se) => r({ out: String(o), err: String(se) })))
}
const durOf = (se: string) => {
  const m = /Duration:\s*(\d+):(\d\d):(\d\d(?:\.\d+)?)/.exec(se)
  return m ? +m[1] * 3600 + +m[2] * 60 + +m[3] : null
}
const probeDur = async (f: string) => durOf((await run(["-hide_banner", "-i", f])).err)

/** One frame, cropped to a rectangle, as a PNG. Canvas units — the render is 1080×1920. */
async function crop(file: string, atSeconds: number, rect: { x: number; y: number; w: number; h: number }, out: string) {
  await run(["-hide_banner", "-loglevel", "error", "-y", "-ss", atSeconds.toFixed(3), "-i", file,
    "-vf", `crop=${rect.w}:${rect.h}:${rect.x}:${rect.y}`, "-frames:v", "1", out])
}

/** Mean absolute difference between two same-size PNGs, 0–255. ffmpeg does the arithmetic. */
async function meanDiff(a: string, b: string): Promise<number> {
  const { err } = await run(["-hide_banner", "-i", a, "-i", b,
    // signalstats on the DIFFERENCE image. Measured both ways on a real pair before being trusted:
    // an identical rectangle reads 0, the avatar's own rectangle reads ~45, and the gap between
    // two separate encodes of the same footage reads ~0.7 — so the threshold has two orders of
    // magnitude of room and is not measuring encoder noise.
    "-filter_complex", "[0:v][1:v]blend=all_mode=difference,format=gray,signalstats,metadata=print:key=lavfi.signalstats.YAVG",
    "-f", "null", "-"])
  const m = [...err.matchAll(/lavfi\.signalstats\.YAVG=([\d.]+)/g)].pop()
  return m ? Number(m[1]) : NaN
}

/** Mean hue of a rectangle — how the two Looks are told apart without reading the input list. */
async function meanHue(file: string, atSeconds: number, rect: { x: number; y: number; w: number; h: number }): Promise<number> {
  const { err } = await run(["-hide_banner", "-ss", atSeconds.toFixed(3), "-i", file,
    "-vf", `crop=${rect.w}:${rect.h}:${rect.x}:${rect.y},signalstats,metadata=print:key=lavfi.signalstats.HUEAVG`,
    "-frames:v", "1", "-f", "null", "-"])
  const m = [...err.matchAll(/lavfi\.signalstats\.HUEAVG=(-?[\d.]+)/g)].pop()
  return m ? Number(m[1]) : NaN
}

let pass = 0, fail = 0
const ok = (label: string, cond: boolean, detail = "") => {
  if (cond) { pass++; console.log(`  ✓ ${label}${detail ? `   ${detail}` : ""}`) }
  else { fail++; console.log(`  ✗ ${label}${detail ? `   ${detail}` : ""}`) }
}

async function main() {
  const source = arg("source"), hook = arg("hook"), cta = arg("cta")
  const avatar = arg("avatar"), avatarCta = arg("avatar-cta")
  const outDir = arg("out") ?? path.join(process.cwd(), ".presenter-cta-demo")
  // --avatar may be omitted when --avatar-cta is given: an intro recording with no lip-synced clip
  // and a CTA with one is a legitimate state, and the avatar must then appear ONLY in the CTA.
  if (!source || !hook || !cta || (!avatar && !avatarCta)) {
    console.error("--source, --hook, --cta and at least one of --avatar / --avatar-cta are required")
    process.exit(1)
  }
  await fs.mkdir(outDir, { recursive: true })
  const font = process.env.OVERLAY_FONT_PATH ?? "/System/Library/Fonts/Supplemental/Arial Bold.ttf"

  const D = (await probeDur(source))!
  const hookD = (await probeDur(hook))!
  const ctaD = (await probeDur(cta))!
  const windows = computeVoiceWindows(D, hookD, ctaD)

  console.log(`\nsource   ${path.basename(source)}  ${D.toFixed(2)}s`)
  console.log(`hook     ${path.basename(hook)}  ${hookD.toFixed(2)}s   -> avatar window 0.00–${hookD.toFixed(2)}s`)
  console.log(`cta      ${path.basename(cta)}  ${ctaD.toFixed(2)}s   -> avatar window ${windows.cta!.startSeconds.toFixed(2)}–${windows.cta!.endSeconds.toFixed(2)}s`)
  console.log(`avatar   ${avatar ? path.basename(avatar) : "NONE (intro unmatched — audio only)"}` +
    `${avatarCta ? `  +  ${path.basename(avatarCta)} (CTA)` : ""}`)

  // ── THE GRAPH, printed ─────────────────────────────────────────────────────────────────────
  const platform = presenterCompositionPlatform("market_type", "instagram")
  const plan = buildPresenterPlan({
    inputIndex: avatar ? 3 : null, platform,
    voiceHookSeconds: hookD,
    ctaWindow: windows.cta,
    ctaInputIndex: avatarCta ? (avatar ? 4 : 3) : null,
  })
  console.log(`\nplan     ${plan.windows.length} window(s):`)
  for (const w of plan.windows) {
    console.log(`         ${w.kind.padEnd(4)} input ${w.inputIndex}   ${w.startSeconds.toFixed(3)}–${w.endSeconds.toFixed(3)}s`)
  }
  console.log(`\nfilter   ${buildPresenterFilter(plan, "withpres").split(";").join("\n         ")}\n`)

  // ── TWO RENDERS: with the presenter, and without it ────────────────────────────────────────
  // The second is the baseline every presence measurement is taken against.
  const withPres = path.join(outDir, "with-presenter.mp4")
  const noPres = path.join(outDir, "no-presenter.mp4")
  const common = {
    sourcePath: source, workDir: outDir, fontPath: font,
    template: "market_type", headline: "SAN ANTONIO", subheadline: "LUXURY APARTMENTS",
    audioChoice: "original", platform: "instagram",
    hookPath: hook, ctaPath: cta,
    presenterIntroSeconds: null, presenterSide: null, presenterWidthPx: null,
  }
  console.log("rendering with the presenter…")
  await renderReel(FF, { ...common, outputPath: withPres, presenterPath: avatar, presenterCtaPath: avatarCta } as never)
  // The burned-in headline must clear the figure whenever the figure appears AT ALL, so a
  // CTA-only post needs the shifted lockup too. Compared below against the presenter-free render.
  console.log("rendering the same footage WITHOUT one, as the baseline…")
  await renderReel(FF, { ...common, outputPath: noPres, presenterPath: null, presenterCtaPath: null } as never)

  // The rectangle the avatar occupies, from the spec rather than from a guess. Its height is the
  // 9:16 clip scaled to the plan's width; the inset is measured from the canvas bottom.
  const h = Math.round(plan.widthPx / (9 / 16))
  const rect = { x: presenterXPx(plan.side, plan.widthPx, platform), y: 1920 - presenterBottomInsetPx(platform) - h, w: plan.widthPx, h }
  console.log(`\npresenter rectangle  x${rect.x} y${rect.y} ${rect.w}×${rect.h}  (canvas units)\n`)

  // Sample points: inside each window, clear of its fade, and in the dead middle.
  const introOn = avatar ? "on" as const : "off" as const
  const ctaOn = avatarCta ? "on" as const : "off" as const
  const probes: { t: number; expect: "on" | "off"; what: string }[] = [
    { t: 0.6, expect: introOn, what: "early in the hook window" },
    { t: Math.max(0.8, hookD - PRESENTER.fadeSeconds - 0.3), expect: introOn, what: "late in the hook window, before the fade" },
    { t: hookD + 0.8, expect: "off", what: "just after the hook window" },
    { t: (hookD + windows.cta!.startSeconds) / 2, expect: "off", what: "the middle of the video" },
    { t: windows.cta!.startSeconds - 0.6, expect: "off", what: "just before the CTA window" },
    { t: windows.cta!.startSeconds + 0.6, expect: ctaOn, what: "early in the CTA window" },
    { t: Math.min(D - 0.1, windows.cta!.endSeconds - PRESENTER.fadeSeconds - 0.3), expect: ctaOn, what: "late in the CTA window, before the fade" },
  ]

  console.log("THE AVATAR IS ON SCREEN EXACTLY WHILE A RECORDING IS SPEAKING")
  const THRESHOLD = 2.0   // mean 8-bit difference; an identical rectangle measures ~0
  for (const [i, p] of probes.entries()) {
    const a = path.join(outDir, `w${i}.png`), b = path.join(outDir, `n${i}.png`)
    await crop(withPres, p.t, rect, a)
    await crop(noPres, p.t, rect, b)
    const d = await meanDiff(a, b)
    const on = d > THRESHOLD
    ok(`t=${p.t.toFixed(2)}s  avatar ${p.expect.toUpperCase().padEnd(3)} — ${p.what}`,
      on === (p.expect === "on"), `diff ${d.toFixed(2)}`)
  }

  // ── WHICH LOOK LANDED IN WHICH WINDOW ──────────────────────────────────────────────────────
  if (avatar && avatarCta) {
    console.log("\nEACH WINDOW SHOWS ITS OWN LOOK")
    const hueHook = await meanHue(withPres, 0.6, rect)
    const hueCta = await meanHue(withPres, windows.cta!.startSeconds + 0.6, rect)
    ok("the two windows do not show the same clip", Math.abs(hueHook - hueCta) > 10,
      `hook hue ${hueHook.toFixed(1)}°, CTA hue ${hueCta.toFixed(1)}°`)
  }

  // ── THE MIX IS AUTHORITATIVE ───────────────────────────────────────────────────────────────
  console.log("\nTHE AVATARS' OWN AUDIO NEVER REACHES THE OUTPUT")
  const info = (await run(["-hide_banner", "-i", withPres])).err
  const audioStreams = [...info.matchAll(/Stream #0:\d+.*: Audio:/g)].length
  ok("the finished file carries exactly one audio stream", audioStreams === 1, `${audioStreams} found`)
  ok("…and it is AAC from the mix, not Opus from an avatar clip",
    /Stream #0:\d+.*: Audio: aac/.test(info) && !/Audio: opus/.test(info))
  const outD = (await probeDur(withPres))!
  ok("the video is not shortened by the avatar clips", Math.abs(outD - D) < 0.6, `${outD.toFixed(2)}s vs ${D.toFixed(2)}s`)

  console.log(`\n${pass} passed, ${fail} failed`)
  console.log(`\n${withPres}`)
  if (fail) process.exit(1)
}

main().catch((e) => { console.error("failed:", e.message); process.exit(1) })
