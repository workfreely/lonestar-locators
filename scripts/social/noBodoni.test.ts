// Bodoni must not come back.
//
// The hero secondary line used to render in Bodoni Moda — a Didone whose hairline strokes are the
// first thing a lossy re-encode destroys. It was removed, but removal alone is not a guarantee:
// the face lived behind a two-member union, a CSS @font-face, a second bundled TTF and a
// `face === "head" ? … : …` ternary in both the preview and the renderer. Any one of those coming
// back reintroduces it SILENTLY — a wrong overlay face is invisible in a thumbnail and only shows
// up in a published Reel.
//
// The primary defence is the TYPE: OverlayFace has one member, so an attempt to select another
// face fails to compile. This file guards everything a type cannot reach — asset files, CSS, build
// config and string literals.
import { readFileSync, existsSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { computeOverlayLayout, OVERLAY_SPEC } from "@/lib/social/overlaySpec"
import { buildDrawPlan, buildVideoFilter } from "@/lib/social/renderVideo"

let pass = 0, fail = 0
const ok = (l: string, c: boolean, d = "") => { if (c) { pass++; console.log("  ✓", l) } else { fail++; console.log("  ✗", l + (d ? ` — ${d}` : "")) } }
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
/** Source with comments stripped — a historical note mentioning Bodoni is fine; a live reference is not. */
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/(?<!:)\/\/.*$/gm, "")

console.log("no Bodoni font FILES ship:")
for (const dir of ["assets/social/fonts", "public/fonts"]) {
  const files = readdirSync(join(process.cwd(), dir))
  ok(`${dir} contains no Bodoni file`, !files.some((f) => /bodoni/i.test(f)), files.join(", "))
  ok(`${dir} still ships the Libre face`, files.some((f) => /LibreBaskerville/i.test(f)))
  ok(`${dir} ships exactly ONE overlay font`, files.filter((f) => /\.ttf$/i.test(f)).length === 1, files.join(", "))
}
// The two directories must agree, or preview and render measure differently.
ok("render and preview font directories hold the same filenames",
  JSON.stringify(readdirSync(join(process.cwd(), "assets/social/fonts")).sort()) ===
  JSON.stringify(readdirSync(join(process.cwd(), "public/fonts")).sort()))

console.log("\nno LIVE Bodoni reference in the social renderer or its config:")
const SOURCES = [
  "lib/social/overlaySpec.ts",
  "lib/social/renderVideo.ts",
  "components/crm/social/PreviewOverlay.tsx",
  "app/api/admin/social-autopilot/posts/[id]/render/route.ts",
  "app/globals.css",
  "next.config.ts",
]
for (const f of SOURCES) {
  ok(`${f} has no live Bodoni reference`, !/bodoni/i.test(code(read(f))))
}
ok("no OverlayDetail font-family survives anywhere", SOURCES.every((f) => !/OverlayDetail/.test(code(read(f)))))
ok("no DETAIL_FONT_PATH survives", !/DETAIL_FONT_PATH/.test(code(read("app/api/admin/social-autopilot/posts/[id]/render/route.ts"))))
ok("the render route passes no detailFontPath", !/detailFontPath/.test(code(read("app/api/admin/social-autopilot/posts/[id]/render/route.ts"))))
ok("RenderInput no longer accepts a detail font", !/detailFontPath/.test(code(read("lib/social/renderVideo.ts"))))
ok("next.config traces exactly one overlay font", (read("next.config.ts").match(/assets\/social\/fonts\/[\w-]+\.ttf/g) ?? []).length === 1)

console.log("\nthe TYPE is the real guard:")
const spec = read("lib/social/overlaySpec.ts")
ok('OverlayFace has exactly one member ("head")', /export type OverlayFace = "head"\s*$/m.test(spec))
ok("…so no second face can be assigned without a compile error", !/OverlayFace\s*=\s*"head"\s*\|/.test(spec))
ok("the Bodoni advance map and its fitters are gone",
  !/\bDETAIL_ADV\b/.test(code(spec)) && !/export function fitDetailPx/.test(spec) && !/export function detailTextWidthPx/.test(spec))

console.log("\nevery live layout resolves to the one face, and the filter draws with one font:")
const TEMPLATES = ["market_type", "market_type_centered", "special_feature", "hits_different", "upgrade", "pov_price", "what_mo_gets_you"] as const
for (const t of TEMPLATES) {
  const L = computeOverlayLayout(t, "SAN ANTONIO RENTAL HOMES", "2 Months Free · Private Yards")
  const faces = [L.headline.face, ...(L.detail ? [L.detail.face] : [])]
  ok(`${t}: every block is head-faced`, faces.every((f) => f === "head"), faces.join(","))
}
{
  // The reported symptom, end to end: the T4 detail line must be drawn with the Libre file.
  const plan = buildDrawPlan(computeOverlayLayout("special_feature", "SAN ANTONIO RENTAL HOMES", "2 Months Free · Private Yards"))
  const filter = buildVideoFilter("/fonts/LibreBaskerville-Head.ttf", plan.map((i) => ({ file: "/x.txt", fontPx: i.fontPx, topPx: i.topPx, lineSpacing: i.lineSpacing })))
  const fontfiles = [...filter.matchAll(/fontfile='([^']+)'/g)].map((m) => m[1])
  ok("every drawtext in the T4 filter uses the SAME font file", new Set(fontfiles).size === 1, fontfiles.join(" | "))
  ok("…and it is the Libre face", fontfiles.every((f) => /LibreBaskerville/.test(f)), fontfiles[0])
  ok("the T4 detail line is actually present (guard is not vacuous)", plan.some((i) => i.name === "sub"))
  ok("no Bodoni path can appear in a rendered filter", !/bodoni/i.test(filter))
}

console.log("\nthe worker renders with the same single face:")
if (existsSync(join(process.cwd(), "worker/src/render.mjs"))) {
  const w = read("worker/src/render.mjs")
  ok("worker has no live Bodoni reference", !/bodoni/i.test(code(w)))
  ok("worker loads the Libre face", /LibreBaskerville/.test(w))
  ok("worker declares no second/detail font", !/detailFont|DETAIL_FONT/.test(code(w)))
}
// Sizing is unchanged by this removal — the detail keeps its own size, just not its own typeface.
ok("the detail still has its own size (only the FACE was unified)", OVERLAY_SPEC.sub.fontPx !== OVERLAY_SPEC.headline.fontPx)

console.log(`\nNo Bodoni: ${pass} passed, ${fail} failed`)
if (fail) process.exit(1)
