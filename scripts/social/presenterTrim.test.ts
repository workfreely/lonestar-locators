// AUTOMATIC PADDING TRIM for presenter clips.
//
// ── THE BUG THIS PREVENTS ───────────────────────────────────────────────────────────────────
// Generated avatars arrive centred in a full canvas with transparency around them. Measured on the
// first real HeyGen clip: a 1080x1920 WebM whose figure occupied only y572..1396 — 524px of empty
// space below it. The renderer anchors the presenter BY ITS BOTTOM EDGE so a taller avatar grows
// upward instead of sliding into Instagram's caption; that assumes the clip's bottom edge is the
// figure's bottom. With padding it is not, and the avatar floats ~175px above its footing —
// silently, with no error, which is the worst kind of wrong.
//
// ── MEASURED, NOT ASSUMED ───────────────────────────────────────────────────────────────────
// Run against the real Riley clip, detection returned x124 y566 834x834 against a manual
// measurement of x124..952 / y572..1396. A few pixels more generous, and correctly so: cropdetect
// scanned every frame and caught gesture extremes a single-frame bbox missed. The resulting clip
// has ZERO padding below its content — bottom row 100% opaque — so the feet land exactly on the
// anchor.
//
// ── WHY ALPHA AND NOT LUMINANCE ─────────────────────────────────────────────────────────────
// A presenter in a black shirt against transparency has almost no luminance signal at the
// shoulders; a luma threshold would crop into them. Alpha says exactly which pixels are the person,
// which is also what makes this work for ANY avatar from any vendor rather than just the one tested.
//
// Run: npx tsx scripts/social/presenterTrim.test.ts
import { readFileSync } from "node:fs"
import path from "node:path"
import { shouldTrim, type TrimBox } from "../../lib/social/presenterTrim"

let pass = 0, fail = 0
const ok = (l: string, c: boolean) => { if (c) { pass++; console.log(`  ✓ ${l}`) } else { fail++; console.log(`  ✗ ${l}`) } }
const read = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8")
const src = read("lib/social/presenterTrim.ts")
const code = src.replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, "")

// ── 1. WHEN TO TRIM ─────────────────────────────────────────────────────────
console.log("1. the decision to trim:")
{
  const full: TrimBox = { x: 0, y: 0, w: 1080, h: 1920 }
  ok("a clip that is already tight is NOT re-encoded", !shouldTrim(full, 1080, 1920))
  // The real HeyGen case.
  ok("the measured Riley box IS trimmed (834x834 of 1080x1920)", shouldTrim({ x: 124, y: 566, w: 834, h: 834 }, 1080, 1920))
  ok("a 3% saving is not worth a generation of re-encode", !shouldTrim({ x: 0, y: 0, w: 1070, h: 1890 }, 1080, 1920))
  ok("a 20% saving is", shouldTrim({ x: 0, y: 0, w: 1080, h: 1530 }, 1080, 1920))

  // A box that removes nearly everything means detection went wrong. Cropping to a sliver is far
  // worse than leaving the padding, so it is refused rather than trusted.
  ok("an implausibly tiny box is REFUSED, not applied", !shouldTrim({ x: 500, y: 900, w: 60, h: 60 }, 1080, 1920))
  ok("...while a small-but-plausible figure is accepted", shouldTrim({ x: 400, y: 600, w: 280, h: 420 }, 1080, 1920))
}

// ── 2. EVEN GEOMETRY ────────────────────────────────────────────────────────
// yuv420p subsamples chroma 2x2; an odd crop origin shifts colour against luma.
console.log("\n2. crop geometry stays even:")
ok("makeEven is applied to every detected box", /function makeEven/.test(code) && /makeEven\(box\)/.test(code))
ok("...origins are rounded DOWN so content is never cut off", /b\.x - \(b\.x % 2\)/.test(code) && /b\.y - \(b\.y % 2\)/.test(code))
ok("...and the box is widened to compensate, not narrowed", /b\.w \+ \(b\.x - x\)/.test(code))
ok("cropdetect is asked for even output too", /round=2/.test(code))

// ── 3. DETECTION READS THE ALPHA PLANE ──────────────────────────────────────
console.log("\n3. detection uses alpha, so any avatar works:")
ok("alphaextract promotes alpha to luminance for cropdetect", /alphaextract,cropdetect/.test(code))
ok("limit=0 — only FULLY transparent pixels are croppable", /limit=0/.test(code))
ok("reset_count=0 — one box across the whole clip, not the first frame",
  /reset_count=0/.test(code))
ok("...which is what catches a gesture in a later frame", /reset_count=0/.test(code))
ok("the LAST crop= line is taken, as cropdetect refines its box", /matches\.at\(-1\)/.test(code))
ok("the decoder flag precedes the input it applies to",
  /if \(decoder\) args\.push\("-c:v", decoder\)[\s\S]{0,120}"-i", clipPath/.test(code))
ok("...without which a WebM would present no alpha at all and detection would find nothing",
  /decoder/.test(code))

// ── 4. THE ORIGINAL IS NEVER MODIFIED ───────────────────────────────────────
console.log("\n4. the generated clip is an input, never edited:")
ok("output goes to a NEW path in the work dir", /path\.join\(workDir, "presenter-trimmed\.mov"\)/.test(code))
ok("...never over the input", !/-y[\s\S]{0,200}clipPath\)/.test(code.replace(/"-i", clipPath/g, "")))
ok("the module deletes nothing", !/unlink|rm\(|rmdir|remove\(/.test(code))
ok("ProRes 4444 out — alpha survives losslessly and needs no decoder flag on the way back",
  /prores_ks/.test(code) && /yuva444p10le/.test(code))
ok("audio is dropped from the derivative (it rides the Voice Clip path)", /"-an"/.test(code))

// ── 5. FAILURE DEGRADES, NEVER THROWS ───────────────────────────────────────
// A presenter sitting slightly high is cosmetic. A failed render is a broken post.
console.log("\n5. every failure path returns the ORIGINAL clip:")
for (const reason of ["detect_failed", "no_box_detected", "trim_not_worthwhile", "trim_failed"]) {
  const re = new RegExp(`path: clipPath[^}]*reason: "${reason}"`)
  ok(`${reason} -> original path`, re.test(code))
}
ok("trimPresenterClip never throws out of the happy path", /catch \{/.test(code) && !/throw new Error/.test(code.split("export async function trimPresenterClip")[1] ?? ""))

// ── 6. WIRED INTO THE RENDERER, BEFORE THE PLAN ─────────────────────────────
console.log("\n6. the renderer trims before it computes placement:")
{
  const rv = read("lib/social/renderVideo.ts")
  const rvCode = rv.replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, "")
  ok("renderReel calls trimPresenterClip", /trimPresenterClip\(/.test(rvCode))
  ok("...before building the presenter plan",
    rvCode.indexOf("trimPresenterClip(") < rvCode.indexOf("buildPresenterPlan("))
  ok("...and the ffmpeg input uses the TRIMMED path", /presenterInput: presenterLocal/.test(rvCode))
  ok("...with the decoder recomputed for it (ProRes needs none, WebM does)",
    /decoder: decoderForPresenterClip\(presenterLocal\)/.test(rvCode))
  ok("no presenter ⇒ no probe, no trim, no behaviour change at all",
    /if \(presenterLocal\) \{/.test(rvCode))
}

// ── 7. THE APPROVED GEOMETRY IS UNCHANGED ───────────────────────────────────
console.log("\n7. trimming changes WHICH pixels, never WHERE they go:")
{
  const spec = read("lib/social/presenterSpec.ts")
  ok("width is still the approved 400", /widthPx: 400/.test(spec))
  ok("left edge still 110", /xPx: 110/.test(spec))
  ok("caption overlap still 60 (feet y1608)", /captionOverlapPx: 60/.test(spec))
  ok("intro still 4s", /defaultIntroSeconds: 4/.test(spec))
  ok("fade still 0.6s", /fadeSeconds: 0\.6/.test(spec))
  ok("the trim module defines NO geometry of its own",
    !/1608|110|400|captionOverlap/.test(code))
}

console.log(`\nPresenter trim: ${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
