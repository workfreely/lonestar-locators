// The two new overlay templates are exact VARIANTS of existing ones (reusing the same primitives):
//   • market_type_centered = Market + Type (T1) typography, group VERTICALLY CENTERED.
//   • apartment_standards   = Upgrade (T6) exactly, headline "Your apartment standards went up".
// Run: npx tsx scripts/social/newTemplates.test.ts
import { buildTemplateHeadline, buildTemplateDetail, type SourceMeta } from "@/lib/social/composePost"
import { computeOverlayLayout, templateFamily, OVERLAY_CANVAS } from "@/lib/social/overlaySpec"

let pass = 0, fail = 0
const ok = (l: string, c: boolean) => { if (c) { pass++; console.log(`  ✓ ${l}`) } else { fail++; console.log(`  ✗ ${l}`) } }
const H = OVERLAY_CANVAS.h

const meta: SourceMeta = { market: "San Antonio", propertyType: null, socialSpecial: null, special: null, budgetRange: "1450", amenities: null }

console.log("Template 2 — Market + Type (Centered): SAME as T1, only vertically centered:")
ok("headline identical to T1", buildTemplateHeadline("market_type_centered", meta) === buildTemplateHeadline("market_type", meta))
ok("detail identical to T1", buildTemplateDetail("market_type_centered", meta) === buildTemplateDetail("market_type", meta))
ok("headline is Market + Type", buildTemplateHeadline("market_type_centered", meta) === "SAN ANTONIO APARTMENTS")
ok("detail is Starting at price", buildTemplateDetail("market_type_centered", meta) === "Starting at $1,450/month")
ok("layout family is hero", templateFamily("market_type_centered") === "hero")
{
  const head = buildTemplateHeadline("market_type_centered", meta), det = buildTemplateDetail("market_type_centered", meta)
  const t1 = computeOverlayLayout("market_type", head, det)
  const t2 = computeOverlayLayout("market_type_centered", head, det)
  // Typography identical (same font sizes for headline + detail).
  ok("headline font size identical to T1", t2.headline.fontPx === t1.headline.fontPx)
  ok("detail font size identical to T1", (t2.detail?.fontPx ?? 0) === (t1.detail?.fontPx ?? 0))
  // T1 is anchored near the top; the centered variant sits far lower (vertical center of the group).
  ok("T1 anchored near the top (< 300px)", t1.headline.topPx < 300)
  ok("T2 group moved well below the top (> 700px)", t2.headline.topPx > 700)
  // The whole group is vertically centered around the canvas midpoint (960).
  const groupTop = t2.headline.topPx
  const groupBottom = (t2.detail ? t2.detail.topPx + t2.detail.fontPx : t2.headline.topPx + t2.headline.fontPx)
  ok("T2 group centered around H/2 (±20px)", Math.abs((groupTop + groupBottom) / 2 - H / 2) < 20)
}

console.log("\nFinal template — Your Apartment Standards: EXACT Upgrade variant:")
ok("headline is the fixed copy", buildTemplateHeadline("apartment_standards", meta) === "Your apartment standards went up")
ok("detail uses the shared special+price logic (same as Upgrade)", buildTemplateDetail("apartment_standards", meta) === buildTemplateDetail("upgrade", meta))
ok("detail is Starting at price", buildTemplateDetail("apartment_standards", meta) === "Starting at $1,450/month")
ok("layout family is center_hook_detail (same as Upgrade)", templateFamily("apartment_standards") === "center_hook_detail")
{
  // Feed the SAME headline+detail to Upgrade and the variant → geometry must be byte-identical
  // (same size rules, gap, centering) — proving the variant reuses Upgrade's treatment exactly.
  const same = ["Your apartment standards went up", "Starting at $1,450/month"] as const
  const up = computeOverlayLayout("upgrade", same[0], same[1])
  const as_ = computeOverlayLayout("apartment_standards", same[0], same[1])
  ok("same family", up.family === as_.family)
  ok("same headline font size", up.headline.fontPx === as_.headline.fontPx)
  ok("same headline topPx (identical positioning)", up.headline.topPx === as_.headline.topPx)
  ok("same detail font size", (up.detail?.fontPx ?? -1) === (as_.detail?.fontPx ?? -2))
  ok("same detail topPx", (up.detail?.topPx ?? -1) === (as_.detail?.topPx ?? -2))
  // Headline stays ONE line when it fits (it does — shorter than Upgrade's own hook).
  const lay = computeOverlayLayout("apartment_standards", "Your apartment standards went up", "Starting at $1,450/month")
  ok("headline stays on one line", lay.headline.lines.length === 1)
  ok("detail renders underneath", !!lay.detail && lay.detail.lines.length === 1)
  // Vertically centered.
  ok("group vertically centered around H/2 (±20px)", (() => { const t = lay.headline.topPx, b = (lay.detail ? lay.detail.topPx + lay.detail.fontPx : t); return Math.abs((t + b) / 2 - H / 2) < 20 })())
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
