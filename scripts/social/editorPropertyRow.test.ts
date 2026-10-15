// POST EDITOR — the top property row, and the Area/Neighborhood read-back it was missing.
//
// area_neighborhood was captured at upload and stored correctly, but the editor's GET projection
// omitted it, so the value was effectively WRITE-ONCE: invisible and uncorrectable after upload.
// Live data showed the cost — one post carried area "Katy" (a Houston suburb) under market
// "Dallas", and there was no screen on which that could be fixed.
//
// These are SOURCE assertions rather than DOM ones on purpose: the editor sits behind an admin auth
// gate wired to the production database, so there is no way to render it in a test without signing
// in as a real operator. Source assertions still pin the things that actually broke — the field
// being absent from a projection, a payload, or a type — and they run with no credentials at all.
//
// Run: npx tsx scripts/social/editorPropertyRow.test.ts
import { readFileSync } from "node:fs"
import path from "node:path"

let pass = 0, fail = 0
const ok = (l: string, c: boolean) => { if (c) { pass++; console.log(`  ✓ ${l}`) } else { fail++; console.log(`  ✗ ${l}`) } }
const read = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8")

const editor = read("components/crm/social/PostEditor.tsx")
const getRoute = read("app/api/admin/social-autopilot/posts/[id]/route.ts")
const patchRoute = read("app/api/admin/social-autopilot/content/[id]/route.ts")
const composer = read("lib/social/composePost.ts")

console.log("top property row — four fields, in order:")
// The grid must declare FOUR tracks, and the first must be narrower than the old 2fr so the fourth
// cell has somewhere to come from. Asserted as "not 2fr and < 2fr" rather than a literal, so the
// exact ratio can be retuned without a false failure.
const grid = editor.match(/sm:grid-cols-\[([0-9.]+fr(?:_[0-9.]+fr)+)\]/)
ok("the row declares an explicit multi-track grid", !!grid)
if (grid) {
  const tracks = grid[1].split("_").map((t) => parseFloat(t))
  ok("it has FOUR columns", tracks.length === 4, )
  ok("the name column is still the widest", tracks[0] === Math.max(...tracks))
  ok("but narrower than the old 2fr, which is what paid for the 4th cell", tracks[0] < 2)
  ok("the other three share one width", new Set(tracks.slice(1)).size === 1)
}

// Order is what the user specified. Compare by source position so a reorder fails loudly.
const at = (s: string) => editor.indexOf(s)
// The Neighborhood index must come from the RENDERED LABEL, not from the first textual mention —
// the comment above the grid also names the field, and matching that made this assertion pass/fail
// on comment placement instead of on field order.
// TWO ROWS NOW. The identity block was split so Building Type could have a real column and
// Neighborhood could sit BESIDE District instead of stacked above it inside one cell.
//   row 1  Property / Building Name | Building Type | Unit Type | Market
//   row 2  Neighborhood / Area      | District
// "Property Type" was renamed to "Unit Type" — label only; the state, the 14-value vocabulary and
// the social_content.property_type column are untouched.
const iArea = editor.search(/Neighborhood \/ Area <span className="normal-case/)
const iName = at("Property / Building Name"), iBuilding = at("Building Type{")
const iUnit = editor.search(/Unit Type <span className="normal-case/), iMarket = at(">Market<")
const iDistrict = editor.search(/District <span className="normal-case/)
ok("all six labels are present", [iName, iBuilding, iUnit, iMarket, iArea, iDistrict].every((i) => i > 0))
ok("row 1 order is Name -> Building Type -> Unit Type -> Market",
  iName < iBuilding && iBuilding < iUnit && iUnit < iMarket)
ok("row 2 follows row 1, and is Neighborhood -> District", iMarket < iArea && iArea < iDistrict)
ok("the old label is gone", !/>Property Type</.test(editor))

// Matched-property + address must stay INSIDE the name cell, i.e. before the next field's label.
ok("the matched-property address stays beneath the building name", at("{address}") > iName && at("{address}") < iBuilding)
ok("the Property Research trigger also stays in that cell", at("Property Research") > iName && at("Property Research") < iBuilding)

console.log("\nthe read-back gap is closed end to end:")
ok("GET projection selects area_neighborhood", /source:source_content_id\([^)]*\barea_neighborhood\b/.test(getRoute))
ok("GET response maps it out as areaNeighborhood", /areaNeighborhood:\s*src\.area_neighborhood/.test(getRoute))
ok("the hand-written src type declares it (tsc would otherwise reject the mapping)",
  /area_neighborhood:\s*string \| null/.test(getRoute))
ok("the editor's Source type declares it", /areaNeighborhood:\s*string \| null/.test(editor))
ok("it is hydrated into state from the loaded post", /setAreaNeighborhood\(p\.source\?\.areaNeighborhood/.test(editor))
ok("it is SENT on save", /body:\s*JSON\.stringify\(\{[^}]*\bareaNeighborhood\b/.test(editor))
ok("and it is in the save callback's dependency list, so edits are not stale",
  /\}, \[sourceContentId[^\]]*\bareaNeighborhood\b/.test(editor))
ok("the PATCH route already accepted it (route side needed no change)",
  /EDITABLE = \[[^\]]*"areaNeighborhood"/.test(patchRoute) && /areaNeighborhood:\s*"area_neighborhood"/.test(patchRoute))
ok("it renders through the SAME AreaSelect the upload screens use",
  /import AreaSelect from/.test(editor) && /<AreaSelect\b/.test(editor))
ok("wired to the live market so the option list follows a market change",
  /<AreaSelect[\s\S]{0,200}?market=\{market\}/.test(editor))

console.log("\nPRIVACY — internal field must not reach public copy:")
// The whole reason this field was excluded from SourceMeta. Exposing it for EDITING must not have
// opened a path into a caption or an overlay.
const metaBlock = composer.slice(composer.indexOf("export type SourceMeta"), composer.indexOf("export type SourceMeta") + 1200)
ok("SourceMeta still does not carry areaNeighborhood", !/areaNeighborhood\s*[?:]/.test(metaBlock))
ok("nothing in composePost reads an area value", !/\barea_neighborhood\b/.test(composer))
// Editing it must not invalidate or regenerate copy — every OTHER field in the row calls
// syncGenerated, and this one deliberately does not.
const areaOnChange = editor.match(/<AreaSelect[\s\S]{0,400}?\/>/)?.[0] ?? ""
ok("changing it does NOT trigger caption/overlay regeneration", !/syncGenerated/.test(areaOnChange))
ok("it is still labelled internal in the editor, as on the upload screens", /Neighborhood[\s\S]{0,160}?· internal/.test(editor))

console.log(`\nEditor property row: ${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
