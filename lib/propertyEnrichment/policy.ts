// Property Search Agent — enrichment write POLICY (pure, deterministic).
//
// The allowlist of enrichment-writable fields, the commission firewall, the image
// fields, field-aware source authority, and the per-field write decision. No I/O.
// The writer (writer.ts) enforces these; nothing else may write property_catalog.

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
