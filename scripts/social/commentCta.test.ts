// Social Beast — COMMENT CTA (comment-keyword call to action, derived from Property Type).
//
// The caption now closes with a comment keyword so organic posts can convert through automated DMs.
// The keyword comes from the ALREADY-SELECTED Property Type — no new field, no new state.
//
// The regression this file mainly exists to prevent is NOT the wording: it is that every caption in
// the library was written against the old "Submit the form…" closing line. isGeneratedCaption
// decides generator-owned vs manual by matching a stored caption against what the generator would
// produce, so changing the closing line could have reclassified the entire library as manual
// overrides — freezing them so a Market/Type change never re-syncs them again.

import { buildCaption, commentCta, commentCtaKeyword, isGeneratedCaption, publishCaption } from "@/lib/social/composePost"

let pass = 0
const failures: string[] = []
function ok(label: string, cond: boolean, detail = "") {
  if (cond) { pass++; console.log(`  ✓ ${label}`) }
  else { failures.push(label); console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`) }
}

const SA = { market: "San Antonio", amenities: "Private Yards, Detached Garages, Stainless Steel Appliances" }
const cap = (propertyType: string | null) => buildCaption({ ...SA, propertyType }, "seed-1")

console.log("\nKEYWORD PER PROPERTY TYPE (the mapping as specified):")
const CASES: [string | null, string][] = [
  ["Studio", "LIST"],
  ["Apartment", "LIST"],
  ["Townhome", "TOWN"],
  ["Loft", "LOFT"],
  ["High-Rise", "RISE"],
  ["Rental Home", "HOME"],
  ["Penthouse", "KEY"],
]
for (const [type, kw] of CASES) ok(`${type} → ${kw}`, commentCtaKeyword(type) === kw, commentCtaKeyword(type))

console.log("\nFALLBACK — unknown / unmapped / absent → LIST:")
for (const v of ["Houseboat", "", "   ", "Open to All", "nonsense-type"]) {
  ok(`${JSON.stringify(v)} → LIST`, commentCtaKeyword(v) === "LIST", commentCtaKeyword(v))
}
ok("null → LIST", commentCtaKeyword(null) === "LIST")
ok("undefined → LIST", commentCtaKeyword(undefined) === "LIST")
// "Home" is the spec's synonym for the canonical "Rental Home".
ok('"Home" → HOME', commentCtaKeyword("Home") === "HOME")
ok('"home" (lowercase) → HOME', commentCtaKeyword("home") === "HOME")

console.log("\nCOMPOUND TYPES reduce to their HEAD NOUN (same rule hashtag ranking uses):")
ok("Split-Level Townhome → TOWN", commentCtaKeyword("Split-Level Townhome") === "TOWN")
ok("Split-Level Penthouse → KEY", commentCtaKeyword("Split-Level Penthouse") === "KEY")
ok("Split-Level Loft → LOFT", commentCtaKeyword("Split-Level Loft") === "LOFT")
ok("Industrial-Style Apartment → LIST", commentCtaKeyword("Industrial-Style Apartment") === "LIST")
ok("Industrial-Style Townhome → TOWN", commentCtaKeyword("Industrial-Style Townhome") === "TOWN")
ok("Industrial-Style Penthouse → KEY", commentCtaKeyword("Industrial-Style Penthouse") === "KEY")
ok("Industrial-Style Loft → LOFT", commentCtaKeyword("Industrial-Style Loft") === "LOFT")

console.log("\nEXACT CTA FORMAT:")
const town = commentCta("Townhome")
ok("matches the specified string verbatim",
  town === '✅ Comment "TOWN" and I’ll send you the best options within your budget.', JSON.stringify(town))
ok("starts with the green check", town.startsWith("✅ "))
ok("keyword is in straight double quotes", town.includes('"TOWN"'))
ok("uses the typographic apostrophe in I’ll", town.includes("I’ll"))

console.log("\nCAPTION TAIL — exactly one blank line, no old CTA, no duplicates:")
const t = cap("Townhome")
ok("ends with the comment CTA", t.endsWith(town))
ok("EXACTLY one blank line between the service line and the CTA",
  t.includes(`My apartment locating service is completely free!\n\n${town}`))
ok("…and not two blank lines", !t.includes(`free!\n\n\n`))
ok("the old 'Submit the form' line is gone", !t.includes("Submit the form"))
ok("the service line is preserved", t.includes("My apartment locating service is completely free!"))
ok("only ONE CTA in the caption", (t.match(/✅ Comment/g) ?? []).length === 1)

console.log("\nTHE SPECIFIED TOWNHOME EXAMPLE, END TO END:")
const expected = [
  "Moving to San Antonio? This could be home.",
  "",
  "🏡 Amenities",
  "",
  "• Private Yards",
  "• Detached Garages",
  "• Stainless Steel Appliances",
  "",
  "My apartment locating service is completely free!",
  "",
  '✅ Comment "TOWN" and I’ll send you the best options within your budget.',
].join("\n")
const sameShape = t.split("\n").slice(1).join("\n") === expected.split("\n").slice(1).join("\n")
ok("amenities section, spacing and CTA match the specified example below the hook", sameShape)
if (!sameShape) console.log("\n--- actual ---\n" + t + "\n--- expected ---\n" + expected)

console.log("\nPER-TYPE CAPTIONS each carry their own keyword:")
for (const [type, kw] of CASES) {
  const c = cap(type)
  ok(`${type} caption ends with "${kw}"`, c.endsWith(`✅ Comment "${kw}" and I’ll send you the best options within your budget.`))
}
ok("unknown type caption falls back to LIST", cap("Houseboat").includes('Comment "LIST"'))

console.log("\nPROPERTY TYPE CHANGE re-points the keyword:")
ok("Townhome → High-Rise changes TOWN to RISE",
  cap("Townhome").includes('"TOWN"') && cap("High-Rise").includes('"RISE"') && !cap("High-Rise").includes('"TOWN"'))

console.log("\nEXISTING LIBRARY CAPTIONS STAY GENERATOR-OWNED (the real regression risk):");
{
  // A caption exactly as the generator produced it BEFORE this change.
  const legacyTail = "My apartment locating service is completely free!\n\nSubmit the form to get your free custom apartment list."
  const legacy = `Moving to San Antonio? This could be home.\n\n🏡 Amenities\n\n• Private Yards\n• Detached Garages\n• Stainless Steel Appliances\n\n${legacyTail}`
  const src = { ...SA, propertyType: "Townhome" }
  ok("an OLD caption is still recognized as generated", isGeneratedCaption(legacy, src, "seed-1"))
  ok("…and publishCaption re-generates it with the NEW CTA",
    publishCaption(legacy, src, "seed-1").includes('✅ Comment "TOWN"'))
  ok("…and the regenerated caption drops the old line",
    !publishCaption(legacy, src, "seed-1").includes("Submit the form"))
  // A genuinely hand-written caption must STILL be treated as manual and left alone.
  const manual = "Come see this one, DM me for details."
  ok("a manual caption is still NOT generator-owned", !isGeneratedCaption(manual, src, "seed-1"))
  ok("…and publishCaption leaves it untouched", publishCaption(manual, src, "seed-1") === manual)
  // A new-format caption is of course generator-owned too.
  ok("a NEW-format caption is generator-owned", isGeneratedCaption(cap("Townhome"), src, "seed-1"))
}

console.log(`\n${pass} passed, ${failures.length} failed\n`)
if (failures.length) { failures.forEach((f) => console.log(`  FAILED: ${f}`)); process.exit(1) }
