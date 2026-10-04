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
import { parseAmenities, serializeAmenities } from "@/lib/social/amenities"

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
    ok("the collapsed trigger is one line in the property cell",
      /\{researchOpen \? "▾" : "▸"\}<\/span> Property Research/.test(read(EDITOR)))
    ok("…and it toggles the panel", /onClick=\{\(\) => setResearchOpen\(\(o\) => !o\)\}/.test(editor))
    ok("the panel renders only when open",
      /\{researchOpen && !!placeId && sourceContentId && \(/.test(editor))
    // The clipping fix: the panel must sit AFTER the 2fr grid closes, not inside it.
    ok("the panel is OUTSIDE the [2fr_1fr_1fr] row",
      editor.indexOf("<PropertyResearch sourceContentId") > editor.indexOf("68fr_19fr_13fr") - 400 &&
      editor.indexOf("<PropertyResearch sourceContentId") > editor.indexOf("sm:grid-cols-[2fr_1fr_1fr]"))
    ok("…and spans the full width", /<div className="w-full min-w-0">/.test(ui))
    // A leading space means UNPREFIXED; "md:grid-cols-3" is the responsive form
    // and must not trip this (the first version of this assertion did).
    ok("its inner grids are responsive (no unprefixed 3/4 columns)",
      !/ grid-cols-3 /.test(ui) && !/ grid-cols-4 /.test(ui) &&
      /grid-cols-2 md:grid-cols-3/.test(ui) && /grid-cols-2 sm:grid-cols-4/.test(ui))
    ok("…every grid in the panel starts at 2 columns",
      (ui.match(/grid-cols-2 (sm|md):grid-cols-[34]/g) ?? []).length === 4)
    ok("it is shown only when a property is matched",
      /\{!!placeId && sourceContentId && \(/.test(editor))
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

  console.log("\nMATCHED PROPERTY ADDRESS (read, never stored):")
  {
    const route2 = strip(read("app/api/admin/social-autopilot/posts/[id]/route.ts"))
    ok("the address is READ from property_catalog by place_id",
      /\.from\("property_catalog"\)[\s\S]{0,80}\.select\("address"\)[\s\S]{0,60}\.eq\("place_id", placeId\)/.test(route2))
    // property_catalog has RLS ENABLED and no policies in this database, so an
    // RLS-scoped read returns zero rows for every property — indistinguishable
    // from "no address". Service role is what every other reader of this table
    // uses; the route is already platform-admin gated.
    ok("…via the service role, like every other reader of that table",
      /const \{ data, error \} = await supabaseAdmin\s*\n\s*\.from\("property_catalog"\)/.test(route2))
    ok("…and a lookup failure is logged, never silently null",
      /if \(error\) \{[\s\S]{0,160}catalog address lookup failed/.test(route2))
    ok("the lookup is READ-ONLY — no write to property_catalog",
      !/supabaseAdmin[\s\S]{0,200}\.from\("property_catalog"\)[\s\S]{0,120}\.(update|insert|upsert|delete)\(/.test(route2))
    ok("…and returned on the post's source", /address: await catalogAddress\(/.test(route2))
    ok("no address column is added to social_content",
      !/address/.test(read("supabase/manual/20261004_social_property_observations.sql")))
    ok("a trailing ', USA' is trimmed", /replace\(\/,\\s\*USA\\s\*\$\/i, ""\)/.test(route2))
    ok("no row renders without an address", /\{!!placeId && address && \(/.test(editor))
    ok("clearing the match clears the address",
      /onClearMatch=\{\(\) => \{ setPlaceId\(""\); setAddress\(null\) \}\}/.test(editor))
    ok("it is read-only text, not an input",
      /text-\[var\(--crm-text-muted\)\]">\{address\}<\/div>/.test(editor))
    ok("property matching behaviour is untouched",
      /onMatch=\{\(m\) => \{ setPropertyName\(m\.name\); setPlaceId\(m\.placeId\)/.test(editor))
  }

  console.log("\nOBSERVED DATE + STANDARDISED FEATURES:")
  {
    // The giant "icon" was the marketing base rule stretching the indicator to
    // fill the field. The fix reuses the two classes the CRM already uses for
    // exactly this, defined in globals.css because that rule is unlayered and
    // out-ranks Tailwind utilities.
    const css = read("app/globals.css")
    ok("it is still a real date input (picker still opens)", /<input type="date"/.test(ui))
    ok("…and still bound to observedAt", /value=\{observedAt\}/.test(ui))
    ok("the small-icon class is applied", /className="lb-date-native \[color-scheme:dark\] sb-research-date"/.test(ui))
    ok("…and lb-date-native really sizes the indicator down",
      /input\[type="date"\]\.lb-date-native::-webkit-calendar-picker-indicator \{[\s\S]{0,200}width: 1\.15em/.test(css))
    // The selector MUST be prefixed: a bare .sb-research-date is (0,1,0) and loses
    // to the base input[type="date"] rule (0,1,1) — measured in production as
    // width 851px / font-size 17px with the class applied but overridden.
    ok("the compact rule out-specifies the marketing base rule",
      /input\[type="date"\]\.sb-research-date \{/.test(css))
    ok("the field is compact (140–170px)",
      /input\[type="date"\]\.sb-research-date \{[\s\S]{0,200}width: 15\dpx/.test(css))
    ok("…and does not flex-grow",
      /input\[type="date"\]\.sb-research-date \{[\s\S]{0,200}flex: none/.test(css))
    ok("the old Tailwind indicator hacks are gone",
      !/\[&::-webkit-calendar-picker-indicator\]/.test(ui))
    // Chrome opens the native picker ONLY from the trailing indicator, so clicking
    // the text half of a 150px field looked dead. showPicker() makes the whole
    // control open it.
    ok("clicking anywhere in the field opens the picker",
      /onClick=\{\(e\) => \{ try \{ e\.currentTarget\.showPicker\(\) \} catch \{\} \}\}/.test(ui))
    ok("…on the date input itself, not a wrapper",
      /<input type="date"[\s\S]{0,300}showPicker\(\)/.test(ui))
    ok("…and the whole control reads as clickable",
      /input\[type="date"\]\.sb-research-date \{[^}]*cursor: pointer/.test(css))
    // showPicker throws when the picker is already open (the indicator was clicked)
    // or is unsupported; in both cases native behaviour is already right.
    ok("the throw is swallowed, so the indicator still works", /showPicker\(\) \} catch \{\}/.test(ui))
    // It is still a REAL date input — not a text box with a fake picker.
    ok("it is still type=\"date\"", /<input type="date" aria-label="Observed date"/.test(ui))
    ok("…and storage is untouched: still the plain YYYY-MM-DD onChange",
      /onChange=\{\(e\) => setObservedAt\(e\.target\.value\)\}/.test(ui))
    ok("…with no Date parsing anywhere near the field",
      !/new Date\(observedAt|Date\.parse|toISOString\(\)\.slice/.test(ui.split("type=\"date\"")[1]?.slice(0, 400) ?? ""))

    ok("the Save button got more room", /crm-cta px-10 py-2[^"]*whitespace-nowrap/.test(ui))
    ok("…wider than the original px-6", !/crm-cta px-6 /.test(ui))
    ok("the bottom row wraps instead of overflowing", /flex flex-wrap items-center gap-2/.test(ui))

    ok("Features Observed uses the shared AmenitySelect",
      /<AmenitySelect/.test(ui) && /from "@\/components\/crm\/social\/AmenitySelect"/.test(ui))
    ok("…backed by the SAME canonical bank (no duplicate list)",
      /from "@\/lib\/social\/amenities"/.test(ui) && !/AMENITY_BANK = \[/.test(ui))
    ok("…with the marketing 3-cap lifted", /max=\{25\}/.test(ui))
    ok("the marketing field keeps its cap by default",
      /max = MAX/.test(read("components/crm/social/AmenitySelect.tsx")) &&
      !/max=\{/.test(editor.slice(editor.indexOf("Amenities / Features"), editor.indexOf("Amenities / Features") + 400)))
    ok("every cap check now honours the prop",
      !/value\.length >= MAX|next\.length < MAX/.test(read("components/crm/social/AmenitySelect.tsx")))
    ok("research features persist only in the observation layer",
      /setField\("observed_features", serializeAmenities\(next\)\)/.test(ui))
    ok("…and are never prefilled from marketing amenities",
      !/social_content\.amenities|p\.source\?\.amenities/.test(ui))
  }

  console.log("\nobserved_features ROUND-TRIPS (the five-chips-became-one bug):")
  {
    // The defect: the route normalised EVERY field with .replace(/\s+/g, " "),
    // which eats the "\n" that serializeAmenities writes and parseAmenities splits
    // on. Five selected features came back as one chip, with no comma left for
    // parseAmenities' fallback to find. Measured in production before the fix:
    //   "High Ceilings Floor-to-Ceiling Windows Concrete Flooring Skyline Views Rooftop Pool"

    // Only observed_features is multi-value; everything else must stay single-line.
    ok("the route declares exactly ONE multiline field",
      /MULTILINE_FIELDS = new Set\(\["observed_features"\]\)/.test(route))
    ok("…and the value branches on it",
      /MULTILINE_FIELDS\.has\(field\) \? lines\(incoming\[field\]\) : text\(incoming\[field\]\)/.test(route))
    // The single-line normaliser is UNCHANGED for every other field.
    ok("single-line fields still collapse all whitespace",
      /const text = \(v: unknown, max = 500\)[\s\S]*?replace\(\/\\s\+\/g, " "\)/.test(route))

    // The two pieces that make the multiline normaliser safe. \s includes \n;
    // [^\S\n] is "whitespace except newline", which is the whole fix.
    const SPLIT = String.raw`.split(/\r?\n/)`
    const COLLAPSE = String.raw`.replace(/[^\S\n]+/g, " ")`
    ok("the multiline normaliser splits on newline", route.includes(SPLIT))
    ok("…and collapses horizontal whitespace ONLY (never \\n)", route.includes(COLLAPSE))
    ok("…so it never runs a bare \\s+ collapse over the value",
      !/const lines = [\s\S]*?replace\(\/\\s\+\/g/.test(route))

    // Behavioural: the same pipeline the route now runs, over the real helpers.
    // The two assertions above are what keep this from being a vacuous replica —
    // if the route's pipeline changes, they fail first.
    const normalise = (v: string) =>
      v.split(/\r?\n/).map((l) => l.replace(/[^\S\n]+/g, " ").trim()).filter(Boolean).join("\n")

    const picked = ["High Ceilings", "Floor-to-Ceiling Windows", "Concrete Flooring", "Skyline Views", "Rooftop Pool"]
    const stored = normalise(serializeAmenities(picked))
    ok("5 features store newline-delimited", stored.split("\n").length === 5, JSON.stringify(stored))
    const back = parseAmenities(stored)
    ok("…and reload as 5 separate chips", back.length === 5, JSON.stringify(back))
    ok("…in the order they were picked", back.join("|") === picked.join("|"), back.join("|"))

    // The pre-fix normaliser, asserted to actually reproduce the bug — otherwise
    // the test above could pass for the wrong reason.
    const broken = serializeAmenities(picked).replace(/\s+/g, " ").trim()
    ok("the OLD normaliser really did collapse them to one chip",
      parseAmenities(broken).length === 1)

    // Multi-word features must not be shredded, and internal padding still cleans up.
    ok("a single feature stays one chip", parseAmenities(normalise(serializeAmenities(["Rooftop Pool"]))).length === 1)
    ok("padded lines are trimmed, not dropped",
      parseAmenities(normalise("  High Ceilings  \n\tRooftop   Pool  ")).join("|") === "High Ceilings|Rooftop Pool")
    ok("blank lines do not become empty chips",
      parseAmenities(normalise("High Ceilings\n\n\nRooftop Pool")).length === 2)
    // A fully blank value is still "not an observation" → deleted, not stored as "".
    ok("an all-whitespace value normalises to nothing", normalise(" \n \t \n ") === "")
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
