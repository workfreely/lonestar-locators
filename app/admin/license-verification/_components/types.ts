// lb_list_licenses row. Mirrors the RPC's return columns exactly — deliberately
// narrow: no email, subscription, network tier, or service areas.
export type LicenseRow = {
  user_id: string
  display_name: string
  photo_url: string | null
  license_state: string | null
  license_number: string | null
  license_verified_at: string | null
  signed_up_at: string | null
  /** Display-only referral context; null for a direct signup. */
  sponsor_name: string | null
  /** Set by lb_reject_license. Mutually exclusive with license_verified_at — the
   *  profiles_license_status_exclusive CHECK makes a both-set row impossible. */
  license_rejected_at: string | null
  license_rejection_reason: string | null
}
