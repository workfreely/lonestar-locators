/**
 * SOCIAL BEAST — PROPERTY RESEARCH OBSERVATIONS (Phase 1).
 *
 * The risk here is not whether a form saves. It is whether a note taken while
 * editing a video can ever reach authoritative Property Intelligence. Mini Beast
 * owns property_catalog, property_floor_plans, property_attributes and
 * property_specials; Social Beast is a provenance SOURCE and must be structurally
 * incapable of writing any of them.
 *
 * So most of this file asserts NEGATIVES, and the positives are about keeping the
 * two price concepts apart — the video's marketing overlay price vs. the observed
 * price of the unit on screen.
 *
 * Run: npx tsx scripts/social/propertyResearch.test.ts
 */
import { readFileSync } from "node:fs"
import path from "node:path"

let pass = 0, fail = 0
const ok = (l: string, c: boolean, d = "") => {
  if (c) { pass++; console.log(`  ✓ ${l}`) } else { fail++; console.log(`  ✗ ${l}${d ? `\n      ${d}` : ""}`) }
}
const read = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8")
const strip = (t: string) =>
  t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1")

const MIG = "supabase/manual/20261004_social_property_observations.sql"
const ROUTE = "app/api/admin/social-autopilot/content/[id]/research/route.ts"
const UI = "components/crm/social/PropertyResearch.tsx"
const EDITOR = "components/crm/social/PostEditor.tsx"

async function main() {
  console.log("\nPROPERTY RESEARCH OBSERVATIONS\n")

  const mig = read(MIG)
  const route = strip(read(ROUTE))
  const ui = strip(read(UI))
  const editor = strip(read(EDITOR))

  console.log("IT CANNOT WRITE AUTHORITATIVE PROPERTY INTELLIGENCE:")
  {
    for (const t of ["property_catalog", "property_floor_plans", "property_attributes", "property_specials", "property_enrichment_events"]) {
      ok(`the route never references ${t}`, !new RegExp(t).test(route))
      ok(`…nor does the UI`, !new RegExp(t).test(ui))
    }
    ok("the route writes exactly two tables",
      (route.match(/\.from\("social_(property|floorplan)_observations"\)/g) ?? []).length >= 2 &&
      !/\.from\("(?!social_)/.test(route.replace(/\.from\("social_content"\)/g, "")))
    ok("…and the only other table it reads is social_content (for place_id)",
      /\.from\("social_content"\)\s*\.select\("id, place_id"\)/.test(route))
    ok("no freshness field is stamped",
      !/pricing_last_verified|intel_enriched_at|verified_at|current_special_checked_at/.test(route))
    ok("the migration creates no FK to property_catalog",
      !/references public\.property_catalog/.test(mig))
    ok("…which is deliberate, for not-yet-catalogued properties",
      /NO foreign key to property_catalog/.test(mig))
  }

  console.log("\nTHE TWO PRICE CONCEPTS STAY APART:")
  {
    ok("the floor-plan observation has its own price column",
      /observed_price\s+text/.test(mig) && /price_context\s+text check/.test(mig))
    ok("the route never touches the video's marketing price",
      !/budget_range|price_label_mode/.test(route))
    ok("…nor does the research UI", !/budget_range|priceLabelMode/.test(ui))
    ok("price_context reuses the vocabulary but is a separate column",
      /check \(price_context in \('starting_at','exact_unit'\)\)/.test(mig))
    ok("the marketing amenities field is not reused for research",
      !/\bamenities\b/.test(route) && /observed_features/.test(route))
  }

  console.log("\nTWO TABLES, TWO SHAPES:")
  {
    // Slice each CREATE TABLE block; the comments between columns are long, so a
    // fixed-width window around them is fragile and fails for the wrong reason.
    const block = (name: string) => {
      const i = mig.indexOf(`create table if not exists public.${name}`)
      return i < 0 ? "" : mig.slice(i, mig.indexOf("\n);", i))
    }
    const obsBlock = block("social_property_observations")
    ok("property observations are EAV (field + value)",
      obsBlock.length > 0 && /\bfield\s+text not null/.test(obsBlock) && /\bvalue\s+text not null/.test(obsBlock),
      `block len ${obsBlock.length}`)
    ok("the floor plan is ONE composite row per video",
      /create table if not exists public\.social_floorplan_observations\s*\(\s*social_content_id uuid primary key/.test(mig))
    ok("values are stored verbatim as text, never cast to numeric",
      /value\s+text not null/.test(mig) && /observed_price\s+text/.test(mig))
    ok("every floor-plan detail is optional",
      !/plan_name[^,]*not null/.test(mig) && !/beds\s+numeric not null/.test(mig))
    ok("provenance rides on each observation",
      (mig.match(/source_url\s+text/g) ?? []).length === 2 && (mig.match(/observed_at\s+date/g) ?? []).length === 2)
  }

  console.log("\nRE-SAVING UPDATES, NEVER DUPLICATES:")
  {
    ok("a unique key scopes one observation per (video, field)",
      /unique \(social_content_id, field\)/.test(mig))
    ok("the route upserts on that key",
      /onConflict: "social_content_id,field"/.test(route))
    ok("the floor plan upserts on its primary key",
      /onConflict: "social_content_id"/.test(route))
  }

  console.log("\nBLANKS DO NOT CREATE ROWS:")
  {
    ok("an empty value is deleted rather than stored",
      /if \(value === null\) \{ clears\.push\(field\); continue \}/.test(route))
    ok("…and the delete is scoped to this video's cleared fields",
      /\.delete\(\)\s*\.eq\("social_content_id", id\)\s*\.in\("field", clears\)/.test(route))
    ok("an all-empty floor plan removes the row instead of storing nulls",
      /const planEmpty = Object\.values\(plan\)\.every\(\(v\) => v === null\)/.test(route))
    ok("text() returns null for whitespace-only input",
      /return s \? s\.slice\(0, max\) : null/.test(route))
  }

  console.log("\nSILENT-WRITE PROTECTION (the workspaces lesson):")
  {
    // RLS is on; a table with RLS and no policy accepts a write that matches zero
    // rows and reports success. Both policies must exist AND the route must check
    // the row count.
    ok("RLS is enabled on both tables",
      (mig.match(/enable row level security/g) ?? []).length === 2)
    ok("…with a policy on each",
      (mig.match(/create policy/g) ?? []).length === 2)
    ok("the policy mirrors social_content (admin AND owner)",
      /public\.is_platform_admin\(\) and observed_by = auth\.uid\(\)/.test(mig))
    ok("the route verifies the upsert actually wrote every row",
      /data\.length !== upserts\.length/.test(route))
    ok("…and the floor-plan write affected exactly one row",
      /!data \|\| data\.length !== 1/.test(route))
  }

  console.log("\nTENANCY — place_id comes from the row, not the request:")
  {
    ok("place_id is read from social_content", /place_id: string \| null \} \| null\)\?\.place_id/.test(route))
    ok("…never from the body", !/body\.placeId|body\.place_id/.test(route))
    ok("saving without a matched property is refused",
      /Match a property before saving research/.test(route))
    ok("the route is platform-admin gated", /requirePlatformAdmin\(\)/.test(route))
    ok("observed_by is the session user", /observed_by: guard\.userId/.test(route))
  }

  console.log("\nTHE FIELD VOCABULARY IS THE AUTHORITATIVE ONE:")
  {
    for (const f of ["studio_starting_rent", "onebr_starting_rent", "twobr_starting_rent",
      "threebr_starting_rent", "fourbr_starting_rent", "townhome_starting_rent",
      "loft_starting_rent", "penthouse_starting_rent"]) {
      ok(`${f} is accepted`, new RegExp(`"${f}"`).test(route) && new RegExp(`"${f}"`).test(ui))
    }
    ok("an unknown field is ignored (closed allow-list)",
      /if \(!\(field in incoming\)\) continue/.test(route) && /const PROPERTY_FIELDS = new Set/.test(route))
    ok("fivebr_plus is deliberately absent from Phase 1",
      !/fivebr_plus/.test(ui) && !/fivebr_plus/.test(route.replace(/fivebr_plus_starting_rent exists[^\n]*/g, "")))
  }

  console.log("\nUI — ONE LINE COLLAPSED, ONLY WHEN MATCHED:")
  {
    ok("collapsed renders a single disclosure button",
      /\{open \? "▾" : "▸"\}<\/span> Property Research/.test(read(UI)))
    ok("…and it is the toggle itself", /onClick=\{\(\) => setOpen\(\(o\) => !o\)\}/.test(ui))
    ok("the body renders only when open", /\{open && \(/.test(ui))
    ok("it is shown only when a property is matched",
      /\{!!placeId && sourceContentId && <PropertyResearch/.test(editor))
    ok("it sits inside PostEditor, not the shared PropertySearchField",
      !/PropertyResearch/.test(read("components/crm/social/PropertySearchField.tsx")))
    ok("…so the upload modal and Bulk Review are untouched",
      !/PropertyResearch/.test(read("components/crm/social/SocialAutopilotClient.tsx")) &&
      !/PropertyResearch/.test(read("components/crm/social/BulkReview.tsx")))
    ok("research loads on first expand, not on editor mount",
      /if \(!open \|\| loaded\) return/.test(ui))
    ok("+ More reveals the optional four",
      /\{showMore \?/.test(ui) && /MORE_FIELDS/.test(ui) && /\+ More/.test(ui))
  }

  console.log("\nEXISTING SAVE-DRAFT BEHAVIOUR IS UNCHANGED:")
  {
    ok("Save Draft still patches the source and the post",
      /const saveDraft = async \(\) => \{/.test(editor) && /patchSource/.test(editor))
    ok("the research save is a SEPARATE endpoint",
      /content\/\$\{sourceContentId\}\/research/.test(ui))
    ok("…and the editor's own save path never calls it",
      !/\/research/.test(editor))
    ok("the research component holds its own state, not the editor's",
      !/setPriceRange|setAmenities|setSpecial/.test(ui))
  }

  console.log(`\n${pass} passed, ${fail} failed\n`)
  if (fail > 0) process.exit(1)
}

void main()
