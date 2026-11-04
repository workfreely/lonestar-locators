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
for (const dir of ["lib/matching", "lib/leads", "lib/quickMatch", "apps/beast-companion/src", "packages/companion-shared/src", "app/smart-lead-form"]) {
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

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"} — ${pass} passed, ${fail} failed\n`)
process.exit(fail === 0 ? 0 : 1)
