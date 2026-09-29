// COMPOUND Social-only property types — "{QUALIFIER} {HEAD NOUN}" families (Split-Level,
// Industrial-Style). Two things make them different from every pre-existing type:
//   1. HERO fitting. "SAN ANTONIO INDUSTRIAL-STYLE APARTMENTS" is 39 chars vs the longest pre-existing
//      combo's 24, so it cannot reach the 900px safe box above HERO_MIN_PX (47) and would take the
//      multi-line char-wrap — splitting the qualifier off its head noun. A compound-only floor
//      (COMPOUND_HERO_MIN_PX) keeps it on ONE line instead.
//   2. HERO detail coupling. The normal hero detail has a 44px floor, which under a 30px fit-down
//      compound headline would render the SUPPORTING line larger than the headline. Compound heroes
//      follow `headline − 2` down to COMPOUND_HERO_DETAIL_MIN_PX.
// Both are gated on the compound qualifier, so pre-existing types are untouched — asserted below.
// Run: npx tsx scripts/social/compoundTypes.test.ts
import { readFileSync, readdirSync } from "node:fs"
import path from "node:path"
import {
  PROPERTY_TYPES, SOCIAL_ONLY_PROPERTY_TYPES, COMPOUND_TYPE_QUALIFIERS, propertyNoun, propertyNounPlural,
} from "@/lib/social/propertyTypes"
import { OVERLAY_TEMPLATES, buildTemplateHeadline, buildTemplateDetail, type SourceMeta } from "@/lib/social/composePost"
import {
  computeOverlayLayout, templateFamily, headlineTextWidthPx, detailTextWidthPx, isCompoundHeadline,
  fitCompoundHeroPx, HEADLINE_TEXT_AVAIL_PX, DETAIL_TEXT_AVAIL_PX, HERO_MAX_PX, HERO_MIN_PX,
  COMPOUND_HERO_MIN_PX, COMPOUND_HERO_DETAIL_MIN_PX, OVERLAY_CANVAS, OVERLAY_SPEC,
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
ok("compound floors are SEPARATE, lower constants", COMPOUND_HERO_MIN_PX === 30 && COMPOUND_HERO_DETAIL_MIN_PX === 26 && COMPOUND_HERO_MIN_PX < HERO_MIN_PX)

console.log("\nHERO (T1/T2/T4): compound headlines stay on ONE line, detail never outgrows them:")
let heroChecked = 0
for (const t of COMPOUND_TYPES) for (const m of MARKETS) for (const price of PRICES) {
  for (const tpl of ["market_type", "market_type_centered", "special_feature"] as const) {
    const s = meta(m, t, price)
    const L = computeOverlayLayout(tpl, buildTemplateHeadline(tpl, s), buildTemplateDetail(tpl, s))
    if (L.headline.lines.length !== 1) ok(`ONE line: ${t} / ${m} / ${tpl}`, false)
    else if (L.detail && L.detail.fontPx > L.headline.fontPx) ok(`detail <= headline: ${t} / ${m} / ${tpl} (${L.detail.fontPx} > ${L.headline.fontPx})`, false)
    else heroChecked++
  }
}
ok(`all ${heroChecked} compound hero combos: one line AND detail <= headline`, heroChecked === COMPOUND_TYPES.length * MARKETS.length * PRICES.length * 3)
{
  // The inversion this guards against, stated concretely: worst-case compound headline at 30px.
  const s = meta("San Antonio", "Industrial-Style Apartment", "$1,495 - $2,100")
  const L = computeOverlayLayout("market_type", buildTemplateHeadline("market_type", s), buildTemplateDetail("market_type", s))
  ok("worst case renders 30px headline with a 28px price line (not the 44px floor)", L.headline.fontPx === 30 && L.detail?.fontPx === 28)
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
  ok("T3 lowercases the whole compound phrase", buildTemplateHeadline("your_sign", s) === "Your sign to get that industrial-style loft")
  ok("T5 lowercases the whole compound phrase", buildTemplateHeadline("next_property", s) === "What your next industrial-style loft could look like")
  ok("T11 keeps the compound as a title-case sentence subject", buildTemplateHeadline("hits_different", s) === "Industrial-Style Lofts just hit different")
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
    for (const line of b.lines) {
      const txt = b.uppercase ? line.toUpperCase() : line
      const w = b.face === "head" ? headlineTextWidthPx(txt, b.fontPx) : detailTextWidthPx(txt, b.fontPx)
      if (w > avail + 0.5) { overflow++; console.log(`    overflow ${t}/${m}/${tpl}: ${Math.round(w)} > ${avail} "${txt}"`) }
    }
  }
  if (L.detail) {
    const headBottom = L.headline.topPx + L.headline.lines.length * L.headline.fontPx + (L.headline.lines.length - 1) * L.headline.lineSpacing
    if (L.detail.topPx < headBottom - 0.5) collision++
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
