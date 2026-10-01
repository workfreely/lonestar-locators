// PASS 2 — the combined area selection limit.
//
// The rule: at most 2 areas IN TOTAL across Preferred Neighborhoods
// (leads.neighborhoods) and Nearby Areas (leads.submarkets). Not 2 in each.
//
// Six surfaces can write these columns, and Edit Client writes DIRECTLY to Supabase
// from the browser rather than through /api/leads/submit — so this suite checks the
// shared rule, every surface that must consult it, and that no surface keeps a
// private copy of the arithmetic.
//
// Run: npx tsx scripts/leads/areaLimit.test.ts
import { readFileSync } from "node:fs"
import path from "node:path"
import {
  MAX_AREA_SELECTIONS,
  countAreaSelections,
  isAtAreaLimit,
  verdictForWrite,
  areaLimitHint,
} from "@/lib/leads/areaLimit"
import { MAX_LOCATIONS } from "@/lib/formOptions"

let pass = 0, fail = 0
const ok = (l: string, c: boolean, d = "") => {
  if (c) { pass++; console.log(`  ✓ ${l}${d ? ` — ${d}` : ""}`) } else { fail++; console.log(`  ✗ ${l}${d ? ` — ${d}` : ""}`) }
}
const read = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8")
const strip = (t: string) =>
  t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "").replace(/(^|[^:])\/\/.*$/gm, "$1")

console.log("THE LIMIT IS 2, COMBINED:")
ok("the cap is 2", MAX_AREA_SELECTIONS === 2, String(MAX_AREA_SELECTIONS))
ok("there is ONE numeric source", MAX_AREA_SELECTIONS === MAX_LOCATIONS)
ok("0 areas is valid", countAreaSelections("", "") === 0)
ok("1 Preferred + 1 Nearby counts as 2", countAreaSelections("Downtown", "Boerne") === 2)
ok("2 Preferred + 0 Nearby counts as 2", countAreaSelections("Downtown, UTSA", "") === 2)
ok("0 Preferred + 2 Nearby counts as 2", countAreaSelections("", "Boerne, Schertz") === 2)
// The bug this prevents: a per-section cap of 2 would let 2+2 = 4 through.
ok("it is NOT 2 per section", countAreaSelections("Downtown, UTSA", "Boerne, Schertz") === 4)
ok("null columns count as zero", countAreaSelections(null, null) === 0)
ok("arrays work as well as CSV", countAreaSelections(["A", "B"], []) === 2)
ok("blank entries and stray commas are not counted",
  countAreaSelections("Downtown, , ,", "") === 1)

console.log("\nTHE THREE ALLOWED SHAPES, AND THE THIRD SELECTION BLOCKED:")
for (const [n, s, label] of [
  ["", "", "0 areas"],
  ["Downtown", "", "1 Preferred"],
  ["", "Boerne", "1 Nearby"],
  ["Downtown, UTSA", "", "2 Preferred + 0 Nearby"],
  ["", "Boerne, Schertz", "0 Preferred + 2 Nearby"],
  ["Downtown", "Boerne", "1 Preferred + 1 Nearby"],
] as const) {
  ok(`allowed: ${label}`, verdictForWrite(n, s).ok)
}
// The user's own examples.
ok("allowed: Downtown + UTSA", verdictForWrite("Downtown, UTSA", "").ok)
ok("allowed: La Cantera/The Rim + Boerne", verdictForWrite("La Cantera/The Rim", "Boerne").ok)
ok("allowed: Westover Hills + Schertz", verdictForWrite("Westover Hills", "Schertz").ok)
ok("REFUSED: Downtown + UTSA + Schertz", !verdictForWrite("Downtown, UTSA", "Schertz").ok)
ok("REFUSED: 3 in one column", !verdictForWrite("Downtown, UTSA, Southtown", "").ok)
ok("REFUSED: 12 areas (the legacy Select All shape)",
  !verdictForWrite("All of Houston, Downtown Houston, Midtown, Montrose, The Heights, Medical Center, Museum District, River Oaks, Galleria, Washington Ave, East Downtown (EaDo), Greenway / Upper Kirby", "").ok)
{
  const v = verdictForWrite("A, B, C", "")
  ok("the refusal states the count and the limit",
    !v.ok && v.count === 3 && v.limit === 2 && /at most 2/.test(v.message))
}

console.log("\nADDING IS REFUSED AT THE CAP; REMOVING STAYS AVAILABLE:")
ok("not at the limit with 1", !isAtAreaLimit("Downtown", ""))
ok("at the limit with 2", isAtAreaLimit("Downtown", "Boerne"))
// `>=`, not `===`, is what makes the legacy case work with no special case.
ok("an over-cap legacy lead is ALSO 'at' the limit", isAtAreaLimit("A, B, C, D", ""))

console.log("\nLEGACY LEADS WITH >2 ARE NEVER TRUNCATED:")
// 9 of 26 production leads are over the cap; three hold 12.
ok("a legacy lead reducing 12 → 5 is allowed", verdictForWrite("A, B, C, D, E", "", 12).ok)
ok("a legacy lead reducing 12 → 2 is allowed", verdictForWrite("A, B", "", 12).ok)
ok("a legacy lead reducing 3 → 2 is allowed", verdictForWrite("A, B", "", 3).ok)
ok("holding steady at 5 is REFUSED", !verdictForWrite("A, B, C, D, E", "", 5).ok)
ok("growing 5 → 6 is REFUSED", !verdictForWrite("A, B, C, D, E, F", "", 5).ok)
ok("once at 2, the normal cap applies again", !verdictForWrite("A, B, C", "", 2).ok)
{
  const v = verdictForWrite("A, B, C, D, E", "", 5)
  ok("the legacy message says to remove areas, not that they were dropped",
    !v.ok && /Remove areas/.test(v.message) && /5 saved areas/.test(v.message))
}
ok("the rule never returns a trimmed list — only a verdict",
  !("neighborhoods" in (verdictForWrite("A, B, C", "") as object)))

console.log("\nTHE SERVER ROUTE ENFORCES IT (not just the browser):")
{
  const route = strip(read("app/api/leads/submit/route.ts"))
  ok("/api/leads/submit calls the shared rule", /verdictForWrite\(/.test(route))
  ok("it pushes a validation error rather than trimming",
    /errors\.push\(\{ field: "neighborhoods", message: areaVerdict\.message \}\)/.test(route))
  ok("it does not quietly slice the array", !/\.slice\(0,\s*(2|MAX)/.test(route))

  // THE BYPASS THIS PASS CLOSES: `neighborhoods` was a NARRATIVE field, so a
  // resubmission stored `${old}; ${new}` — over the cap, and malformed, because
  // every reader splits these columns on commas.
  ok("neighborhoods is no longer concatenated on resubmission",
    /NARRATIVE_FIELDS = \["notes"\] as const/.test(route))
  ok("both area columns are scalars (newest wins, history recorded)",
    /neighborhoods: "Desired Areas"/.test(route) && /submarkets: "Nearby Areas"/.test(route))
  const narrativeBlock = route.slice(route.indexOf("NARRATIVE_FIELDS ="), route.indexOf("SCALAR_LABELS"))
  ok("no area column remains in the narrative set", !/neighborhoods|submarkets/.test(narrativeBlock))
}

console.log("\nEDIT CLIENT WRITES DIRECT TO SUPABASE — so it checks too:")
{
  const modal = strip(read("components/LeadFormModal.tsx"))
  ok("it updates leads directly (the reason a client-side gate is needed)",
    /from\("leads"\)[\s\S]{0,60}\.update\(patch\)/.test(modal))
  ok("handleSave consults the shared rule", /verdictForWrite\(/.test(modal))
  ok("it passes the lead's CURRENT count, so a legacy lead can reduce",
    /countAreaSelections\(lead\.neighborhoods, lead\.submarkets\)/.test(modal))
  ok("it refuses the save instead of writing a trimmed patch",
    /if \(!areaVerdict\.ok\) \{\s*alert\(areaVerdict\.message\)\s*return/.test(modal))
}

console.log("\nEVERY PICKER USES THE SHARED PREDICATE — no private arithmetic:")
for (const f of [
  "components/LeadFields.tsx",
  "app/smart-lead-form/_components/form/sections/LeadFormFields.tsx",
  "app/components/ContactForm.tsx",
  "app/components/LandingForm.tsx",
]) {
  const src = strip(read(f))
  const name = f.split("/").pop()
  ok(`${name} calls isAtAreaLimit`, /isAtAreaLimit\(/.test(src))
  // A hand-rolled `a.length + b.length >= N` is how one surface drifts from the rule.
  ok(`${name} keeps no private count`,
    !/neighborhoods\.length \+ \w*\.?submarkets\.length >=/.test(src))
}

console.log("\nTHE NUMBER IS NEVER TYPED INTO COPY:")
ok("the hint is derived", areaLimitHint() === "up to 2 total (Preferred Neighborhoods + Nearby Areas)")
for (const f of [
  "components/LeadFields.tsx",
  "app/smart-lead-form/_components/form/sections/LeadFormFields.tsx",
  "app/components/ContactForm.tsx",
  "app/components/LandingForm.tsx",
]) {
  const src = strip(read(f))
  ok(`${f.split("/").pop()} renders areaLimitHint()`, /areaLimitHint\(\)/.test(src))
  ok(`${f.split("/").pop()} has no hardcoded "up to 3" areas copy`,
    !/up to 3 (areas|total)/.test(src))
}

console.log("\nSELECT ALL CANNOT CREATE 3+ (it is gone from both legacy forms):")
for (const f of ["app/components/ContactForm.tsx", "app/components/LandingForm.tsx"]) {
  const src = read(f)
  const name = f.split("/").pop()
  ok(`${name} has no Select All control`, !/Select All/.test(src))
  ok(`${name} never bulk-writes the whole option list`,
    !/neighborhoods: \[\.\.\.cityNeighborhoods\[formData\.city\]\]/.test(src))
  ok(`${name} never bulk-writes every submarket`,
    !/submarkets: \["New Braunfels", "Boerne", "Schertz", "San Marcos"\]/.test(src))
  // "All of {City}" was a checkbox that selected everything, plus an auto-promote
  // that turned n-1 selections into all n. Both are what produced the three live
  // 12-area leads.
  ok(`${name} has no "All of {City}" option`, !/"All of (Austin|Dallas|Houston|San Antonio)"/.test(src))
  ok(`${name} has no select-everything branch`, !/value\.startsWith\("All of"\)/.test(src))
  ok(`${name} keeps Deselect All (reducing is always allowed)`, /Deselect All/.test(src))
  ok(`${name} disables a checkbox at the cap`, /isAtAreaLimit\(formData\.neighborhoods, formData\.submarkets\)/.test(src))
}

console.log("\nMATCHING IS UNTOUCHED BY THIS PASS:")
{
  const multi = strip(read("lib/propertyExplorer/multiArea.ts"))
  const sug = strip(read("lib/propertyExplorer/suggestions.ts"))
  // The intake limit and the search fan-out are different numbers on purpose: the
  // cap is what a client may PICK, MAX_UNLEASH_AREAS is how many centroids the Map
  // will search for a lead that already holds more.
  ok("MAX_UNLEASH_AREAS is still 3", /MAX_UNLEASH_AREAS = 3/.test(multi))
  ok("MAX_SUGGESTIONS is still 5 (Pass 3)", /MAX_SUGGESTIONS = 5/.test(sug))
  ok("areaLimit does not import the matcher", !/propertyExplorer/.test(strip(read("lib/leads/areaLimit.ts"))))
  ok("multiArea does not import the intake limit", !/areaLimit|formOptions/.test(multi))
}

console.log("\nTHE DB TRIGGER IS THE LAYER NO SURFACE CAN BYPASS:")
{
  const sql = read("supabase/manual/20261008_area_selection_limit.sql")
  ok("a BEFORE INSERT OR UPDATE trigger exists",
    /before insert or update of neighborhoods, submarkets on public\.leads/i.test(sql))
  ok("the limit matches the app constant", /v_limit    constant integer := 2/.test(sql))
  ok("a strictly decreasing over-cap row is allowed", /v_new_count < v_old_count/.test(sql))
  ok("an unrelated edit to an over-cap row is allowed",
    /is not distinct from old\.neighborhoods/.test(sql))
  // A CHECK constraint would reject even a REDUCING update to the 9 legacy rows.
  ok("it is a trigger, not a CHECK constraint", !/add constraint .* check/i.test(sql))
  ok("the migration rewrites no data",
    !/^\s*(update|delete)\s+public\.leads/im.test(sql.split("-- ─── VERIFICATION")[0]))
}

console.log(`\nArea selection limit: ${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
