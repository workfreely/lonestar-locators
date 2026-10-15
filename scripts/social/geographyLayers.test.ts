// SOCIAL BEAST — the four geographic layers, and the three things that must not move.
//
// ── WHAT CHANGED ────────────────────────────────────────────────────────────────────────────
// Verified research kept producing properties where TWO location names are both accurate and only
// one field existed to hold them: Atelier Dallas is in Downtown Dallas AND the Arts District; Tin
// Top Flats is in Midtown San Antonio AND Tobin Hill. `district` is one additive nullable column
// so the specific name stops competing with the broader one.
//
// ── WHAT THESE TESTS GUARD ──────────────────────────────────────────────────────────────────
// The risk here is not that the feature fails to work — it is that it quietly damages three
// things that were explicitly to be preserved:
//
//   1. EXISTING SELECTIONS. The migration must be additive only. A backfill, a default or a
//      NOT NULL would rewrite 121 stored area values that took real work to get right.
//   2. PUBLIC COPY. area_neighborhood is deliberately absent from composePost's SourceMeta so it
//      can never reach a caption, headline or overlay. district inherits that rule exactly — and
//      a projection that reads it is one import away from a composer that uses it.
//   3. THE EDITOR'S DESIGN. The property row is a four-track grid with four labels in a specified
//      order. District had to fit WITHOUT becoming a fifth column.
//
// SOURCE assertions, like editorPropertyRow.test.ts beside it: the editor sits behind an admin
// gate wired to the production database, so it cannot be rendered in a test. Source assertions
// still pin what actually breaks — a field missing from a projection, a payload or a type — and
// they need no credentials.
//
// Run: npx tsx scripts/social/geographyLayers.test.ts

import { readFileSync } from "node:fs"
import path from "node:path"
import { MARKETS, getMarketByName } from "@/lib/markets/catalog"
import {
  areaOptionsForMarket,
  preservedAreaValue,
  isCanonicalArea,
  districtOptionsForMarket,
  isCanonicalDistrict,
  preservedDistrictValue,
} from "@/lib/social/intakeFields"

let pass = 0, fail = 0
const ok = (l: string, c: boolean) => { if (c) { pass++; console.log(`  ✓ ${l}`) } else { fail++; console.log(`  ✗ ${l}`) } }
const read = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8")

// Comments describe the rules these tests check, so an assertion that a name is ABSENT must not be
// satisfied — or defeated — by prose. Strip comments first. This exact trap has bitten before.
const codeOnly = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "").replace(/--.*$/gm, "")

const migration = read("supabase/migrations/20261020000000_social_content_district.sql")
// A migration's EXECUTABLE surface is its statements minus its `--` comments AND minus the string
// literals inside `comment on ...`. That documentation string legitimately names the sibling
// columns to explain the layering, and a COMMENT ON cannot modify a column or a row — so leaving
// it in would make the "never written to" assertions below fail on documentation.
const mig = codeOnly(migration).replace(/comment\s+on\s+[\s\S]*?;/gi, "")
const areaSelect = read("components/crm/social/AreaSelect.tsx")
const editor = read("components/crm/social/PostEditor.tsx")
const getRoute = read("app/api/admin/social-autopilot/posts/[id]/route.ts")
const patchRoute = read("app/api/admin/social-autopilot/content/[id]/route.ts")
const composer = read("lib/social/composePost.ts")
const intake = read("lib/social/intakeFields.ts")

// ── 1. THE MIGRATION IS ADDITIVE, AND NOTHING IS POPULATED ──────────────────────────────────
console.log("\nmigration — additive only:")
ok("adds district as nullable text, idempotently",
  /alter table public\.social_content\s+add column if not exists district text\s*;/i.test(mig))
ok("NO backfill — no update statement anywhere", !/\bupdate\s+public\.social_content\b/i.test(mig))
ok("NO default, so every existing row starts null", !/\bdefault\b/i.test(mig))
ok("NOT NULL is never applied", !/\bnot\s+null\b/i.test(mig))
ok("no column is altered or dropped", !/\balter\s+column\b/i.test(mig) && !/\bdrop\b/i.test(mig))
// The single most dangerous thing this migration could do is touch its sibling.
ok("area_neighborhood is never written to or altered by the migration",
  !/area_neighborhood/i.test(mig))
ok("market is never written to or altered by the migration", !/\bmarket\b/i.test(mig))
ok("no constraint, index or check is added",
  !/\bconstraint\b/i.test(mig) && !/\bcreate\s+index\b/i.test(mig) && !/\bcheck\s*\(/i.test(mig))
ok("the column comment states the internal rule", /never written to\s+public post copy/i.test(migration))

// ── 2. EXISTING SELECTIONS AND THE EXISTING FIELD ARE PRESERVED ─────────────────────────────
console.log("\npreservation — area_neighborhood is untouched:")
ok("still editable through the content PATCH", /EDITABLE = \[[^\]]*"areaNeighborhood"/.test(patchRoute))
ok("still mapped to its column", /areaNeighborhood:\s*"area_neighborhood"/.test(patchRoute))
ok("still read by the post GET projection", /source:source_content_id\([^)]*\barea_neighborhood\b/.test(getRoute))
ok("still mapped out of the GET response", /areaNeighborhood:\s*src\.area_neighborhood/.test(getRoute))
ok("still hydrated into editor state", /setAreaNeighborhood\(p\.source\?\.areaNeighborhood/.test(editor))
ok("still sent on save", /body:\s*JSON\.stringify\(\{[^}]*\bareaNeighborhood\b/.test(editor))
ok("its 5000-char PATCH cap is unchanged — only district gets a narrower one",
  /MAX_LEN[^=]*=\s*\{\s*district:\s*200\s*\}/.test(patchRoute) && !/areaNeighborhood:\s*\d+/.test(patchRoute))
// Market is the layer above both and was explicitly to stay as it is.
ok("Market keeps its own field and column", /EDITABLE = \[[^\]]*"market"/.test(patchRoute) && /market:\s*"market"/.test(patchRoute))

// ── 3. DISTRICT IS WIRED END TO END ─────────────────────────────────────────────────────────
console.log("\ndistrict — database to editor:")
ok("PATCH accepts it", /EDITABLE = \[[^\]]*"district"/.test(patchRoute))
ok("PATCH maps it to the district column", /district:\s*"district"/.test(patchRoute))
ok("PATCH caps it at 200, like the intake cap on its sibling",
  /MAX_LEN[^=]*=\s*\{[^}]*district:\s*200/.test(patchRoute) && /MAX_LEN\[k\]\s*\?\?\s*5000/.test(patchRoute))
ok("GET projects it", /source:source_content_id\([^)]*\bdistrict\b/.test(getRoute))
ok("GET declares it on the source type", /district:\s*string \| null/.test(getRoute))
ok("GET maps it out", /district:\s*src\.district/.test(getRoute))
ok("the editor's Source type declares it", /district:\s*string \| null/.test(editor))
ok("the editor holds it in state", /const \[district, setDistrict\] = useState\(""\)/.test(editor))
ok("the editor hydrates it from the loaded post", /setDistrict\(p\.source\?\.district/.test(editor))
ok("the editor SENDS it on save", /body:\s*JSON\.stringify\(\{[^}]*\bdistrict\b/.test(editor))
ok("and it is in the save callback's dependency list",
  /\}, \[sourceContentId[^\]]*\bdistrict\b/.test(editor))

// ── 4. BOTH LAYERS, ONE OPTION SOURCE ───────────────────────────────────────────────────────
console.log("\none catalog, two layers:")
ok("AreaSelect takes a layer prop defaulting to area", /layer\s*=\s*"area"/.test(areaSelect))
ok("the prop is typed to the two layers", /layer\?:\s*"area" \| "district"/.test(areaSelect))
ok("the district bank comes from intakeFields, not a new array",
  /districtOptionsForMarket/.test(areaSelect) && !/const\s+DISTRICTS\s*[:=]/.test(areaSelect))
ok("intakeFields reads districts off the canonical Market entry",
  /m\?\.districts \?\? \[\]/.test(intake))
ok("the editor renders the district control through the SAME component",
  /<AreaSelect\s+layer="district"/.test(editor))
ok("both controls are market-aware", (areaSelect.match(/market/g) ?? []).length > 3)

console.log("\noption helpers behave:")
ok("districts is OPTIONAL on Market, so no market entry had to change",
  /districts\?:\s*string\[\]/.test(read("lib/markets/catalog.ts")))
ok("no market is bulk-populated with districts yet",
  MARKETS.every((m) => (m.districts ?? []).length === 0))
ok("an unknown market yields an empty bank, not a throw", districtOptionsForMarket("Nowhere").length === 0)
ok("an empty market yields an empty bank", districtOptionsForMarket("").length === 0)
ok("nothing is canonical while the banks are empty", !isCanonicalDistrict("Dallas", "Arts District"))
// This is the preservation guarantee that matters: every district typed today is non-canonical,
// so if preservedDistrictValue dropped it, a market switch would silently delete real data.
ok("a typed district is PRESERVED across markets", preservedDistrictValue("Dallas", "Arts District") === "Arts District")
ok("blank is not preserved as a value", preservedDistrictValue("Dallas", "   ") === null)
ok("the area helpers are unchanged — a canonical area still reads canonical",
  isCanonicalArea("Dallas", "Downtown Dallas") && preservedAreaValue("Dallas", "Downtown Dallas") === null)
ok("and a free-text area is still preserved", preservedAreaValue("Dallas", "Frisco") === "Frisco")
ok("the area bank is still non-empty for every market, which is why only district free-texts",
  MARKETS.every((m) => areaOptionsForMarket(m.name).neighborhoods.length > 0))
ok("San Antonio still carries Boerne and Schertz as SUBMARKETS, not districts",
  (getMarketByName("San Antonio")?.submarkets ?? []).includes("Boerne") &&
  (getMarketByName("San Antonio")?.submarkets ?? []).includes("Schertz"))

// ── 5. INTERNAL: NEITHER LAYER CAN REACH PUBLIC COPY ────────────────────────────────────────
console.log("\ninternal only — captions, overlays and headlines:")
const metaBlock = composer.slice(composer.indexOf("SourceMeta"), composer.indexOf("SourceMeta") + 1400)
ok("SourceMeta still does not carry areaNeighborhood", !/areaNeighborhood\s*[?:]/.test(codeOnly(metaBlock)))
ok("SourceMeta does not carry district either", !/\bdistrict\s*[?:]/.test(codeOnly(metaBlock)))
ok("composePost reads neither geographic field",
  !/\barea_neighborhood\b/.test(codeOnly(composer)) && !/\bdistrict\b/.test(codeOnly(composer)))
// Editing either field must not invalidate generated copy. The two controls now live in their own
// ROW rather than stacked in one cell, so the region checked is row 2 in full — from the
// Neighborhood label to the research panel that follows the row.
// The slice must start at the ROW's opening div, not at the Neighborhood label — the label sits
// inside the first cell, so starting there cuts that cell's own className off the front and the
// col-span assertion below could only ever see one of the two.
const labelAt = editor.search(/Neighborhood \/ Area <span className="normal-case/)
const rowStart = editor.lastIndexOf('<div className="grid grid-cols-1 sm:grid-cols-[1.6fr_1fr_1fr_1fr] gap-3">', labelAt)
const rowEnd = editor.indexOf("Property Research PANEL", labelAt)
const cell = editor.slice(rowStart, rowEnd > rowStart ? rowEnd : rowStart + 3000)
// codeOnly, because the comment INSIDE this cell explains the rule by naming syncGenerated — and
// matching prose instead of code is how this assertion first failed against correct code.
ok("changing Neighborhood or District does NOT regenerate copy", !/syncGenerated/.test(codeOnly(cell)))
ok("both AreaSelects sit in row 2, side by side", (codeOnly(cell).match(/<AreaSelect\b/g) ?? []).length === 2)
ok("each gets its own column, spanning two tracks of the four", (cell.match(/sm:col-span-2/g) ?? []).length === 2)

// ── 6. THE EDITOR'S DESIGN IS PRESERVED ─────────────────────────────────────────────────────
console.log("\nproperty row — design unchanged:")
const grid = editor.match(/sm:grid-cols-\[([0-9.]+fr(?:_[0-9.]+fr)+)\]/)
ok("the row still declares an explicit multi-track grid", !!grid)
ok("it still has FOUR columns, not five", !!grid && grid[1].split("_").length === 4)
// BOTH rows declare the SAME four tracks, so their column edges line up.
ok("the four-track grid is used by both identity rows",
  (editor.match(/grid grid-cols-1 sm:grid-cols-\[1\.6fr_1fr_1fr_1fr\]/g) ?? []).length === 2)
const at = (x: string) => editor.indexOf(x)
const iArea = editor.search(/Neighborhood \/ Area <span className="normal-case/)
const iName = at("Property / Building Name"), iBuilding = at("Building Type{")
const iUnit = editor.search(/Unit Type <span className="normal-case/), iMarket = at(">Market<")
ok("all five labels above the geography row are present", [iName, iBuilding, iUnit, iMarket, iArea].every((i) => i > 0))
ok("row 1 is Name -> Building Type -> Unit Type -> Market",
  iName < iBuilding && iBuilding < iUnit && iUnit < iMarket)
ok("District sits BESIDE Neighborhood in row 2, no longer stacked in its cell",
  editor.search(/District <span className="normal-case/) > iArea &&
  !/mt-2 block[\s\S]{0,80}District/.test(editor))

// ── 7. RENDER AND PUBLISH ARE NOT IN THE BLAST RADIUS ───────────────────────────────────────
// A geographic field has no business in a render or a publish. These paths were not edited; this
// asserts that, so a later change cannot wire one in without a test failing.
console.log("\nrendering and publishing untouched:")
for (const f of [
  "lib/social/composePost.ts",
  "app/api/admin/social-autopilot/posts/route.ts",
]) {
  ok(`${f} never reads district`, !/\bdistrict\b/.test(codeOnly(read(f))))
}
ok("the post GET still projects every render/cover column it did before",
  /cover_thumb_offset_ms/.test(getRoute) && /render_status/.test(getRoute) && /rendered_storage_path/.test(getRoute))
ok("prepared copy is still built from public-safe facts only — no geography beyond market",
  /market:\s*s\.market as string \| null/.test(read("app/api/admin/social-autopilot/posts/route.ts")))

console.log(`\n${pass} passed, ${fail} failed\n`)
process.exit(fail === 0 ? 0 : 1)
