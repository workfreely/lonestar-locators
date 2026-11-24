// THE OVERLAY LAYER — the text as its own supersampled RGBA image with a real gaussian shadow.
// Run: npx tsx scripts/social/overlayLayer.test.ts
//
// What this suite is for: the treatment it replaces was approved on type at 66px/52px, where its
// em-relative values round to a 2px halo — and NO template in the registry lays out at those
// sizes. Every one of them produces 36-47px, where the same values round to 1px. The approved
// look therefore never shipped, and nothing caught it. So the assertions below are mostly about
// the class of bug: the treatment is in ABSOLUTE PIXELS and is asserted to be identical at every
// size any template can produce, and the layout is asserted to be untouched for all of them.
import { readFileSync } from "node:fs"
import path from "node:path"
import { OVERLAY_TEMPLATES } from "@/lib/social/composePost"
import { OVERLAY_LAYER, OVERLAY_CANVAS, cssBlurRadiusForSigma, computeOverlayLayout } from "@/lib/social/overlaySpec"
import { buildOverlayLayerFilter, buildOverlayLayerArgs, buildVideoFilter, buildFfmpegArgs, buildDrawPlan, DELIVERY, type DrawItem } from "@/lib/social/renderVideo"
import { RENDERER_VERSION } from "@/lib/social/renderSpec"
import { safeAreaFor } from "@/lib/social/platformSafeArea"

let pass = 0, fail = 0
const ok = (l: string, c: boolean) => { if (c) { pass++; console.log(`  ✓ ${l}`) } else { fail++; console.log(`  ✗ ${l}`) } }
const read = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8")

const ITEMS: DrawItem[] = [
  { file: "/tmp/head.txt", fontPx: 38, topPx: 915, lineSpacing: 8 },
  { file: "/tmp/sub.txt", fontPx: 36, topPx: 970, lineSpacing: 6 },
]
const G = buildOverlayLayerFilter("/fonts/LibreBaskerville-Head.ttf", ITEMS)

console.log("the approved treatment, exactly:")
ok("pure white letters at full opacity", /fontcolor=white/.test(G) && !/fontcolor=white@/.test(G))
ok("0.75px white stroke", OVERLAY_LAYER.strokePx === 0.75 && /bordercolor=white@1\.0/.test(G))
ok("4x supersampling", OVERLAY_LAYER.supersample === 4
  && G.includes(`s=${DELIVERY.w * 4}x${DELIVERY.h * 4}`)
  && new RegExp(`scale=${DELIVERY.w}:${DELIVERY.h}:flags=lanczos`).test(G))
ok("a real gaussian drop shadow, on the ALPHA only",
  new RegExp(`gblur=sigma=${OVERLAY_LAYER.dropSigmaPx}:steps=3:planes=8`).test(G))
ok("…black, at the approved alpha and offset",
  /colorchannelmixer=rr=0:gg=0:bb=0/.test(G)
  && new RegExp(`colorchannelmixer=aa=${OVERLAY_LAYER.dropAlpha}`).test(G)
  && new RegExp(`\\[drop\\]overlay=x=0:y=${OVERLAY_LAYER.dropOffsetPx}`).test(G))
ok("the wider ambient lift is there too",
  new RegExp(`gblur=sigma=${OVERLAY_LAYER.liftSigmaPx}:steps=3:planes=8`).test(G)
  && new RegExp(`colorchannelmixer=aa=${OVERLAY_LAYER.liftAlpha}`).test(G))
ok("NO BLACK OUTLINE anywhere in the layer", !/bordercolor=black/.test(G) && !/borderw=\d+:bordercolor=black/.test(G))
ok("the letters are painted LAST, so nothing can tint the white",
  G.lastIndexOf("[tx]overlay") > G.lastIndexOf("[drop]overlay") && G.lastIndexOf("[drop]overlay") > G.lastIndexOf("[lift]overlay"))

console.log("\nthe stroke cannot move a glyph:")
ok("drawtext still centres on the canvas axis", /x=\(w-text_w\)\/2/.test(G))
ok("font size, y and line spacing are the layout's, scaled by the supersample and nothing else",
  G.includes(`fontsize=${38 * 4}`) && G.includes(`y=${915 * 4}`) && G.includes(`line_spacing=${8 * 4}`)
  && G.includes(`fontsize=${36 * 4}`) && G.includes(`y=${970 * 4}`) && G.includes(`line_spacing=${6 * 4}`))

// ── THE CLASS OF BUG ────────────────────────────────────────────────────────────────────────
console.log("\nthe treatment is identical at every size any template produces:")
const sizes = new Set<number>()
for (const t of OVERLAY_TEMPLATES) for (const p of ["instagram", "tiktok", "instagram_story"])
  for (const it of buildDrawPlan(computeOverlayLayout(t, "Luxury doesn't have to be expensive", "Starting at $999/month", p))) sizes.add(it.fontPx)
const sizeList = [...sizes].sort((a, b) => a - b)
ok(`every template lays out at one of ${sizeList.join(", ")}px — none of them the 66/52px the old em values were tuned on`,
  sizeList.length > 0 && !sizeList.includes(66) && !sizeList.includes(52))
ok("the old em treatment rounds to a 1px halo at EVERY one of them (the defect, recorded)",
  sizeList.every((px) => Math.max(1, Math.round(0.03 * px)) === 1))
ok("the new treatment is absolute, so it is the same at all of them",
  sizeList.every(() => OVERLAY_LAYER.strokePx === 0.75 && OVERLAY_LAYER.dropSigmaPx === 2.2))

console.log("\nno template's layout moves:")
let moved = 0, outside = 0
for (const t of OVERLAY_TEMPLATES) for (const p of ["instagram", "tiktok", "instagram_story"]) {
  const plan = buildDrawPlan(computeOverlayLayout(t, "Luxury doesn't have to be expensive", "Starting at $999/month", p))
  const items = plan.map((it, i) => ({ file: `/tmp/${i}.txt`, fontPx: it.fontPx, topPx: it.topPx, lineSpacing: it.lineSpacing }))
  const g = buildOverlayLayerFilter("/f.ttf", items)
  for (const it of plan) {
    if (!g.includes(`fontsize=${it.fontPx * 4}`) || !g.includes(`y=${Math.round(it.topPx * 4)}`)) moved++
  }
  const sa = safeAreaFor(p)
  const top = Math.min(...plan.map((i) => i.topPx))
  const bot = Math.max(...plan.map((i) => i.topPx + i.fontPx * i.text.split("\n").length))
  if (top < sa.text.y || bot > sa.text.y + sa.text.h) outside++
}
ok(`all ${OVERLAY_TEMPLATES.length} templates x 3 platforms keep their exact font size and y`, moved === 0)
ok("…and every one stays inside its platform's text-safe box", outside === 0)

console.log("\nthe video pass:")
const withLayer = buildVideoFilter("/f.ttf", ITEMS, "scale=1080:1920", null, undefined, 3)
ok("one overlay, and NO drawtext on the frame", /\[3:v\]overlay=x=0:y=0/.test(withLayer) && !/drawtext/.test(withLayer))
const without = buildVideoFilter("/f.ttf", ITEMS, "scale=1080:1920", null)
ok("…while every existing caller that passes no index keeps the drawtext graph verbatim",
  /drawtext/.test(without) && !/overlay=x=0:y=0/.test(without))
ok("a post with no overlay text still just exposes the frame",
  buildVideoFilter("/f.ttf", [], "scale=1080:1920", null, undefined, 3).endsWith("null[v]"))

const args = buildFfmpegArgs({
  sourcePath: "/src.mp4", outputPath: "/out.mp4", filter: withLayer, audioChoice: "original",
  extraInputs: ["/v1.wav", "/v2.wav"],
  presenterInputs: [{ path: "/p.webm", decoder: "libvpx-vp9" }],
  overlayInput: "/layer.png",
})
const inputs = args.reduce<string[]>((acc, a, i) => (a === "-i" ? [...acc, args[i + 1]] : acc), [])
// source, two voice clips, one presenter, then the layer: index 4. The formula renderReel uses is
// 1 + voiceCount + presenterCount, which is what this checks — not a hand-written number.
const VOICE = 2, PRESENTERS = 1
ok("the layer is the LAST input, after the voice clips and the presenter",
  inputs[inputs.length - 1] === "/layer.png" && inputs.length === 1 + VOICE + PRESENTERS + 1)
ok("…and renderReel's formula lands on exactly that index",
  inputs[1 + VOICE + PRESENTERS] === "/layer.png")
ok("no overlay input means no extra -i at all",
  !buildFfmpegArgs({ sourcePath: "/s.mp4", outputPath: "/o.mp4", filter: "x", audioChoice: "original" }).includes("/layer.png"))

const layerArgs = buildOverlayLayerArgs({ filter: G, outputPath: "/layer.png" })
ok("the layer pass writes exactly one frame", layerArgs.includes("-frames:v") && layerArgs.includes("1"))
ok("…and nothing of the source reaches it", !layerArgs.includes("/src.mp4"))

console.log("\nthe renderer runs it once, before the video:")
const RV = read("lib/social/renderVideo.ts")
ok("the layer is built before buildFfmpegArgs is called",
  RV.indexOf("buildOverlayLayerArgs") < RV.indexOf("const args = buildFfmpegArgs"))
ok("…and only when there is text to draw", /if \(items\.length > 0\) \{[\s\S]{0,200}overlayPath = /.test(RV))
ok("the index is derived from the same input order buildFfmpegArgs emits",
  /overlayInputIndex = 1 \+ voiceCount \+ presenterInputs\.length/.test(RV))

console.log("\nthe editor preview reads the renderer's numbers, not its own:")
const PV = read("components/crm/social/PreviewOverlay.tsx")
ok("it imports OVERLAY_LAYER", /OVERLAY_LAYER/.test(PV))
ok("the stroke is the same 0.75px, painted under the fill as borderw is",
  /WebkitTextStroke: `\$\{OVERLAY_LAYER\.strokePx\}px #ffffff`/.test(PV) && /paintOrder: "stroke fill"/.test(PV))
ok("both shadows come from the same sigmas through one shared conversion",
  /cssBlurRadiusForSigma\(OVERLAY_LAYER\.dropSigmaPx\)/.test(PV) && /cssBlurRadiusForSigma\(OVERLAY_LAYER\.liftSigmaPx\)/.test(PV))
ok("the preview-only blur that never existed in the export is no longer USED",
  !/t\.shadowBlurEm/.test(PV) && !/OVERLAY_TEXT/.test(PV))
ok("no black edge is drawn in the preview either", !/rgba\(0,0,0,\$\{t\.edgeAlpha\}\)/.test(PV))
ok("sigma to CSS blur radius is 2x", cssBlurRadiusForSigma(2.2) === 4.4 && cssBlurRadiusForSigma(7) === 14)

console.log("\nexisting artifacts are correctly stale:")
ok("RENDERER_VERSION was bumped", RENDERER_VERSION === 2)
ok("…and the reason is recorded with it", /overlay stopped being burned on by drawtext/.test(read("lib/social/renderSpec.ts")))

ok("the canvas the layer is built on is the delivery canvas",
  DELIVERY.w === OVERLAY_CANVAS.w && DELIVERY.h === OVERLAY_CANVAS.h)

console.log(`\nOverlay layer: ${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
