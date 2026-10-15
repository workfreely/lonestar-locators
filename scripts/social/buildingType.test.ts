// BUILDING TYPE — the vocabulary, the one-key merge, the editor's two rows, and the five things
// this field must never do.
//
// Run: npx tsx scripts/social/buildingType.test.ts   (pure — no database, no network)
//
// The risk here is not that the field fails to save. It is that it quietly becomes authoritative
// over Unit Type, or that saving one jsonb key overwrites the researched facts around it.

import { readFileSync } from "node:fs"
import { BUILDING_TYPES, BUILDING_TYPE_KEY, isBuildingType, normalizeBuildingType } from "@/lib/social/buildingTypes"
import { PROPERTY_TYPES } from "@/lib/social/propertyTypes"
import { mergeStableResearch } from "@/lib/social/mergeResearch"

let pass = 0, fail = 0
const ok = (label: string, cond: boolean) => {
  if (cond) { pass++; console.log(`  ✓ ${label}`) } else { fail++; console.log(`  ✗ ${label}`) }
}
// THE COMMENT TRAP: absence assertions run on source with COMMENTS stripped, because prose
// explaining a rule has matched the regex testing that rule before, in this repo.
//
// BOTH NAIVE STRIPPERS ARE BROKEN, in opposite directions, and each one silently made every
// absence assertion in this file vacuous until the canary below caught it:
//
//   • Stripping string literals too: in a .tsx file an apostrophe in ordinary JSX text ("the
//     database's") is not a quote, so the matcher paired it with the next apostrophe hundreds of
//     lines away and deleted the code in between.
//   • Stripping /* */ anywhere: PostEditor.tsx contains accept="video/*". That /* opens a false
//     block comment that runs 20,959 characters to the next */, swallowing the lines under test.
//
// So: JSX comments, then block comments ONLY where one opens at the start of a line, then line
// comments. A /* inside an attribute or a string can never begin a line, and literals are left
// alone. Precise regexes are the defence against literals, not a bigger hammer.
const codeOnly = (src: string) =>
  src.replace(/\{\/\*[\s\S]*?\*\/\}/g, " ")
     .replace(/^[ \t]*\/\*[\s\S]*?\*\//gm, " ")
     .replace(/^\s*\/\/.*$/gm, " ")

const editor = readFileSync("components/crm/social/PostEditor.tsx", "utf8")
const editorCode = codeOnly(editor)
if (!/syncGenerated\(metaOf\(\{ propertyType: v \}\)\)/.test(editorCode)) {
  // A stripper that eats the code under test makes every absence assertion below vacuous. This is
  // the canary: a call we KNOW is in the file must survive stripping.
  console.log("  ✗ FATAL — codeOnly() removed code under test; absence assertions would be vacuous")
  process.exit(1)
}
const route = readFileSync("app/api/admin/social-autopilot/property-research/route.ts", "utf8")

console.log("\nThe vocabulary")
ok("six values", BUILDING_TYPES.length === 6)
ok("Mid-Rise is present — 13 library properties are 4–8 storeys", BUILDING_TYPES.includes("Mid-Rise" as never))
ok("the five proposed values are all present",
  ["Apartment Community", "High-Rise", "Townhome Community", "Rental Home Community", "Mixed Community"]
    .every((v) => (BUILDING_TYPES as readonly string[]).includes(v)))
ok("no duplicates", new Set(BUILDING_TYPES).size === BUILDING_TYPES.length)
ok("the jsonb key is declared once", BUILDING_TYPE_KEY === "buildingType")

console.log("\nBuilding Type is not Unit Type")
// The two vocabularies may only ever share "High-Rise", which is genuinely both a building and a
// marketable unit description. Any further overlap means one list is drifting into the other.
const shared = (BUILDING_TYPES as readonly string[]).filter((b) => (PROPERTY_TYPES as readonly string[]).includes(b))
ok(`the lists overlap on High-Rise only (found: ${shared.join(", ") || "none"})`,
  shared.length === 1 && shared[0] === "High-Rise")
ok("Unit Type still has all 14 values", PROPERTY_TYPES.length === 14)
ok("the specialised Loft and Penthouse variants are preserved",
  ["Loft", "Penthouse", "Split-Level Loft", "Split-Level Penthouse", "Industrial-Style Loft",
   "Split-Level Townhome", "Industrial-Style Apartment", "Industrial-Style Townhome",
   "Industrial-Style Penthouse"].every((t) => (PROPERTY_TYPES as readonly string[]).includes(t)))

console.log("\nBlank is a valid state, and near-misses are refused")
ok("empty string normalises to null (clear)", normalizeBuildingType("")?.ok === true &&
  (normalizeBuildingType("") as { value: unknown }).value === null)
ok("null normalises to null", (normalizeBuildingType(null) as { value: unknown }).value === null)
ok("undefined normalises to null", (normalizeBuildingType(undefined) as { value: unknown }).value === null)
ok("a real value passes through", (normalizeBuildingType("Mid-Rise") as { value: unknown }).value === "Mid-Rise")
ok("whitespace is trimmed, not rejected", (normalizeBuildingType("  High-Rise  ") as { value: unknown }).value === "High-Rise")
for (const bad of ["High Rise", "apartment community", "Highrise", "Penthouse", "Townhome", "Apartment"]) {
  ok(`"${bad}" is REFUSED rather than coerced`, normalizeBuildingType(bad).ok === false)
}
ok("a non-string is refused", normalizeBuildingType(42).ok === false)
ok("the guard rejects blank", !isBuildingType("") && !isBuildingType(null))

console.log("\nSaving one key cannot destroy the research around it")
// The real shape: everything verified about a building, which a plain overwrite would erase.
const stable = {
  address: "21455 Merchants Way, Katy, TX 77449",
  stories: 8,
  architecture: ["Art-deco former headquarters"],
  floorPlans: [{ name: "B5", beds: 2, baths: 2, sqft: 1331 }],
  ceilingHeight: "9 TO 14 FEET — a RANGE across the plans",
  geography: { city: "Katy", district: "Mason Creek", broaderArea: "West Houston" },
  communityAmenities: ["Pool", "Fitness"],
  officialWebsite: "https://example.com",
}
const afterSet = mergeStableResearch(stable as never, { buildingType: "Mid-Rise" } as never)
ok("buildingType is added", afterSet.buildingType === "Mid-Rise")
for (const k of Object.keys(stable)) ok(`  ${k} survives the write`, JSON.stringify(afterSet[k]) === JSON.stringify((stable as Record<string, unknown>)[k]))
ok("nested geography is intact, not flattened",
  JSON.stringify(afterSet.geography) === JSON.stringify(stable.geography))

const afterClear = mergeStableResearch(afterSet as never, {}, { remove: [BUILDING_TYPE_KEY] })
ok("clearing REMOVES the key rather than storing null",
  !("buildingType" in afterClear) && afterClear.buildingType === undefined)
ok("clearing leaves every other key untouched",
  Object.keys(stable).every((k) => JSON.stringify(afterClear[k]) === JSON.stringify((stable as Record<string, unknown>)[k])))

console.log("\nThe save route")
ok("PATCH exists", /export async function PATCH\(/.test(route))
ok("a blank place_id is refused", /if \(!placeId\) return NextResponse\.json\(\{ error: "no_place_id" \}/.test(route))
ok("the value is normalised before any write",
  route.indexOf("normalizeBuildingType") < route.indexOf('.update({ stable:'))
// The import and the explanatory comment both contain the helper's NAME, so a bare name test
// passes even when the call is gone. Assert on what is assigned to nextStable, comments stripped.
ok("nextStable is produced BY mergeStableResearch, not by an object literal",
  /const nextStable =[\s\S]{0,160}mergeStableResearch\(/.test(codeOnly(route)) &&
  !/const nextStable = \{/.test(codeOnly(route)))
ok("only the stable column is ever updated", (route.match(/\.update\(/g) ?? []).length === 1 &&
  /\.update\(\{ stable: nextStable \}\)/.test(route))
ok("pricing, sources, unresolved and property_name are never written",
  !/\.update\([\s\S]{0,120}(pricing|sources|unresolved|property_name)/.test(route))
ok("it never creates research — the row must already exist",
  !/\.insert\(|\.upsert\(/.test(route) && /"no_research" \}, \{ status: 404 \}/.test(route))
ok("authorization is the database's — no service role, no security definer",
  !/service_role|SERVICE_ROLE|supabaseAdmin|security definer/i.test(route))
ok("an unauthenticated caller is refused", /error: "unauthorized" \}, \{ status: 401 \}/.test(route))
ok("a blocked write surfaces as 403 rather than a silent success",
  /if \(!saved\) return NextResponse\.json\(\{ error: "write_blocked" \}/.test(route))
ok("it touches no social_content or social_posts column",
  !/social_content|social_posts/.test(codeOnly(route)))

console.log("\nThe editor's two rows")
ok("row 1 order is Property / Building Name, Building Type, Unit Type, Market", (() => {
  const i = (s: string) => editor.indexOf(s)
  return i("Property / Building Name") < i(">\n                Building Type") - 1 ||
    (i("Property / Building Name") < i("Building Type{") &&
     i("Building Type{") < i("Unit Type <span") &&
     i("Unit Type <span") < i(">Market<"))
})())
ok("Neighborhood and District are in a SECOND grid, side by side",
  (editor.match(/grid grid-cols-1 sm:grid-cols-\[1\.4fr_1\.2fr_1\.25fr_0\.75fr\]/g) ?? []).length === 2 &&
  /Neighborhood \/ Area/.test(editor) &&
  (editor.match(/className="block sm:col-span-2 min-w-0"/g) ?? []).length === 2)
ok("District is no longer stacked inside the Neighborhood cell",
  !/mt-2 block[\s\S]{0,80}District/.test(editor))
ok("both rows collapse to one column on a phone",
  (editor.match(/grid-cols-1 sm:grid-cols-\[1\.4fr/g) ?? []).length === 2)
ok("the label reads Unit Type, not Property Type", /Unit Type <span/.test(editor) && !/>Property Type</.test(editor))

console.log("\nThe five things Building Type must never do")
ok("1. it is never passed to syncGenerated", !/syncGenerated\([^)]*buildingType/.test(editorCode))
ok("2. it is never put in metaOf", !/metaOf\(\{[^}]*buildingType/.test(editorCode))
ok("3. it is not in the post's save body",
  !/body: JSON\.stringify\(\{[^}]*buildingType[^}]*\}\)[\s\S]{0,200}posts\//.test(editorCode))
ok("4. it is disabled until a property is matched", /disabled=\{!placeId \|\|/.test(editor))
ok("5. a failed save reverts rather than showing an unsaved value",
  /setBuildingType\(previous\)/.test(editor) && /setBuildingTypeState\("error"\)/.test(editor))
ok("a blank place_id fetches nothing", /if \(!placeId\) \{ setBuildingTypeState\("idle"\); return \}/.test(editor))
ok("Unit Type still feeds generated copy, exactly as before",
  /setPropertyType\(v\); syncGenerated\(metaOf\(\{ propertyType: v \}\)\)/.test(editor))

console.log(`\n${pass} passed, ${fail} failed\n`)
process.exit(fail === 0 ? 0 : 1)
