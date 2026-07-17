// Management Approval Filter — v1 framework, scoring intentionally disabled.
//
// Purpose: classify whether a property's management company is known to be
// approval-friendly. Completely independent of, and not called by, the
// Location Filter (components/crm/LeadInsights.tsx LOCATION FILTER block).
//
// Also unrelated to the pre-existing lib/matching/approvalFilter.ts, which
// classifies APPROVED/REVIEW/DENIED from a lead's credit/eviction/felony
// fields — a different concern despite the similar name. This module is
// solely about management-company reputation.
//
// v1 status: framework only. getManagementApprovalBonus() always returns
// approvalBonus: 0, regardless of match. Verified against production data
// at the time this was written: management_company is populated on only
// 7 of 196 properties, and none of those 7 values match any company on
// APPROVAL_FRIENDLY_MANAGEMENT_COMPANIES (or a plausible alias of one) —
// so real scoring is deferred until the field is populated more broadly.
// See the TODO comments below for exactly where that scoring will go.

// ─── Approval-friendly management companies (hardcoded per business list) ──

const APPROVAL_FRIENDLY_MANAGEMENT_COMPANY_NAMES = [
  "Greystar",
  "Management Support",
  "WillowBridge Management",
  "Embrey",
  "Shelter Corp",
  "Lynd",
  "Churchill Forge",
  "Shippy Management",
  "Portico",
  "RPM",
  "United Apartment Group (UAG)",
  "Magnolia Property Company",
  "ResProp",
  "The Finger Companies",
  "Abbey Residential",
  "The Tipton Group",
]

// ─── Normalization ──────────────────────────────────────────────────────────
// Trim + lowercase so comparisons are whitespace- and case-insensitive.

export function normalizeManagementCompanyName(name: string | null | undefined): string {
  return String(name ?? "").trim().toLowerCase()
}

// Alias → canonical-name mapping, applied before the approval-friendly Set
// lookup (e.g. a property stored as "RPM Living" would resolve to "RPM").
//
// Deliberately empty right now: per instruction, aliases are only added
// once confirmed to actually exist in the database. As of this audit, no
// property's management_company value matches any alias spelling of the
// list above — not "United Apartment Group", not "UAG", not "RPM Living".
// Add entries here only after verifying a real matching value in
// production, e.g.:
//   "united apartment group": "united apartment group (uag)",
//   "uag": "united apartment group (uag)",
//   "rpm living": "rpm",
const MANAGEMENT_COMPANY_ALIASES: Record<string, string> = {}

const APPROVAL_FRIENDLY_MANAGEMENT_COMPANIES = new Set<string>(
  APPROVAL_FRIENDLY_MANAGEMENT_COMPANY_NAMES.map(normalizeManagementCompanyName)
)

function resolveCanonicalManagementCompany(rawName: string | null | undefined): string | null {
  const normalized = normalizeManagementCompanyName(rawName)
  if (!normalized) return null
  return MANAGEMENT_COMPANY_ALIASES[normalized] ?? normalized
}

export function isApprovalFriendlyManagementCompany(rawName: string | null | undefined): boolean {
  const resolved = resolveCanonicalManagementCompany(rawName)
  if (!resolved) return false
  return APPROVAL_FRIENDLY_MANAGEMENT_COMPANIES.has(resolved)
}

// ─── Entry point ────────────────────────────────────────────────────────────

export type ManagementApprovalResult = {
  approvalBonus: number
  isApprovalFriendly: boolean
  resolvedManagementCompany: string | null
}

export function getManagementApprovalBonus(property: any): ManagementApprovalResult {
  const rawName = property?.management_company
  const resolvedManagementCompany = resolveCanonicalManagementCompany(rawName)

  // No management_company on this property at all — 0 bonus, nothing to evaluate.
  if (!resolvedManagementCompany) {
    return { approvalBonus: 0, isApprovalFriendly: false, resolvedManagementCompany: null }
  }

  const isApprovalFriendly = APPROVAL_FRIENDLY_MANAGEMENT_COMPANIES.has(resolvedManagementCompany)

  // TODO(approval-scoring): once management_company is populated broadly
  // enough across the property table, replace this hardcoded 0 with a real
  // point value when isApprovalFriendly is true (e.g. `isApprovalFriendly
  // ? 10 : 0`). Left at 0 deliberately for now — framework/classification
  // only, no scoring change.
  const approvalBonus = 0

  return { approvalBonus, isApprovalFriendly, resolvedManagementCompany }
}
