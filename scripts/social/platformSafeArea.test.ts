/**
 * SOCIAL BEAST — per-platform safe areas.
 *
 * The headline is fitted into the PLATFORM's text-safe box, not the raw 1080px canvas. Fitting to
 * the canvas is what put a published Reel's headline against Instagram's engagement rail.
 *
 * The load-bearing property is symmetry: both renderers centre text on the CANVAS (FFmpeg
 * x=(w-text_w)/2, CSS equal margins), so a box whose centre is not 540 cannot be honoured. An
 * asymmetric draft TikTok box put an 820px line 20px past its own edge — caught in testing, now
 * impossible by construction.
 *
 * Run: npx tsx scripts/social/platformSafeArea.test.ts
 */
import { readFileSync } from "node:fs"
import path from "node:path"
import { PLATFORM_SAFE_AREAS, safeAreaFor, textAvailPx, sideMarginPx, SOCIAL_CANVAS, DEFAULT_PLATFORM } from "@/lib/social/platformSafeArea"
import { computeOverlayLayout, headlineTextWidthPx } from "@/lib/social/overlaySpec"
import { buildTemplateHeadline, buildTemplateDetail, OVERLAY_TEMPLATES } from "@/lib/social/composePost"
import { PROPERTY_TYPES } from "@/lib/social/propertyTypes"

let pass = 0, fail = 0
const ok = (l: string, c: boolean, d = "") => {
  if (c) { pass++; console.log(`  ✓ ${l}`) } else { fail++; console.log(`  ✗ ${l}${d ? `\n      ${d}` : ""}`) }
}
const read = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8")
const CONV = (OVERLAY_TEMPLATES as readonly string[]).filter((t) => !["market_type", "market_type_centered", "special_feature"].includes(t))

console.log("\nPLATFORM SAFE AREAS\n")

console.log("EVERY BOX IS CANVAS-SYMMETRIC (the centring model requires it):")
for (const [id, sa] of Object.entries(PLATFORM_SAFE_AREAS)) {
  const right = SOCIAL_CANVAS.w - (sa.text.x + sa.text.w)
  ok(`${id}: left ${sa.text.x} === right ${right}`, right === sa.text.x)
  ok(`  …so a full-width line stays inside it once canvas-centred`,
    (SOCIAL_CANVAS.w + sa.text.w) / 2 <= sa.text.x + sa.text.w)
}

console.log("\nINSTAGRAM IS THE MEASURED SET:")
{
  const ig = safeAreaFor("instagram")
  ok("text box is x110 w860 (margins 110)", ig.text.x === 110 && ig.text.w === 860)
  ok("vertical band is y150..1500", ig.text.y === 150 && ig.text.y + ig.text.h === 1500)
  ok("flagged as measured", ig.measured === true)
  const rail = ig.zones.find((z) => z.kind === "rail")!.rect
  const caption = ig.zones.find((z) => z.kind === "caption")!.rect
  ok("rail recorded at x978 (measured from the screenshot)", rail.x === 978)
  ok("caption block recorded at y1548", caption.y === 1548)
  // The box must actually clear the UI it was derived from.
  ok("text box clears the rail", ig.text.x + ig.text.w <= rail.x, `${ig.text.x + ig.text.w} vs ${rail.x}`)
  ok("text box clears the caption block", ig.text.y + ig.text.h <= caption.y)
}

console.log("\nTIKTOK IS PROVISIONAL AND SAYS SO:")
{
  const tt = safeAreaFor("tiktok")
  ok("flagged NOT measured", tt.measured === false)
  ok("source string says provisional", /PROVISIONAL/i.test(tt.source))
  ok("its box is narrower than Instagram's", tt.text.w < safeAreaFor("instagram").text.w)
  ok("…and still clears its own rail", tt.text.x + tt.text.w <= tt.zones.find((z) => z.kind === "rail")!.rect.x)
}

console.log("\nUNKNOWN PLATFORMS FALL BACK TO THE MEASURED SET:")
{
  ok("default is instagram", DEFAULT_PLATFORM === "instagram")
  ok("unknown / null / empty all resolve to instagram",
    [null, undefined, "", "youtube", "facebook", "INSTAGRAM "].every((p) => safeAreaFor(p as never).id === "instagram"))
  ok("case-insensitive match works", safeAreaFor("TikTok").id === "tiktok")
  ok("helpers agree with the table", textAvailPx("instagram") === 860 && sideMarginPx("instagram") === 110)
}

console.log("\nPER-PLATFORM FITTING — INSTAGRAM IS NEVER SHRUNK FOR TIKTOK:")
{
  const head = "This is what real penthouse living looks like"
  const ig = computeOverlayLayout("real_living", head, "Starting at $7K/month", "instagram")
  const tt = computeOverlayLayout("real_living", head, "Starting at $7K/month", "tiktok")
  ok("the same copy fits LARGER on Instagram than TikTok", ig.headline.fontPx > tt.headline.fontPx, `ig ${ig.headline.fontPx} vs tt ${tt.headline.fontPx}`)
  ok("…and Instagram matches the no-platform default", computeOverlayLayout("real_living", head, "Starting at $7K/month").headline.fontPx === ig.headline.fontPx)
  ok("each block carries its own platform's margin",
    ig.headline.sideMarginPx === 110 && tt.headline.sideMarginPx === safeAreaFor("tiktok").text.x)
}

console.log("\nNOTHING OVERFLOWS ITS OWN BOX, ON EITHER PLATFORM:")
for (const plat of ["instagram", "tiktok"]) {
  const sa = safeAreaFor(plat)
  const rail = sa.zones.find((z) => z.kind === "rail")!.rect.x
  let over = 0, pastRail = 0, three = 0, one = 0, total = 0
  let min = 99, max = 0
  const wrapTpls = new Set<string>()
  for (const tpl of CONV) for (const pt of [...PROPERTY_TYPES, null]) for (const mkt of ["Dallas", "Houston", "San Antonio"]) {
    const h = buildTemplateHeadline(tpl as never, { propertyType: pt as never, market: mkt, budgetRange: "1600" })
    if (!h) continue
    const d = buildTemplateDetail(tpl as never, { propertyType: pt as never, market: mkt, budgetRange: "1600" }) ?? ""
    const L = computeOverlayLayout(tpl as never, h, d, plat)
    total++
    if (L.headline.lines.length === 1) { one++; min = Math.min(min, L.headline.fontPx); max = Math.max(max, L.headline.fontPx) }
    if (L.headline.lines.length > 2) three++
    if (L.headline.lines.length > 1) wrapTpls.add(tpl)
    for (const l of L.headline.lines) {
      const w = headlineTextWidthPx(l, L.headline.fontPx)
      if (w > sa.text.w) over++
      if ((SOCIAL_CANVAS.w + w) / 2 > rail) pastRail++
    }
    if (L.detail) { const w = headlineTextWidthPx(L.detail.lines[0], L.detail.fontPx); if (w > sa.text.w) over++ }
  }
  ok(`${plat}: 0 of ${total} variants overflow the box`, over === 0, String(over))
  ok(`${plat}: 0 lines reach the engagement rail`, pastRail === 0, String(pastRail))
  ok(`${plat}: no 3-line headlines`, three === 0)
  // The "only trade_up wraps" guarantee is INSTAGRAM's — it is the measured, live platform and the
  // one the 42 real posts target. TikTok's provisional box is 96px narrower, so more templates
  // legitimately wrap there; asserting otherwise would be asserting a property we never promised.
  if (plat === "instagram") {
    ok(`${plat}: only trade_up ever wraps`, [...wrapTpls].join(",") === "trade_up", [...wrapTpls].join(","))
  } else {
    ok(`${plat}: wraps a superset of Instagram's, which a narrower box must`,
      wrapTpls.has("trade_up") && wrapTpls.size >= 1, [...wrapTpls].join(","))
  }
  ok(`${plat}: one-line sizes stay in the 26–38 band (${min}–${max})`, min >= 26 && max <= 38)
}

console.log("\nTHE OVERLAY IS PRESENTATIONAL ONLY:")
{
  const ui = read("components/crm/social/SafeAreaOverlay.tsx")
  ok("it reads the SAME table the fitter uses", /safeAreaFor/.test(ui))
  ok("…and computes no sizes of its own", !/fontPx|fitHook|headlineTextWidthPx/.test(ui))
  ok("zones are positioned as canvas percentages", /SOCIAL_CANVAS\.w/.test(ui) && /SOCIAL_CANVAS\.h/.test(ui))
  ok("a provisional platform is labelled as such in the UI", /provisional/i.test(ui))
  const editor = read("components/crm/social/PostEditor.tsx")
  ok("the editor exposes an Off / Instagram / TikTok toggle", /"off", "instagram", "tiktok"/.test(editor))
  ok("…defaulting to Off", /useState<"off" \| "instagram" \| "tiktok">\("off"\)/.test(editor))
  ok("the renderer fits to the post's platform", /input\.platform \?\? "instagram"/.test(read("lib/social/renderVideo.ts")))
  ok("…and the render route passes the post's platform", /platform: \(p\.platform as string \| null\) \?\? "instagram"/.test(read("app/api/admin/social-autopilot/posts/[id]/render/route.ts")))
}

console.log(`\n${pass} passed, ${fail} failed\n`)
if (fail > 0) process.exit(1)
