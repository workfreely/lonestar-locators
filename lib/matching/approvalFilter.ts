// Approval Filter V1 — classification only, no scoring.
//
// Derives booleans from actual lead schema fields rather than relying on
// synthetic boolean columns that don't exist in the table.
//
// Lead field derivation:
//   hasBrokenLease = broken_lease_age != null OR broken_lease_amount != null
//   hasEviction    = eviction_age != null OR eviction_balance != null OR eviction_court != null
//   hasFelony      = felony_age != null OR criminal_background contains "felony"
//                    OR criminal_charge contains "felony"
//
// Classification:
//   APPROVED — all checks pass
//   REVIEW   — credit_min missing; cannot evaluate; include anyway
//   DENIED   — a check explicitly fails; exclude from results
//
// Only DENIED properties are excluded (included: false).
// REVIEW properties are included — they surface for human review, not auto-excluded.
//
// Not wired into production. See app/api/admin/debug/approval-filter.

export type ApprovalStatus =
  | "APPROVED"
  | "REVIEW"
  | "DENIED_CREDIT"
  | "DENIED_BROKEN_LEASE"
  | "DENIED_EVICTION"
  | "DENIED_FELONY"

export type ApprovalClassification = "APPROVED" | "REVIEW" | "DENIED"

export type ApprovalFilterResult = {
  included: boolean
  classification: ApprovalClassification
  status: ApprovalStatus
  reasons: string[]
  // Derived booleans exposed for debug visibility
  derived: {
    hasBrokenLease: boolean
    hasEviction: boolean
    hasFelony: boolean
  }
}

function hasValue(v: any): boolean {
  return v !== null && v !== undefined && String(v).trim() !== ""
}

function containsFelony(value: any): boolean {
  if (!hasValue(value)) return false
  return String(value).toLowerCase().includes("felony")
}

export function deriveBooleans(lead: any): {
  hasBrokenLease: boolean
  hasEviction: boolean
  hasFelony: boolean
} {
  const hasBrokenLease =
    hasValue(lead?.broken_lease_age) || hasValue(lead?.broken_lease_amount)

  const hasEviction =
    hasValue(lead?.eviction_age) ||
    hasValue(lead?.eviction_balance) ||
    hasValue(lead?.eviction_court)

  const hasFelony =
    hasValue(lead?.felony_age) ||
    containsFelony(lead?.criminal_background) ||
    containsFelony(lead?.criminal_charge)

  return { hasBrokenLease, hasEviction, hasFelony }
}

export function checkApproval(lead: any, property: any): ApprovalFilterResult {
  const reasons: string[] = []
  const derived = deriveBooleans(lead)

  const creditMin = property?.credit_min ?? null
  const creditScore = lead?.credit_score ?? null

  // --- credit_min missing: cannot evaluate → REVIEW (still included) ---
  if (creditMin === null) {
    return {
      included: true,
      classification: "REVIEW",
      status: "REVIEW",
      reasons: ["Property has no credit_min — needs manual review"],
      derived,
    }
  }

  // --- Credit score fails ---
  if (creditScore === null || creditScore < creditMin) {
    return {
      included: false,
      classification: "DENIED",
      status: "DENIED_CREDIT",
      reasons: [
        creditScore === null
          ? `Lead has no credit score on record (property requires ${creditMin})`
          : `Credit score ${creditScore} is below property minimum of ${creditMin}`,
      ],
      derived,
    }
  }

  reasons.push(`Credit score ${creditScore} meets minimum of ${creditMin}`)

  // --- Broken Lease ---
  if (derived.hasBrokenLease && property?.broken_lease_ok === false) {
    return {
      included: false,
      classification: "DENIED",
      status: "DENIED_BROKEN_LEASE",
      reasons: ["Lead has broken lease; property does not accept broken leases"],
      derived,
    }
  }

  // --- Eviction ---
  if (derived.hasEviction && property?.eviction_ok === false) {
    return {
      included: false,
      classification: "DENIED",
      status: "DENIED_EVICTION",
      reasons: ["Lead has prior eviction; property does not accept evictions"],
      derived,
    }
  }

  // --- Felony ---
  if (derived.hasFelony && property?.felony_ok === false) {
    return {
      included: false,
      classification: "DENIED",
      status: "DENIED_FELONY",
      reasons: ["Lead has felony on record; property does not accept felonies"],
      derived,
    }
  }

  return {
    included: true,
    classification: "APPROVED",
    status: "APPROVED",
    reasons,
    derived,
  }
}
