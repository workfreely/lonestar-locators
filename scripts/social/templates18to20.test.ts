// TEMPLATES 18-20, and proof the original 17 are untouched.
//
// Three additions, all Template 8's treatment with different wording. Two defects surfaced only by
// RENDERING them, not by reading the code:
//
//   EMOJI       Libre Baskerville contains no glyph for U+2728 ✨, U+1F60E 😎, U+1F440 👀 or
//               U+1F3E1 🏡 — verified against the shipped TTF. Burned-in emoji rendered as tofu
//               boxes. They live in the CAPTION, where Instagram draws them natively.
//   LINE BREAK  the center-hook fitter collapsed the headline with replace(/\s+/g, " ") — its
//               comment literally said "no manual breaks" — so T20's punchline ran onto the end of
//               the setup. Hard breaks are now honoured, and a headline WITHOUT one takes the
//               identical path it always did.
//
// Run: npx tsx scripts/social/templates18to20.test.ts
import { readFileSync } from "node:fs"
import path from "node:path"
import { OVERLAY_TEMPLATES, OVERLAY_TEMPLATE_LABEL, buildTemplateHeadline, buildTemplateDetail, buildCaption, commentCtaKeyword, isGeneratedCaption } from "../../lib/social/composePost"
import { computeOverlayLayout, templateFamily, CENTER_HOOK } from "../../lib/social/overlaySpec"

let pass = 0, fail = 0
const ok = (l: string, c: boolean) => { if (c) { pass++; console.log(`  ✓ ${l}`) } else { fail++; console.log(`  ✗ ${l}`) } }
const meta = (o: Record<string, unknown> = {}) => ({ market: null, propertyType: null, budgetRange: null, amenities: null, special: null, socialSpecial: null, priceLabelMode: null, ...o }) as never

const ORIGINAL_17 = ["market_type","market_type_centered","your_sign","special_feature","next_property","upgrade",
  "apartment_standards","pov_upgrade","affordable_luxury","pov_price","hits_different","trade_up",
  "wanted_luxury","real_living","what_mo_gets_you","what_mo_gets_you_top","property_tour"] as const

// ── 1. REGISTRY ─────────────────────────────────────────────────────────────
console.log("1. twenty templates, the first seventeen undisturbed:")
ok("20 templates registered", OVERLAY_TEMPLATES.length === 20)
ok("the original 17 keep their exact positions", ORIGINAL_17.every((k, i) => OVERLAY_TEMPLATES[i] === k))
ok("T18-T20 are appended at the end",
  OVERLAY_TEMPLATES[17] === "would_you_live_here" && OVERLAY_TEMPLATES[18] === "imagine_coming_home" && OVERLAY_TEMPLATES[19] === "client_me")
ok("no key is duplicated", new Set(OVERLAY_TEMPLATES).size === 20)
ok("every template has a dropdown label", OVERLAY_TEMPLATES.every((t) => !!OVERLAY_TEMPLATE_LABEL[t]))
ok("T8 and T10 are untouched",
  buildTemplateHeadline("pov_upgrade", meta({ propertyType: "Townhome" })) === "POV: You upgraded to a townhome" &&
  OVERLAY_TEMPLATE_LABEL.pov_price === "POV + Price")

// ── 2. GEOMETRY: TEMPLATE 8's FAMILY, NO NEW PATH ───────────────────────────
console.log("\n2. Template 8's geometry, reused rather than copied:")
ok("T19 is in Template 8's family exactly", templateFamily("imagine_coming_home") === templateFamily("pov_upgrade"))
ok("T18 and T20 take the detail-free bucket, as what_mo_gets_you does",
  templateFamily("would_you_live_here") === templateFamily("what_mo_gets_you") &&
  templateFamily("client_me") === templateFamily("what_mo_gets_you"))
ok("...which is why they return no detail line",
  buildTemplateDetail("would_you_live_here", meta({ budgetRange: "1500" })) === "" &&
  buildTemplateDetail("client_me", meta({ budgetRange: "1500" })) === "")
ok("T19 DOES take the optional price line, collapsing when absent",
  buildTemplateDetail("imagine_coming_home", meta({ budgetRange: "1500" })) === "Starting at $1,500/month" &&
  buildTemplateDetail("imagine_coming_home", meta()) === "")

// ── 3. DYNAMIC COPY ─────────────────────────────────────────────────────────
console.log("\n3. real data in, never invented:")
ok("T18 uses the verified price", buildTemplateHeadline("would_you_live_here", meta({ budgetRange: "1500" })) === "Would you live here for $1,500/month?")
ok("T18 OMITS the price rather than inventing one", buildTemplateHeadline("would_you_live_here", meta()) === "Would you live here?")
ok("...and never prints $0 or a placeholder",
  !/\$0|\{|undefined|null|NaN/.test(buildTemplateHeadline("would_you_live_here", meta({ budgetRange: "" }))))
ok("T19 needs no metadata at all", buildTemplateHeadline("imagine_coming_home", meta()) === "Imagine coming home to this")

for (const [type, city, want] of [
  ["Townhome", "Dallas", "a townhome in Dallas"],
  ["Apartment", "Houston", "an apartment in Houston"],
  ["Penthouse", "San Antonio", "a penthouse in San Antonio"],
  ["Loft", "Austin", "a loft in Austin"],
  ["Split-Level Penthouse", "Dallas", "a split-level penthouse in Dallas"],
] as const) {
  const h = buildTemplateHeadline("client_me", meta({ propertyType: type, market: city }))
  ok(`T20 ${type} / ${city} -> “I need ${want}”`, h.includes(`I need ${want}.`))
}
ok("T20 never writes 'a apartment'", !/\ba apartment\b/.test(buildTemplateHeadline("client_me", meta({ propertyType: "Apartment", market: "Dallas" }))))
ok("T20 degrades with no metadata", buildTemplateHeadline("client_me", meta()).includes("I need a place."))
ok("T20 keeps the punchline unchanged in every case",
  ["Townhome", "Loft", null].every((t) => buildTemplateHeadline("client_me", meta({ propertyType: t, market: "Dallas" })).includes("Me: “Say less.”")))

// ── 4. THE TWO-LINE EXCHANGE SURVIVES THE FITTER ────────────────────────────
console.log("\n4. T20 renders as two lines, at a size that fits:")
for (const type of ["Loft", "Townhome", "Split-Level Penthouse"]) {
  const h = buildTemplateHeadline("client_me", meta({ propertyType: type, market: "San Antonio" }))
  const L = computeOverlayLayout("client_me", h, "", "instagram")
  ok(`${type}: exactly two lines`, L.headline.lines.length === 2)
  ok(`${type}: the punchline is on its OWN line`, L.headline.lines[1] === "Me: “Say less.”")
  ok(`${type}: fitted size stays in the readable band`, L.headline.fontPx >= 20 && L.headline.fontPx <= 46)
}

// ── 5. NO EMOJI IN A BURNED-IN HEADLINE ─────────────────────────────────────
console.log("\n5. emoji are caption-only (the overlay font has no glyphs for them):")
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2700}-\u{27BF}\u{2600}-\u{26FF}\u{2728}]/u
for (const t of OVERLAY_TEMPLATES) {
  const h = buildTemplateHeadline(t, meta({ market: "Dallas", propertyType: "Townhome", budgetRange: "1500" }))
  if (EMOJI.test(h)) { fail++; console.log(`  ✗ ${t} headline contains an emoji: ${JSON.stringify(h)}`) }
}
ok("no template burns an emoji into the video", true)
ok("...but T19's caption keeps its sparkle", EMOJI.test(buildCaption(meta({ market: "Dallas" }), "s", "imagine_coming_home" as never)))
ok("...T18's caption keeps its eyes", EMOJI.test(buildCaption(meta({ market: "Dallas", budgetRange: "1500" }), "s", "would_you_live_here" as never)))
ok("...and T20's caption keeps its sunglasses", EMOJI.test(buildCaption(meta({ market: "Dallas" }), "s", "client_me" as never)))

// ── 6. CAPTION STRUCTURE MATCHES TEMPLATE 8 ─────────────────────────────────
console.log("\n6. the caption body is Template 8's, verbatim:")
{
  const src = meta({ market: "Dallas", propertyType: "Townhome", budgetRange: "1500", amenities: "Resort pool\nDog park\nEV charging" })
  const t8 = buildCaption(src, "seed", "pov_upgrade" as never)
  const body = (c: string) => c.split("\n").slice(1).join("\n")   // everything after the opener
  for (const t of ["would_you_live_here", "imagine_coming_home", "client_me"] as const) {
    ok(`${t}: body identical to T8's`, body(buildCaption(src, "seed", t as never)) === body(t8))
  }
  const c18 = buildCaption(src, "seed", "would_you_live_here" as never)
  ok("T18 opener asks about the PRICE, with the same figure as the headline",
    c18.startsWith("Be honest… would you pay $1,500/month? 👀"))
  ok("...and the on-video headline still asks about the PLACE",
    buildTemplateHeadline("would_you_live_here", src) === "Would you live here for $1,500/month?")
  ok("...with no price, the opener falls back to the place question",
    buildCaption(meta({ market: "Houston" }), "s", "would_you_live_here" as never).startsWith("Be honest… would you live here? 👀"))
  ok("T19 opener is verbatim", buildCaption(src, "s", "imagine_coming_home" as never).startsWith("Imagine calling this place home. 🏡✨"))
  ok("T20 opener is verbatim", buildCaption(src, "s", "client_me" as never).startsWith("You tell me what you’re looking for. I’ll find it. 😎"))
  // Assert the SECTION and its bullets, not a specific title-casing — the normaliser's casing
  // rules are its own concern and are covered by captionAmenities.test.ts.
  ok("the amenities section is present with its bullets",
    c18.includes("🏡 Amenities") && (c18.match(/^• /gm) ?? []).length === 3)
  ok("the free-service line is present", c18.includes("My apartment locating service is completely free!"))
  ok("the keyword CTA uses the dynamic mapping", c18.includes('Comment "TOWN"'))
  ok("...KEY for a penthouse, LOFT for a loft",
    commentCtaKeyword("Penthouse") === "KEY" && commentCtaKeyword("Loft") === "LOFT")
}

// ── 7. ALL 20 PRODUCE A VALID LAYOUT ────────────────────────────────────────
console.log("\n7. every template renders, with and without metadata:")
{
  let bad = 0
  for (const t of OVERLAY_TEMPLATES) for (const m of [meta({ market: "Dallas", propertyType: "Townhome", budgetRange: "1500" }), meta()]) {
    const h = buildTemplateHeadline(t, m), d = buildTemplateDetail(t, m)
    const L = computeOverlayLayout(t, h, d, "instagram")
    const okLayout = L.headline.fontPx > 0 && L.headline.topPx >= 0 && L.headline.lines.every((x) => typeof x === "string")
    if (!okLayout) { bad++; console.log(`  ✗ ${t} produced an invalid layout`) }
  }
  ok(`all ${OVERLAY_TEMPLATES.length} templates × 2 metadata states produce a valid layout`, bad === 0)
}

// ── 8. THE FROZEN GEOMETRY IS UNTOUCHED ─────────────────────────────────────
console.log("\n8. nothing in the frozen surface moved:")
{
  const spec = readFileSync(path.join(process.cwd(), "lib/social/overlaySpec.ts"), "utf8")
  ok("yFrac 427/1920 intact", spec.includes("427 / 1920"))
  ok("its FROZEN marker intact", spec.includes("FROZEN"))
  ok("T1 still renders its approved headline",
    buildTemplateHeadline("market_type", meta({ market: "San Antonio", propertyType: "High-Rise" })) === "SAN ANTONIO HIGH-RISES")
  ok("T15 still prices inside its headline",
    buildTemplateHeadline("what_mo_gets_you", meta({ market: "Dallas", budgetRange: "1495" })) === "What $1,495/month gets you in Dallas")
}

// ── 9. A CAPTION WRITTEN WITH THE OLD T18 OPENER STAYS GENERATOR-OWNED ──────
// T18's opener changed the day it shipped. A draft carrying the previous wording must still be
// recognised as GENERATED — otherwise it freezes as a "manual override" and stops re-syncing when
// the price or property type changes. The codebase keeps a supersededOpeners registry for exactly
// this; the old wording is now in it.
console.log("\n9. the superseded T18 opener is still recognised:")
{
  const src = meta({ market: "Dallas", propertyType: "Townhome", budgetRange: "1500", amenities: "Pool" })
  const current = buildCaption(src, "seed", "would_you_live_here" as never)
  const body = current.slice(current.indexOf("\n"))
  const old = "Be honest… would you live here for $1,500/month? 👀" + body
  ok("the PREVIOUS opener still reads as generated", isGeneratedCaption(old, src, "seed", "would_you_live_here" as never))
  ok("the CURRENT opener reads as generated", isGeneratedCaption(current, src, "seed", "would_you_live_here" as never))
  ok("a genuinely manual caption is NOT overwritten",
    !isGeneratedCaption("My own words." + body, src, "seed", "would_you_live_here" as never))
}

// ── 10. T20's APPROVED TWO-STATEMENT SPACING ───────────────────────────────
// T20 is the ONLY template whose headline carries an authored "\n", and the break separates two
// speakers rather than two halves of a sentence. The approved look is ~19px of rendered ink
// between them, which comes from line_spacing 14 (MEASURED on real 1080x1920 frames:
// 8 -> 13px, 12 -> 17px, 14 -> 19px, 17 -> 22px).
//
// The value is asserted here rather than left to the constant alone because the two numbers that
// could plausibly drive it are NOT interchangeable: DETAIL_GAP_PX (17) positions a separate draw
// block and renders 13px, while this one is ffmpeg line_spacing inside a single multi-line draw.
// Anyone "unifying" them would silently retighten T20 to the spacing Jay rejected.
console.log("\n10. T20 keeps its approved two-statement spacing:")
{
  const src = meta({ market: "Dallas", propertyType: "High-Rise", budgetRange: "2500" })
  const L = computeOverlayLayout("client_me" as never, buildTemplateHeadline("client_me" as never, src), buildTemplateDetail("client_me" as never, src))
  ok("T20 still renders TWO authored lines", L.headline.lines.length === 2)
  ok("...separated by the approved hard-break spacing (14)", L.headline.lineSpacing === CENTER_HOOK.hardBreakSpacing && CENTER_HOOK.hardBreakSpacing === 14)
  ok("...which is NOT the wrap spacing", CENTER_HOOK.hardBreakSpacing !== CENTER_HOOK.lineSpacing)

  // EVERY other template must still use the tighter wrap spacing. This is the assertion that would
  // have caught the change being applied more widely than T20.
  let others = 0, wrong = 0
  for (const tpl of OVERLAY_TEMPLATES) {
    if (tpl === "client_me") continue
    for (const pt of [null, "High-Rise", "Split-Level Townhome"]) {
      const s2 = meta({ market: "San Antonio", propertyType: pt, budgetRange: "2500" })
      const l2 = computeOverlayLayout(tpl as never, buildTemplateHeadline(tpl as never, s2), buildTemplateDetail(tpl as never, s2))
      if (templateFamily(tpl as never) === "hero") continue
      others++
      if (l2.headline.lineSpacing !== CENTER_HOOK.lineSpacing) wrong++
    }
  }
  ok(`all ${others} other conversational layouts keep the 8px wrap spacing`, wrong === 0)
}

console.log(`\nTemplates 18-20: ${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
