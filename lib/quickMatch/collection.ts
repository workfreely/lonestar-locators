// Quick Match — loading the curated collection.
//
// ── THE ONLY QUERY QUICK MATCH MAKES ────────────────────────────────────────────────────────
// One call to lb_quick_match_candidates, an ADDITIVE function. It does not touch
// lb_property_catalog_by_ids, which is Unleash Beast's read path, and it cannot return a
// non-member because membership is its WHERE clause.
//
// It runs under the CALLER'S OWN session, never the service role: the function is granted to
// `authenticated` and deliberately not to `anon`, so a client-facing page cannot reach screening
// data even by guessing the name.
//
// ── DEGRADING HONESTLY ──────────────────────────────────────────────────────────────────────
// Until the migration is applied, a missing function returns `readPathMissing: true` and an
// empty list rather than throwing, so the workspace can say plainly that the read path has not
// shipped yet instead of showing an empty section that looks like "no matches". Silence and
// "nothing found" must never look the same here.
import type { SupabaseClient } from "@supabase/supabase-js"
import type {
  QuickMatchProperty, PolicyStatus, BalanceRequirement, CriminalPolicy, LookbackBasis, OffenseType,
} from "./types"
import {
  APPROVAL_STATUSES, BALANCE_REQUIREMENTS, CRIMINAL_POLICIES, LOOKBACK_BASES, OFFENSE_TYPES,
} from "@/lib/propertyIntel/approvalCriteria"

export const DEFAULT_COLLECTION = "san_antonio"

export type CollectionLoad = {
  properties: QuickMatchProperty[]
  /** True when lb_quick_match_candidates does not exist yet in this database. */
  readPathMissing: boolean
  error: string | null
}

const s = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v : null)
const n = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null
  const x = Number(v)
  return Number.isFinite(x) ? x : null
}
const b = (v: unknown): boolean | null => (typeof v === "boolean" ? v : null)

/** A stored token is trusted only if it is IN the editor's own vocabulary. A value outside it —
 *  a legacy import, a hand-edited row — is read as unknown rather than reasoned over, because an
 *  unrecognised policy is exactly the case where a guess does damage. */
const oneOf = <T extends string>(vocab: readonly string[], v: unknown): T | null => {
  const t = s(v)
  return t !== null && vocab.includes(t) ? (t as T) : null
}

/** The offense-category array, filtered to known tokens and put in the canonical order. */
const offenseTypes = (v: unknown): OffenseType[] | null => {
  if (!Array.isArray(v)) return null
  const have = new Set(v.map((x) => String(x).trim()))
  const kept = OFFENSE_TYPES.filter((t) => have.has(t))
  return kept.length > 0 ? [...kept] : null
}

export async function loadQuickMatchCollection(
  supabase: SupabaseClient,
  collection: string = DEFAULT_COLLECTION,
): Promise<CollectionLoad> {
  const { data, error } = await supabase.rpc("lb_quick_match_candidates", { p_collection: collection })
  if (error) {
    // PostgREST reports an unknown function as PGRST202, and Postgres as 42883.
    const missing = error.code === "PGRST202" || error.code === "42883"
      || /could not find the function|does not exist/i.test(error.message ?? "")
    return { properties: [], readPathMissing: missing, error: missing ? null : error.message }
  }
  const rows = (data ?? []) as Array<Record<string, unknown>>
  return {
    readPathMissing: false,
    error: null,
    properties: rows.map((r) => ({
      placeId: String(r.place_id),
      propertyName: s(r.property_name),
      address: s(r.address),
      zip: s(r.zip),
      websiteUrl: s(r.website_url),
      imageUrl: s(r.property_image_url),
      googleRating: n(r.google_rating),
      currentSpecial: s(r.current_special),
      quickMatchCollection: s(r.quick_match_collection),

      creditMinimumStatus: s(r.credit_minimum_status),
      creditMinimumScore: n(r.credit_minimum_score),
      creditObservedApprovalScore: n(r.credit_observed_approval_score),
      creditScreeningNotes: s(r.credit_screening_notes),

      brokenLeaseStatus: oneOf<PolicyStatus>(APPROVAL_STATUSES, r.broken_lease_status),
      brokenLeaseMinAgeYears: n(r.broken_lease_min_age_years),
      brokenLeaseBalanceRequirement: oneOf<BalanceRequirement>(BALANCE_REQUIREMENTS, r.broken_lease_balance_requirement),
      brokenLeaseMaxBalance: n(r.broken_lease_max_balance),
      brokenLeasePositiveHistoryRequired: b(r.broken_lease_positive_history_required),

      evictionStatus: oneOf<PolicyStatus>(APPROVAL_STATUSES, r.eviction_status),
      evictionMinAgeYears: n(r.eviction_min_age_years),
      evictionBalanceRequirement: oneOf<BalanceRequirement>(BALANCE_REQUIREMENTS, r.eviction_balance_requirement),
      evictionPositiveHistoryRequired: b(r.eviction_positive_history_required),

      rentalDebtStatus: oneOf<PolicyStatus>(APPROVAL_STATUSES, r.rental_debt_status),
      rentalDebtBalanceRequirement: oneOf<BalanceRequirement>(BALANCE_REQUIREMENTS, r.rental_debt_balance_requirement),
      rentalDebtMaxBalance: n(r.rental_debt_max_balance),

      felonyPolicy: oneOf<CriminalPolicy>(CRIMINAL_POLICIES, r.felony_policy),
      felonyMinAgeYears: n(r.felony_min_age_years),
      felonyRestrictions: s(r.felony_restrictions),
      misdemeanorPolicy: oneOf<CriminalPolicy>(CRIMINAL_POLICIES, r.misdemeanor_policy),
      misdemeanorMinAgeYears: n(r.misdemeanor_min_age_years),
      misdemeanorRestrictions: s(r.misdemeanor_restrictions),
      criminalRestrictedOffenseTypes: offenseTypes(r.criminal_restricted_offense_types),
      criminalLookbackBasis: oneOf<LookbackBasis>(LOOKBACK_BASES, r.criminal_lookback_basis),
      backgroundScreeningNotes: s(r.background_screening_notes),

      screeningAdditionalDeposit: s(r.screening_additional_deposit),
      screeningRiskFee: s(r.screening_risk_fee),
      screeningGuarantorProgram: s(r.screening_guarantor_program),
      screeningRequirementsCheckedAt: s(r.screening_requirements_checked_at),

      bedsMin: n(r.beds_min),
      bedsMax: n(r.beds_max),
      onebrStartingRent: n(r.onebr_starting_rent),
      twobrStartingRent: n(r.twobr_starting_rent),
      threebrStartingRent: n(r.threebr_starting_rent),
      rentMin: n(r.rent_min),
      latitude: n(r.latitude),
      longitude: n(r.longitude),
    })),
  }
}
