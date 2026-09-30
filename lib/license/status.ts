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

// ── PASS 7: launch access eligibility ───────────────────────────────────────
//
// This is the TypeScript half of a rule that exists in exactly two places. The
// other is public.lb_workspace_has_access (supabase/manual/20261001_pass7_*.sql),
// which gates RLS on leads and the rest of the CRM tables. They MUST agree, so
// this is written to mirror that SQL character for character:
//
//     ( license_verified_at is not null and license_state = 'TX' )
//     or internal_demo_access
//
// The SQL half additionally ANDs the billing sources. Billing is NOT folded in
// here on purpose — getAccessState already owns that decision, and composing the
// two at the call site keeps "licence" and "entitlement" separately auditable.

/** The one state Locator Beast has launched in. */
export const LAUNCH_LICENSE_STATE = "TX"

export type LaunchAccessFields = LicenseFields & {
  license_state?: string | null
  /** Owner-granted internal demo/training exemption. Trigger-protected: a user can
   *  neither grant nor revoke it, so it is as trustworthy as license_verified_at. */
  internal_demo_access?: boolean | null
}

/**
 * The launch rule proper: verified AND Texas. Both halves are required, and the
 * Pass 4 licence-state freeze is what makes the second half trustworthy — without
 * it a verified out-of-state agent could flip license_state to 'TX' and keep the
 * verification stamp.
 *
 * Compared with EXACT equality, deliberately: the license_state CHECK constraint
 * admits only the uppercase two-letter codes, so normalising here would only make
 * TypeScript MORE permissive than the SQL — the one direction that matters, since
 * it would let someone navigate into a CRM whose rows RLS then hides.
 */
export function hasVerifiedLaunchLicense(p: LaunchAccessFields | null | undefined): boolean {
  return licenseStatus(p) === "verified" && p?.license_state === LAUNCH_LICENSE_STATE
}

/**
 * Licence eligibility as the access gate asks it: the launch rule, or the explicit
 * owner-granted demo exemption.
 *
 * `=== true` is deliberate — only a real boolean grants, never a merely truthy
 * value, and never `undefined` from a caller that forgot to select the column.
 *
 * This says nothing about billing. `signed in → this → getAccessState → product`.
 */
export function passesLicenseGate(p: LaunchAccessFields | null | undefined): boolean {
  return hasVerifiedLaunchLicense(p) || p?.internal_demo_access === true
}
