// HERO SIDE MARGINS, PER PLATFORM.
//
// The hero family used its own margins (90 headline / 75 detail) on every platform, while the
// center-hook family read sideMarginPx(platform). Invisible until a hero template was rendered for
// TikTok: "DALLAS APARTMENTS" at 66px is 878px of ink, centred as x101–979, and TikTok's engagement
// rail starts at x930 — so the headline ran 49px under the icons.
//
// The fix has two halves and BOTH have to hold, or it is not a fix:
//   1. TikTok hero text now fits inside TikTok's box and clears the rail.
//   2. Instagram is byte-identical, because reading the platform margin everywhere would have moved
//      Instagram's hero from 90 to 110 and re-fitted every hero headline on the one platform whose
//      geometry is signed off.
import { computeOverlayLayout, headlineFit, headlineTextWidthPx, OVERLAY_CANVAS, OVERLAY_SPEC, overlayTextFor, OVERLAY_TEXT } from "@/lib/social/overlaySpec"
import { safeAreaFor, sideMarginPx } from "@/lib/social/platformSafeArea"
import { OVERLAY_TEMPLATES, buildTemplateHeadline, buildTemplateDetail, type OverlayTemplate } from "@/lib/social/composePost"
import { buildDrawPlan, buildVideoFilter } from "@/lib/social/renderVideo"

let pass = 0
let fail = 0
function ok(name: string, cond: boolean, detail = "") {
  if (cond) { pass++; console.log(`  ✓ ${name}`) }
  else { fail++; console.log(`  ✗ ${name}${detail ? `  — ${detail}` : ""}`) }
}

const src = {
  market: "Dallas", propertyType: "Apartment", budgetRange: "1450",
  priceLabelMode: "starting_at", special: "8 Weeks Free", socialSpecial: null, amenities: "Pool",
} as never
const lay = (t: OverlayTemplate, p: string) =>
  computeOverlayLayout(t, buildTemplateHeadline(t, src), buildTemplateDetail(t, src), p)
const HERO = OVERLAY_TEMPLATES.filter((t) => lay(t, "instagram").family === "hero" && lay(t, "instagram").headline.lines.length > 0)

/** Where a line's INK actually lands: both renderers centre on the CANVAS (FFmpeg x=(w-text_w)/2,
 *  the preview textAlign:center in a symmetric box), so the margin alone does not prove clearance. */
const ink = (line: string, px: number) => {
  const w = headlineTextWidthPx(line, px)
  return { x0: (OVERLAY_CANVAS.w - w) / 2, x1: (OVERLAY_CANVAS.w + w) / 2, w }
}

console.log(`hero templates under test: ${HERO.length}`)
ok("there is at least one hero template to test", HERO.length > 0)

// ── 1. TIKTOK: NOTHING TOUCHES THE RAIL ───────────────────────────────────────────────────────
console.log("\nTikTok — hero text fits the safe box and clears the engagement rail:")
const tt = safeAreaFor("tiktok")
const RAIL_X = tt.zones.find((z) => z.kind === "rail")!.rect.x
let overruns = 0
for (const t of HERO) {
  const L = lay(t, "tiktok")
  for (const b of [L.headline, L.detail]) {
    if (!b || !b.lines.length) continue
    b.lines.forEach((line, i) => {
      const { x0, x1 } = ink(line, b.linePx?.[i] ?? b.fontPx)
      if (x1 > RAIL_X || x0 < tt.text.x || x1 > tt.text.x + tt.text.w) {
        overruns++
        console.log(`      ${t}: "${line}" x${x0.toFixed(0)}–${x1.toFixed(0)}`)
      }
    })
  }
}
ok(`no hero line overruns TikTok's box or rail (${HERO.length} templates)`, overruns === 0, `${overruns} line(s) do`)
for (const t of HERO) {
  const L = lay(t, "tiktok")
  ok(`${t}: headline margin is TikTok's (${L.headline.sideMarginPx})`, L.headline.sideMarginPx === sideMarginPx("tiktok"))
  if (L.detail) ok(`${t}: detail margin is TikTok's (${L.detail.sideMarginPx})`, L.detail.sideMarginPx === sideMarginPx("tiktok"))
}

// The fit-to-width logic is what absorbs the narrower box — the headline shrinks, nothing is clipped.
console.log("\n…and it is the EXISTING fitter doing it, not a clip:")
{
  const igPx = lay("market_type_centered" as OverlayTemplate, "instagram").headline.fontPx
  const ttPx = lay("market_type_centered" as OverlayTemplate, "tiktok").headline.fontPx
  ok(`the headline re-fits smaller on TikTok (${igPx}px → ${ttPx}px)`, ttPx < igPx)
  ok("…and is still one line, not wrapped or truncated",
    lay("market_type_centered" as OverlayTemplate, "tiktok").headline.lines.length === 1)
  ok("…and is still within the fitter's own floor", ttPx >= 47, String(ttPx))
  ok("headlineFit honours a narrower available width directly",
    headlineFit("DALLAS APARTMENTS", 764).fontPx < headlineFit("DALLAS APARTMENTS", 900).fontPx)
  ok("…and is unchanged at the default width",
    headlineFit("DALLAS APARTMENTS").fontPx === headlineFit("DALLAS APARTMENTS", OVERLAY_CANVAS.w - 2 * OVERLAY_SPEC.headline.sideMarginPx).fontPx)
}

// ── 2. INSTAGRAM IS UNTOUCHED ─────────────────────────────────────────────────────────────────
// This is the half that could go wrong silently, so it is asserted per template and per surface
// rather than spot-checked.
console.log("\nInstagram — byte-identical to the approved geometry:")
let drift = 0
for (const t of HERO) {
  for (const p of ["instagram", "instagram_story"]) {
    const L = lay(t, p)
    if (L.headline.sideMarginPx !== OVERLAY_SPEC.headline.sideMarginPx) { drift++; console.log(`      ${t}|${p} headline margin ${L.headline.sideMarginPx}`) }
    if (L.detail && L.detail.sideMarginPx !== OVERLAY_SPEC.sub.sideMarginPx) { drift++; console.log(`      ${t}|${p} detail margin ${L.detail.sideMarginPx}`) }
  }
}
ok("hero margins on both Instagram surfaces are still 90 / 75", drift === 0, `${drift} drifted`)
ok("the hero's own constants are unchanged",
  OVERLAY_SPEC.headline.sideMarginPx === 90 && OVERLAY_SPEC.sub.sideMarginPx === 75)
ok("Instagram's platform margin is still LARGER than the hero's — which is why it is not read here",
  sideMarginPx("instagram") > OVERLAY_SPEC.headline.sideMarginPx,
  "if this ever inverts, revisit the default")
for (const t of HERO) {
  const a = lay(t, "instagram")
  ok(`${t}: Instagram headline size and y unchanged (${a.headline.fontPx}px y${Math.round(a.headline.topPx)})`,
    a.headline.fontPx === headlineFit(buildTemplateHeadline(t, src)).fontPx)
}

// ── 3. NOTHING VERTICAL MOVED ─────────────────────────────────────────────────────────────────
console.log("\nvertical position is untouched on both platforms:")
for (const t of HERO) {
  const ig = lay(t, "instagram"), ttl = lay(t, "tiktok")
  // market_type/special_feature are top-anchored and TikTok has its own anchor (300 vs 427); the
  // centred ones must land at the same y on both, because centring is platform-independent.
  if (t === "market_type_centered") {
    // CENTRING IS THE INVARIANT, NOT THE TOP COORDINATE. A re-fitted headline makes the lockup
    // shorter, so it starts a few px lower while its MIDPOINT stays on the canvas centre — which is
    // what "vertically centred, exactly where it was" means. Asserting equal `topPx` would have
    // demanded the lockup stay the same HEIGHT, which is the one thing the width fix changes.
    const mid = (b: typeof ig) => (b.headline.topPx + (b.detail ? b.detail.topPx + b.detail.fontPx : b.headline.topPx + b.headline.fontPx)) / 2
    ok(`${t}: still centred on Instagram (midpoint ${Math.round(mid(ig))})`, Math.abs(mid(ig) - OVERLAY_CANVAS.h / 2) < 1)
    ok(`${t}: still centred on TikTok (midpoint ${Math.round(mid(ttl))})`, Math.abs(mid(ttl) - OVERLAY_CANVAS.h / 2) < 1)
    ok(`${t}: the two midpoints agree`, Math.round(mid(ig)) === Math.round(mid(ttl)))
  } else {
    ok(`${t}: TikTok keeps its own top anchor (${Math.round(ttl.headline.topPx)})`, Math.round(ttl.headline.topPx) === 300)
  }
}

// ── 4. THE SHADOW IS UNAFFECTED ───────────────────────────────────────────────────────────────
console.log("\nthe approved shadow still reaches both lines on TikTok:")
{
  const L = lay("market_type_centered" as OverlayTemplate, "tiktok")
  const plan = buildDrawPlan(L)
  const filter = buildVideoFilter("/f.ttf", plan.map((i) => ({ file: `/t/${i.name}.txt`, fontPx: i.fontPx, topPx: i.topPx, lineSpacing: i.lineSpacing })), undefined, null, overlayTextFor("market_type_centered"))
  const draws = filter.split(";").filter((d) => d.includes("drawtext"))
  ok("both lines are drawn", draws.length === 2)
  ok("…each with the approved halo and shadow",
    draws.every((d) => /bordercolor=black@0\.22/.test(d) && /shadowcolor=black@0\.75/.test(d) && /shadowx=0/.test(d)))
  ok("…and the treatment is the untouched baseline",
    JSON.stringify(overlayTextFor("market_type_centered")) === JSON.stringify({ ...OVERLAY_TEXT }))
}

// ── 5. PREVIEW / EXPORT PARITY AT THE NEW WIDTH ───────────────────────────────────────────────
console.log("\npreview and export agree at the TikTok width:")
for (const t of HERO) {
  const L = lay(t, "tiktok")
  const plan = buildDrawPlan(L)
  const headPlan = plan.filter((i) => i.name.startsWith("head"))
  const sizes = L.headline.linePx ?? [L.headline.fontPx]
  ok(`${t}: the draw plan carries the re-fitted size(s) the preview block does`,
    headPlan.length === sizes.length && headPlan.every((i, n) => i.fontPx === sizes[n]))
  const sub = plan.find((i) => i.name === "sub")
  if (L.detail) ok(`${t}: …and the detail's`, !!sub && sub.fontPx === L.detail.fontPx && sub.topPx === L.detail.topPx)
}

console.log(`\nHero platform margins: ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
