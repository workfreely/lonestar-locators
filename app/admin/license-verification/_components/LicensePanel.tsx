"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase/client"
import { CRM_SECONDARY_BUTTON } from "@/lib/crmButtonStyles"
import Card, { ReferredByPill } from "@/app/admin/network/_components/MemberCard"
import {
  SUPPORTED_LICENSE_STATES,
  STATE_NAMES,
  STATE_AGENCIES,
  STATE_LOOKUP_URLS,
  isSupportedState,
} from "./licenseLookups"
import type { LicenseRow } from "./types"
import { licenseStatus, LICENSE_STATUS_LABEL } from "@/lib/license/status"
import { verifyLicense } from "@/lib/license/verifyLicense"

// Owner-only license review. Verification is manual by design — the owner opens the
// issuing state's own registry, confirms the number, and records the result here.
// There is no scraping and no third-party verification service.
//
// This page adds no verification state of its own: every action calls an existing
// owner-only RPC — lb_verify_license / lb_unverify_license / lb_reject_license — each
// of which raises for anyone who is not the platform owner. Verify and Reject are
// mutually exclusive in the DATABASE, not merely here: each RPC clears the other's
// column, and profiles_license_status_exclusive makes a both-set row impossible.
// Statuses are derived by lib/license/status.ts, the same module the agent's own
// onboarding and Profile screens use.
// Referral membership is not read, shown, or affected anywhere on this page.

function formatDate(iso: string | null): string {
  if (!iso) return "—"
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "—"
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

export default function LicensePanel({ rows }: { rows: LicenseRow[] }) {
  const router = useRouter()
  const [busyUser, setBusyUser] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  // The row whose reason box is open, and its draft. One at a time: rejecting is a
  // deliberate act, and a second open box invites sending the wrong reason.
  const [rejecting, setRejecting] = useState<string | null>(null)
  const [reason, setReason] = useState("")

  async function run(
    rpc: "lb_verify_license" | "lb_unverify_license" | "lb_reject_license",
    userId: string,
    args: Record<string, unknown> = {},
  ) {
    if (busyUser) return
    setBusyUser(userId)
    setError(null)
    // PASS 8: Verify goes through the shared helper, which also sends the
    // trial-started email when THAT call granted a trial, and returns an
    // already-user-facing message. Unverify/Reject keep the plain RPC — neither
    // can start a trial — and keep their own message mapping.
    let message: string | null = null
    if (rpc === "lb_verify_license") {
      message = (await verifyLicense(userId)).error
    } else {
      const { error } = await supabase.rpc(rpc, { p_user: userId, ...args })
      if (error) {
        message = error.message?.includes("license_number_missing")
          ? "That agent hasn't entered a license number yet."
          : error.message?.includes("rejection_reason_required")
            ? "Add a short reason so the agent knows what to fix."
            : error.message || "Could not update that license."
      }
    }
    setBusyUser(null)
    if (message) {
      setError(message)
      return
    }
    setRejecting(null)
    setReason("")
    router.refresh()
  }

  // Compact metadata line: "TX · License 1234567 · Joined Aug 21, 2026".
  // MemberCard already appends the joined date, so this supplies the first two parts.
  function subtitleFor(row: LicenseRow): string {
    const state = row.license_state ?? "—"
    const number = row.license_number?.trim() ? `License ${row.license_number.trim()}` : "License —"
    return `${state} · ${number}`
  }

  // Sends the owner to the issuing state's own registry. Omitted when no state is on
  // file — there is no correct registry to open, and guessing one is worse than none.
  function lookupLink(row: LicenseRow) {
    if (!isSupportedState(row.license_state)) return null
    const state = row.license_state
    return (
      <a
        href={STATE_LOOKUP_URLS[state]}
        target="_blank"
        rel="noopener noreferrer"
        title={STATE_AGENCIES[state]}
        className="text-[12px] font-medium text-[var(--crm-text-secondary)] underline decoration-[var(--crm-border)] underline-offset-2 transition-colors hover:text-[var(--crm-text-primary)]"
      >
        Verify on {STATE_NAMES[state]} licensing site ↗
      </a>
    )
  }

  function actionFor(row: LicenseRow) {
    if (row.license_verified_at) {
      return (
        <button
          type="button"
          disabled={busyUser !== null}
          onClick={() => run("lb_unverify_license", row.user_id)}
          className={`${CRM_SECONDARY_BUTTON} !px-3.5 !py-1.5 !text-[12px]`}
        >
          {busyUser === row.user_id ? "…" : "Unverify"}
        </button>
      )
    }
    // Nothing to verify against yet — the RPC would refuse, so no action is offered.
    if (!row.license_number?.trim()) return null

    // The reason box replaces the pair while open: the only two choices that make
    // sense mid-rejection are send and cancel.
    if (rejecting === row.user_id) {
      return (
        <div className="flex items-center gap-1.5">
          <input
            autoFocus
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && reason.trim()) run("lb_reject_license", row.user_id, { p_reason: reason.trim() })
              if (e.key === "Escape") { setRejecting(null); setReason("") }
            }}
            placeholder="What needs fixing?"
            maxLength={300}
            className="w-52 rounded-lg border border-[var(--crm-border)] bg-[var(--crm-inset)] px-2.5 py-1.5 text-[12px] text-[var(--crm-text-primary)] outline-none placeholder:text-[var(--crm-text-muted)] focus:border-[var(--crm-text-muted)]"
          />
          <button
            type="button"
            disabled={busyUser !== null || !reason.trim()}
            onClick={() => run("lb_reject_license", row.user_id, { p_reason: reason.trim() })}
            className={`${CRM_SECONDARY_BUTTON} !px-3 !py-1.5 !text-[12px] disabled:opacity-40`}
          >
            {busyUser === row.user_id ? "…" : "Send"}
          </button>
          <button
            type="button"
            onClick={() => { setRejecting(null); setReason("") }}
            className="px-1.5 text-[12px] font-medium text-[var(--crm-text-muted)] transition-colors hover:text-[var(--crm-text-primary)]"
          >
            Cancel
          </button>
        </div>
      )
    }

    return (
      <>
        <button
          type="button"
          disabled={busyUser !== null}
          onClick={() => run("lb_verify_license", row.user_id)}
          className={`${CRM_SECONDARY_BUTTON} !px-3.5 !py-1.5 !text-[12px]`}
        >
          {busyUser === row.user_id ? "…" : "Verify License"}
        </button>
        {/* Rejecting always takes a reason, so this opens the box rather than acting.
            A plain link, not a second button: verifying is the common outcome. */}
        <button
          type="button"
          disabled={busyUser !== null}
          onClick={() => { setRejecting(row.user_id); setReason(row.license_rejection_reason ?? "") }}
          className="text-[12px] font-medium text-[var(--crm-text-secondary)] underline decoration-[var(--crm-border)] underline-offset-2 transition-colors hover:text-[var(--crm-text-primary)]"
        >
          Needs correction
        </button>
      </>
    )
  }

  const unverified = rows.filter((r) => !r.license_verified_at)
  const verified = rows.filter((r) => !!r.license_verified_at)

  return (
    <div className="space-y-5">
      {error && <p className="text-[13px] font-medium text-red-400">{error}</p>}

      <Group title={`Unverified (${unverified.length})`} empty="No agents awaiting verification." rows={unverified}
        subtitleFor={subtitleFor} lookupLink={lookupLink} actionFor={actionFor} />

      <Group title={`Verified (${verified.length})`} empty="No verified licenses yet." rows={verified}
        subtitleFor={subtitleFor} lookupLink={lookupLink} actionFor={actionFor} />
    </div>
  )
}

function Group({
  title,
  empty,
  rows,
  subtitleFor,
  lookupLink,
  actionFor,
}: {
  title: string
  empty: string
  rows: LicenseRow[]
  subtitleFor: (r: LicenseRow) => string
  lookupLink: (r: LicenseRow) => React.ReactNode
  actionFor: (r: LicenseRow) => React.ReactNode
}) {
  return (
    <div>
      <p className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-[var(--crm-text-muted)]">{title}</p>
      {rows.length === 0 ? (
        <p className="text-[13px] text-[var(--crm-text-muted)]">{empty}</p>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <Card
              key={r.user_id}
              name={r.display_name}
              photoUrl={r.photo_url}
              joinedDate={r.signed_up_at}
              // Derived by the SAME function the two agent-facing screens use, so the
              // owner can never see a different status than the agent does.
              status={licenseStatus(r)}
              subtitle={subtitleFor(r)}
              meta={
                <>
                  {/* Referral context only when a sponsor exists — a direct signup
                      gets no badge at all. */}
                  <ReferredByPill sponsorName={r.sponsor_name} />
                  {/* The reason already sent, so the owner can see what they asked
                      for without reopening the box. */}
                  {licenseStatus(r) === "rejected" && r.license_rejection_reason?.trim() && (
                    <span className="text-[11px] font-medium text-[var(--crm-text-muted)]">
                      {r.license_rejection_reason.trim()}
                    </span>
                  )}
                </>
              }
              action={
                <div className="flex flex-wrap items-center justify-end gap-2.5">
                  {lookupLink(r)}
                  {actionFor(r)}
                </div>
              }
            />
          ))}
        </div>
      )}
    </div>
  )
}

/** Compact reference strip — the official registry for every supported state. */
export function OfficialLookups() {
  return (
    <section className="rounded-xl border border-[var(--crm-border)] bg-[var(--crm-panel)] p-4">
      <p className="mb-1 text-[13px] font-semibold text-[var(--crm-text-primary)]">Official License Lookups</p>
      <p className="mb-3 text-[12px] text-[var(--crm-text-muted)]">
        Each link opens that state&rsquo;s own licensing agency.
      </p>
      <div className="flex flex-wrap gap-x-2 gap-y-1.5">
        {SUPPORTED_LICENSE_STATES.map((s) => (
          <a
            key={s}
            href={STATE_LOOKUP_URLS[s]}
            target="_blank"
            rel="noopener noreferrer"
            title={STATE_AGENCIES[s]}
            className="rounded-full border border-[var(--crm-border)] px-3 py-1 text-[12px] font-medium text-[var(--crm-text-secondary)] transition-colors hover:border-[var(--crm-text-muted)] hover:text-[var(--crm-text-primary)]"
          >
            {STATE_NAMES[s]} ↗
          </a>
        ))}
      </div>
    </section>
  )
}
