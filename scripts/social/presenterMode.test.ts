// TIKTOK PRESENTER MODE — the lockup moves to a top anchor when a presenter is attached.
//
// A presenter occupies the lower half of the frame, so a CENTRED lockup would sit on the figure.
// Presenter Mode moves the whole lockup to y480 for the life of the video — not just while the
// avatar is visible, because text that jumps when it fades reads as a glitch.
//
// The two failure modes worth testing are opposite: moving text for a presenter that is not there,
// and leaving it centred under one that is. Both are asserted, along with the scope — this is a
// reviewed TikTok/Market + Type test, not a library-wide rollout, and everything outside that scope
// must be bit-identical.
import { computeOverlayLayout, presenterModeAnchorPx, presenterCompositionPlatform, overlayTextFor, OVERLAY_TEXT, OVERLAY_CANVAS, headlineTextWidthPx } from "@/lib/social/overlaySpec"
import { OVERLAY_TEMPLATES, OVERLAY_TEMPLATE_ORDER, buildTemplateHeadline, buildTemplateDetail, type OverlayTemplate } from "@/lib/social/composePost"
import { safeAreaFor } from "@/lib/social/platformSafeArea"
import { PRESENTER, presenterBottomPx } from "@/lib/social/presenterSpec"
import { buildDrawPlan, buildVideoFilter } from "@/lib/social/renderVideo"
import { readFileSync } from "node:fs"

let pass = 0
let fail = 0
function ok(name: string, cond: boolean, detail = "") {
  if (cond) { pass++; console.log(`  ✓ ${name}`) }
  else { fail++; console.log(`  ✗ ${name}${detail ? `  — ${detail}` : ""}`) }
}

const src = { market: "Dallas", propertyType: "Apartment", budgetRange: "1450", priceLabelMode: "starting_at", special: "8 Weeks Free", socialSpecial: null, amenities: "Pool" } as never
const lay = (t: OverlayTemplate, platform: string, presenter = false) =>
  computeOverlayLayout(t, buildTemplateHeadline(t, src), buildTemplateDetail(t, src), platform, presenter)
// 380 after three reviewed SELF_ONLY tests on a real phone (480 → 440 → 380). The profile grid was
// MEASURED at 3:4 (cells ~307x408, visible band y240-1680), not the 1:1 the first value assumed.
const ANCHOR = 380        // TikTok, finalized
const IG_ANCHOR = 320     // Instagram sits higher; everything else is TikTok's composition
const MT = "market_type_centered" as OverlayTemplate
const MT_TOP = "market_type" as OverlayTemplate

// ── 1. THE ANCHOR APPLIES, AND ONLY IN SCOPE ──────────────────────────────────────────────────
console.log("the anchor resolves only for TikTok × Market + Type:")
ok(`market_type_centered on tiktok → ${ANCHOR}`, presenterModeAnchorPx("market_type_centered", "tiktok") === ANCHOR)
ok(`market_type on tiktok → ${ANCHOR}`, presenterModeAnchorPx("market_type", "tiktok") === ANCHOR)
// Instagram borrows TikTok's COMPOSITION but keeps its OWN anchor — the one value that is not
// shared, because vertical position was settled per platform on a real phone.
ok(`Instagram has its own anchor → ${IG_ANCHOR}`, presenterModeAnchorPx("market_type_centered", "instagram") === IG_ANCHOR)
ok("…for the hidden top variant too", presenterModeAnchorPx("market_type", "instagram") === IG_ANCHOR)
ok(`…and an Instagram presenter layout lands there (y${IG_ANCHOR}), not on TikTok's ${ANCHOR}`,
  Math.round(lay("market_type_centered" as OverlayTemplate, "instagram", true).headline.topPx) === IG_ANCHOR)
ok("the two anchors are genuinely different", IG_ANCHOR !== ANCHOR)
ok("instagram_story is still NOT enrolled (different interface and crop, no reviewed test)",
  presenterModeAnchorPx("market_type_centered", "instagram_story") === null)
for (const t of ["pov_price", "roomie", "special_feature", "what_mo_gets_you", "pov_regular_shmegular"]) {
  ok(`${t} is out of scope on tiktok`, presenterModeAnchorPx(t, "tiktok") === null)
}
ok("an unknown platform resolves to null", presenterModeAnchorPx("market_type_centered", "snapchat") === null)

// ── 2. WITH A PRESENTER, ON TIKTOK ────────────────────────────────────────────────────────────
console.log("\nwith a presenter attached, on TikTok:")
{
  const on = lay(MT, "tiktok", true), off = lay(MT, "tiktok", false)
  ok(`the lockup moves to y${ANCHOR} (was y${Math.round(off.headline.topPx)})`, Math.round(on.headline.topPx) === ANCHOR)
  const lockH = Math.round((on.detail!.topPx + on.detail!.fontPx) - on.headline.topPx)
  ok(`it translates as ONE unit — same height (${lockH}px) as centred`,
    lockH === Math.round((off.detail!.topPx + off.detail!.fontPx) - off.headline.topPx))
  ok("…same fitted sizes", on.headline.fontPx === off.headline.fontPx && on.detail!.fontPx === off.detail!.fontPx)
  ok("…same gap", Math.round(on.detail!.topPx - (on.headline.topPx + on.headline.fontPx)) ===
    Math.round(off.detail!.topPx - (off.headline.topPx + off.headline.fontPx)))
  ok("…same margins (the TikTok rail fix is preserved)",
    on.headline.sideMarginPx === off.headline.sideMarginPx && on.detail!.sideMarginPx === off.detail!.sideMarginPx)
  ok("…same wording and case", JSON.stringify(on.headline.lines) === JSON.stringify(off.headline.lines) && on.headline.uppercase === off.headline.uppercase)
  ok("the hidden top variant moves too, so a saved post on either renders alike",
    Math.round(lay(MT_TOP, "tiktok", true).headline.topPx) === ANCHOR)
}

// ── 3. WITHOUT A PRESENTER, NOTHING MOVES — ANYWHERE ──────────────────────────────────────────
console.log("\nwithout a presenter, every template on every platform is unchanged:")
{
  let moved = 0
  for (const t of OVERLAY_TEMPLATES) {
    for (const p of ["instagram", "instagram_story", "tiktok"]) {
      const a = lay(t, p, false)
      // The default argument must behave identically to an explicit false.
      const b = computeOverlayLayout(t, buildTemplateHeadline(t, src), buildTemplateDetail(t, src), p)
      if (JSON.stringify(a) !== JSON.stringify(b)) { moved++; console.log(`      ${t}|${p} differs from the default`) }
    }
  }
  ok(`the presenter flag defaults to false for all ${OVERLAY_TEMPLATES.length} templates × 3 surfaces`, moved === 0)
  // CENTRING IS THE INVARIANT, NOT THE TOP COORDINATE. On TikTok the headline re-fits to 57px for
  // the narrower rail-safe box, so the lockup is shorter and its TOP sits a few px lower while its
  // MIDPOINT stays on the canvas centre. Pinning y890 on both would demand the lockup keep
  // Instagram's height on TikTok, which the rail fix deliberately changes.
  const midOf = (L: ReturnType<typeof lay>) =>
    (L.headline.topPx + (L.detail ? L.detail.topPx + L.detail.fontPx : L.headline.topPx + L.headline.fontPx)) / 2
  for (const p of ["tiktok", "instagram"]) {
    const L = lay(MT, p, false)
    ok(`market_type_centered stays centred on ${p} without a presenter (top y${Math.round(L.headline.topPx)}, midpoint ${Math.round(midOf(L))})`,
      Math.abs(midOf(L) - OVERLAY_CANVAS.h / 2) < 1)
  }
  ok("…and Instagram's centred top is still exactly y890", Math.round(lay(MT, "instagram", false).headline.topPx) === 890)
  ok(`market_type keeps its top anchor on TikTok (y${Math.round(lay(MT_TOP, "tiktok", false).headline.topPx)})`,
    Math.round(lay(MT_TOP, "tiktok", false).headline.topPx) === 300)
  ok("…and the frozen y427 on Instagram", Math.round(lay(MT_TOP, "instagram", false).headline.topPx) === 427)
}

// ── 4. OUT-OF-SCOPE TEMPLATES DO NOT MOVE EVEN WITH A PRESENTER ───────────────────────────────
console.log("\nwith a presenter, OUT-OF-SCOPE templates are still untouched:")
{
  let moved = 0
  for (const t of OVERLAY_TEMPLATES) {
    if (t === MT || t === MT_TOP) continue
    for (const p of ["instagram", "instagram_story", "tiktok"]) {
      if (JSON.stringify(lay(t, p, true)) !== JSON.stringify(lay(t, p, false))) { moved++; console.log(`      ${t}|${p} moved`) }
    }
  }
  ok(`${OVERLAY_TEMPLATES.length - 2} other templates unaffected on all 3 surfaces`, moved === 0, `${moved} moved`)
  // Instagram's Market + Type DOES move now — that is the change. A Story still must not.
  ok("Market + Type on INSTAGRAM now moves with a presenter (it is enrolled)",
    JSON.stringify(lay(MT, "instagram", true)) !== JSON.stringify(lay(MT, "instagram", false)))
  ok("…and a STORY is still untouched by a presenter",
    JSON.stringify(lay(MT, "instagram_story", true)) === JSON.stringify(lay(MT, "instagram_story", false)))
}

// ── 5. THE GEOMETRY, AGAINST TIKTOK'S INTERFACE AND BOTH GRID CROPS ───────────────────────────
console.log("\ngeometry — interface, grid crops, and the WORST-CASE 9:16 presenter:")
{
  const L = lay(MT, "tiktok", true)
  const top = Math.round(L.headline.topPx), bottom = Math.round(L.detail!.topPx + L.detail!.fontPx)
  const tt = safeAreaFor("tiktok")
  const header = tt.zones.find((z) => z.kind === "header")!.rect
  const rail = tt.zones.find((z) => z.kind === "rail")!.rect
  const CAP_EXPANDED = 831
  // 9:16 is the TALLEST a presenter clip can be at the default width — the binding case.
  const pH916 = Math.round(PRESENTER.widthPx / (9 / 16))
  const pBottom = presenterBottomPx("tiktok")
  const pTop916 = pBottom - pH916

  ok(`text y${top}–${bottom} clears TikTok's header (y${header.y + header.h})`, top >= header.y + header.h)
  ok(`…and the expanded caption (y${CAP_EXPANDED})`, bottom < CAP_EXPANDED)
  ok(`…and the 9:16 presenter's head (y${pTop916}, gap ${pTop916 - bottom}px)`, pTop916 - bottom >= 40, `${pTop916 - bottom}px`)
  ok(`the presenter itself clears the rail (reaches x${PRESENTER.xPx + PRESENTER.widthPx}, rail x${rail.x})`,
    PRESENTER.xPx + PRESENTER.widthPx <= rail.x)
  // 3:4 is the MEASURED crop (a real profile screenshot: cells ~307x408 → 0.75), and it is the one
  // this layout is REQUIRED to satisfy.
  ok(`3:4 grid crop (measured): text fully visible, ${top - 240}px padding`, top >= 240 && bottom <= 1680)
  ok("3:4 grid crop: the 9:16 presenter's head is visible", pTop916 >= 240)
  ok("the measured 3:4 crop leaves real headroom (>=100px)", top - 240 >= 100, `${top - 240}px`)
  // 1:1 (y420-1500) is NOT asserted, because at y380 it would fail and that is a known, accepted
  // trade — see the SCOPE note in overlaySpec. It is still MEASURED here so the cost is on the
  // record rather than discovered later: a square crop would clip the lockup's top by this much.
  const squareClip = Math.max(0, 420 - top)
  console.log(`  · 1:1 crop (hypothetical, NOT a requirement): would clip ${squareClip}px off the top`)
  ok("…and a square crop would still not reach the PRICE line", bottom <= 1500 && top + L.headline.fontPx <= 1500)
  // Horizontal: every line's INK, since both renderers centre on the canvas.
  let wide = 0
  for (const b of [L.headline, L.detail!]) b.lines.forEach((line, i) => {
    const w = headlineTextWidthPx(line, b.linePx?.[i] ?? b.fontPx)
    if ((OVERLAY_CANVAS.w + w) / 2 > rail.x) wide++
  })
  ok("no text line reaches the engagement rail", wide === 0)
}

// ── 5b. INSTAGRAM = TIKTOK'S COMPOSITION, SHIFTED ────────────────────────────────────────────
// Everything that makes the picture is TikTok's — fitted font sizes, margins, line breaking, gap,
// treatment, and the figure's x / width / footing. The ONLY difference is the vertical offset, and
// it is asserted as an exact rigid translation rather than "both are in range": a layout that
// differed in some OTHER way would still satisfy a range check.
console.log("\nInstagram is TikTok's composition shifted up, and nothing else:")
{
  const ttL = lay(MT, "tiktok", true)
  const igL = lay(MT, "instagram", true)
  const SHIFT = ANCHOR - IG_ANCHOR

  ok(`the lockup sits ${SHIFT}px higher (y${Math.round(igL.headline.topPx)} vs y${Math.round(ttL.headline.topPx)})`,
    Math.round(ttL.headline.topPx - igL.headline.topPx) === SHIFT)
  ok(`…and the price line moves by exactly the same ${SHIFT}px`,
    Math.round(ttL.detail!.topPx - igL.detail!.topPx) === SHIFT)
  // RIGID TRANSLATION: shift Instagram's layout back down by SHIFT and it must equal TikTok's.
  const shifted = JSON.parse(JSON.stringify(igL))
  shifted.headline.topPx += SHIFT
  shifted.detail.topPx += SHIFT
  ok("shifting it back down reproduces TikTok's layout EXACTLY — nothing else differs",
    JSON.stringify(shifted) === JSON.stringify(ttL))

  ok(`…same headline size (${igL.headline.fontPx}px, NOT Instagram's own 66px)`,
    igL.headline.fontPx === ttL.headline.fontPx && igL.headline.fontPx === 57)
  ok(`…same price size (${igL.detail!.fontPx}px)`, igL.detail!.fontPx === ttL.detail!.fontPx && igL.detail!.fontPx === 52)
  ok(`…same ${Math.round(igL.detail!.topPx - (igL.headline.topPx + igL.headline.fontPx))}px headline→price gap`,
    Math.round(igL.detail!.topPx - (igL.headline.topPx + igL.headline.fontPx)) ===
    Math.round(ttL.detail!.topPx - (ttL.headline.topPx + ttL.headline.fontPx)))
  ok("…same side margins", igL.headline.sideMarginPx === ttL.headline.sideMarginPx && igL.detail!.sideMarginPx === ttL.detail!.sideMarginPx)
  ok("…same line breaking", JSON.stringify(igL.headline.lines) === JSON.stringify(ttL.headline.lines))
  ok("…and the same burned-in treatment", JSON.stringify(overlayTextFor(MT)) === JSON.stringify({ ...OVERLAY_TEXT }))
  ok("Instagram's own geometry really would differ (the substitution is doing work)",
    lay(MT, "instagram", false).headline.fontPx === 66 && ttL.headline.fontPx === 57)

  // y320 still has to clear the interface it is moving toward.
  const igArea = safeAreaFor("instagram")
  const header = igArea.zones.find((z) => z.kind === "header")!.rect
  const igTop = Math.round(igL.headline.topPx), igBottom = Math.round(igL.detail!.topPx + igL.detail!.fontPx)
  ok(`text y${igTop}–${igBottom} still clears Instagram's header (y${header.y + header.h}, ${igTop - (header.y + header.h)}px)`,
    igTop >= header.y + header.h)
  ok("…and stays inside the declared text box", igTop >= igArea.text.y && igBottom <= igArea.text.y + igArea.text.h)

  // The presenter's own placement goes through the SAME substitution, in the renderer.
  const sub = presenterCompositionPlatform(MT, "instagram")
  ok(`the composition platform for Instagram + Market + Type is "${sub}"`, sub === "tiktok")
  ok("…so the figure stands at TikTok's footing (y1480), not Instagram's y1608",
    presenterBottomPx(sub) === 1480 && presenterBottomPx("instagram") === 1608)
  ok(`…at the same x${PRESENTER.xPx} and width ${PRESENTER.widthPx}`, PRESENTER.xPx === 110 && PRESENTER.widthPx === 400)
  ok("…with the same 4s intro and 0.6s fade", PRESENTER.defaultIntroSeconds === 4 && PRESENTER.fadeSeconds === 0.6)
  ok(`…and ${Math.round((presenterBottomPx(sub) - Math.round(PRESENTER.widthPx / (9 / 16))) - igBottom)}px of clearance to the tallest head`,
    (presenterBottomPx(sub) - Math.round(PRESENTER.widthPx / (9 / 16))) - igBottom >= 40)
  const strip = (x: string) => x.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "")
  ok("the stripper works (a comment mentioning the call is not a call)",
    !strip("// platform: presenterCompositionPlatform(x)").includes("presenterCompositionPlatform"))
  const rv = strip(readFileSync("lib/social/renderVideo.ts", "utf8"))
  ok("the renderer builds the presenter plan through the substitution",
    /buildPresenterPlan\(\{[\s\S]{0,400}?platform:\s*presenterCompositionPlatform\(/.test(rv))
  ok("…and there is exactly one call to it there", (rv.match(/presenterCompositionPlatform\(/g) ?? []).length === 1)
  ok("both lines are drawn for the full duration (no time gating)", buildDrawPlan(igL).length === 2)
  ok(`…at the Instagram anchor (y${Math.round(buildDrawPlan(igL)[0].topPx)})`, Math.round(buildDrawPlan(igL)[0].topPx) === IG_ANCHOR)
}

// ── 5c. WHAT MUST NOT MOVE ON INSTAGRAM ───────────────────────────────────────────────────────
console.log("\nInstagram WITHOUT a presenter, and Stories, are untouched:")
{
  ok("centred Market + Type is still exactly y890 with no presenter",
    Math.round(lay(MT, "instagram", false).headline.topPx) === 890)
  ok("…still its own 66px headline", lay(MT, "instagram", false).headline.fontPx === 66)
  ok("…and still vertically centred", (() => {
    const L = lay(MT, "instagram", false)
    const mid = (L.headline.topPx + L.detail!.topPx + L.detail!.fontPx) / 2
    return Math.abs(mid - OVERLAY_CANVAS.h / 2) < 1
  })())
  ok("a STORY with a presenter is NOT substituted", presenterCompositionPlatform(MT, "instagram_story") === "instagram_story")
  ok("…and its layout is unchanged by a presenter",
    JSON.stringify(lay(MT, "instagram_story", true)) === JSON.stringify(lay(MT, "instagram_story", false)))
  ok("an out-of-scope template is never substituted",
    presenterCompositionPlatform("apartment_crush", "instagram") === "instagram")
  ok("TikTok itself is never substituted", presenterCompositionPlatform(MT, "tiktok") === "tiktok")
  ok(`…and TikTok's finalized anchor is still ${ANCHOR}`,
    Math.round(lay(MT, "tiktok", true).headline.topPx) === ANCHOR && presenterModeAnchorPx(MT, "tiktok") === ANCHOR)
  ok("…including the hidden top variant", Math.round(lay(MT_TOP, "tiktok", true).headline.topPx) === ANCHOR)
}

// ── 6. STYLING AND THE RENDER PATH ────────────────────────────────────────────────────────────
console.log("\nshadows, fitting and the single composition pipeline:")
{
  const L = lay(MT, "tiktok", true)
  const plan = buildDrawPlan(L)
  const filter = buildVideoFilter("/f.ttf", plan.map((i) => ({ file: `/t/${i.name}.txt`, fontPx: i.fontPx, topPx: i.topPx, lineSpacing: i.lineSpacing })), undefined, null, overlayTextFor(MT))
  const draws = filter.split(";").filter((d) => d.includes("drawtext"))
  ok("both lines are drawn", draws.length === 2)
  ok("…each with the approved halo and shadow",
    draws.every((d) => /borderw=2/.test(d) && /bordercolor=black@0\.22/.test(d) && /shadowcolor=black@0\.75/.test(d)))
  ok("the treatment is the untouched baseline", JSON.stringify(overlayTextFor(MT)) === JSON.stringify({ ...OVERLAY_TEXT }))
  ok("…and the plan's y values are the Presenter Mode ones",
    plan[0].topPx === L.headline.topPx && plan[1].topPx === L.detail!.topPx)
}
{
  // ONE pipeline: the renderer decides from the SAME fact that composites the presenter, and the
  // editor preview from the same state it sends. Neither invents a second source of truth.
  const code = (x: string) => x.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "")
  const rv = code(readFileSync("lib/social/renderVideo.ts", "utf8"))
  const ed = code(readFileSync("components/crm/social/PostEditor.tsx", "utf8"))
  ok("the renderer derives the flag from input.presenterPath", /computeOverlayLayout\([\s\S]{0,300}?!!input\.presenterPath/.test(rv))
  ok("…the same value it composites the presenter from", /presenterLocal\s*\?/.test(rv) || /input\.presenterPath/.test(rv))
  ok("the editor preview derives it from the attached presenter", /computeOverlayLayout\([^)]*!!presenter\.presenterId\)/.test(ed))
  ok("no second overlay/composition path was introduced",
    (rv.match(/buildPresenterFilter\(/g) ?? []).length === 1)
  ok("renderPost still supplies the clip to the renderer",
    /presenterPath:\s*presenterLocal/.test(code(readFileSync("lib/social/renderPost.ts", "utf8"))))
}

// ── 7. NOTHING ELSE CHANGED ───────────────────────────────────────────────────────────────────
console.log("\nselector and identities untouched:")
ok("33 registered identities", OVERLAY_TEMPLATES.length === 33)
ok("31 visible selections", OVERLAY_TEMPLATE_ORDER.length === 31)
ok("the hidden pair is still registered and still hidden",
  (OVERLAY_TEMPLATES as readonly string[]).includes("market_type") &&
  !(OVERLAY_TEMPLATE_ORDER as readonly string[]).includes("market_type") &&
  (OVERLAY_TEMPLATES as readonly string[]).includes("what_mo_gets_you_top") &&
  !(OVERLAY_TEMPLATE_ORDER as readonly string[]).includes("what_mo_gets_you_top"))
ok("presenter timing constants are unchanged",
  PRESENTER.defaultIntroSeconds === 4 && PRESENTER.minIntroSeconds === 3 &&
  PRESENTER.maxIntroSeconds === 5 && PRESENTER.fadeSeconds === 0.6)
ok("presenter placement constants are unchanged",
  PRESENTER.xPx === 110 && PRESENTER.widthPx === 400 && PRESENTER.captionOverlapPx === 60)

console.log(`\nPresenter Mode (TikTok): ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
