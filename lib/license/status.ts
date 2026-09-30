// Licence verification status — the ONE derivation, shared by onboarding, Profile
// and the owner panel so the three can never disagree about what a row means.
//
// Pure: no I/O, no Supabase import. It reads only the three TRUSTED profile fields,
// every one of which is owner-written and protected by lb_guard_verified_license —
// a user can edit their licence NUMBER while unverified, and nothing else.
//
// INERT until the Pass 4 SQL is applied by hand: the two rejection fields are
// optional here, so a caller that has not yet selected them simply never resolves
// "rejected". Nothing imports this yet.

export type LicenseStatus = "unsubmitted" | "pending" | "verified" | "rejected"

export type LicenseFields = {
  license_number?: string | null
  /** Owner-granted. The authoritative SUCCESS signal and the one field a user cannot forge. */
  license_verified_at?: string | null
  /** Owner-granted. Mutually exclusive with license_verified_at (DB CHECK). */
  license_rejected_at?: string | null
  license_rejection_reason?: string | null
}

const filled = (v: string | null | undefined): boolean => !!v && String(v).trim().length > 0

/**
 * PRECEDENCE, highest first — and the database makes the only ambiguous pair
 * impossible rather than relying on this order:
 *
 *   1. verified   license_verified_at present
 *   2. rejected   license_rejected_at present
 *   3. pending    a licence number, awaiting review
 *   4. unsubmitted
 *
 * Verified is checked first because it is the signal the access gate reads. The
 * `profiles_license_status_exclusive` CHECK guarantees the two timestamps are never
 * both set, so this order can never actually be exercised as a tie-break — it exists
 * so the function stays total if a row were ever restored from an older backup.
 *
 * A rejection is deliberately NOT cleared here when the number changes: the guard
 * trigger owns that, so the status a user sees always reflects what is stored.
 */
export function licenseStatus(p: LicenseFields | null | undefined): LicenseStatus {
  if (!p) return "unsubmitted"
  if (filled(p.license_verified_at)) return "verified"
  if (filled(p.license_rejected_at)) return "rejected"
  return filled(p.license_number) ? "pending" : "unsubmitted"
}

/** The label each status shows, reusing the wording already live in Profile. */
export const LICENSE_STATUS_LABEL: Record<LicenseStatus, string | null> = {
  unsubmitted: null, // no chip at all — an empty field explains itself
  pending: "Pending verification",
  verified: "Verified",
  rejected: "Needs correction",
}

/** The owner's reason, shown only when it is the reason for the CURRENT state. */
export function licenseRejectionReason(p: LicenseFields | null | undefined): string | null {
  if (licenseStatus(p) !== "rejected") return null
  const reason = p?.license_rejection_reason
  return filled(reason) ? String(reason).trim() : null
}

/** Whether the agent may still edit the number. Mirrors the DB trigger exactly. */
export function isLicenseEditable(p: LicenseFields | null | undefined): boolean {
  return licenseStatus(p) !== "verified"
}
