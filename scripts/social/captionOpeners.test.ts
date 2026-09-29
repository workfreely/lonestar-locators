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
  ["market_type", "Moving to San Antonio? Check this out."],
  ["market_type_centered", "Moving to San Antonio? You need to see this."],
  ["your_sign", "Moving to San Antonio? This is your sign."],
  ["special_feature", "Moving to San Antonio? This deal is hard to beat."],
  ["next_property", "Moving to San Antonio? This could be your next townhome."],
  ["upgrade", "Moving to San Antonio? Ready for an upgrade?"],
  ["apartment_standards", "Moving to San Antonio? Your standards just went up."],
  ["pov_upgrade", "Moving to San Antonio? POV: you upgraded."],
  ["affordable_luxury", "Moving to San Antonio? Luxury doesn't have to break the budget."],
  ["pov_price", "POV: this is what $1,800/month gets you in San Antonio."],
  ["hits_different", "Townhomes just hit different."],
  ["trade_up", "Moving to San Antonio? It might be time to trade up."],
  ["wanted_luxury", "Moving to San Antonio? You wanted luxury."],
  ["real_living", "This is real townhome living in San Antonio."],
  ["what_mo_gets_you", "What $1,800/month gets you in San Antonio."],
  ["what_mo_gets_you_top", "What $1,800/month gets you in San Antonio."],
]
ok("every template is covered exactly once", EXPECTED.length === OVERLAY_TEMPLATES.length && EXPECTED.every(([t]) => (OVERLAY_TEMPLATES as readonly string[]).includes(t)))
for (const [tpl, want] of EXPECTED) {
  const got = captionOpener(tpl, SA)
  ok(`${tpl}: ${JSON.stringify(want)}`, got === want)
  if (got !== want) console.log(`      got ${JSON.stringify(got)}`)
}
ok("the opener is the caption's FIRST line", EXPECTED.every(([tpl, want]) => first(buildCaption(SA, "seed-1", tpl)) === want))

console.log("\nonly the first line changes — the rest of the caption is untouched:")
{
  const bodies = new Set(OVERLAY_TEMPLATES.map((t) => body(buildCaption(SA, "seed-1", t))))
  ok("every template produces the SAME body below the opener", bodies.size === 1)
  const b = [...bodies][0]
  ok("the two fixed CTA lines are intact and unchanged",
    b.includes("My apartment locating service is completely free!") && b.includes("Submit the form to get your free custom apartment list."))
  ok("the special and amenities sections are intact", b.includes("✨ 1 Month Free") && b.includes("🏡 Amenities") && b.includes("• Rooftop Pool"))
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
  ok("T5 uses the canonical singular noun", captionOpener("next_property", { ...SA, propertyType: "Industrial-Style Loft" }) === "Moving to San Antonio? This could be your next industrial-style loft.")
  ok("T14 uses the canonical singular noun", captionOpener("real_living", { ...SA, propertyType: "Split-Level Penthouse" }) === "This is real split-level penthouse living in San Antonio.")
  // Price openers use the canonical "/month" suffix and the shared lowest-price rule.
  ok("price openers use the canonical /month suffix", (captionOpener("pov_price", SA) ?? "").includes("$1,800/month") && !(captionOpener("pov_price", SA) ?? "").includes("/mo "))
  ok("price openers use the LOWEST price in the range", (captionOpener("what_mo_gets_you", { ...SA, budgetRange: "$2,400 - $1,800" }) ?? "").includes("$1,800/month"))
}

console.log("\nmarket comes from the SELECTED Social Beast market:")
for (const m of ["Austin", "Dallas", "DFW", "Houston", "San Antonio"]) {
  ok(`${m} appears verbatim in its opener`, (captionOpener("market_type", { ...SA, market: m }) ?? "") === `Moving to ${m}? Check this out.`)
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
    first(buildCaption({ market: "Austin", propertyType: "Loft" }, "seed-1", "pov_price")).startsWith("Moving to Austin?") || first(buildCaption({ market: "Austin", propertyType: "Loft" }, "seed-1", "pov_price")).startsWith("This is your sign"))
  ok("no market at all ⇒ the type-based hook, not a broken 'Moving to ?'",
    first(buildCaption({ propertyType: "Townhome" }, "seed-1", "market_type")) === "Need a new townhome?")
}

console.log("\nmanual-edit + legacy rules preserved:")
{
  ok("a caption generated for ANY template is generator-owned",
    OVERLAY_TEMPLATES.every((t) => isGeneratedCaption(buildCaption(SA, "seed-1", t), SA, "seed-1")))
  // The pre-change rotating-hook caption must STAY generator-owned or existing drafts would freeze.
  ok("a LEGACY rotating-hook caption is still generator-owned", isGeneratedCaption(buildCaption(SA, "seed-1"), SA, "seed-1"))
  ok("a stale caption from a DIFFERENT market/type is still generator-owned",
    isGeneratedCaption(buildCaption({ ...SA, market: "Austin", propertyType: "Loft" }, "seed-1", "upgrade"), SA, "seed-1"))
  ok("a genuinely manual caption is preserved (NOT generator-owned)",
    !isGeneratedCaption("Come see this one before it's gone!\n\nDM me.", SA, "seed-1"))
}

console.log(`\nCaption openers: ${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
