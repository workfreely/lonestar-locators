// QUICK MATCH — a READ-ONLY dry run against whatever database the environment points at.
//
// Run: set -a && . ./.env.local && set +a && npx tsx scripts/quickMatch/dryRun.ts
//      set -a && . ./.env.local && set +a && npx tsx scripts/quickMatch/dryRun.ts 102
// (the second form prints the full conflict / verify detail for one client)
//
// WHAT IT DOES NOT DO: it writes nothing. No recommendation row, no stamp, no message. It reads
// the curated collection and the lead rows, runs the real engine in-process, and prints what
// would be drafted. That is the only honest way to answer "how many properties will an agent
// actually see", because the answer depends entirely on how much screening data is on record.
//
// It reads property_catalog DIRECTLY rather than through lb_quick_match_candidates, so it works
// before that function's migration is applied — the column list below is the function's own, and
// a divergence between the two would show up as a missing field in the output rather than
// silently changing a verdict.
import { createClient } from "@supabase/supabase-js"
import { runQuickMatch, type QuickMatchProperty } from "@/lib/quickMatch"
import { resolveClientNeeds } from "@/lib/quickMatch/needs"
import { DEFAULT_COLLECTION } from "@/lib/quickMatch/collection"
import { OFFENSE_TYPES, type OffenseType } from "@/lib/propertyIntel/approvalCriteria"

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required (.env.local).")
  process.exit(1)
}
const db = createClient(url, key, { auth: { persistSession: false } })

/** The same columns lb_quick_match_candidates returns. */
const CATALOG_COLUMNS = [
  "place_id", "property_name", "address", "zip", "website_url", "property_image_url",
  "google_rating", "current_special", "quick_match_collection",
  "credit_minimum_status", "credit_minimum_score", "credit_observed_approval_score",
  "credit_screening_notes",
  "broken_lease_status", "broken_lease_min_age_years", "broken_lease_balance_requirement",
  "broken_lease_max_balance", "broken_lease_positive_history_required",
  "eviction_status", "eviction_min_age_years", "eviction_balance_requirement",
  "eviction_positive_history_required",
  "rental_debt_status", "rental_debt_balance_requirement", "rental_debt_max_balance",
  "felony_policy", "felony_min_age_years", "felony_restrictions",
  "misdemeanor_policy", "misdemeanor_min_age_years", "misdemeanor_restrictions",
  "criminal_restricted_offense_types", "criminal_lookback_basis", "background_screening_notes",
  "screening_additional_deposit", "screening_risk_fee", "screening_guarantor_program",
  "screening_requirements_checked_at",
  "beds_min", "beds_max", "onebr_starting_rent", "twobr_starting_rent", "threebr_starting_rent",
  "rent_min", "latitude", "longitude",
].join(", ")

const s = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v : null)
const n = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null
  const x = Number(v)
  return Number.isFinite(x) ? x : null
}
const b = (v: unknown): boolean | null => (typeof v === "boolean" ? v : null)
const anyOf = <T extends string>(v: unknown): T | null => s(v) as T | null
const offense = (v: unknown): OffenseType[] | null => {
  if (!Array.isArray(v)) return null
  const have = new Set(v.map((x) => String(x).trim()))
  const kept = OFFENSE_TYPES.filter((t) => have.has(t))
  return kept.length ? [...kept] : null
}

const toProperty = (r: Record<string, unknown>): QuickMatchProperty => ({
  placeId: String(r.place_id), propertyName: s(r.property_name), address: s(r.address), zip: s(r.zip),
  websiteUrl: s(r.website_url), imageUrl: s(r.property_image_url), googleRating: n(r.google_rating),
  currentSpecial: s(r.current_special), quickMatchCollection: s(r.quick_match_collection),
  creditMinimumStatus: s(r.credit_minimum_status), creditMinimumScore: n(r.credit_minimum_score),
  creditObservedApprovalScore: n(r.credit_observed_approval_score), creditScreeningNotes: s(r.credit_screening_notes),
  brokenLeaseStatus: anyOf(r.broken_lease_status), brokenLeaseMinAgeYears: n(r.broken_lease_min_age_years),
  brokenLeaseBalanceRequirement: anyOf(r.broken_lease_balance_requirement),
  brokenLeaseMaxBalance: n(r.broken_lease_max_balance),
  brokenLeasePositiveHistoryRequired: b(r.broken_lease_positive_history_required),
  evictionStatus: anyOf(r.eviction_status), evictionMinAgeYears: n(r.eviction_min_age_years),
  evictionBalanceRequirement: anyOf(r.eviction_balance_requirement),
  evictionPositiveHistoryRequired: b(r.eviction_positive_history_required),
  rentalDebtStatus: anyOf(r.rental_debt_status),
  rentalDebtBalanceRequirement: anyOf(r.rental_debt_balance_requirement),
  rentalDebtMaxBalance: n(r.rental_debt_max_balance),
  felonyPolicy: anyOf(r.felony_policy), felonyMinAgeYears: n(r.felony_min_age_years),
  felonyRestrictions: s(r.felony_restrictions),
  misdemeanorPolicy: anyOf(r.misdemeanor_policy), misdemeanorMinAgeYears: n(r.misdemeanor_min_age_years),
  misdemeanorRestrictions: s(r.misdemeanor_restrictions),
  criminalRestrictedOffenseTypes: offense(r.criminal_restricted_offense_types),
  criminalLookbackBasis: anyOf(r.criminal_lookback_basis),
  backgroundScreeningNotes: s(r.background_screening_notes),
  screeningAdditionalDeposit: s(r.screening_additional_deposit), screeningRiskFee: s(r.screening_risk_fee),
  screeningGuarantorProgram: s(r.screening_guarantor_program),
  screeningRequirementsCheckedAt: s(r.screening_requirements_checked_at),
  bedsMin: n(r.beds_min), bedsMax: n(r.beds_max),
  onebrStartingRent: n(r.onebr_starting_rent), twobrStartingRent: n(r.twobr_starting_rent),
  threebrStartingRent: n(r.threebr_starting_rent), rentMin: n(r.rent_min),
  latitude: n(r.latitude), longitude: n(r.longitude),
})

async function main() {
  const only = process.argv[2] ? String(process.argv[2]) : null

  const { data: catalog, error: cErr } = await db
    .from("property_catalog").select(CATALOG_COLUMNS).eq("quick_match_collection", DEFAULT_COLLECTION)
  if (cErr) { console.error("catalog read failed:", cErr.message); process.exit(1) }
  const properties = (catalog ?? []).map((r) => toProperty(r as Record<string, unknown>))

  // HOW MUCH IS ON RECORD. Printed first, because it is what decides everything below.
  const filled = (f: (p: QuickMatchProperty) => unknown) => properties.filter((p) => f(p) !== null).length
  console.log(`\nCOLLECTION "${DEFAULT_COLLECTION}" — ${properties.length} members`)
  console.log(`  credit minimum        ${filled((p) => p.creditMinimumScore)}   credit status ${filled((p) => p.creditMinimumStatus)}`)
  console.log(`  broken lease status   ${filled((p) => p.brokenLeaseStatus)}   eviction status ${filled((p) => p.evictionStatus)}   rental debt ${filled((p) => p.rentalDebtStatus)}`)
  console.log(`  felony policy         ${filled((p) => p.felonyPolicy)}   misdemeanor policy ${filled((p) => p.misdemeanorPolicy)}`)
  console.log(`  restricted offenses   ${filled((p) => p.criminalRestrictedOffenseTypes)}   lookback basis ${filled((p) => p.criminalLookbackBasis)}`)
  console.log(`  1BR / 2BR / 3BR rent  ${filled((p) => p.onebrStartingRent)} / ${filled((p) => p.twobrStartingRent)} / ${filled((p) => p.threebrStartingRent)}`)

  let leadQuery = db.from("leads").select("*")
  if (only) leadQuery = leadQuery.eq("id", only)
  const { data: leads, error: lErr } = await leadQuery
  if (lErr) { console.error("lead read failed:", lErr.message); process.exit(1) }

  let eligibleCount = 0
  for (const lead of leads ?? []) {
    const needs = resolveClientNeeds(lead as Record<string, unknown>)
    const r = runQuickMatch({ lead: lead as Record<string, unknown>, properties, needs, travelMinutes: {} })
    if (!r.eligibility.eligible) continue
    eligibleCount++
    const l = lead as Record<string, unknown>
    console.log(`\n── lead ${l.id} — ${l.first_name ?? ""} ${l.last_name ?? ""}`.trimEnd())
    console.log(`   triggers: ${r.eligibility.reasons.join(" | ")}`)
    console.log(`   asks for: ${needs.bedrooms ?? "?"}BR, budget ${needs.budgetMax ?? "?"}, ZIP ${needs.destinationZip ?? "—"}, areas ${needs.namedAreas.join("/") || "—"}`)
    console.log(`   considered ${r.consideredCount}  →  strong ${r.tierCounts.strong_candidate}, verify ${r.tierCounts.needs_verification}, no-policy ${r.tierCounts.curated_only}, excluded ${r.excludedMismatches.length}`)
    console.log(`   WOULD DRAFT ${r.recommendations.length}:`)
    for (const rec of r.recommendations) {
      console.log(`     • [${rec.tier}] ${rec.property.propertyName} (${rec.property.zip ?? "?"})`)
      if (only) {
        for (const c of rec.conflicts) console.log(`         conflict: ${c}`)
        for (const u of rec.unverified.slice(0, 6)) console.log(`         verify:   ${u}`)
      }
    }
    for (const x of r.excludedMismatches) {
      console.log(`     ✗ EXCLUDED ${x.propertyName}: ${x.why.join("; ")}`)
    }
  }
  console.log(`\n${eligibleCount} of ${(leads ?? []).length} clients are eligible. NOTHING WAS WRITTEN.\n`)
}

void main()
