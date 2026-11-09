/**
 * CRIMINAL BACKGROUND — the Approval Criteria group, its vocabulary, and the five things it must
 * never do.
 *
 * WHAT THIS GUARDS.
 *
 *  1. UNKNOWN IS NOT "NOT CONSIDERED". NULL means nobody has asked. A property with nothing
 *     entered must never read as one that refuses a felony — refusing IS a finding, and 4,201 of
 *     4,207 properties have no criminal answer at all.
 *
 *  2. AN EMPTY CATEGORY SET IS NOT A STATEMENT. Selecting no offense categories clears to NULL.
 *     It is never stored as an empty array, which would read as "nothing is restricted" — a claim
 *     nobody made. The database CHECK makes the empty array unstorable so the two cannot blur.
 *
 *  3. A CHARGE IS NOT A CONVICTION. The lookback carries its own basis (offense date or
 *     conviction date) and NULL when the office did not say. Nothing defaults it, and nothing
 *     infers an age from the prose the import left behind.
 *
 *  4. NO AUTOMATED JOB CAN REACH THESE COLUMNS. All nine are owner-only and firewalled, exactly
 *     as commission and the credit answer are. An import must not be able to overwrite what a
 *     leasing office told a human being.
 *
 *  5. NOTHING ELSE MOVED. Quick Match, Unleash Beast, Top Pick, the Smart Form, Beast Companion
 *     and the lead-side criminal columns are untouched, and the sixteen live approval columns
 *     still read and save exactly as before.
 *
 * Run: npx tsx scripts/tests/criminalBackground.test.ts   (pure — reads source + exported values)
 */
import { existsSync, readFileSync } from "node:fs"
import {
  APPROVAL_FIELDS, APPROVAL_COLUMNS, CRIMINAL_COLUMNS, CRIMINAL_KEYS, CRIMINAL_POLICIES,
  LOOKBACK_BASES, OFFENSE_TYPES, FELONY_POLICY_OPTIONS, MISDEMEANOR_POLICY_OPTIONS,
  LOOKBACK_BASIS_OPTIONS, OFFENSE_TYPE_OPTIONS, APPROVAL_TEXT_MAX, APPROVAL_NOTES_MAX,
  MAX_AGE_YEARS, parseApprovalValue, approvalValueToInput, offenseTypesToInput, toggleOffenseType,
  planApprovalWrites,
} from "@/lib/propertyIntel/approvalCriteria"
import {
  ENRICHMENT_WRITABLE_FIELDS, CANONICAL_SCALAR_FIELDS, OWNER_SCREENING_FIELDS,
  OWNER_ONLY_FIELDS, OWNER_CLEARABLE_FIELDS, decideFieldWrite,
} from "@/lib/propertyEnrichment/policy"

let pass = 0
let fail = 0
const ok = (l: string, c: boolean, d = "") => {
  if (c) { pass++; console.log(`  ✓ ${l}`) }
  else { fail++; console.log(`  ✗ ${l}${d ? `\n      ${d}` : ""}`) }
}
/** Comments quote rejected designs and old wording, so assertions run against CODE. */
const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n")
const read = (p: string) => readFileSync(p, "utf8")
const migration = (name: string) =>
  read(existsSync(`supabase/migrations/${name}`) ? `supabase/migrations/${name}` : `supabase/prepared/${name}`)

const panel = strip(read("components/crm/MapPropertyEditor.tsx"))
const route = strip(read("app/api/admin/owner/property-pricing/route.ts"))
const ddl = migration("20261112000000_property_criminal_background.sql")
const backfill = migration("20261112000001_criminal_background_backfill.sql")

const COLUMNS = [
  "felony_policy", "felony_min_age_years", "felony_restrictions",
  "misdemeanor_policy", "misdemeanor_min_age_years", "misdemeanor_restrictions",
  "criminal_restricted_offense_types", "criminal_lookback_basis", "background_screening_notes",
]
/** The seven names property_approval_policy already uses. Reuse is the point, so it is asserted. */
const REUSED = [
  "felony_policy", "felony_min_age_years", "felony_restrictions",
  "misdemeanor_policy", "misdemeanor_min_age_years", "misdemeanor_restrictions",
  "background_screening_notes",
]

console.log("\nCRIMINAL BACKGROUND — editor group, vocabulary, firewall\n")

console.log("the nine columns, and which of them are reused names")
ok("CRIMINAL_COLUMNS is exactly the nine", CRIMINAL_COLUMNS.slice().sort().join(",") === COLUMNS.slice().sort().join(","),
  CRIMINAL_COLUMNS.join(","))
ok("nine payload keys, one per column", CRIMINAL_KEYS.length === 9)
ok("every criminal key carries group:'criminal'", CRIMINAL_KEYS.every((k) => APPROVAL_FIELDS[k].group === "criminal"))
ok("seven of the nine are property_approval_policy's own names",
  REUSED.every((c) => CRIMINAL_COLUMNS.includes(c)) && REUSED.length === 7)
ok("the two new ones are the category set and the lookback basis",
  CRIMINAL_COLUMNS.filter((c) => !REUSED.includes(c)).sort().join(",") ===
  "criminal_lookback_basis,criminal_restricted_offense_types")
ok("the migration adds all nine", COLUMNS.every((c) => new RegExp(`add column if not exists\\s+${c}\\b`).test(ddl)))
ok("…and it is ADDITIVE ONLY — no drop, no update, no delete, no default",
  !/\bdrop\s+(column|table)\b/i.test(ddl) && !/^\s*update\s/im.test(ddl) &&
  !/^\s*delete\s/im.test(ddl) && !/\bset\s+default\b/i.test(ddl))
ok("the category column is text[], not text", /criminal_restricted_offense_types\s+text\[\]/.test(ddl))

console.log("\n1. UNKNOWN IS NOT 'NOT CONSIDERED'")
ok("blank parses as the deliberate clear to NULL",
  JSON.stringify(parseApprovalValue("criminalPolicy", "")) === '{"write":null}')
ok("null parses as NULL", JSON.stringify(parseApprovalValue("criminalPolicy", null)) === '{"write":null}')
ok("Unknown is the FIRST option on both policies and its value is empty",
  FELONY_POLICY_OPTIONS[0].value === "" && FELONY_POLICY_OPTIONS[0].label === "Unknown" &&
  MISDEMEANOR_POLICY_OPTIONS[0].value === "" && MISDEMEANOR_POLICY_OPTIONS[0].label === "Unknown")
ok("'unknown' is not a storable token on either policy",
  !CRIMINAL_POLICIES.includes("unknown" as never) && "bad" in parseApprovalValue("criminalPolicy", "unknown"))
ok("the DDL constrains both policies to the three tokens",
  /felony_policy in \('considered','case_by_case','not_considered'\)/.test(ddl) &&
  /misdemeanor_policy in \('considered','case_by_case','not_considered'\)/.test(ddl))
ok("…and allows NULL explicitly in both",
  /felony_policy is null/.test(ddl) && /misdemeanor_policy is null/.test(ddl))
ok("no column has a default, so nothing is guessed for 4,207 properties",
  !/add column if not exists\s+\w+\s+[\w\[\]]+\s+default/i.test(ddl))

console.log("\n2. AN EMPTY CATEGORY SET IS NOT A STATEMENT")
ok("no categories selected → NULL, not []",
  JSON.stringify(parseApprovalValue("offenseTypes", "")) === '{"write":null}')
ok("one category → a one-element array",
  JSON.stringify(parseApprovalValue("offenseTypes", "assault")) === '{"write":["assault"]}')
ok("several → canonical order, whatever order they arrive in",
  JSON.stringify(parseApprovalValue("offenseTypes", "sex_offense,drug,assault")) ===
  '{"write":["drug","assault","sex_offense"]}')
ok("duplicates collapse", JSON.stringify(parseApprovalValue("offenseTypes", "dwi,dwi")) === '{"write":["dwi"]}')
ok("an unknown category is REJECTED, never dropped", "bad" in parseApprovalValue("offenseTypes", "assault,arson"))
ok("…so four of five picked categories can never be stored as the policy",
  "bad" in parseApprovalValue("offenseTypes", "drug,dwi,assault,theft_fraud,arson"))
ok("the DDL forbids the empty array", /cardinality\(criminal_restricted_offense_types\) > 0/.test(ddl))
ok("…and constrains membership to the six the panel offers",
  /<@ array\['drug','dwi','assault','theft_fraud','sex_offense','other'\]::text\[\]/.test(ddl))
ok("the six tokens and the six options are the same set, in the same order",
  OFFENSE_TYPE_OPTIONS.map((o) => o.value).join(",") === OFFENSE_TYPES.join(","))
ok("no option offers an empty value — Unknown is the absence of chips, not a chip",
  OFFENSE_TYPE_OPTIONS.every((o) => o.value !== ""))

console.log("\n   the set survives the round trip through one string-shaped state")
ok("a stored array reads back as the canonical joined string",
  approvalValueToInput(["sex_offense", "drug"]) === "drug,sex_offense")
ok("NULL reads back as blank, never as a category", approvalValueToInput(null) === "")
ok("joined string → array → joined string is identity", (() => {
  const joined = "drug,assault,other"
  const parsed = parseApprovalValue("offenseTypes", joined)
  return "write" in parsed && approvalValueToInput(parsed.write) === joined
})())
ok("toggle adds in canonical order", toggleOffenseType("sex_offense", "drug") === "drug,sex_offense")
ok("toggle removes", toggleOffenseType("drug,sex_offense", "drug") === "sex_offense")
ok("toggling the last one off empties the string → the clear", toggleOffenseType("drug", "drug") === "")
ok("offenseTypesToInput ignores junk rather than storing it", offenseTypesToInput("arson,drug") === "drug")

console.log("\n3. A CHARGE IS NOT A CONVICTION")
ok("the lookback basis has exactly two tokens", LOOKBACK_BASES.join(",") === "offense_date,conviction_date")
ok("Unknown is the first option and empty", LOOKBACK_BASIS_OPTIONS[0].value === "" &&
  LOOKBACK_BASIS_OPTIONS[0].label === "Unknown")
ok("'unknown' is not a token", "bad" in parseApprovalValue("lookbackBasis", "unknown"))
ok("a basis is never defaulted in code", !/criminalLookbackBasis['"]?\s*[:=]\s*['"](offense_date|conviction_date)/.test(panel) &&
  !/criminal_lookback_basis['"]?\s*[:=]\s*['"](offense_date|conviction_date)/.test(route))
ok("…and never defaulted in the DDL", !/criminal_lookback_basis\s+text\s+default/i.test(ddl))
ok("the backfill does NOT write a basis", !/criminal_lookback_basis\s*=/.test(strip(backfill)))
ok("the backfill does NOT write a category set", !/criminal_restricted_offense_types\s*=/.test(strip(backfill)))
ok("the backfill parses no age out of prose — no regexp, no substring, no cast of text to int",
  !/~|regexp_|substring|::int/i.test(strip(backfill)))
ok("the backfill cannot overwrite an agent's value — every assignment is coalesce(existing, …)",
  (strip(backfill).match(/coalesce\(c\./g) ?? []).length >= 7)

console.log("\n   the ages themselves: years, whole, bounded")
ok("0 is a real answer, not blank", JSON.stringify(parseApprovalValue("age", "0")) === '{"write":0}')
ok("7 years", JSON.stringify(parseApprovalValue("age", "7")) === '{"write":7}')
ok(`${MAX_AGE_YEARS} is the ceiling`, "write" in parseApprovalValue("age", String(MAX_AGE_YEARS)))
ok("21 is rejected", "bad" in parseApprovalValue("age", String(MAX_AGE_YEARS + 1)))
ok("a decade typed as 300 is rejected", "bad" in parseApprovalValue("age", "300"))
ok("negative is rejected", "bad" in parseApprovalValue("age", "-1"))
ok("'7 years' is rejected rather than coerced", "bad" in parseApprovalValue("age", "7 years"))
ok("the DDL bounds both ages 0–20",
  /felony_min_age_years\s+between 0 and 20/.test(ddl) && /misdemeanor_min_age_years\s+between 0 and 20/.test(ddl))

console.log("\n   felony and misdemeanor stay separate throughout")
ok("separate policy columns", APPROVAL_FIELDS.felonyPolicy.column === "felony_policy" &&
  APPROVAL_FIELDS.misdemeanorPolicy.column === "misdemeanor_policy")
ok("separate age columns", APPROVAL_FIELDS.felonyMinAgeYears.column === "felony_min_age_years" &&
  APPROVAL_FIELDS.misdemeanorMinAgeYears.column === "misdemeanor_min_age_years")
ok("separate restriction columns", APPROVAL_FIELDS.felonyRestrictions.column === "felony_restrictions" &&
  APPROVAL_FIELDS.misdemeanorRestrictions.column === "misdemeanor_restrictions")
ok("a felony policy write never names a misdemeanor column", (() => {
  const { writes } = planApprovalWrites({ felonyPolicy: "not_considered" })
  return writes.length === 1 && writes[0].column === "felony_policy"
})())

console.log("\n4. NO AUTOMATED JOB CAN REACH THESE COLUMNS")
ok("all nine are owner-screening fields", COLUMNS.every((c) => OWNER_SCREENING_FIELDS.has(c)))
ok("all nine are owner-only", COLUMNS.every((c) => OWNER_ONLY_FIELDS.has(c)))
ok("all nine are owner-CLEARABLE, so unknown is reachable again", COLUMNS.every((c) => OWNER_CLEARABLE_FIELDS.has(c)))
ok("none is enrichment-writable", COLUMNS.every((c) => !ENRICHMENT_WRITABLE_FIELDS.has(c)))
ok("none is a canonical scalar field", COLUMNS.every((c) => !CANONICAL_SCALAR_FIELDS.includes(c)))
{
  // THE FIREWALL IS IN THE WRITER, not in decideFieldWrite — which answers the different question
  // "may this value replace that one?" and would happily fill an empty column. So the gate is
  // asserted where it actually is: one branch, taken for every OWNER_ONLY field, which demands
  // request-level authorization AND the internal source before anything else is considered.
  const writer = strip(read("lib/propertyEnrichment/writer.ts"))
  ok("the writer gates the whole owner-only set in one branch, before the allowlist",
    /if \(OWNER_ONLY_FIELDS\.has\(cand\.field\)\) \{/.test(writer) &&
    writer.indexOf("OWNER_ONLY_FIELDS.has(cand.field)) {") < writer.indexOf("!ENRICHMENT_WRITABLE_FIELDS.has(cand.field)"))
  ok("…and that branch admits only an authorized request with the internal manual source",
    /ownerAuthorized === true[\s\S]{0,200}cand\.sourceType === "manual_verified"[\s\S]{0,120}OWNER_ONLY_FIELDS\.has\(cand\.field\)/.test(writer))
  ok("so an automated candidate for these columns is refused twice over: owner-only, and absent " +
     "from the enrichment allowlist",
    COLUMNS.every((c) => OWNER_ONLY_FIELDS.has(c) && !ENRICHMENT_WRITABLE_FIELDS.has(c)))
}
ok("preserve-by-default still refuses a PUBLIC source over a stored policy", COLUMNS.every((c) =>
  decideFieldWrite({
    field: c, candidateText: "considered", currentText: "not_considered",
    candidateSourceType: "google_places", candidateVerification: "verified",
    candidateOwnerOverride: true, currentProvenance: null,
  }).outcome !== "write"))
ok("an OWNER correction with the internal source type IS allowed — preserve-by-default would " +
   "otherwise freeze a policy the office has since changed",
  decideFieldWrite({
    field: "felony_policy", candidateText: "case_by_case", currentText: "not_considered",
    candidateSourceType: "manual_verified", candidateVerification: "inferred",
    candidateOwnerOverride: true, currentProvenance: undefined,
  }).outcome === "write")
ok("…and an owner CLEAR returns a stored policy to unknown",
  decideFieldWrite({
    field: "felony_policy", candidateText: null, currentText: "case_by_case",
    candidateSourceType: "manual_verified", candidateVerification: "inferred",
    candidateOwnerOverride: true, candidateOwnerClear: true, currentProvenance: undefined,
  }).outcome === "write")
ok("the editor writes property_catalog, never property_approval_policy",
  !/property_approval_policy/.test(route) && !/property_approval_policy/.test(panel))
ok("the route probes the criminal columns separately and refuses clearly when absent",
  /readCriminalCriteria/.test(route) && /criminal_columns_missing/.test(route))
ok("…with its own 409, so a live requirement field still saves while criminal is unapplied",
  /approval_columns_missing/.test(route) && /criminal_columns_missing/.test(route) &&
  /requirementKeys/.test(route) && /criminalKeys/.test(route))

console.log("\n5. NOTHING ELSE MOVED")
ok("the sixteen live approval columns are unchanged in number", APPROVAL_COLUMNS.length === 16)
ok("…and carry no criminal column", APPROVAL_COLUMNS.every((c) => !CRIMINAL_COLUMNS.includes(c)))
ok("the two column lists do not overlap at all",
  new Set([...APPROVAL_COLUMNS, ...CRIMINAL_COLUMNS]).size === APPROVAL_COLUMNS.length + CRIMINAL_COLUMNS.length)
// lib/quickMatch IS NOW A READER, BY REQUEST. It was on this list while the criminal columns
// were a property record nothing consumed; the approved Quick Match workflow (2026-11-04) asks
// it to evaluate "felony/misdemeanor policies, offense categories, and lookback periods", so the
// isolation this sweep protects has moved rather than loosened. What it still protects is the
// claim that matters: UNLEASH BEAST SEARCH, ITS FILTERS AND ITS RANKING, the Beast Companion,
// the shared package and the public Smart Form read none of these columns. Those stay on the
// list, and lib/quickMatch gets the narrow, named exception below.
for (const dir of ["lib/matching", "lib/leads", "apps/beast-companion/src", "packages/companion-shared/src", "app/smart-lead-form"]) {
  if (!existsSync(dir)) { ok(`${dir} — not present, nothing to check`, true); continue }
  const hits = (function walk(d: string): string[] {
    const { readdirSync, statSync } = require("node:fs") as typeof import("node:fs")
    const out: string[] = []
    for (const e of readdirSync(d)) {
      const p = `${d}/${e}`
      if (statSync(p).isDirectory()) { out.push(...walk(p)); continue }
      if (!/\.(ts|tsx)$/.test(p)) continue
      const body = strip(read(p))
      // The lead-side columns (leads.criminal_background, criminal_charge, felony_age,
      // misdemeanor_age) are a DIFFERENT set and are deliberately not matched here.
      if (CRIMINAL_COLUMNS.some((c) => body.includes(c))) out.push(p)
    }
    return out
  })(dir)
  ok(`${dir} does not read the new property columns`, hits.length === 0, hits.join(", "))
}
// ── THE WHOLE REPOSITORY, NOT A LIST OF DIRECTORIES ─────────────────────────────────────────
// The sweep above names six places. This one names the only files ALLOWED to mention the nine
// columns or the nine payload keys and then checks everything else — so a future reader anywhere
// in the tree is caught, and so "the migration changes no search or recommendation behaviour" is
// a measured fact rather than a list somebody remembered to extend.
{
  const { readdirSync, statSync } = require("node:fs") as typeof import("node:fs")
  const ALLOWED = [
    "lib/propertyIntel/approvalCriteria.ts",          // the vocabulary itself
    "lib/propertyEnrichment/policy.ts",               // the owner firewall's field list
    "app/api/admin/owner/property-pricing/route.ts",  // the one endpoint that reads and writes them
    "components/crm/MapPropertyEditor.tsx",           // the one panel that draws them
    // NOT a reader of the new columns — a NAME COLLISION, and the one that proves the design.
    // This is the curated importer that put the eight live answers into the LEGACY table. It
    // names felony_policy and misdemeanor_policy, which are now columns on both tables, and it
    // writes them through writeWideRow("property_approval_policy", …) — the table is an explicit
    // argument. Asserted below rather than taken on trust.
    "scripts/propertyIntel/qual_apply.ts",
    // QUICK MATCH, the authorised consumer. Three files, each with one job:
    "lib/quickMatch/types.ts",        // the shape, re-exporting the editor's own vocabularies
    "lib/quickMatch/collection.ts",   // the read: RPC rows → that shape, tokens validated
    "lib/quickMatch/screening.ts",    // the rules, asserted in scripts/tests/quickMatch.test.ts
    // A READ-ONLY dry-run harness. It names the columns because it reads property_catalog
    // directly — so it works before the RPC's migration is applied — and it writes nothing.
    "scripts/quickMatch/dryRun.ts",
    // THE CLIENT-FACING LABEL, and the narrowest reader of all. It reads felonyPolicy and
    // misdemeanorPolicy — and nothing else about a criminal record — to decide whether a
    // property has recorded that it reviews one individually. What can leave it is a single
    // fixed string, "Background Case-by-Case": no charge, no age, no restriction text, no agent
    // note, nothing about the client. It is added here deliberately; see
    // scripts/leads/quickMatchHighlights.test.ts, which asserts those limits.
    "lib/quickMatch/highlights.ts",
    "scripts/leads/quickMatchHighlights.test.ts",
    // The backfill suite. It names the columns ONLY in the QuickMatchProperty fixture every
    // Quick Match test builds — all nine are null in it — because a Recommendation cannot be
    // constructed without them. No assertion in it reads a criminal field, and the backfill it
    // tests reaches them solely through screeningHighlight, already allowed above.
    "scripts/leads/quickMatchBackfill.test.ts",
    // The location-correction suite, for exactly the same reason: the nine columns appear only in
    // its all-null QuickMatchProperty fixture, which a Recommendation cannot be built without.
    // It asserts about ZIPs, reference landmarks and drive times; nothing in it reads a criminal
    // field, and the correction path it tests never looks at one.
    "scripts/leads/quickMatchLocationDriveTime.test.ts",
  ]
  const SKIP = /^(node_modules|\.next|\.git|dist|build|coverage|supabase|docs|reports|scripts\/tests)/
  const walk = (d: string): string[] => {
    const out: string[] = []
    for (const e of readdirSync(d)) {
      const p = d === "." ? e : `${d}/${e}`
      if (SKIP.test(p)) continue
      let st; try { st = statSync(p) } catch { continue }
      if (st.isDirectory()) { out.push(...walk(p)); continue }
      if (/\.(ts|tsx)$/.test(p)) out.push(p)
    }
    return out
  }
  const NAMES = [...CRIMINAL_COLUMNS, ...CRIMINAL_KEYS]
  const readers = walk(".").filter((f) => !ALLOWED.includes(f))
    .filter((f) => { const b = strip(read(f)); return NAMES.some((n) => b.includes(n)) })
  ok(`no module outside the seven that own or consume these fields reads any of them (${walk(".").length} files swept)`,
    readers.length === 0, readers.join(", "))

  // The exception is NARROW, and these two assertions are what keep it so. Quick Match may read
  // the columns; it may not write them, and it may not reach them through any path but the
  // function that filters to the curated collection.
  for (const f of ["lib/quickMatch/collection.ts", "lib/quickMatch/screening.ts", "lib/quickMatch/types.ts",
                   "lib/quickMatch/criminal.ts", "lib/quickMatch/ranking.ts", "lib/quickMatch/index.ts",
                   "lib/quickMatch/persist.ts", "lib/quickMatch/needs.ts",
                   "lib/quickMatch/highlights.ts"]) {
    if (!existsSync(f)) { ok(`${f} — not present`, true); continue }
    const body = strip(read(f))
    ok(`${f} never writes property_catalog`,
      !/\.from\(\s*["'\`]property_catalog/.test(body) && !/update\(|upsert\(.*property_catalog/.test(body)
      || !/property_catalog/.test(body))
  }
  ok("the only property read Quick Match makes is the curated-collection function",
    (() => {
      const body = strip(read("lib/quickMatch/collection.ts"))
      return /lb_quick_match_candidates/.test(body)
        && !/lb_property_catalog_by_ids/.test(body)
        && !/\.from\(\s*["'\`]property_catalog/.test(body)
    })())

  // And the matching filters specifically, by name, because that is what the question is about.
  for (const f of ["lib/matching/filters/approvalFilter.ts", "lib/matching/managementApprovalFilter.ts",
                   "lib/matching/filters/finalRankingEngine.ts", "lib/matching/propertyTypeFilter.ts"]) {
    if (!existsSync(f)) { ok(`${f} — not present`, true); continue }
    const body = strip(read(f))
    ok(`${f} reads none of the nine`, !NAMES.some((n) => body.includes(n)))
  }
  // The lead-side columns it DOES read are a different set with different names, which is why
  // adding property columns cannot reach it. Asserted so the distinction stays deliberate.
  // lib/matching/approvalFilter.ts is the one that actually screens a lead against a property.
  // It reads the LEAD's criminal answers — criminal_background, criminal_charge, felony_age —
  // which are different columns on a different table with different names. That is why adding
  // nine property columns cannot reach it, and why the names were kept apart.
  const af = strip(read("lib/matching/approvalFilter.ts"))
  ok("the lead-side filter still reads the LEAD's own criminal answers",
    af.includes("criminal_background") && af.includes("felony_age"))
  ok("…and none of the nine property columns, whose names deliberately do not collide with them",
    !NAMES.some((n) => af.includes(n)))

  // THE LEGACY IMPORTER. Adding the seven shared names to OWNER_ONLY_FIELDS must not break the
  // import that filled property_approval_policy: that firewall is enforced in enrichProperty
  // (writer.ts) against property_catalog, and the importer writes the policy table through
  // writeWideRow, which does not consult it.
  {
    const qa = strip(read("scripts/propertyIntel/qual_apply.ts"))
    ok("the importer writes the LEGACY table by name, and never property_catalog",
      qa.includes('writeWideRow("property_approval_policy"') && !qa.includes('"property_catalog"'))
    ok("…and the only field it sends through the firewalled writer is affordable_program",
      (qa.match(/enrichProperty\(/g) || []).length === 1 && qa.includes('field: "affordable_program"'))
    const ww = strip(read("lib/propertyIntel/wideWriter.ts"))
    ok("writeWideRow does not consult OWNER_ONLY_FIELDS, so the import path is unchanged",
      !ww.includes("OWNER_ONLY_FIELDS") && !ww.includes("ownerCommissionWrite"))
  }
}

ok("the panel's change set is gated per group, not by one flag",
  /spec\.group === "criminal" \? loaded\.criminalAvailable : loaded\.approvalAvailable/.test(panel))
ok("the group is drawn where it was asked for — after Eviction, before Deposits & Risk Fees", (() => {
  const ev = panel.indexOf("Eviction</h4>")
  const cb = panel.indexOf("Criminal Background</h4>")
  const dep = panel.indexOf("Deposits &amp; Risk Fees</h4>")
  return ev > 0 && cb > ev && dep > cb
})())
ok("no helper paragraph was added to the group", (() => {
  const start = panel.indexOf("Criminal Background</h4>")
  const end = panel.indexOf("Deposits &amp; Risk Fees</h4>")
  const body = panel.slice(start, end)
  // The amber migration notice sits OUTSIDE the group, above it; inside, labels only.
  return !/text-\[10px\] leading-snug text-\[var\(--crm-text-muted\)\]/.test(body)
})())
ok("the Smart Form has no new question", (() => {
  if (!existsSync("app/smart-lead-form/_lib/types.ts")) return true
  const t = read("app/smart-lead-form/_lib/types.ts")
  return !CRIMINAL_COLUMNS.some((c) => t.includes(c))
})())

console.log("\n   free text is capped, not silently truncated")
ok(`restrictions cap at ${APPROVAL_TEXT_MAX}`, "write" in parseApprovalValue("text", "x".repeat(APPROVAL_TEXT_MAX)) &&
  "bad" in parseApprovalValue("text", "x".repeat(APPROVAL_TEXT_MAX + 1)))
ok(`notes cap at ${APPROVAL_NOTES_MAX}, matching credit_screening_notes`,
  "write" in parseApprovalValue("notes", "x".repeat(APPROVAL_NOTES_MAX)) &&
  "bad" in parseApprovalValue("notes", "x".repeat(APPROVAL_NOTES_MAX + 1)))
ok("prose is stored as typed, only trimmed", (() => {
  const r = parseApprovalValue("text", "  Nothing assault related  ")
  return "write" in r && r.write === "Nothing assault related"
})())

console.log("\n   the whole group plans as one save")
{
  const { keys, writes, rejected } = planApprovalWrites({
    felonyPolicy: "case_by_case", felonyMinAgeYears: "7", felonyRestrictions: "Nothing assault related",
    misdemeanorPolicy: "considered", misdemeanorMinAgeYears: "", misdemeanorRestrictions: "",
    criminalRestrictedOffenseTypes: "assault,sex_offense", criminalLookbackBasis: "conviction_date",
    backgroundScreeningNotes: "Corporate review above 10 years.",
  })
  ok("all nine keys are seen", keys.length === 9)
  ok("nothing is rejected", rejected.length === 0, rejected.join(","))
  ok("the two blanks are CLEARS, not values", writes.filter((w) => w.clear).length === 2 &&
    writes.filter((w) => w.clear).every((w) => w.value === null))
  ok("the category set travels as an array", (() => {
    const w = writes.find((w) => w.column === "criminal_restricted_offense_types")!
    return Array.isArray(w.value) && w.value.join(",") === "assault,sex_offense"
  })())
  ok("the age travels as a number", writes.find((w) => w.column === "felony_min_age_years")!.value === 7)
}
{
  const { writes, rejected } = planApprovalWrites({ felonyPolicy: "Case-by-Case", felonyMinAgeYears: "7" })
  ok("the DISPLAY form of a token is rejected, not coerced", rejected.includes("felonyPolicy"))
  ok("…and the good field beside it is still planned, so the agent is told about both",
    writes.length === 1 && writes[0].column === "felony_min_age_years")
}

// ── WHAT THE 420px RENDER FOUND ─────────────────────────────────────────────────────────────
// Both of these were real defects caught by rendering the shipped component at the panel's own
// width (w-full max-w-[420px] sm:w-[420px]), not by reading the source. They are asserted here
// so the fix cannot be undone by a later edit that only looks reasonable in a wide window.
{
  // A policy cell is 186px and shares its top row with the provenance age line ("Verified:
  // Oct 27, 2026", 96px). At "Misdemeanor policy" the label was 93px, so label + gap + age came
  // to exactly 186, the row wrapped, and that select sat 17px below its neighbour. The group
  // heading already says Criminal Background, which is why Eviction's one select is just "Policy".
  ok('the policy labels are the SHORT ones that fit beside an age line at 186px',
    /aSelect\("felonyPolicy", "Felony",/.test(panel) &&
    /aSelect\("misdemeanorPolicy", "Misdemeanor",/.test(panel))

  // The restrictions carry the leasing office's own sentence. The longest already stored is 57
  // characters; a 184px half-column shows 27 of them, and reading that sentence is how it becomes
  // a structured age and category. Full width shows all 57.
  const group = panel.slice(panel.indexOf("Criminal Background</h4>"), panel.indexOf("RENTAL DEBT"))
  const restrictionsRow = group.slice(group.indexOf('aInput("felonyRestrictions"'))
    .slice(0, group.slice(group.indexOf('aInput("felonyRestrictions"')).indexOf("Background notes"))
  ok("the two restrictions inputs are full width, not a two-column pair",
    !/grid-cols-2/.test(restrictionsRow))
  ok("…while the policies and the ages above them still ARE paired",
    (group.match(/grid grid-cols-2 gap-3/g) || []).length === 2)

  // THE MIN-AGE LABELS. "Misdemeanor minimum age (years)" measured 184px of a 186px cell — a
  // 2px margin, so it rendered on one line at exactly 420px and wrapped at any narrower panel
  // width, dropping its input 16.5px below the felony input beside it. "Min. Age (YRS)" is 78px
  // and clears 156px, the narrowest the panel gets. Both say the same thing because the column
  // each sits under already names the offence, and the pair is gated as one fragment, so an
  // unlabelled lone column cannot occur.
  ok("both min-age labels are the short form that fits a 186px cell",
    (group.match(/aInput\("(?:felony|misdemeanor)MinAgeYears", "Min\. Age \(YRS\)"/g) || []).length === 2)
  ok("…and neither keeps the long label that wrapped",
    !/minimum age \(years\)/i.test(group))
}

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"} — ${pass} passed, ${fail} failed\n`)
process.exit(fail === 0 ? 0 : 1)
