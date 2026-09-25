// Property Search Agent — enrichment write POLICY (pure, deterministic).
//
// The allowlist of enrichment-writable fields, the commission firewall, the image
// fields, field-aware source authority, and the per-field write decision. No I/O.
// The writer (writer.ts) enforces these; nothing else may write property_catalog.

import { fieldOwnership, isMalformedValue } from "./ownership"
import type { FieldProvenance, SourceType, VerificationStatus } from "./types"

// ── Commission is NEVER writable by this enrichment path (this checkpoint) ──
// Public-web sources are firewalled explicitly; no authoritative commission
// provider has been approved yet, so trusted sources are also declined here.
export const COMMISSION_FIELDS = new Set(["send_commission", "escort_commission", "bonus_flat"])

// Public source types have ZERO authority over commission (structural firewall).
export const PUBLIC_SOURCE_TYPES = new Set<SourceType>([
  "public_web",
  "official_property_site",
  "official_management_site",
  "google_places",
])

// ── Image columns are governed by image_selection_state, NOT the field allowlist ──
export const IMAGE_FIELDS = new Set([
  "property_image_url",
  "property_image_url_backup",
  "property_image_source",
  "property_image_source_detail",
  "property_image_status",
  "property_image_checked_at",
  "property_image_verified_at",
])

// ── Enrichment-writable identity / geo / contact / intelligence fields ──
// Commission + image + provenance columns are deliberately EXCLUDED.
export const ENRICHMENT_WRITABLE_FIELDS = new Set([
  "property_name",
  "address",
  "city",
  "state",
  "market",
  "neighborhood",
  "location",
  "location_keywords",
  "amenity_keywords",
  "zip",
  "latitude",
  "longitude",
  "property_type",
  "website_url",
  "tour_url",
  "apply_url",
  "availability_url",
  "google_rating",
  "google_review_count",
  "leasing_email",
  "phone",
  "management_company",
  "current_special",
])

// Canonical scalar fields added by the ~380-field reconciliation (migration
// 20260925000008). All enrichment-writable (subject to preserve-by-default); commission
// and image columns remain excluded. Arrays (text[]) and jsonb pass through as raw values.
export const CANONICAL_SCALAR_FIELDS = [
  "year_built", "year_renovated", "amenities_url", "floor_plans_url", "tour_scheduling_url",
  "management_company_id", "locator_status_detail", "beds_min", "beds_max", "baths_min", "baths_max",
  "sqft_min", "sqft_max", "rent_min", "rent_max", "studio_starting_rent", "onebr_starting_rent",
  "twobr_starting_rent", "threebr_starting_rent", "fourbr_starting_rent", "fivebr_plus_starting_rent",
  "townhome_starting_rent", "penthouse_starting_rent", "loft_starting_rent", "has_live_pricing",
  "pricing_last_verified", "inventory_type", "classification_tags", "structural_scale", "property_grade",
  "loft_type", "townhome_overlap", "rental_home_candidate", "dwelling_attachment", "stories",
  "penthouse_available", "deposit_amount", "deposit_range", "flexible_deposit_option",
  "deposit_alternative_provider", "deposit_alternative_notes", "application_fee", "admin_fee",
  "holding_fee", "short_term_lease_available", "minimum_lease_term", "maximum_lease_term",
  "available_lease_terms", "month_to_month_available", "lease_term_notes",
  "airbnb_short_term_rental_allowed", "subletting_allowed", "short_term_rental_notes", "pets_allowed",
  "breed_restrictions", "restricted_breeds_notes", "pet_weight_limit", "pet_weight_limit_per_pet",
  "number_of_pets_allowed", "pet_deposit", "pet_fee", "monthly_pet_rent", "pet_policy_notes",
  "pet_policy_last_verified", "all_bills_paid", "water_included", "electric_included", "gas_included",
  "trash_included", "sewer_included", "cable_included", "utility_package_flat_fee", "utility_notes",
  "internet_included", "internet_provider", "fiber_available", "internet_package_required",
  "internet_fee", "internet_notes", "internet_last_verified", "leasing_hours", "tour_hours_notes",
  "hours_last_verified", "furnished_units_available", "furniture_package_available",
  "corporate_housing_available", "corporate_lease_allowed", "washer_dryer_included",
  "washer_dryer_connections", "affordable_program", "affordable_income_cap", "affordable_rent_limitation",
  "affordable_program_eligibility", "affordable_program_notes", "affordable_program_last_verified",
  "escort_required", "tour_requirement_status", "escort_notes", "escort_requirement_last_verified",
  "submarket", "cross_streets", "nearby_freeways", "nearby_landmark_1", "nearby_landmark_1_type",
  "nearby_landmark_2", "nearby_landmark_2_type", "nearby_landmark_3", "nearby_landmark_3_type",
  "source_type", "confidence_status", "verification_notes", "classification_status",
  "management_company_website_url",
] as const
for (const f of CANONICAL_SCALAR_FIELDS) ENRICHMENT_WRITABLE_FIELDS.add(f)

// Field-aware source authority (foundation, not a ranking engine). Trusted internal
// sources are authoritative for any non-commission field; public sources are
// authoritative only for the fields they legitimately own.
const GOOGLE_AUTHORITATIVE = new Set([
  "google_rating",
  "google_review_count",
  "latitude",
  "longitude",
  "address",
  "city",
  "state",
  "zip",
])
const PROPERTY_SITE_AUTHORITATIVE = new Set([
  "property_name",
  "market",
  "neighborhood",
  "location",
  "location_keywords",
  "amenity_keywords",
  "property_type",
  "website_url",
  "tour_url",
  "apply_url",
  "availability_url",
  "leasing_email",
  "phone",
  "management_company",
  "current_special",
  "address",
  "city",
  "state",
  "zip",
])
const TRUSTED_SOURCE_TYPES = new Set<SourceType>([
  "trusted_locator_source",
  "trusted_brokerage_source",
  "manual_verified",
])

export function isAuthoritative(field: string, sourceType: SourceType): boolean {
  if (TRUSTED_SOURCE_TYPES.has(sourceType)) return true // trusted internal wins for any non-commission field
  if (sourceType === "google_places") return GOOGLE_AUTHORITATIVE.has(field)
  if (sourceType === "official_property_site" || sourceType === "official_management_site") {
    return PROPERTY_SITE_AUTHORITATIVE.has(field)
  }
  return false // public_web, unknown → authoritative for nothing
}

const ALL_SOURCE_TYPES = new Set<SourceType>([
  "official_property_site",
  "official_management_site",
  "google_places",
  "trusted_locator_source",
  "trusted_brokerage_source",
  "manual_verified",
  "public_web",
  "unknown",
])
const ALL_VERIFICATION = new Set<VerificationStatus>(["verified", "inferred", "unverified", "unknown"])

export function isKnownSourceType(s: string): s is SourceType {
  return ALL_SOURCE_TYPES.has(s as SourceType)
}
export function isKnownVerification(v: string): v is VerificationStatus {
  return ALL_VERIFICATION.has(v as VerificationStatus)
}

/** Normalize a candidate value to the text we compare/store; null when "no value". */
export function toStoredText(value: unknown): string | null {
  if (value === null || value === undefined) return null
  if (Array.isArray(value)) return value.length ? JSON.stringify(value) : null
  const s = typeof value === "string" ? value : String(value)
  return s.trim() === "" ? null : s
}

export type Decision = { outcome: "write" | "skip"; reason: string }

/**
 * Decide whether a NON-commission, NON-image writable field should be written.
 *
 * PRESERVE-BY-DEFAULT: only an EMPTY/MISSING field is eligible for verified
 * enrichment. ANY populated value — legacy (no field-level provenance), tracked
 * (has provenance but not verified), or verified — is preserved by default. The
 * mere ABSENCE of field-level provenance is NOT authorization to overwrite a
 * populated value. A verified+authoritative candidate that DISAGREES with a
 * populated value is surfaced as a conflict (skip + report), never auto-applied.
 * Refreshing/replacing a populated field is deferred to a separate field-specific
 * freshness/refresh policy (not implemented in this checkpoint). Pure.
 */
export function decideFieldWrite(args: {
  field: string
  candidateText: string | null
  candidateSourceType: SourceType
  candidateVerification: VerificationStatus
  currentText: string | null
  currentProvenance: FieldProvenance | null
}): Decision {
  const { field, candidateText, candidateSourceType, candidateVerification, currentText, currentProvenance } = args

  // Missing research result → NEVER write / never null out an existing value.
  if (candidateText === null) return { outcome: "skip", reason: "no_value" }

  // Only verified/inferred candidates may write; unverified/unknown never fill.
  if (candidateVerification === "unverified" || candidateVerification === "unknown") {
    return { outcome: "skip", reason: "candidate_unverified" }
  }

  // EMPTY / MISSING → eligible for verified enrichment.
  if (currentText === null) return { outcome: "write", reason: "fill_empty" }

  // Idempotent: identical value → no-op.
  if (currentText === candidateText) return { outcome: "skip", reason: "unchanged" }

  // Numeric-equal → no-op. Uses a tight RELATIVE epsilon so last-ULP float noise
  // (e.g. lat/long 29.6601004 vs 29.660100399999997 from two Google responses, or 4 vs
  // 4.0) is treated as identical, while a genuine change (rating 4.4→4.3, a price delta)
  // still writes. 1e-9 relative catches representation noise only (~1e-15 relative).
  {
    const cn = Number(currentText)
    const kn = Number(candidateText)
    if (
      Number.isFinite(cn) && Number.isFinite(kn) &&
      Math.abs(cn - kn) <= 1e-9 * Math.max(Math.abs(cn), Math.abs(kn), 1)
    ) {
      return { outcome: "skip", reason: "unchanged" }
    }
  }

  // OWNERSHIP-AWARE REFRESH (targeted; does NOT weaken preserve-by-default for stable
  // curated data). Two narrow cases where a newer authoritative value legitimately wins:
  //   1) Google-owned data (rating, reviews, geo, canonical address) refreshed from
  //      google_places — Google owns it, so a newer verified value supersedes a stale one.
  //   2) A demonstrably MALFORMED existing value (e.g. location_keywords ["svg",...]) may
  //      be replaced by a verified authoritative candidate — invalid data is not curated
  //      intelligence worth protecting.
  if (
    fieldOwnership(field) === "google_owned" &&
    candidateSourceType === "google_places" &&
    candidateVerification === "verified"
  ) {
    return { outcome: "write", reason: "refresh_google_owned" }
  }
  if (
    isMalformedValue(field, currentText) &&
    candidateVerification === "verified" &&
    isAuthoritative(field, candidateSourceType)
  ) {
    return { outcome: "write", reason: "replace_malformed" }
  }

  // POPULATED → preserve by default. Classify the existing value for the reason:
  //   legacy   = no field-level provenance (e.g. pre-provenance pilot rows)
  //   verified = current provenance is verified
  //   tracked  = has provenance but not verified (inferred/unverified/unknown)
  const state = !currentProvenance
    ? "legacy"
    : currentProvenance.verificationStatus === "verified"
      ? "verified"
      : "tracked"

  // A verified + field-authoritative candidate that DISAGREES → surface a conflict.
  const authoritative = isAuthoritative(field, candidateSourceType)
  if (candidateVerification === "verified" && authoritative) {
    return { outcome: "skip", reason: `conflict_${state}` }
  }
  // Otherwise preserve the populated value (no refresh policy authorizes a change yet).
  return { outcome: "skip", reason: `preserve_${state}` }
}
