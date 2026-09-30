"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase/client"
import AppHeader from "@/components/crm/AppHeader"
import {
  licenseStatus,
  LICENSE_STATUS_LABEL,
  licenseRejectionReason as rejectionReasonFor,
} from "@/lib/license/status"

// The launch state. Declared once here rather than typed into three strings below.
const LAUNCH_LICENSE_STATE = "TX"

type Initial = {
  licenseNumber: string
  licenseState: string
  /** Set only for a VERIFIED licence that still failed the launch gate — i.e. a
   *  verified licence from outside Texas. A passing licence never reaches here. */
  licenseVerifiedAt: string | null
  licenseRejectedAt: string | null
  licenseRejectionReason: string | null
}

// Copy per state. The wording is the SAME vocabulary the rest of the product already
// uses (lib/license/status.ts owns the chip labels), just expanded into a sentence.
//
// Deliberately absent: any mention of a trial, any countdown, and any suggestion that
// review is automatic. It is a person reading a state registry, and "within 3 business
// days" is the promise onboarding and Profile already make.
const COPY = {
  unsubmitted: {
    title: "Verify your Texas real estate license",
    body: "Enter your Texas license number so we can verify your account.",
  },
  pending: {
    title: "License verification pending",
    body: "We’re reviewing your Texas real estate license. You’ll have access once verification is complete.",
  },
  rejected: {
    title: "Needs correction",
    body: "We couldn’t verify the license number on your account. Correct it below and we’ll review it again.",
  },
  // PASS 7 — a VERIFIED licence that is not a Texas one. Reachable only because
  // middleware now enforces verified-AND-Texas, and the page refuses to bounce
  // them onward. Their number is frozen by the database, so this state offers a
  // relicensing route instead of an input that could not be saved.
  out_of_state: {
    title: "Texas license required",
    body: "Your license is verified, but Locator Beast has launched in Texas only. To continue you’ll need to add a Texas real estate license.",
  },
} as const

// The chip shown for each page state. Four of them are the shared vocabulary
// verbatim; out_of_state maps to "Verified" because that is the literal truth —
// the licence IS verified, it is simply not a Texas one, which the headline says.
// out_of_state stays a PAGE concern and deliberately does not become a fifth
// LicenseStatus: the database has no such state, and inventing one would put the
// shared derivation out of step with lb_workspace_has_access.
const CHIP: Record<keyof typeof COPY, string | null> = {
  unsubmitted: LICENSE_STATUS_LABEL.unsubmitted,
  pending: LICENSE_STATUS_LABEL.pending,
  rejected: LICENSE_STATUS_LABEL.rejected,
  out_of_state: LICENSE_STATUS_LABEL.verified,
}

export default function VerifyLicenseClient({ userId, initial }: { userId: string; initial: Initial }) {
  const router = useRouter()
  const [licenseNumber, setLicenseNumber] = useState(initial.licenseNumber)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Derived from what is STORED, never from what is being typed. On this screen the
  // status IS the page, so previewing a state the user has not saved yet would change
  // the headline under their cursor. The transition to Pending happens for real, on
  // refresh, once the corrected number is written and the DB trigger clears the
  // rejection — which is the behaviour this page is meant to demonstrate.
  const stored = {
    license_number: initial.licenseNumber,
    license_verified_at: initial.licenseVerifiedAt,
    license_rejected_at: initial.licenseRejectedAt,
    license_rejection_reason: initial.licenseRejectionReason,
  }
  // The shared derivation still owns the first four. "verified" can only mean
  // out-of-state here: a verified TEXAS licence passes the gate and was redirected
  // away by the server before this rendered.
  const derived = licenseStatus(stored)
  const status = derived === "verified" ? "out_of_state" : derived
  const reason = rejectionReasonFor(stored)
  const copy = COPY[status]
  // A verified licence is frozen by lb_guard_verified_license — number AND state.
  // Offering an editable field here would promise a write the database refuses.
  const frozen = status === "out_of_state"

  // Reuse, don't re-ask: the saved state is shown as context, not as a question. It is
  // written only when the profile has none yet, so this screen can never silently
  // relicense someone — changing an existing state stays Profile's job.
  const displayState = initial.licenseState || LAUNCH_LICENSE_STATE

  const dirty = licenseNumber.trim() !== initial.licenseNumber.trim()
  const canSave = licenseNumber.trim().length > 0 && dirty && !saving

  async function save() {
    if (!canSave) return
    setSaving(true)
    setError(null)
    // The SAME storage path onboarding and Profile use: a plain profiles UPDATE of
    // license_number. No new RPC, no new table, and the rejection columns are never
    // written from the client — lb_guard_verified_license owns clearing them.
    const { error: updateError } = await supabase
      .from("profiles")
      .update({
        license_number: licenseNumber.trim(),
        ...(initial.licenseState ? {} : { license_state: LAUNCH_LICENSE_STATE }),
      })
      .eq("id", userId)
    setSaving(false)
    if (updateError) {
      setError("We couldn’t save that license number. Please try again.")
      return
    }
    // Re-run the server component so the status is re-derived from the row that now
    // exists — a corrected number comes back as Pending because the trigger cleared
    // the rejection, not because this component decided so.
    router.refresh()
  }

  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader variant="dark" forceDarkSurface />
      <div className="flex flex-1 items-center justify-center px-4 py-16">
        <div className="w-full max-w-lg">
          <div className="w-full rounded-3xl border border-[var(--beast-border)] bg-white p-8 shadow-[0_30px_80px_-40px_rgba(15,23,42,0.25)] sm:p-10">
            <div className="flex items-center gap-2">
              <p className="text-[12px] font-semibold uppercase tracking-[0.25em] text-[var(--beast-blue)]">
                License
              </p>
              {/* The same chip vocabulary as Profile and onboarding — but suppressed
                  when it would simply restate the headline, as "Needs correction"
                  does. A status said twice in one glance reads as a mistake. */}
              {CHIP[status] && CHIP[status] !== copy.title && (
                <span className="inline-flex flex-none items-center rounded-full border border-[var(--beast-border)] px-2.5 py-1 text-[12px] font-semibold text-[var(--beast-ink-soft)]">
                  {CHIP[status]}
                </span>
              )}
            </div>

            <h1 className="mt-2 text-[26px] font-semibold tracking-tight text-[var(--beast-ink)]">{copy.title}</h1>
            <p className="mt-2 text-[15px] leading-relaxed text-[var(--beast-ink-soft)]">{copy.body}</p>

            {/* The owner's own words, when there are any. */}
            {reason && (
              <p className="mt-4 rounded-2xl border border-[var(--beast-border)] px-4 py-3 text-[14px] leading-relaxed text-[var(--beast-ink-soft)]">
                {reason}
              </p>
            )}

            <div className="mt-8 flex flex-col gap-2">
              <label htmlFor="license-number" className="text-[13px] font-medium text-[var(--beast-ink-soft)]">
                {displayState === LAUNCH_LICENSE_STATE ? "Texas Real Estate License Number" : "Real Estate License Number"}
              </label>
              <input
                id="license-number"
                value={licenseNumber}
                onChange={(e) => setLicenseNumber(e.target.value)}
                readOnly={frozen}
                aria-readonly={frozen || undefined}
                autoComplete="off"
                inputMode="numeric"
                className={`rounded-xl border border-[var(--beast-border)] bg-white px-4 py-3 text-[14px] text-[var(--beast-ink)] outline-none transition-colors focus:border-[var(--beast-blue)]${
                  frozen ? " cursor-not-allowed opacity-70" : ""
                }`}
              />
              <p className="text-[12px] font-medium text-[var(--beast-ink-soft)]">
                {frozen
                  ? `Verified in ${displayState}. A verified license can’t be edited — changing your license state starts a new verification.`
                  : `Licensed in ${displayState}. Licenses are verified within 3 business days and will not be displayed publicly by Locator Beast.`}
              </p>
            </div>

            {error && <p className="mt-4 text-[13px] font-medium text-red-600">{error}</p>}

            {/* Out-of-state has nothing to submit here: relicensing lives in Profile,
                which is exempt from the licence gate precisely so this link works. */}
            {frozen ? (
              <a
                href="/admin/profile"
                className="mt-6 block w-full rounded-full bg-[var(--beast-ink)] px-7 py-3.5 text-center text-[15px] font-semibold text-white transition-transform duration-300 hover:scale-[1.02] hover:bg-[var(--beast-blue)]"
              >
                Change license state in Profile
              </a>
            ) : (
              <button
                type="button"
                onClick={save}
                disabled={!canSave}
                className="mt-6 w-full rounded-full bg-[var(--beast-ink)] px-7 py-3.5 text-[15px] font-semibold text-white transition-transform duration-300 hover:scale-[1.02] hover:bg-[var(--beast-blue)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100"
              >
                {saving ? "Saving…" : status === "unsubmitted" ? "Submit for verification" : "Update license number"}
              </button>
            )}

            {/* Why this matters — stated as the requirement it is, with no claim about
                what is enforced today and no mention of a trial. */}
            <p className="mt-6 text-[13px] leading-relaxed text-[var(--beast-ink-soft)]">
              Locator Beast is built for licensed Texas real estate agents. A verified license is required for full
              access to your workspace.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
