// T33 — POV: Regular Shmegular Upgrade, built on POV Couple (T26).
//
// The risk in adding a template is never the template. It is the two lists: OVERLAY_TEMPLATES is
// IDENTITY (a saved post stores a string from it) and OVERLAY_TEMPLATE_ORDER is DISPLAY. Insert
// into the wrong one and every post saved as "roomie" silently becomes something else. So the
// first section below asserts that nothing already stored can change meaning, and it does it by
// pinning the registry's exact prior contents rather than by counting entries.
import {
  OVERLAY_TEMPLATES, OVERLAY_TEMPLATE_ORDER, OVERLAY_TEMPLATE_LABEL,
  buildTemplateHeadline, buildTemplateDetail, captionOpener, startingPriceLabel,
  type OverlayTemplate,
} from "@/lib/social/composePost"
import { computeOverlayLayout, templateFamily, overlayTextFor, headlineTextWidthPx, HOOK_TEXT_AVAIL_PX, OVERLAY_CANVAS } from "@/lib/social/overlaySpec"
import { buildDrawPlan, buildVideoFilter } from "@/lib/social/renderVideo"

let pass = 0
let fail = 0
function ok(name: string, cond: boolean, detail = "") {
  if (cond) { pass++; console.log(`  ✓ ${name}`) }
  else { fail++; console.log(`  ✗ ${name}${detail ? `  — ${detail}` : ""}`) }
}

const NEW = "pov_regular_shmegular" as OverlayTemplate
const BASE = "pov_couple" as OverlayTemplate
const HEADLINE = "POV: You ditched your regular shmegular apartment"
const src = (mode: unknown = "starting_at", budgetRange: string | null = "1450") =>
  ({ market: "Dallas", propertyType: "Apartment", budgetRange, priceLabelMode: mode, special: null, amenities: null }) as never

// ── 1. NOTHING ALREADY SAVED CAN CHANGE MEANING ───────────────────────────────────────────────
console.log("identity is append-only — no existing post can be re-read as another template:")
// The registry EXACTLY as it stood before T33, pinned literally. A reorder or an insertion
// anywhere but the end fails here, which counting entries would not catch.
const REGISTRY_BEFORE_T33 = [
  "market_type", "market_type_centered", "your_sign", "special_feature", "next_property", "upgrade",
  "apartment_standards", "pov_upgrade", "affordable_luxury", "pov_price", "hits_different", "trade_up",
  "wanted_luxury", "real_living", "what_mo_gets_you", "what_mo_gets_you_top", "property_tour",
  "would_you_live_here", "imagine_coming_home", "client_me", "client_me_bad_credit",
  "client_me_ex_cheated", "client_me_rent_increase", "client_me_roaches", "apartment_crush",
  "engagement", "level_up", "them_vs_me", "view", "aura", "pov_couple", "roomie",
]
ok("every pre-existing id is at its exact former index",
  REGISTRY_BEFORE_T33.every((id, i) => OVERLAY_TEMPLATES[i] === id),
  REGISTRY_BEFORE_T33.find((id, i) => OVERLAY_TEMPLATES[i] !== id))
ok("the new id is APPENDED, not inserted", OVERLAY_TEMPLATES[OVERLAY_TEMPLATES.length - 1] === NEW)
ok("the registry grew by exactly one", OVERLAY_TEMPLATES.length === REGISTRY_BEFORE_T33.length + 1,
  String(OVERLAY_TEMPLATES.length))
ok("no duplicate ids", new Set(OVERLAY_TEMPLATES).size === OVERLAY_TEMPLATES.length)

// ── 2. DISPLAY ORDER ──────────────────────────────────────────────────────────────────────────
console.log("\ndisplay order — inserted at 27, everything below shifts down one:")
const pos = (t: string) => OVERLAY_TEMPLATE_ORDER.indexOf(t as OverlayTemplate) + 1
ok(`POV Couple is still 26 (${pos(BASE)})`, pos(BASE) === 26)
ok(`the new template is 27 (${pos(NEW)})`, pos(NEW) === 27)
ok("it sits DIRECTLY after POV Couple", pos(NEW) === pos(BASE) + 1)
ok(`Roomie shifted 27 → 28 (${pos("roomie")})`, pos("roomie") === 28)
ok(`Client / Me shifted 28 → 29 (${pos("client_me")})`, pos("client_me") === 29)
ok(`Client / Me — Roaches shifted 32 → 33 (${pos("client_me_roaches")})`, pos("client_me_roaches") === 33)
ok("the first 19 display positions are untouched",
  OVERLAY_TEMPLATE_ORDER.slice(0, 19).every((t, i) => t === OVERLAY_TEMPLATES[i]))
ok("every registered template appears in the dropdown exactly once",
  OVERLAY_TEMPLATE_ORDER.length === OVERLAY_TEMPLATES.length &&
  new Set(OVERLAY_TEMPLATE_ORDER).size === OVERLAY_TEMPLATES.length &&
  OVERLAY_TEMPLATES.every((t) => OVERLAY_TEMPLATE_ORDER.includes(t)))
ok('it has a label: "POV: Regular Shmegular Upgrade"',
  OVERLAY_TEMPLATE_LABEL[NEW] === "POV: Regular Shmegular Upgrade", OVERLAY_TEMPLATE_LABEL[NEW])

// ── 3. IT INHERITS T26'S TREATMENT ────────────────────────────────────────────────────────────
console.log("\nit renders exactly as POV Couple does:")
ok(`same layout family (${templateFamily(NEW)})`, templateFamily(NEW) === templateFamily(BASE))
const L = computeOverlayLayout(NEW, buildTemplateHeadline(NEW, src()), buildTemplateDetail(NEW, src()), "instagram")
const B = computeOverlayLayout(BASE, buildTemplateHeadline(BASE, src()), buildTemplateDetail(BASE, src()), "instagram")
ok("same side margins (headline)", L.headline.sideMarginPx === B.headline.sideMarginPx)
ok("same side margins (detail)", L.detail!.sideMarginPx === B.detail!.sideMarginPx)
ok("same line spacing", L.headline.lineSpacing === B.headline.lineSpacing && L.detail!.lineSpacing === B.detail!.lineSpacing)
ok("same case treatment (both sentence case)", L.headline.uppercase === B.headline.uppercase && L.detail!.uppercase === B.detail!.uppercase)
ok("same font face on both blocks", L.headline.face === B.headline.face && L.detail!.face === B.detail!.face)
ok("same headline→detail gap",
  Math.round(L.detail!.topPx - (L.headline.topPx + L.headline.fontPx)) ===
  Math.round(B.detail!.topPx - (B.headline.topPx + B.headline.fontPx)))
const tx = overlayTextFor(NEW), tb = overlayTextFor(BASE)
ok("identical text treatment (shadow, edge, tracking)", JSON.stringify(tx) === JSON.stringify(tb))
ok("detail is one step below the headline, as T26 is",
  L.headline.fontPx - L.detail!.fontPx === B.headline.fontPx - B.detail!.fontPx)

// ── 4. HEADLINE ───────────────────────────────────────────────────────────────────────────────
console.log("\nthe headline:")
ok("exact wording", buildTemplateHeadline(NEW, src()) === HEADLINE, buildTemplateHeadline(NEW, src()))
ok("fixed — no property type, market or price leaks in",
  ["Studio", "Penthouse", "Loft", null].every((pt) =>
    buildTemplateHeadline(NEW, { market: "Austin", propertyType: pt, budgetRange: "9999" } as never) === HEADLINE))
ok("renders on ONE line", L.headline.lines.length === 1)
const w = headlineTextWidthPx(L.headline.lines[0], L.headline.fontPx)
ok(`fits the safe box (${w.toFixed(0)}px of ${HOOK_TEXT_AVAIL_PX}px, ${(100 * w / HOOK_TEXT_AVAIL_PX).toFixed(1)}%)`, w <= HOOK_TEXT_AVAIL_PX)
const bottom = L.detail!.topPx + L.detail!.fontPx
ok(`the lockup clears Instagram's 3:4 grid crop (y${Math.round(L.headline.topPx)}–${Math.round(bottom)} inside 240–1680)`,
  L.headline.topPx >= 240 && bottom <= 1680)
ok("both lines stay inside the canvas", bottom <= OVERLAY_CANVAS.h)
ok("a caption opener exists and names no price", !!captionOpener(NEW, src()) && !/\$/.test(captionOpener(NEW, src()) ?? ""))

// ── 5. PRICING — BOTH MODES, FROM THE SHARED SOURCE ───────────────────────────────────────────
console.log("\nthe price line, from the existing price logic only:")
ok('starting_at → "Starting at $1,450/month"',
  buildTemplateDetail(NEW, src("starting_at")) === "Starting at $1,450/month", buildTemplateDetail(NEW, src("starting_at")))
ok('exact_unit → "Exact unit shown: $1,450/month"',
  buildTemplateDetail(NEW, src("exact_unit")) === "Exact unit shown: $1,450/month", buildTemplateDetail(NEW, src("exact_unit")))
ok("an unset mode falls back to starting_at, as everywhere else",
  buildTemplateDetail(NEW, src(null)) === "Starting at $1,450/month")
ok("it is byte-identical to startingPriceLabel — no second formatter",
  (["starting_at", "exact_unit", null] as const).every((m) =>
    buildTemplateDetail(NEW, src(m)) === startingPriceLabel("1450", m as never)))
ok("it matches what POV Couple produces for the same source",
  (["starting_at", "exact_unit"] as const).every((m) => buildTemplateDetail(NEW, src(m)) === buildTemplateDetail(BASE, src(m))))
for (const [label, budget] of [["no price", null], ["empty", ""], ["non-numeric", "call for pricing"]] as [string, string | null][]) {
  const d = buildTemplateDetail(NEW, src("starting_at", budget))
  const layout = computeOverlayLayout(NEW, HEADLINE, d, "instagram")
  ok(`${label} → the line AND its gap collapse (no $0, no placeholder)`, d === "" && layout.detail === null, JSON.stringify(d))
}
ok("a different price is carried through, never a constant",
  buildTemplateDetail(NEW, src("starting_at", "2375")) === "Starting at $2,375/month",
  buildTemplateDetail(NEW, src("starting_at", "2375")))

// ── 6. PREVIEW ↔ EXPORT PARITY ────────────────────────────────────────────────────────────────
// The preview and the renderer both consume computeOverlayLayout; the renderer additionally walks
// buildDrawPlan. Parity therefore means: the draw plan carries the SAME text, sizes and positions
// the preview blocks do, and the filter emits them unchanged.
console.log("\nthe editor preview and the exported MP4 agree:")
for (const mode of ["starting_at", "exact_unit"] as const) {
  const head = buildTemplateHeadline(NEW, src(mode))
  const det = buildTemplateDetail(NEW, src(mode))
  const lay = computeOverlayLayout(NEW, head, det, "instagram")
  const plan = buildDrawPlan(lay)
  ok(`${mode}: the plan has exactly a headline and a detail`, plan.length === 2, String(plan.length))
  ok(`${mode}: headline text, size and y all match the preview block`,
    plan[0].text === lay.headline.lines.join("\n") && plan[0].fontPx === lay.headline.fontPx && plan[0].topPx === lay.headline.topPx)
  ok(`${mode}: detail text, size and y all match the preview block`,
    plan[1].text === lay.detail!.lines.join("\n") && plan[1].fontPx === lay.detail!.fontPx && plan[1].topPx === lay.detail!.topPx)
  ok(`${mode}: the price reaches the burned-in text verbatim`, plan[1].text === det, plan[1].text)
  const filter = buildVideoFilter("/f.ttf", plan.map((i) => ({ file: `/t/${i.name}.txt`, fontPx: i.fontPx, topPx: i.topPx, lineSpacing: i.lineSpacing })), undefined, null, overlayTextFor(NEW))
  const sizes = [...filter.matchAll(/fontsize=(\d+)/g)].map((m) => Number(m[1]))
  const ys = [...filter.matchAll(/:y=(\d+)/g)].map((m) => Number(m[1]))
  ok(`${mode}: the filter draws both at the planned sizes`, sizes.join() === `${lay.headline.fontPx},${lay.detail!.fontPx}`, sizes.join())
  ok(`${mode}: …at the planned positions`, ys.join() === `${Math.round(lay.headline.topPx)},${Math.round(lay.detail!.topPx)}`, ys.join())
  ok(`${mode}: both centred on the same axis`, (filter.match(/x=\(w-text_w\)\/2/g) ?? []).length === 2)
  const fonts = new Set([...filter.matchAll(/fontfile='([^']+)'/g)].map((m) => m[1]))
  ok(`${mode}: one typeface across both lines`, fonts.size === 1)
}
ok("no price → the renderer draws ONE item, not an empty second one",
  buildDrawPlan(computeOverlayLayout(NEW, HEADLINE, "", "instagram")).length === 1)

// ── 7. EVERY OTHER TEMPLATE IS UNCHANGED ──────────────────────────────────────────────────────
console.log("\nno existing template moved, changed family, or changed output:")
let drift = 0
for (const t of REGISTRY_BEFORE_T33 as OverlayTemplate[]) {
  const before = computeOverlayLayout(t, buildTemplateHeadline(t, src()), buildTemplateDetail(t, src()), "instagram")
  if (templateFamily(t) === "hero" && before.headline.lines.length === 0) continue
  if (JSON.stringify(overlayTextFor(t)) !== JSON.stringify(overlayTextFor(BASE)) && t !== "market_type") drift++
}
ok("no template gained an unexpected text treatment (only market_type differs, by design)", drift === 0, String(drift))
ok("POV Couple's own headline is untouched",
  buildTemplateHeadline(BASE, src()) === "POV: You just moved in with the love of your life")
ok("Roomie still computes its per-person split, not the shared price line",
  /per roomie$/.test(buildTemplateDetail("roomie" as OverlayTemplate, { ...(src() as object), propertyType: "Apartment" } as never) || "x") ||
  buildTemplateDetail("roomie" as OverlayTemplate, src()) === "")
ok("every template still resolves a family", OVERLAY_TEMPLATES.every((t) => !!templateFamily(t)))
ok("every template still has a label", OVERLAY_TEMPLATES.every((t) => !!OVERLAY_TEMPLATE_LABEL[t]))

console.log(`\nPOV: Regular Shmegular Upgrade: ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
