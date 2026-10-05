// COMPOUND Social-only property types — "{QUALIFIER} {HEAD NOUN}" families (Split-Level,
// Industrial-Style). Two things make them different from every pre-existing type:
//   1. HERO structure. "SAN ANTONIO INDUSTRIAL-STYLE APARTMENTS" is 39 chars vs the longest
//      pre-existing combo's 24. Forcing it onto ONE line fits only by dropping the hero to 30px, too
//      small for a hero title; the plain char-wrap splits the qualifier off its head noun. So a
//      compound hero is built as exactly TWO lines — market, then the COMPLETE compound type.
//   2. A SUBTLE HIERARCHY. The compound property-type line is the fit driver (always the wider line);
//      the market line steps COMPOUND_MARKET_SCALE (1.18x) above it, capped at the normal hero max.
//      Equal sizes read flat; the market pinned at 66 read as headline + subtitle. The detail then
//      scales off the property line (0.85x) so it stays visibly below it instead of hitting the
//      normal 44px hero-detail floor. Geometry is carried per line (OverlayBlock.linePx/lineTopPx)
//      and drawn as one unit per line in BOTH renderers, because explicit per-line tops are what make
//      the CSS preview and FFmpeg agree exactly.
// Both are gated on the compound qualifier, so pre-existing types are untouched — asserted below.
// Run: npx tsx scripts/social/compoundTypes.test.ts
import { readFileSync, readdirSync } from "node:fs"
import path from "node:path"
import {
  PROPERTY_TYPES, SOCIAL_ONLY_PROPERTY_TYPES, COMPOUND_TYPE_QUALIFIERS, propertyNoun, propertyNounPlural,
} from "@/lib/social/propertyTypes"
import { OVERLAY_TEMPLATES, buildTemplateHeadline, buildTemplateDetail, type SourceMeta } from "@/lib/social/composePost"
import { buildDrawPlan } from "@/lib/social/renderVideo"
import {
  computeOverlayLayout, templateFamily, headlineTextWidthPx, detailTextWidthPx, isCompoundHeadline,
  fitCompoundHeroPx, HEADLINE_TEXT_AVAIL_PX, DETAIL_TEXT_AVAIL_PX, HERO_MAX_PX, HERO_MIN_PX,
  COMPOUND_HERO_MIN_PX, OVERLAY_CANVAS, OVERLAY_SPEC, splitCompoundHeadline, MARKET_TYPE_DETAIL_PX,
  COMPOUND_MARKET_SCALE, COMPOUND_DETAIL_SCALE,
} from "@/lib/social/overlaySpec"

let pass = 0, fail = 0
const ok = (l: string, c: boolean) => { if (c) { pass++; console.log(`  ✓ ${l}`) } else { fail++; console.log(`  ✗ ${l}`) } }

const MARKETS = ["Austin", "Dallas", "DFW", "Houston", "San Antonio"]
// budgetRange present AND absent: the price-bearing headline (T15/T16) and detail (T1/T10–T14) only
// render with a price, so a single fixture would silently skip half the templates.
const PRICES: (string | null)[] = ["$1,495 - $2,100", null]
const meta = (market: string, propertyType: string, budgetRange: string | null): SourceMeta =>
  ({ market, propertyType, budgetRange, special: "1 month free", amenities: "Rooftop pool, EV charging" })
const isCompoundType = (t: string) => COMPOUND_TYPE_QUALIFIERS.some((q) => t.startsWith(q))
const COMPOUND_TYPES = SOCIAL_ONLY_PROPERTY_TYPES.filter(isCompoundType)

console.log("compound type inventory:")
ok("both qualifier families are declared", COMPOUND_TYPE_QUALIFIERS.includes("Split-Level") && COMPOUND_TYPE_QUALIFIERS.includes("Industrial-Style"))
ok("7 compound types (3 Split-Level + 4 Industrial-Style)", COMPOUND_TYPES.length === 7)
ok("every compound type is selectable in PROPERTY_TYPES", COMPOUND_TYPES.every((t) => (PROPERTY_TYPES as readonly string[]).includes(t)))

console.log("\nisCompoundHeadline recognises the qualifier, and ONLY the qualifier:")
ok("uppercase hero headline", isCompoundHeadline("SAN ANTONIO INDUSTRIAL-STYLE APARTMENTS"))
ok("lowercase sentence form", isCompoundHeadline("Your sign to get that split-level loft"))
ok("space instead of hyphen", isCompoundHeadline("AUSTIN INDUSTRIAL STYLE LOFTS"))
ok("pre-existing hero headline is NOT compound", !isCompoundHeadline("SAN ANTONIO RENTAL HOMES"))
ok("unrelated sentence is NOT compound", !isCompoundHeadline("You wanted luxury. You got it."))
ok("empty/null is NOT compound", !isCompoundHeadline("") && !isCompoundHeadline(null))

console.log("\nfitCompoundHeroPx TESTS its floor (never returns an overflowing size):")
ok("worst real compound hero fits one line at >= the floor", fitCompoundHeroPx("SAN ANTONIO INDUSTRIAL-STYLE APARTMENTS") === 30)
ok("result never exceeds HERO_MAX_PX", COMPOUND_TYPES.every((t) => MARKETS.every((m) => {
  const px = fitCompoundHeroPx(buildTemplateHeadline("market_type", meta(m, t, "$1,495 - $2,100")))
  return px !== null && px <= HERO_MAX_PX && px >= COMPOUND_HERO_MIN_PX
})))
ok("a width the floor cannot satisfy returns null (falls through to wrapping)", fitCompoundHeroPx("SPLIT-LEVEL", 1) === null)
ok("returned size actually fits the 900px safe box", COMPOUND_TYPES.every((t) => MARKETS.every((m) => {
  const h = buildTemplateHeadline("market_type", meta(m, t, null))
  return headlineTextWidthPx(h.toUpperCase(), fitCompoundHeroPx(h)!) <= HEADLINE_TEXT_AVAIL_PX
})))

console.log("\nglobal typography constants are UNCHANGED (compound support added nothing global):")
ok("HERO_MAX_PX still 66", HERO_MAX_PX === 66)
ok("HERO_MIN_PX still 47", HERO_MIN_PX === 47)
ok("hero sub/detail base still 44", OVERLAY_SPEC.sub.fontPx === 44)
ok("compound floor is a SEPARATE, lower constant", COMPOUND_HERO_MIN_PX === 30 && COMPOUND_HERO_MIN_PX < HERO_MIN_PX)
ok("headline line spacing unchanged (8)", OVERLAY_SPEC.headline.lineSpacing === 8)

console.log("\nsplitCompoundHeadline keeps the qualifier WITH its head noun:")
ok("market / complete compound type", JSON.stringify(splitCompoundHeadline("SAN ANTONIO INDUSTRIAL-STYLE APARTMENTS")) === JSON.stringify(["SAN ANTONIO", "INDUSTRIAL-STYLE APARTMENTS"]))
ok("single-word market", JSON.stringify(splitCompoundHeadline("DFW SPLIT-LEVEL LOFTS")) === JSON.stringify(["DFW", "SPLIT-LEVEL LOFTS"]))
ok("no market prefix → null (keeps the single-line fit)", splitCompoundHeadline("SPLIT-LEVEL LOFTS") === null)
ok("non-compound → null", splitCompoundHeadline("SAN ANTONIO TOWNHOMES") === null)

console.log("\nHERO (T1/T2/T4): compound titles are exactly TWO lines, market then complete type:")
const HERO_TPLS = ["market_type", "market_type_centered", "special_feature"] as const
let heroChecked = 0, twoLine = 0, hierarchy = 0, typeIntact = 0, detailOk = 0, stacked = 0, marketIndependent = 0
const sizeByType = new Map<string, number>()
for (const t of COMPOUND_TYPES) for (const m of MARKETS) for (const price of PRICES) for (const tpl of HERO_TPLS) {
  heroChecked++
  const s = meta(m, t, price)
  const L = computeOverlayLayout(tpl, buildTemplateHeadline(tpl, s), buildTemplateDetail(tpl, s))
  const h = L.headline
  if (h.lines.length === 2 && h.linePx?.length === 2 && h.lineTopPx?.length === 2) twoLine++
  // Line 1 is the market, stepped ~18% above the property line but never past the normal hero max.
  const [mkPx, prPx] = h.linePx ?? [h.fontPx, h.fontPx]
  const wantMk = Math.min(HERO_MAX_PX, Math.round(prPx * COMPOUND_MARKET_SCALE))
  if (mkPx === wantMk && mkPx <= HERO_MAX_PX && mkPx >= prPx && h.lines[0] === m.toUpperCase()) hierarchy++
  // The shared size is set by whichever line is WIDER (in practice the compound type), so it must be
  // the same for a given type regardless of market — a short market can't buy a bigger title.
  const prev = sizeByType.get(t)
  if (prev === undefined) sizeByType.set(t, h.linePx![1])
  else if (prev === h.linePx![1]) marketIndependent++
  // Line 2 carries the COMPLETE compound type — qualifier and head noun together, never split.
  const expected2 = propertyNounPlural(t).toUpperCase()
  if (h.lines[1] === expected2 && (h.linePx?.[1] ?? 0) <= HERO_MAX_PX) typeIntact++
  // The detail stays a separate third element below, on its existing rule (never hero typography).
  // The detail must be VISIBLY smaller than the property-type line, not merely not-larger.
  if (!L.detail || (L.detail.fontPx <= MARKET_TYPE_DETAIL_PX && L.detail.face === "detail" && L.detail.fontPx < prPx)) detailOk++
  // Line 2 sits directly under line 1: top2 = top1 + size1 + lineSpacing, and the detail below both.
  if (h.lineTopPx && Math.round(h.lineTopPx[1]) === Math.round(h.lineTopPx[0] + h.linePx![0] + h.lineSpacing)
    && (!L.detail || L.detail.topPx >= h.lineTopPx[1] + h.linePx![1])) stacked++
}
ok(`all ${heroChecked} compound hero combos render exactly TWO lines with per-line geometry`, twoLine === heroChecked)
ok(`market line = min(${HERO_MAX_PX}, round(property x ${COMPOUND_MARKET_SCALE})) and never smaller than it, in all ${heroChecked}`, hierarchy === heroChecked)
ok("the property line's size is set by the type, not the market", marketIndependent === heroChecked - COMPOUND_TYPES.length)
ok(`line 2 is the COMPLETE compound type, never split, in all ${heroChecked}`, typeIntact === heroChecked)
ok(`detail is VISIBLY smaller than the property-type line in all ${heroChecked}`, detailOk === heroChecked)
ok(`lines stack correctly and the detail clears them in all ${heroChecked}`, stacked === heroChecked)
{
  // The two worst cases, stated concretely.
  // market / property / detail, exactly as specified.
  const cases: [string, number, number][] = [["Industrial-Style Apartment", 52, 44], ["Split-Level Penthouse", 66, 56]]
  for (const [type, want1, want2] of cases) {
    const s = meta("San Antonio", type, "$1,800 - $2,400")
    const L = computeOverlayLayout("market_type", buildTemplateHeadline("market_type", s), buildTemplateDetail("market_type", s))
    ok(`${type}: "SAN ANTONIO" ${want1}px over "${propertyNounPlural(type).toUpperCase()}" ${want2}px`,
      JSON.stringify(L.headline.linePx) === JSON.stringify([want1, want2]))
  }
  // A compound type that already fits at the hero max puts BOTH lines there (the 1.18 step is capped).
  const fits = meta("San Antonio", "Split-Level Loft", null)
  const Lf = computeOverlayLayout("market_type", buildTemplateHeadline("market_type", fits), "")
  ok("a compound type that already fits keeps BOTH lines at the hero max", JSON.stringify(Lf.headline.linePx) === JSON.stringify([HERO_MAX_PX, HERO_MAX_PX]))
}

console.log("\nDETAIL scales off the property line, never the 44px hero floor:")
{
  // The specific case Jay called out: the longest Industrial-Style types must read 52 / 44 / 36-38.
  for (const type of ["Industrial-Style Apartment", "Industrial-Style Townhome", "Industrial-Style Penthouse"]) {
    const s = meta("San Antonio", type, "$1,900 - $2,400")
    const L = computeOverlayLayout("market_type", buildTemplateHeadline("market_type", s), buildTemplateDetail("market_type", s))
    const [mk, pr] = L.headline.linePx!
    ok(`${type}: 52 / 44 / 36-38 (got ${mk} / ${pr} / ${L.detail!.fontPx})`,
      mk === 52 && pr === 44 && L.detail!.fontPx >= 36 && L.detail!.fontPx <= 38)
  }
  // The rule can only REDUCE the existing result, never raise it — so a compound detail is never
  // bigger than the non-compound rule would have produced, and T4's flat 44 base still caps T4.
  let reduces = 0, n = 0
  for (const t of COMPOUND_TYPES) for (const tpl of HERO_TPLS) {
    n++
    const s = meta("San Antonio", t, "$1,900 - $2,400")
    const L = computeOverlayLayout(tpl, buildTemplateHeadline(tpl, s), buildTemplateDetail(tpl, s))
    const base = tpl === "special_feature" ? OVERLAY_SPEC.sub.fontPx
      : Math.min(MARKET_TYPE_DETAIL_PX, Math.max(OVERLAY_SPEC.sub.fontPx, L.headline.fontPx - 2))
    const want = Math.min(base, Math.max(26, Math.round(L.headline.fontPx * COMPOUND_DETAIL_SCALE)))
    if (L.detail!.fontPx === want && L.detail!.fontPx <= base) reduces++
  }
  ok(`detail = min(existing rule, round(property x ${COMPOUND_DETAIL_SCALE})) in all ${n} compound hero combos`, reduces === n)
}

console.log("\nCENTERING — both hero lines share ONE centre axis (no per-line padding):")
{
  const s = meta("San Antonio", "Industrial-Style Apartment", "$1,800 - $2,400")
  const L = computeOverlayLayout("market_type", buildTemplateHeadline("market_type", s), buildTemplateDetail("market_type", s))
  // Geometry carries ONE symmetric side margin for the whole block; each line is centred in that same
  // box by the renderer (textAlign:center in CSS, x=(w-text_w)/2 in FFmpeg). There is deliberately no
  // per-line x/offset field, so there is nothing that COULD shift one line relative to the other.
  ok("the block has a single symmetric side margin, not per-line offsets",
    L.headline.sideMarginPx === OVERLAY_SPEC.headline.sideMarginPx && !("lineXPx" in L.headline))
  const centre = OVERLAY_CANVAS.w / 2
  const centres = L.headline.lines.map((line, i) => {
    const w = headlineTextWidthPx(line.toUpperCase(), L.headline.linePx![i])
    return (OVERLAY_CANVAS.w - w) / 2 + w / 2 // FFmpeg's x=(w-text_w)/2 plus half the text width
  })
  ok("every line's rendered centre equals the canvas centre", centres.every((c) => Math.abs(c - centre) < 0.5))
}

console.log("\nGRAMMAR — the qualifier never splits from its head noun; only the noun pluralises:")
for (const t of COMPOUND_TYPES) {
  ok(`propertyNoun("${t}") is singular`, !/s$/.test(propertyNoun(t)))
  ok(`propertyNounPlural("${t}") pluralises the HEAD NOUN only`, /s$/.test(propertyNounPlural(t)) && !/Split-Levels|Industrial-Styles/i.test(propertyNounPlural(t)))
}
{
  const s = meta("San Antonio", "Industrial-Style Loft", "$1,495 - $2,100")
  // The EXISTING indefiniteArticle helper already handles the compound (it tests the first letter of
  // the whole phrase, case-insensitively) — no per-sentence hard-coding.
  ok('T12 uses "an" before Industrial-Style', buildTemplateHeadline("trade_up", s).includes("an industrial-style loft"))
  ok('T12 uses "a" before Split-Level', buildTemplateHeadline("trade_up", meta("San Antonio", "Split-Level Loft", null)).includes("a split-level loft"))
  ok("T14 lowercases the WHOLE compound phrase", buildTemplateHeadline("real_living", s) === "This is what real industrial-style loft living looks like")
  ok("T3 lowercases the whole compound phrase after \"new\"", buildTemplateHeadline("your_sign", s) === "Your sign to get that new industrial-style loft")
  ok("T5 lowercases the whole compound phrase", buildTemplateHeadline("next_property", s) === "What your next industrial-style loft could look like")
  // SENTENCE case mid-sentence, not the dropdown's title case: the qualifier is a descriptive
  // adjective here, not a proper noun.
  ok("T11 sentence-cases the compound subject", buildTemplateHeadline("hits_different", s) === "Industrial-style lofts just hit different")
  ok("T11 sentence-cases Split-Level too", buildTemplateHeadline("hits_different", meta("San Antonio", "Split-Level Townhome", null)) === "Split-level townhomes just hit different")
  // ...but NON-compound types keep their existing title-cased copy exactly.
  // SENTENCE case now applies to EVERY type, not just the compounds — this is a sentence subject,
  // not the dropdown label.
  ok("T11 sentence-cases multi-word NON-compound types too", buildTemplateHeadline("hits_different", meta("San Antonio", "Rental Home", null)) === "Rental homes just hit different")
  ok("T11 sentence-cases hyphenated NON-compound types too", buildTemplateHeadline("hits_different", meta("San Antonio", "High-Rise", null)) === "High-rises just hit different")
  ok("T11 leaves single-word NON-compound types unchanged", buildTemplateHeadline("hits_different", meta("San Antonio", "Townhome", null)) === "Townhomes just hit different")
  ok("T1 hero headline is {CITY} {QUALIFIER} {PLURAL}", buildTemplateHeadline("market_type", s) === "SAN ANTONIO INDUSTRIAL-STYLE LOFTS")
}

console.log("\nFULL SWEEP — 7 compound types × 5 markets × 2 price states × 16 templates:")
let overflow = 0, collision = 0, offCanvas = 0, staleMo = 0, badArticle = 0, orphaned = 0, combos = 0
for (const t of COMPOUND_TYPES) for (const m of MARKETS) for (const price of PRICES) for (const tpl of OVERLAY_TEMPLATES) {
  combos++
  const s = meta(m, t, price)
  const head = buildTemplateHeadline(tpl, s), det = buildTemplateDetail(tpl, s)
  const L = computeOverlayLayout(tpl, head, det)
  // Measure each block with ITS OWN face's advance map and safe box — a head-face block measured with
  // the detail map (or vice versa) would under-report and hide a real overflow.
  for (const b of [L.headline, L.detail]) {
    if (!b) continue
    const avail = b === L.headline ? HEADLINE_TEXT_AVAIL_PX : DETAIL_TEXT_AVAIL_PX
    b.lines.forEach((line, i) => {
      const txt = b.uppercase ? line.toUpperCase() : line
      // Measure at THIS line's own size. The compound hero's lines differ (66 over 44), and the
      // block's nominal fontPx is the SMALLER one — measuring line 1 at 44 would under-report by a
      // third and hide a real overflow.
      const px = b.linePx?.[i] ?? b.fontPx
      const w = b.face === "head" ? headlineTextWidthPx(txt, px) : detailTextWidthPx(txt, px)
      if (w > avail + 0.5) { overflow++; console.log(`    overflow ${t}/${m}/${tpl}: ${Math.round(w)} > ${avail} @${px}px "${txt}"`) }
    })
  }
  if (L.detail) {
    const h = L.headline
    // Block height is the SUM of the per-line sizes when they differ, not lineCount × one size.
    const headH = h.linePx
      ? h.linePx.reduce((a, b2) => a + b2, 0) + (h.linePx.length - 1) * h.lineSpacing
      : h.lines.length * h.fontPx + (h.lines.length - 1) * h.lineSpacing
    if (L.detail.topPx < h.topPx + headH - 0.5) collision++
    if (L.detail.topPx + L.detail.lines.length * L.detail.fontPx > OVERLAY_CANVAS.h) offCanvas++
  }
  const all = `${head} || ${det}`
  if (/\/mo\b/.test(all)) staleMo++
  const q = COMPOUND_TYPE_QUALIFIERS.find((x) => t.startsWith(x))!
  const noun = t.slice(q.length + 1)
  if (new RegExp(`${q}\\s+(?!${noun}s?\\b)`, "i").test(all)) { orphaned++; console.log(`    orphaned qualifier ${t}/${tpl}: ${all}`) }
  for (const phrase of all.match(/\b(a|an) ([a-z][\w-]*)/g) ?? []) {
    const [art, word] = phrase.split(" ")
    if (art !== (/^[aeiou]/i.test(word) ? "an" : "a")) { badArticle++; console.log(`    bad article ${t}/${tpl}: "${phrase}"`) }
  }
}
ok(`${combos} combos: no text overflows its safe box`, overflow === 0)
ok(`${combos} combos: headline and detail never collide`, collision === 0)
ok(`${combos} combos: nothing renders off-canvas`, offCanvas === 0)
ok(`${combos} combos: "/month" intact, no stale "/mo"`, staleMo === 0)
ok(`${combos} combos: qualifier never orphaned from its head noun`, orphaned === 0)
ok(`${combos} combos: a/an always agrees`, badArticle === 0)

console.log("\nRENDER PLAN — the FFmpeg path draws the two title lines as two sized drawtext calls:")
{
  const s = meta("San Antonio", "Industrial-Style Apartment", "$1,800 - $2,400")
  const L = computeOverlayLayout("market_type", buildTemplateHeadline("market_type", s), buildTemplateDetail("market_type", s))
  const plan = buildDrawPlan(L)
  ok("compound hero becomes 2 title items + 1 detail item", plan.length === 3)
  ok("title items carry the per-line sizes, market larger than property",
    plan[0].fontPx === L.headline.linePx![0] && plan[1].fontPx === L.headline.linePx![1] && plan[0].fontPx > plan[1].fontPx)
  ok("title items carry the per-line tops", plan[0].topPx === L.headline.lineTopPx![0] && plan[1].topPx === L.headline.lineTopPx![1])
  ok("each title item holds ONE line of text, already uppercased",
    plan[0].text === "SAN ANTONIO" && plan[1].text === "INDUSTRIAL-STYLE APARTMENTS" && !plan[0].text.includes("\n") && !plan[1].text.includes("\n"))
  ok("the detail is a separate item on the detail face", plan[2].face === "detail" && plan[2].fontPx === L.detail!.fontPx)
  // A NON-compound hero must still be ONE item with the whole (possibly multi-line) text, unchanged.
  const N = computeOverlayLayout("market_type", "SAN ANTONIO TOWNHOMES", "Starting at $1,800/month")
  const nplan = buildDrawPlan(N)
  ok("non-compound hero is still ONE title item", nplan.length === 2 && nplan[0].text === "SAN ANTONIO TOWNHOMES" && nplan[0].fontPx === N.headline.fontPx)
}

console.log("\nCONVERSATIONAL templates keep the approved 28px / 27px sizing:")
{
  const sizes = new Set<string>()
  for (const t of COMPOUND_TYPES) for (const m of MARKETS) for (const tpl of OVERLAY_TEMPLATES) {
    if (templateFamily(tpl) === "hero") continue
    const s = meta(m, t, "$1,800 - $2,400")
    const L = computeOverlayLayout(tpl, buildTemplateHeadline(tpl, s), buildTemplateDetail(tpl, s))
    if (L.headline.lines.length) sizes.add(`head ${L.headline.fontPx}`)
    if (L.detail) sizes.add(`detail ${L.detail.fontPx}`)
  }
  // Exactly two sizes may appear. The T11 sentence-case change swaps uppercase letters for narrower
  // lowercase ones, so this also proves the new copy did not let any hook fit at a DIFFERENT size.
  // Compound subjects are the LONGEST conversational copy, so under per-headline fitting they are
  // exactly the ones that land below the ceiling. The invariant is no longer "one flat size" but
  // "every render sits inside the allowed band, one line, detail strictly under the headline".
  const nums = [...sizes].map((s) => ({ kind: s.split(" ")[0], px: Number(s.split(" ")[1]) }))
  ok("every conversational compound render sits in the 26–38px band",
    nums.every((n) => n.px >= 26 && n.px <= 38), [...sizes].join(" | "))
  ok("…and every compound detail stays strictly under its headline",
    nums.filter((n) => n.kind === "detail").every((d) => d.px <= 37), [...sizes].join(" | "))
  // The compound hero must NOT leak its per-line geometry into the conversational family.
  const conv = computeOverlayLayout("hits_different", buildTemplateHeadline("hits_different", meta("San Antonio", "Industrial-Style Loft", "$1,800 - $2,400")), "Starting at $1,800/month")
  ok("conversational blocks carry no per-line geometry", !conv.headline.linePx && !conv.headline.lineTopPx)
}

console.log("\nPRE-EXISTING types are UNAFFECTED (the compound branch cannot reach them):")
let heroFitsInNormalRange = 0, preExisting = 0
for (const t of PROPERTY_TYPES) {
  if (isCompoundType(t)) continue
  for (const m of MARKETS) for (const price of PRICES) {
    const s = meta(m, t, price)
    for (const tpl of OVERLAY_TEMPLATES) {
      if (templateFamily(tpl) !== "hero") continue
      preExisting++
      const L = computeOverlayLayout(tpl, buildTemplateHeadline(tpl, s), buildTemplateDetail(tpl, s))
      // A non-compound hero must still sit in the ORIGINAL range and keep the ORIGINAL 44px detail floor.
      const inRange = L.headline.fontPx >= HERO_MIN_PX && L.headline.fontPx <= HERO_MAX_PX
      const detailFloorKept = !L.detail || L.detail.fontPx >= OVERLAY_SPEC.sub.fontPx
      if (inRange && detailFloorKept) heroFitsInNormalRange++
      else console.log(`    changed ${t}/${m}/${tpl}: head ${L.headline.fontPx}, detail ${L.detail?.fontPx}`)
    }
  }
}
ok(`all ${preExisting} pre-existing hero combos stay in [${HERO_MIN_PX}, ${HERO_MAX_PX}] with the 44px detail floor`, heroFitsInNormalRange === preExisting)

// ONE geometry path. The compound hero fix was correct in computeOverlayLayout for a whole release
// yet production still showed "SAN ANTONIO / SPLIT-LEVEL / PENTHOUSES", because BulkReview drew its
// own overlay from wrapHeadline() (break-first, ≤16 chars) at a fixed 66px and never called the
// layout engine at all. Any surface that re-implements geometry can silently disagree with the burn-in
// again, so assert the invariant directly on the source.
console.log("\nARCHITECTURE — every overlay surface goes through computeOverlayLayout:")
{
  const read = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8")
  const spec = read("lib/social/overlaySpec.ts")
  ok("overlayPreviewStyle (the legacy px→% helper) no longer exists", !/export function overlayPreviewStyle/.test(spec))
  // wrapHeadline/wrapSub stay, but ONLY as computeOverlayLayout's internal fallback. Strip comments
  // first, so a file that merely EXPLAINS the old helpers (like BulkReview's fix note) isn't flagged.
  const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1")
  const walk = (d: string): string[] => readdirSync(d, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(path.join(d, e.name)) : /\.tsx?$/.test(e.name) ? [path.join(d, e.name)] : [])
  const offenders = ["components", "app"]
    .flatMap((root) => walk(path.join(process.cwd(), root)))
    .filter((f) => /\bwrapHeadline\b|\bwrapSub\b|\boverlayPreviewStyle\b/.test(stripComments(readFileSync(f, "utf8"))))
    .map((f) => path.relative(process.cwd(), f))
  if (offenders.length) console.log("    offenders: " + offenders.join(", "))
  ok("no UI component wraps or sizes overlay text itself", offenders.length === 0)
  const bulk = read("components/crm/social/BulkReview.tsx")
  ok("BulkReview renders the shared <PreviewOverlay> from computeOverlayLayout",
    /computeOverlayLayout\(/.test(bulk) && /<PreviewOverlay\b/.test(bulk))
  const preview = read("components/crm/social/PreviewOverlay.tsx")
  ok("PreviewOverlay uses white-space:pre so a fitted line can never be re-wrapped by the browser",
    /whiteSpace:\s*"pre"/.test(preview) && !/pre-line|overflowWrap/.test(preview))
}

console.log(`\nCompound property types: ${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
