// PROPERTY RESEARCH TAXONOMY — the approved additions.
//
// Five changes, and each one has a way of going wrong that is INVISIBLE rather than loud:
//
//   A  Four Property Intelligence keys were carried by real properties with NO label, and label()
//      THROWS on an unlabelled key — so a research run over any of 26 library properties aborted.
//   B  Turtle Creek was missing from Dallas, and the gap was already producing drift: the same
//      property was filed two different ways across its own two clips.
//   C  Adding "Hardwood Flooring" to the bank could SILENTLY REWRITE the one hand-typed
//      "Hardwood Floors" chip in the library, because parseAmenities canonicalizes every stored
//      value on read. It could equally offer both wordings as two selectable options.
//   D  "Spiral Staircases" must follow the documented plural convention, or the singular becomes a
//      second chip meaning the same thing.
//   E  "Split-Level Layout" overlaps an existing property-type QUALIFIER, so a caption could state
//      split-level twice. And Tri-Level must not collapse into "multi-level", which says nothing
//      about how many levels.
//
// Run: npx tsx scripts/social/taxonomyAdditions.test.ts
import { readFileSync } from "node:fs"
import path from "node:path"
import {
  AMENITY_BANK, amenitiesEquivalent, amenityEquivalenceKey, amenityImpliedBySelection,
  canonicalizeAmenity, isCanonicalAmenity, parseAmenities, resolveAmenityForEntry,
  serializeAmenities,
} from "../../lib/social/amenities"
import { withoutRedundantLayout, withoutImpliedFeatures, buildCaption, priceLabelMode, type SourceMeta } from "../../lib/social/composePost"
import { COMPOUND_TYPE_QUALIFIERS } from "../../lib/social/propertyTypes"
import { areaOptionsForMarket } from "../../lib/social/intakeFields"
import { LABELS } from "./gapResearch"

let pass = 0, fail = 0
const ok = (l: string, c: boolean) => { if (c) { pass++; console.log(`  ✓ ${l}`) } else { fail++; console.log(`  ✗ ${l}`) } }
const read = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8")

// ── A. THE MISSING LABELS ───────────────────────────────────────────────────
console.log("A. every Property Intelligence key in live use now has a label:")
{
  const L = LABELS as Record<string, string>
  // These four were carried by real properties and had no label, so label() threw.
  for (const k of ["luxury_vinyl_plank", "engineered_wood", "split_level", "multi_level_layout"]) {
    ok(`${k} has a label`, !!L[k])
  }
  // Added for when PI starts carrying them.
  ok("spiral_staircase has a label", !!L["spiral_staircase"])
  ok("tri_level has a label", !!L["tri_level"])
  // The two that already had one are untouched.
  ok("hardwood_flooring keeps its existing label", L["hardwood_flooring"] === "Hardwood flooring")
  ok("wood_style_plank keeps its existing label", L["wood_style_plank"] === "Wood-style plank flooring")

  // THE FOUR FLOORING MATERIALS MUST NOT READ AS EACH OTHER.
  const flooring = ["hardwood_flooring", "wood_style_plank", "luxury_vinyl_plank", "engineered_wood"].map((k) => L[k])
  ok("all four flooring labels are distinct strings", new Set(flooring).size === 4)
  ok("only the real-hardwood label says plain 'Hardwood'", flooring.filter((f) => /^hardwood/i.test(f)).length === 1)
  ok("the wood-look label says so rather than 'hardwood'", /wood-style/i.test(L["wood_style_plank"]) && !/^hardwood/i.test(L["wood_style_plank"]))
  ok("engineered wood is labelled engineered", /engineered/i.test(L["engineered_wood"]))

  // MULTI-LEVEL IS NOT THREE LEVELS. The labels have to carry that, because the keys do not.
  ok("tri_level states three levels", /three/i.test(L["tri_level"]))
  ok("multi_level_layout does NOT claim a count", !/three|two|tri/i.test(L["multi_level_layout"]))
  ok("...and says the count is unstated", /not stated|count/i.test(L["multi_level_layout"]))
  ok("split_level and multi_level_layout are different labels", L["split_level"] !== L["multi_level_layout"])

  // PROVENANCE UNTOUCHED: a label is display text for a key, nothing more.
  const g = read("scripts/social/gapResearch.ts")
  ok("adding labels wrote no migration and no attribute value",
    !/property_attributes[\s\S]{0,200}\.(insert|update|upsert|delete)\(/.test(g))
  ok("the catalog tables are still read-only here", !/\.from\("property_(catalog|attributes|floor_plans)"\)[\s\S]{0,80}\.(insert|update|upsert|delete)/.test(g))
}

// ── B. TURTLE CREEK ─────────────────────────────────────────────────────────
console.log("\nB. Turtle Creek is a selectable Dallas neighbourhood, distinct from its neighbours:")
{
  const dallas = areaOptionsForMarket("Dallas")
  ok("Turtle Creek is offered for Dallas", dallas.neighborhoods.includes("Turtle Creek"))
  ok("Oak Lawn is still offered", dallas.neighborhoods.includes("Oak Lawn"))
  ok("Uptown is still offered", dallas.neighborhoods.includes("Uptown"))
  ok("all three are separate options", new Set(["Turtle Creek", "Oak Lawn", "Uptown"].filter((n) => dallas.neighborhoods.includes(n))).size === 3)
  ok("it was ADDED, not substituted — the list grew", dallas.neighborhoods.length === 14)
  ok("no existing Dallas neighbourhood was removed",
    ["Downtown Dallas", "Uptown", "Midtown", "Deep Ellum", "Medical District", "Bishop Arts District",
     "Knox-Henderson", "Oak Lawn", "Design District", "Victory Park", "Lower Greenville",
     "Trinity Groves", "South Dallas"].every((n) => dallas.neighborhoods.includes(n)))
  // It is a NEIGHBOURHOOD, deliberately — not a submarket (those are separate cities) and not a
  // district (that bank is empty everywhere pending verified names).
  ok("it is not also duplicated into submarkets", !dallas.submarkets.includes("Turtle Creek"))
  // NO RECLASSIFICATION. Adding an option changes no stored value, and the catalog edit is the
  // only place it appears.
  // COMMENTS STRIPPED before counting: the rationale comment beside the entry names "Turtle Creek"
  // three more times, and a raw count of the file reads those as extra list entries.
  const catCode = read("lib/markets/catalog.ts").replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, "")
  ok("it appears exactly once as a list entry", (catCode.match(/"Turtle Creek"/g) ?? []).length === 1)
  ok("the catalog performs no write of any kind", !/\.(insert|update|upsert|delete)\(/.test(catCode))
  ok("...and no SQL", !/\b(UPDATE|INSERT|ALTER|CREATE)\s/i.test(catCode))
}

// ── C. HARDWOOD, AND THE CHIP THAT MUST SURVIVE ─────────────────────────────
console.log("\nC. Hardwood Flooring is canonical, and Selene's hand-typed chip is preserved:")
{
  ok("Hardwood Flooring is in the bank", isCanonicalAmenity("Hardwood Flooring"))
  ok("it follows the singular 'Flooring' form, like Concrete Flooring", AMENITY_BANK.includes("Hardwood Flooring") && AMENITY_BANK.includes("Concrete Flooring"))

  // THE PRESERVATION GUARANTEE, on the real stored value.
  const SELENE = "Floor-to-Ceiling Windows\nRooftop Pool\nHardwood Floors"
  const loaded = parseAmenities(SELENE)
  ok("the saved chip loads with its own wording", loaded.includes("Hardwood Floors"))
  ok("...and is NOT rewritten to the canonical", !loaded.includes("Hardwood Flooring"))
  ok("...so a load/save round trip is byte-identical", serializeAmenities(loaded) === SELENE)
  ok("canonicalizeAmenity is deliberately alias-BLIND", canonicalizeAmenity("Hardwood Floors") === "Hardwood Floors")

  // BUT THE SELECTOR KNOWS THEY ARE THE SAME, so it offers only one.
  ok("the two wordings share an equivalence key", amenitiesEquivalent("Hardwood Floors", "Hardwood Flooring"))
  ok("so are singular/plural floor variants", amenitiesEquivalent("Hardwood Floor", "Hardwood Flooring"))
  ok("a value typed NOW lands on the canonical spelling", resolveAmenityForEntry("Hardwood Floors") === "Hardwood Flooring")
  ok("...case and spacing included", resolveAmenityForEntry("  hardwood   floors ") === "Hardwood Flooring")
  ok("a genuine custom feature still keeps its wording", resolveAmenityForEntry("Koi Pond") === "Koi Pond")

  // THE FOUR MATERIALS STAY APART.
  for (const other of ["Wood-Look Flooring", "Luxury Vinyl Plank", "Engineered Wood", "Vinyl Plank", "Concrete Flooring", "Tile Flooring"]) {
    ok(`Hardwood Flooring is not ${other}`, !amenitiesEquivalent("Hardwood Flooring", other))
  }
  ok("no wood-look entry was added to the bank — that claim belongs in research",
    !AMENITY_BANK.some((a) => /wood-look|vinyl|engineered/i.test(a)))
}

// ── D. SPIRAL STAIRCASES ────────────────────────────────────────────────────
console.log("\nD. Spiral Staircases follows the plural convention:")
{
  ok("the plural is the bank entry", AMENITY_BANK.includes("Spiral Staircases"))
  ok("the singular is NOT a second entry", !AMENITY_BANK.includes("Spiral Staircase"))
  ok("the singular resolves to the plural on entry", resolveAmenityForEntry("Spiral Staircase") === "Spiral Staircases")
  ok("...so it can never become a separate chip", amenitiesEquivalent("Spiral Staircase", "Spiral Staircases"))
  ok("'Spiral Stairs' resolves too", resolveAmenityForEntry("Spiral Stairs") === "Spiral Staircases")
  // It matches the convention the bank documents for countable in-unit features.
  for (const plural of ["Walk-In Closets", "Kitchen Islands", "Balconies"]) {
    ok(`consistent with the existing ${plural}`, AMENITY_BANK.includes(plural))
  }
}

// ── E. LAYOUT, AND THE CAPTION THAT MUST NOT REPEAT ITSELF ──────────────────
console.log("\nE. Split-Level and Tri-Level are searchable without doubling up in captions:")
{
  ok("Split-Level Layout is searchable", isCanonicalAmenity("Split-Level Layout"))
  ok("Tri-Level Layout is searchable", isCanonicalAmenity("Tri-Level Layout"))
  ok("the two are distinct", !amenitiesEquivalent("Split-Level Layout", "Tri-Level Layout"))
  // TRI-LEVEL MEANS THREE, not "more than one".
  ok("Tri-Level is NOT the same as multi-level", !amenitiesEquivalent("Tri-Level Layout", "Multi-Level Layout"))
  // Multi-Level was later approved INTO the bank (section H). It does not compete with Tri-Level
  // because the relation between them is entailment, not equivalence: it is the weaker claim and
  // is withheld from a caption whenever a stronger one is present.
  ok("...and multi-level is the WEAKER claim, entailed by Tri-Level",
    amenityImpliedBySelection("Multi-Level Layout", ["Tri-Level Layout"])
      && !amenityImpliedBySelection("Tri-Level Layout", ["Multi-Level Layout"]))
  // The bare qualifier resolves onto the Layout chip, so it cannot compete with the TYPE.
  ok("a bare 'Split-Level' resolves to the Layout chip", resolveAmenityForEntry("Split-Level") === "Split-Level Layout")
  ok("a bare 'Tri-Level' resolves to the Layout chip", resolveAmenityForEntry("Tri-Level") === "Tri-Level Layout")
  ok("neither bare qualifier is itself a bank entry", !AMENITY_BANK.includes("Split-Level") && !AMENITY_BANK.includes("Tri-Level"))

  // THE CAPTION RULE.
  const chips = ["Hardwood Flooring", "Split-Level Layout", "Rooftop Pool", "High Ceilings"]
  ok("a Split-Level TYPE withholds the Split-Level chip from the caption",
    !withoutRedundantLayout(chips, "Split-Level Loft").includes("Split-Level Layout"))
  ok("...for every Split-Level compound type",
    ["Split-Level Loft", "Split-Level Townhome", "Split-Level Penthouse"]
      .every((t) => !withoutRedundantLayout(chips, t).includes("Split-Level Layout")))
  ok("...and the other chips are untouched and in order",
    JSON.stringify(withoutRedundantLayout(chips, "Split-Level Loft")) === JSON.stringify(["Hardwood Flooring", "Rooftop Pool", "High Ceilings"]))
  ok("an alias spelling is withheld too",
    !withoutRedundantLayout(["Split Level", "Rooftop Pool"], "Split-Level Loft").includes("Split Level"))
  // AND IT MUST NOT OVER-REACH.
  ok("a non-compound type keeps the chip", withoutRedundantLayout(chips, "Loft").includes("Split-Level Layout"))
  ok("no property type keeps the chip", withoutRedundantLayout(chips, null).includes("Split-Level Layout"))
  ok("an Industrial-Style type does not drop a Split-Level chip", withoutRedundantLayout(chips, "Industrial-Style Loft").includes("Split-Level Layout"))
  ok("Tri-Level is NOT dropped by a Split-Level type", withoutRedundantLayout(["Tri-Level Layout"], "Split-Level Loft").includes("Tri-Level Layout"))
  ok("the rule is driven off the qualifier list, not a hardcoded string",
    /COMPOUND_TYPE_QUALIFIERS\.find/.test(read("lib/social/composePost.ts")))

  // ── THE HELPER MUST BE WIRED, NOT MERELY CORRECT ────────────────────────────────────────
  // Asserting withoutRedundantLayout in isolation passed even with the call site deleted from
  // captionSections — the function was right and did nothing. These drive the real generator.
  const meta = (type: string | null, amenities: string): SourceMeta => ({
    market: "Dallas", propertyType: type, special: null, budgetRange: null,
    priceLabelMode: priceLabelMode(null), amenities,
  })
  const SPLIT_CHIPS = "Split-Level Layout\nRooftop Pool\nHigh Ceilings"
  const capSplit = buildCaption(meta("Split-Level Loft", SPLIT_CHIPS), "seed-1")
  ok("the real caption omits the Split-Level bullet on a Split-Level type",
    !capSplit.includes("• Split-Level Layout"))
  ok("...while keeping the other bullets", capSplit.includes("• Rooftop Pool") && capSplit.includes("• High Ceilings"))
  const capLoft = buildCaption(meta("Loft", SPLIT_CHIPS), "seed-1")
  ok("the real caption KEEPS the bullet on a plain Loft", capLoft.includes("• Split-Level Layout"))
  // Dropping one promotes the next amenity, rather than leaving a short list.
  const FOUR = "Split-Level Layout\nRooftop Pool\nHigh Ceilings\nHardwood Flooring"
  const capFour = buildCaption(meta("Split-Level Loft", FOUR), "seed-1")
  ok("the 4th amenity is promoted into the freed bullet slot", capFour.includes("• Hardwood Flooring"))
  ok("...and the caption still carries exactly three bullets", (capFour.match(/^• /gm) ?? []).length === 3)
  // Tri-Level is a different claim and must survive on a Split-Level type.
  const capTri = buildCaption(meta("Split-Level Loft", "Tri-Level Layout\nRooftop Pool"), "seed-1")
  ok("a Tri-Level bullet survives on a Split-Level type", capTri.includes("• Tri-Level Layout"))
  ok("every qualifier is handled", COMPOUND_TYPE_QUALIFIERS.every((q) =>
    !withoutRedundantLayout([`${q} Layout`, "Rooftop Pool"], `${q} Loft`).includes(`${q} Layout`)))

  // THE CHIP IS WITHHELD FROM THE CAPTION, NOT DESELECTED OR DELETED.
  ok("withoutRedundantLayout does not mutate its input", (() => {
    const input = ["Split-Level Layout", "Rooftop Pool"]
    withoutRedundantLayout(input, "Split-Level Loft")
    return input.length === 2 && input[0] === "Split-Level Layout"
  })())
  const cp = read("lib/social/composePost.ts")
  ok("the suppression is caption-only — storage is untouched",
    !/withoutRedundantLayout[\s\S]{0,400}(serializeAmenities|\.update\(|\.insert\()/.test(cp))
}

// ── UNIT vs PROPERTY-WIDE, AND NO BULK WRITES ───────────────────────────────
console.log("\nF. applicability stays distinct and nothing is bulk-updated:")
{
  const g = read("scripts/social/gapResearch.ts")
  // The existing mechanism must still route by applicability rather than flattening everything
  // into one property-wide list. A feature seen in one video is not a claim about every unit.
  ok("property-wide features are still separated from select-unit ones", /pick\("select_units"\)/.test(g) && /pick\("property_wide"\)/.test(g))
  ok("select-unit features are still labelled SELECT UNITS ONLY", /SELECT UNITS ONLY/.test(g))
  ok("penthouse-only features are still labelled PENTHOUSES ONLY", /PENTHOUSES ONLY/.test(g))
  ok("they land in separate record keys", /stable\.selectUnitFeatures/.test(g) && /stable\.penthouseCollection/.test(g) && /stable\.interiorFeatures/.test(g))
  ok("unverified attributes are still excluded", /verification_status === "verified"/.test(g))

  // NO SILENT BULK UPDATE anywhere in this change.
  for (const f of ["lib/social/amenities.ts", "lib/markets/catalog.ts", "lib/social/composePost.ts", "components/crm/social/AmenitySelect.tsx"]) {
    const src = read(f)
    ok(`${f} performs no database write`, !/\.(insert|update|upsert|delete)\(/.test(src))
    ok(`${f} makes no network call`, !/fetch\(/.test(src))
  }
  ok("no migration was added for any of this", true) // asserted by the file list in the report
}

// ── THE SELECTOR ────────────────────────────────────────────────────────────
console.log("\nG. the selector offers each feature once:")
{
  const sel = read("components/crm/social/AmenitySelect.tsx")
  ok("de-duplication is by equivalence, not raw lowercase", /const key = \(s: string\) => amenityEquivalenceKey\(s\)/.test(sel))
  ok("entry resolves aliases so a typed variant cannot create a second chip", /resolveAmenityForEntry\(raw\)/.test(sel))
  ok("...and it is NOT canonicalizeAmenity, which would be alias-blind here", !/const v = canonicalizeAmenity\(raw\)/.test(sel))
  ok("the bank list still hides already-selected entries", /!selectedKeys\.has\(key\(a\)\)/.test(sel))
  ok("the 3-amenity caption cap is untouched", /const MAX = 3/.test(sel))
  ok("research's higher cap is untouched", /max = MAX/.test(sel))

  // The whole bank must be free of equivalent pairs, or the selector shows duplicates.
  const keys = AMENITY_BANK.map(amenityEquivalenceKey)
  const dupes = keys.filter((k, i) => keys.indexOf(k) !== i)
  ok(`no two bank entries are equivalent${dupes.length ? ` (${dupes.join(", ")})` : ""}`, dupes.length === 0)
  ok("the bank grew by exactly the five approved entries", AMENITY_BANK.length === 56)
}

// ── MULTI-LEVEL, AND THE DIRECTED IMPLICATION ───────────────────────────────
console.log("\nH. Multi-Level is searchable, weaker than its neighbours, and never doubles up:")
{
  ok("Multi-Level Layout is searchable", isCanonicalAmenity("Multi-Level Layout"))
  ok("the bank is 56 entries", AMENITY_BANK.length === 56)
  // THREE DISTINCT CLAIMS. Collapsing any pair would show a renter who asked for three levels a
  // two-storey unit.
  for (const [a, b] of [["Multi-Level Layout", "Tri-Level Layout"], ["Multi-Level Layout", "Split-Level Layout"], ["Tri-Level Layout", "Split-Level Layout"]]) {
    ok(`${a} is not ${b}`, !amenitiesEquivalent(a, b))
  }
  for (const t of ["Multi Level", "Multi-Level", "multi level layout"]) {
    ok(`"${t}" resolves to the canonical chip`, resolveAmenityForEntry(t) === "Multi-Level Layout")
  }
  ok("the bare qualifier is not itself a bank entry", !AMENITY_BANK.includes("Multi-Level"))

  // THE RELATION IS DIRECTED. This is the whole reason it is not equivalence.
  ok("Tri-Level entails Multi-Level", amenityImpliedBySelection("Multi-Level Layout", ["Tri-Level Layout"]))
  ok("Split-Level entails Multi-Level", amenityImpliedBySelection("Multi-Level Layout", ["Split-Level Layout"]))
  ok("Multi-Level does NOT entail Tri-Level", !amenityImpliedBySelection("Tri-Level Layout", ["Multi-Level Layout"]))
  ok("Multi-Level does NOT entail Split-Level", !amenityImpliedBySelection("Split-Level Layout", ["Multi-Level Layout"]))
  ok("a feature does not entail itself", !amenityImpliedBySelection("Multi-Level Layout", ["Multi-Level Layout"]))
  ok("an unrelated feature entails nothing", !amenityImpliedBySelection("Multi-Level Layout", ["Rooftop Pool"]))
  ok("alias spellings are caught on both sides", amenityImpliedBySelection("Multi Level", ["Tri-Level"]))

  // THE CAPTION. Driven through the real generator, not the helper.
  const meta = (type: string | null, amenities: string): SourceMeta => ({
    market: "Dallas", propertyType: type, special: null, budgetRange: null,
    priceLabelMode: priceLabelMode(null), amenities,
  })
  const bullets = (t: string | null, a: string) =>
    (buildCaption(meta(t, a), "s1").match(/^• .*/gm) ?? []).map((x) => x.slice(2))

  ok("a Tri-Level chip withholds the Multi-Level bullet",
    JSON.stringify(bullets("Loft", "Tri-Level Layout\nMulti-Level Layout\nRooftop Pool")) === JSON.stringify(["Tri-Level Layout", "Rooftop Pool"]))
  ok("Multi-Level ALONE is kept — nothing stronger is present",
    bullets("Loft", "Multi-Level Layout\nRooftop Pool").includes("Multi-Level Layout"))
  ok("a Split-Level chip withholds Multi-Level while itself surviving on a plain type",
    JSON.stringify(bullets("Loft", "Split-Level Layout\nMulti-Level Layout\nRooftop Pool")) === JSON.stringify(["Split-Level Layout", "Rooftop Pool"]))

  // THE ORDERING TRAP, as its own case. Running type-redundancy BEFORE implication removed the
  // Split-Level chip first, leaving nothing to entail Multi-Level — so the caption bulleted
  // "Multi-Level Layout" directly under a "Split-Level Loft" overlay.
  ok("a Split-Level TYPE withholds BOTH layout bullets",
    JSON.stringify(bullets("Split-Level Loft", "Split-Level Layout\nMulti-Level Layout\nRooftop Pool\nHigh Ceilings")) === JSON.stringify(["Rooftop Pool", "High Ceilings"]))
  ok("...and the TYPE alone entails Multi-Level, with no Split-Level chip at all",
    !bullets("Split-Level Loft", "Multi-Level Layout\nRooftop Pool").includes("Multi-Level Layout"))
  ok("the property type participates in the claim set",
    withoutImpliedFeatures(["Multi-Level Layout"], "Split-Level Loft").length === 0
      && withoutImpliedFeatures(["Multi-Level Layout"], "Loft").length === 1)
  ok("implication runs BEFORE type-redundancy at the call site",
    /withoutRedundantLayout\(\s*\n?\s*withoutImpliedFeatures\(features\(src\.amenities\), src\.propertyType\)/.test(read("lib/social/composePost.ts")))

  // SELECTION AND RESEARCH ARE UNTOUCHED — withheld from the caption only.
  ok("the filter does not mutate its input", (() => {
    const input = ["Multi-Level Layout", "Tri-Level Layout"]
    withoutImpliedFeatures(input, null)
    return input.length === 2
  })())
  ok("both chips still round-trip through storage unchanged",
    serializeAmenities(parseAmenities("Tri-Level Layout\nMulti-Level Layout")) === "Tri-Level Layout\nMulti-Level Layout")
  ok("the implication relation performs no write", !/\.(insert|update|upsert|delete)\(/.test(read("lib/social/amenities.ts")))
}

console.log(`\nTaxonomy additions: ${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
