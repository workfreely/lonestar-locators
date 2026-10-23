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
import { OVERLAY_TEMPLATES, OVERLAY_TEMPLATE_LABEL, buildTemplateHeadline, buildTemplateDetail, buildCaption, commentCtaKeyword, isGeneratedCaption, isGeneratedHeadline } from "../../lib/social/composePost"
import { computeOverlayLayout, templateFamily, CENTER_HOOK, DETAIL_GAP_PX } from "../../lib/social/overlaySpec"

let pass = 0, fail = 0
const ok = (l: string, c: boolean) => { if (c) { pass++; console.log(`  ✓ ${l}`) } else { fail++; console.log(`  ✗ ${l}`) } }
const meta = (o: Record<string, unknown> = {}) => ({ market: null, propertyType: null, budgetRange: null, amenities: null, special: null, socialSpecial: null, priceLabelMode: null, ...o }) as never

const ORIGINAL_17 = ["market_type","market_type_centered","your_sign","special_feature","next_property","upgrade",
  "apartment_standards","pov_upgrade","affordable_luxury","pov_price","hits_different","trade_up",
  "wanted_luxury","real_living","what_mo_gets_you","what_mo_gets_you_top","property_tour"] as const

// ── 1. REGISTRY ─────────────────────────────────────────────────────────────
console.log("1. twenty-one templates, the first twenty undisturbed:")
// T21 was appended after this suite was written. The invariant it protects is "the earlier
// templates keep their positions", which the next assertion states directly — the count is just
// the tripwire, so it tracks the registry rather than being frozen at 20.
// 24 -> 31: T25-T31 were APPENDED (see scripts/social/templates25to31). The count moved; the
// first 24 indices did not, which is the property this file actually depends on.
ok(`${OVERLAY_TEMPLATES.length} templates registered`, OVERLAY_TEMPLATES.length === 33) // +T33 pov_regular_shmegular, appended
ok("T21 is appended LAST, so no existing index moved", OVERLAY_TEMPLATES[20] === "client_me_bad_credit")
ok("the original 17 keep their exact positions", ORIGINAL_17.every((k, i) => OVERLAY_TEMPLATES[i] === k))
ok("T18-T20 are appended at the end",
  OVERLAY_TEMPLATES[17] === "would_you_live_here" && OVERLAY_TEMPLATES[18] === "imagine_coming_home" && OVERLAY_TEMPLATES[19] === "client_me")
ok("no key is duplicated", new Set(OVERLAY_TEMPLATES).size === OVERLAY_TEMPLATES.length)
ok("every template has a dropdown label", OVERLAY_TEMPLATES.every((t) => !!OVERLAY_TEMPLATE_LABEL[t]))
ok("T8 and T10 are untouched",
  buildTemplateHeadline("pov_upgrade", meta({ propertyType: "Townhome" })) === "POV: You upgraded to a townhome" &&
  OVERLAY_TEMPLATE_LABEL.pov_price === "POV + Price")

// ── 2. GEOMETRY: TEMPLATE 8's FAMILY, NO NEW PATH ───────────────────────────
console.log("\n2. Template 8's geometry, reused rather than copied:")
ok("T19 is in Template 8's family exactly", templateFamily("imagine_coming_home") === templateFamily("pov_upgrade"))
ok("T18 takes the detail-free bucket, as what_mo_gets_you does",
  templateFamily("would_you_live_here") === templateFamily("what_mo_gets_you"))
ok("...which is why it returns no detail line",
  buildTemplateDetail("would_you_live_here", meta({ budgetRange: "1500" })) === "")
// T20 MOVED into T19's family: its reply is a real detail line, not an absent one. Asserted
// against T19 rather than a literal so the two cannot drift apart.
ok("T20 now shares T19's family (headline + detail), not the detail-free bucket",
  templateFamily("client_me") === templateFamily("imagine_coming_home") &&
  templateFamily("client_me") !== templateFamily("what_mo_gets_you"))
ok("...and its detail line is the reply, independent of price",
  buildTemplateDetail("client_me", meta({ budgetRange: "1500" })) === "Me: “Say less.”" &&
  buildTemplateDetail("client_me", meta()) === "Me: “Say less.”")
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
// The punchline is fixed and now lives in the DETAIL, so it is asserted there — and the headline
// must NOT contain it any more, which is the structural half of this change.
ok("T20 keeps the punchline unchanged in every case",
  ["Townhome", "Loft", null].every((t) => buildTemplateDetail("client_me", meta({ propertyType: t, market: "Dallas" })) === "Me: “Say less.”"))
ok("...and the headline never carries it", 
  ["Townhome", "Loft", null].every((t) => !buildTemplateHeadline("client_me", meta({ propertyType: t, market: "Dallas" })).includes("Say less")))

// ── 4. THE EXCHANGE SURVIVES THE FITTER AS TWO ELEMENTS ─────────────────────
// Previously this asserted ONE headline wrapping to two lines. The exchange is now a headline and
// a detail, so the fit is checked on each element — the client's line must still fit on one line
// at a readable size, and the reply must render as its own block.
console.log("\n4. T20 renders as headline + detail, at sizes that fit:")
for (const type of ["Loft", "Townhome", "Split-Level Penthouse"]) {
  const src = meta({ propertyType: type, market: "San Antonio" })
  const L = computeOverlayLayout("client_me", buildTemplateHeadline("client_me", src), buildTemplateDetail("client_me", src), "instagram")
  ok(`${type}: the client's line is ONE line`, L.headline.lines.length === 1)
  ok(`${type}: the reply is its own block below`, !!L.detail && L.detail.lines[0] === "Me: “Say less.”" && L.detail.topPx > L.headline.topPx)
  ok(`${type}: fitted size stays in the readable band`, L.headline.fontPx >= 20 && L.headline.fontPx <= 46)
  ok(`${type}: the reply is secondary in size, as T19's price line is`, L.detail!.fontPx <= L.headline.fontPx)
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

// ── 10. T20 IS BUILT ON T19's TWO-ELEMENT STRUCTURE ────────────────────────
// T20's exchange used to live in ONE headline split by an authored "\n". That shape gave the reply
// no independent position, so its spacing had to be faked with line-spacing values the editor
// preview does not even read — a fix could measure "correct" in the FFmpeg render and change
// nothing on screen. The reply now occupies the DETAIL slot, which both surfaces position the same
// way, so the gap is structural rather than tuned.
console.log("\n10. T20 uses T19's headline + detail structure:")
{
  for (const pt of ["Townhome", "Split-Level Penthouse", null]) {
    const src = meta({ market: "Dallas", propertyType: pt, budgetRange: "1500" })
    const head = buildTemplateHeadline("client_me" as never, src)
    const det = buildTemplateDetail("client_me" as never, src)
    const L = computeOverlayLayout("client_me" as never, head, det)
    const label = pt ?? "(no type)"
    ok(`${label}: headline carries ONLY the client's line (no newline)`, !head.includes("\n") && /^Client: /.test(head))
    ok(`${label}: the reply is the DETAIL line`, det === "Me: “Say less.”" && !!L.detail && L.detail.lines[0] === det)
    ok(`${label}: same family as T19`, L.family === templateFamily("imagine_coming_home" as never))
    ok(`${label}: headline is ONE line with no per-line geometry`, L.headline.lines.length === 1 && !L.headline.linePx)
    ok(`${label}: gap is the shared DETAIL_GAP_PX`,
      Math.round(L.detail!.topPx - (L.headline.topPx + L.headline.fontPx)) === DETAIL_GAP_PX)
    ok(`${label}: detail sits BELOW the headline, centred on the same axis`,
      L.detail!.topPx > L.headline.topPx && L.detail!.sideMarginPx === L.headline.sideMarginPx)
  }
  // The dynamic half still populates.
  ok("property type + city populate the headline",
    buildTemplateHeadline("client_me" as never, meta({ market: "Dallas", propertyType: "Townhome" })) === "Client: “I need a townhome in Dallas.”")
  ok("a compound type reads naturally",
    buildTemplateHeadline("client_me" as never, meta({ market: "Dallas", propertyType: "Split-Level Penthouse" })) === "Client: “I need a split-level penthouse in Dallas.”")
  ok("it degrades with no type", /I need a place in Dallas/.test(buildTemplateHeadline("client_me" as never, meta({ market: "Dallas" }))))

  // T20 vs T19: identical geometry rules, which is the whole point of the change.
  const s19 = meta({ market: "Dallas", propertyType: "Townhome", budgetRange: "1500" })
  const L19 = computeOverlayLayout("imagine_coming_home" as never, buildTemplateHeadline("imagine_coming_home" as never, s19), buildTemplateDetail("imagine_coming_home" as never, s19))
  const L20 = computeOverlayLayout("client_me" as never, buildTemplateHeadline("client_me" as never, s19), buildTemplateDetail("client_me" as never, s19))
  const gapOf = (L: typeof L19) => Math.round(L.detail!.topPx - (L.headline.topPx + L.headline.fontPx))
  ok(`T19 and T20 use the IDENTICAL headline->detail gap (${gapOf(L19)}px)`, gapOf(L19) === gapOf(L20))
  ok("...and the same side margins", L19.detail!.sideMarginPx === L20.detail!.sideMarginPx)
  ok("...and T19 itself is unchanged", gapOf(L19) === DETAIL_GAP_PX && !L19.headline.linePx)

  // THE WORKAROUND IS GONE, and no template may regain per-line geometry in this family.
  const spec = readFileSync(path.join(process.cwd(), "lib/social/overlaySpec.ts"), "utf8")
  ok("the hard-break spacing workaround is removed", !/hardBreakSpacing|statementGap|hardBroken/.test(spec))
  let others = 0, wrong = 0
  for (const tpl of OVERLAY_TEMPLATES) {
    for (const pt of [null, "High-Rise", "Split-Level Townhome"]) {
      const s2 = meta({ market: "San Antonio", propertyType: pt, budgetRange: "2500" })
      const l2 = computeOverlayLayout(tpl as never, buildTemplateHeadline(tpl as never, s2), buildTemplateDetail(tpl as never, s2))
      if (templateFamily(tpl as never) === "hero") continue
      others++
      if (l2.headline.lineSpacing !== CENTER_HOOK.lineSpacing || l2.headline.linePx) wrong++
    }
  }
  ok(`all ${others} conversational layouts use the shared single-block path and 8px wrap spacing`, wrong === 0)

  // Caption, hashtags and the superseded headline must all survive.
  const capSrc = meta({ market: "Dallas", propertyType: "Townhome", budgetRange: "1500", amenities: "Resort-Style Pool" })
  ok("T20's caption opener is unchanged", /You tell me what you.{0,3}re looking for/.test(buildCaption(capSrc, "seed", "client_me" as never)))
  ok("the 😎 stays in the caption, never the overlay",
    buildCaption(capSrc, "seed", "client_me" as never).includes("😎")
    && !buildTemplateHeadline("client_me" as never, capSrc).includes("😎")
    && !buildTemplateDetail("client_me" as never, capSrc).includes("😎"))
  const legacy = 'Client: “I need a townhome in Dallas.”\nMe: “Say less.”'
  ok("the SUPERSEDED combined headline is still recognised as generated", isGeneratedHeadline(legacy))
  ok("the CURRENT headline is recognised too", isGeneratedHeadline("Client: “I need a townhome in Dallas.”"))
  ok("a genuinely manual headline is still manual", !isGeneratedHeadline("Client: “I want a castle.”"))
}

console.log(`\nTemplates 18-20: ${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
