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
} as const

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
    license_verified_at: null, // a verified licence never reaches this component
    license_rejected_at: initial.licenseRejectedAt,
    license_rejection_reason: initial.licenseRejectionReason,
  }
  const status = licenseStatus(stored) as "unsubmitted" | "pending" | "rejected"
  const reason = rejectionReasonFor(stored)
  const copy = COPY[status]

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
              {LICENSE_STATUS_LABEL[status] && LICENSE_STATUS_LABEL[status] !== copy.title && (
                <span className="inline-flex flex-none items-center rounded-full border border-[var(--beast-border)] px-2.5 py-1 text-[12px] font-semibold text-[var(--beast-ink-soft)]">
                  {LICENSE_STATUS_LABEL[status]}
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
                autoComplete="off"
                inputMode="numeric"
                className="rounded-xl border border-[var(--beast-border)] bg-white px-4 py-3 text-[14px] text-[var(--beast-ink)] outline-none transition-colors focus:border-[var(--beast-blue)]"
              />
              <p className="text-[12px] font-medium text-[var(--beast-ink-soft)]">
                Licensed in {displayState}. Licenses are verified within 3 business days and will not be displayed
                publicly by Locator Beast.
              </p>
            </div>

            {error && <p className="mt-4 text-[13px] font-medium text-red-600">{error}</p>}

            <button
              type="button"
              onClick={save}
              disabled={!canSave}
              className="mt-6 w-full rounded-full bg-[var(--beast-ink)] px-7 py-3.5 text-[15px] font-semibold text-white transition-transform duration-300 hover:scale-[1.02] hover:bg-[var(--beast-blue)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100"
            >
              {saving ? "Saving…" : status === "unsubmitted" ? "Submit for verification" : "Update license number"}
            </button>

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
