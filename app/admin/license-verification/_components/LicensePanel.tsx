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

// Owner-only license review. Verification is manual by design — the owner opens the
// issuing state's own registry, confirms the number, and records the result here.
// There is no scraping and no third-party verification service.
//
// This page adds no verification state of its own: both actions call the existing
// lb_verify_license / lb_unverify_license RPCs, which write the one universal field
// (profiles.license_verified_at) and raise for anyone who is not the platform owner.
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

  async function run(rpc: "lb_verify_license" | "lb_unverify_license", userId: string) {
    if (busyUser) return
    setBusyUser(userId)
    setError(null)
    const { error } = await supabase.rpc(rpc, { p_user: userId })
    setBusyUser(null)
    if (error) {
      setError(
        error.message?.includes("license_number_missing")
          ? "That agent hasn't entered a license number yet."
          : error.message || "Could not update that license.",
      )
      return
    }
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
    return (
      <button
        type="button"
        disabled={busyUser !== null}
        onClick={() => run("lb_verify_license", row.user_id)}
        className={`${CRM_SECONDARY_BUTTON} !px-3.5 !py-1.5 !text-[12px]`}
      >
        {busyUser === row.user_id ? "…" : "Verify License"}
      </button>
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
              status={r.license_verified_at ? "verified" : "unverified"}
              subtitle={subtitleFor(r)}
              // Referral context only when a sponsor exists — a direct signup
              // gets no badge at all.
              meta={<ReferredByPill sponsorName={r.sponsor_name} />}
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
