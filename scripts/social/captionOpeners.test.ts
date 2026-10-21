// TEMPLATE-AWARE CAPTION OPENERS — the Instagram caption's FIRST LINE varies by overlay template;
// everything below it is unchanged. Run: npx tsx scripts/social/captionOpeners.test.ts
import { captionOpener, buildCaption, buildTemplateHeadline, isGeneratedCaption, OVERLAY_TEMPLATES, type OverlayTemplate, type SourceMeta } from "@/lib/social/composePost"
import { PROPERTY_TYPES } from "@/lib/social/propertyTypes"

let pass = 0, fail = 0
const ok = (l: string, c: boolean) => { if (c) { pass++; console.log(`  ✓ ${l}`) } else { fail++; console.log(`  ✗ ${l}`) } }

const SA: SourceMeta = { market: "San Antonio", propertyType: "Townhome", budgetRange: "$1,800 - $2,400", special: "1 month free", amenities: "Rooftop pool, EV charging" }
const first = (c: string) => c.split("\n\n")[0]
const body = (c: string) => c.split("\n\n").slice(1).join("\n\n")

console.log("the 16 approved openers (San Antonio · Townhome · $1,800):")
const EXPECTED: [OverlayTemplate, string][] = [
  ["market_type", "Moving to San Antonio? I got you."],
  ["market_type_centered", "Moving to San Antonio? You need to see this."],
  ["your_sign", "Moving to San Antonio? This is your sign."],
  ["special_feature", "Moving to San Antonio? This won't last long."],
  ["next_property", "Moving to San Antonio? This could be home."],
  ["upgrade", "Moving to San Antonio? Ready for an upgrade?"],
  ["apartment_standards", "Your standards just went up."],
  ["pov_upgrade", "POV: you upgraded your townhome."],
  ["affordable_luxury", "Moving to San Antonio? Luxury without breaking the bank."],
  ["pov_price", "POV: $1,800/month in San Antonio."],
  ["hits_different", "Townhomes just hit different."],
  ["trade_up", "Moving to San Antonio? It's time to trade up."],
  ["wanted_luxury", "Moving to San Antonio? You wanted luxury."],
  ["real_living", "Real townhome living in San Antonio."],
  ["what_mo_gets_you", "$1,800/month in San Antonio."],
  ["what_mo_gets_you_top", "What $1,800/month gets you in San Antonio."],
  // T17 mirrors its own on-video sentence rather than inventing a second voice.
  ["property_tour", "Come tour this townhome with me."],
  // T18-T20. T18 mirrors its own headline's price so the two can never disagree; T19 needs no
  // metadata at all; T20 states the promise rather than repeating the video's dialogue.
  ["would_you_live_here", "Be honest… would you pay $1,800/month? 👀"],
  ["imagine_coming_home", "Imagine calling this place home. 🏡✨"],
  ["client_me", "You tell me what you’re looking for. I’ll find it. 😎"],
  // T25-T31. Metadata-free by design, so each is the same line for every property — which is what
  // lets them caption any walkthrough. Verbatim the approved wording.
  ["apartment_crush", "I wasn't even looking to move… 👀"],
  ["engagement", "Who would you live here with? 👀"],
  ["level_up", "You leveled up 🔥"],
  ["them_vs_me", "Nah, I'm good 😂"],
  ["view", "I'll never get tired of this view 😍"],
  ["aura", "This has too much aura 🔥"],
  ["pov_couple", "POV: Tag your love ❤️"],
  // T32. Metadata-free like the rest; the per-person figure lives on the VIDEO, never here.
  ["roomie", "Tag your future roomie 👀🏡"],
]
// The four Client / Me variations (T21-T24) have no OPENER: each caption is a fixed approved block
// returned whole,
// because the copy carries no special line and no amenities section and ends with a qualifier the
// section builder has no slot for. It is therefore excluded from the opener table and from the
// shared-body invariant below — and that exclusion is ASSERTED, not assumed, so a future template
// cannot fall out of this suite silently.
const FIXED_CAPTION_TEMPLATES = ["client_me_bad_credit", "client_me_ex_cheated", "client_me_rent_increase", "client_me_roaches"] as const
const OPENER_TEMPLATES = (OVERLAY_TEMPLATES as readonly string[]).filter((t) => !(FIXED_CAPTION_TEMPLATES as readonly string[]).includes(t))
ok("every opener-driven template is covered exactly once", EXPECTED.length === OPENER_TEMPLATES.length && EXPECTED.every(([t]) => OPENER_TEMPLATES.includes(t)))
ok("...and every excluded template really does return a fixed caption",
  (FIXED_CAPTION_TEMPLATES as readonly string[]).every((t) => {
    const c = buildCaption(SA, "seed-1", t as never)
    return !c.includes("✨") && !c.includes("🏡")
  }))
for (const [tpl, want] of EXPECTED) {
  const got = captionOpener(tpl, SA)
  ok(`${tpl}: ${JSON.stringify(want)}`, got === want)
  if (got !== want) console.log(`      got ${JSON.stringify(got)}`)
}
ok("the opener is the caption's FIRST line", EXPECTED.every(([tpl, want]) => first(buildCaption(SA, "seed-1", tpl)) === want))

console.log("\nonly the first line changes — the rest of the caption is untouched:")
{
  const bodies = new Set(OPENER_TEMPLATES.map((t) => body(buildCaption(SA, "seed-1", t as never))))
  ok("every template produces the SAME body below the opener", bodies.size === 1)
  const b = [...bodies][0]
  ok("the service line and the comment CTA are intact and unchanged",
    b.includes("My apartment locating service is completely free!") && /✅ Comment "[A-Z]+" and I’ll send you the best options within your budget\./.test(b))
  ok("the special and amenities sections are intact (special now caption-qualified)", b.includes("✨ Up to 1 month free!") && b.includes("🏡 Amenities") && b.includes("• Rooftop Pool"))
  ok("the caption still carries no price LINE (price only appears in openers 10/15/16)",
    !b.includes("Starting at") && !b.includes("💰"))
}

console.log("\nopeners reuse the canonical type + price formatters (no second formatter):")
{
  // T11 must match the approved Template 11 wording exactly, for every type, plus a full stop.

  ok("T11 opener === the Template 11 headline + '.', for every property type",
    PROPERTY_TYPES.every((pt) => captionOpener("hits_different", { ...SA, propertyType: pt }) === `${buildTemplateHeadline("hits_different", { ...SA, propertyType: pt })}.`))
  ok("T11 opener uses the approved Apartment/Studio 'These' wording",
    captionOpener("hits_different", { ...SA, propertyType: "Apartment" }) === "These apartments just hit different."
    && captionOpener("hits_different", { ...SA, propertyType: "Studio" }) === "These studios just hit different.")
  ok("T11 opener uses the approved sentence casing", captionOpener("hits_different", { ...SA, propertyType: "High-Rise" }) === "High-rises just hit different.")
  ok("T11 opener handles compound types", captionOpener("hits_different", { ...SA, propertyType: "Split-Level Loft" }) === "Split-level lofts just hit different.")
  // T5/T14 use the canonical singular noun (lowercase), including compounds.
  ok("T8 uses the natural lowercase SINGULAR noun", captionOpener("pov_upgrade", { ...SA, propertyType: "Industrial-Style Loft" }) === "POV: you upgraded your industrial-style loft.")
  ok("T14 uses the canonical singular noun", captionOpener("real_living", { ...SA, propertyType: "Split-Level Penthouse" }) === "Real split-level penthouse living in San Antonio.")
  // Price openers use the canonical "/month" suffix and the shared lowest-price rule.
  ok("price openers use the canonical /month suffix", ["pov_price","what_mo_gets_you","what_mo_gets_you_top"].every((t) => (captionOpener(t as OverlayTemplate, SA) ?? "").includes("$1,800/month")))
  ok("price openers use the LOWEST price in the range", (captionOpener("what_mo_gets_you", { ...SA, budgetRange: "$2,400 - $1,800" }) ?? "").includes("$1,800/month"))
  ok("15 and 16 are deliberately DIFFERENT", captionOpener("what_mo_gets_you", SA) !== captionOpener("what_mo_gets_you_top", SA))
}

console.log("\nmarket comes from the SELECTED Social Beast market:")
for (const m of ["Austin", "Dallas", "DFW", "Houston", "San Antonio"]) {
  ok(`${m} appears verbatim in its opener`, (captionOpener("market_type", { ...SA, market: m }) ?? "") === `Moving to ${m}? I got you.`)
}

console.log("\nunresolvable openers fall back — never a placeholder:")
{
  let bad = 0
  const PARTIAL: SourceMeta[] = [{}, { propertyType: "Townhome" }, { market: "Austin" }, { market: "Austin", propertyType: "Loft" }, { budgetRange: "$1,500" }]
  for (const src of PARTIAL) for (const tpl of OVERLAY_TEMPLATES) {
    const line = first(buildCaption(src, "seed-1", tpl))
    if (/\{|\}|undefined|null|Moving to \?|\$\/month|\$undefined/.test(line)) { bad++; console.log(`      BAD ${tpl}: ${JSON.stringify(line)}`) }
  }
  ok("no unresolved placeholder in any partial-metadata combination", bad === 0)
  ok("a price opener with no price falls back to a resolvable hook",
    !first(buildCaption({ market: "Austin", propertyType: "Loft" }, "seed-1", "pov_price")).startsWith("POV: /month"))
  ok("no market at all ⇒ the type-based hook, not a broken 'Moving to ?'",
    first(buildCaption({ propertyType: "Townhome" }, "seed-1", "market_type")) === "Need a new townhome?")
  // T7 needs nothing, so it resolves even with NO metadata at all.
  ok("T7 resolves with no metadata whatsoever", captionOpener("apartment_standards", {}) === "Your standards just went up.")
  // T8 needs only the type, T5 only the market.
  ok("T8 needs only the property type", captionOpener("pov_upgrade", { propertyType: "Loft" }) === "POV: you upgraded your loft." && captionOpener("pov_upgrade", { market: "Austin" }) === null)
  ok("T5 needs only the market", captionOpener("next_property", { market: "Austin" }) === "Moving to Austin? This could be home.")
}

console.log("\nmanual-edit + legacy rules preserved:")
{
  ok("a caption generated for ANY template is generator-owned",
    OVERLAY_TEMPLATES.every((t) => isGeneratedCaption(buildCaption(SA, "seed-1", t), SA, "seed-1")))
  // The pre-change rotating-hook caption must STAY generator-owned or existing drafts would freeze.
  ok("a LEGACY rotating-hook caption is still generator-owned", isGeneratedCaption(buildCaption(SA, "seed-1"), SA, "seed-1"))
  // The SUPERSEDED 1a0bc1a openers must also stay generator-owned.
  ok("captions written with the superseded 1a0bc1a openers are still generator-owned",
    ["Moving to San Antonio? Check this out.", "Moving to San Antonio? This deal is hard to beat.",
     "Moving to San Antonio? This could be your next townhome.", "Moving to San Antonio? Your standards just went up.",
     "Moving to San Antonio? POV: you upgraded.", "Moving to San Antonio? Luxury doesn't have to break the budget.",
     "POV: this is what $1,800/month gets you in San Antonio.", "Moving to San Antonio? It might be time to trade up.",
     "This is real townhome living in San Antonio."]
      // NOTE: this fixture deliberately keeps the PRE-blank-line spacing. It is an
      // INPUT representing a caption stored by an older engine, and it must stay
      // recognized as generator-owned — captionKey() drops empty lines, so both
      // spacings compare equal. Updating it would silently delete that coverage.
      .every((opener) => isGeneratedCaption([opener, "✨ 1 Month Free", "🏡 Amenities\n• Rooftop Pool\n• EV Charging",
        "My apartment locating service is completely free!", "Submit the form to get your free custom apartment list."].join("\n\n"), SA, "seed-1")))
  ok("a stale caption from a DIFFERENT market/type is still generator-owned",
    isGeneratedCaption(buildCaption({ ...SA, market: "Austin", propertyType: "Loft" }, "seed-1", "upgrade"), SA, "seed-1"))
  ok("a genuinely manual caption is preserved (NOT generator-owned)",
    !isGeneratedCaption("Come see this one before it's gone!\n\nDM me.", SA, "seed-1"))
}

console.log(`\nCaption openers: ${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
