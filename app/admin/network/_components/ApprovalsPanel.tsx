"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase/client"
import { CRM_PRIMARY_BUTTON, CRM_SECONDARY_BUTTON } from "@/lib/crmButtonStyles"
import Card, { ReferredByPill } from "./MemberCard"
import type { AdminMember } from "./types"

// Clearly-separated Admin / Members section — rendered ONLY for the platform
// owner (is_platform_admin). Approve moves a member pending → active (unlocking
// their complimentary access + join page); Deactivate moves active → inactive
// (removes complimentary access; all data is retained). Reactivate restores an
// inactive member. Actions call the guarded lb_set_member_status RPC, then
// refresh the server data.

export default function ApprovalsPanel({ members }: { members: AdminMember[] }) {
  const router = useRouter()
  const [busyUser, setBusyUser] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Manual license verification for launch — no queue, no dashboard, no lookup
  // service. Guarded by lb_verify_license, which raises for anyone who is not the
  // platform owner, so this button is defence in depth rather than the control itself.
  async function verifyLicense(userId: string) {
    if (busyUser) return
    setBusyUser(userId)
    setError(null)
    const { error } = await supabase.rpc("lb_verify_license", { p_user: userId })
    setBusyUser(null)
    if (error) {
      setError(
        error.message?.includes("license_number_missing")
          ? "That member hasn't entered a license number yet."
          : error.message || "Could not verify that license.",
      )
      return
    }
    router.refresh()
  }

  // Verified → a plain read-only chip. Unverified with a number → the owner action.
  // No number yet → nothing to verify, so nothing is shown.
  function licenseAction(m: AdminMember) {
    if (m.license_verified_at) {
      return (
        <span className="inline-flex flex-none items-center rounded-full border border-[#0f9d58]/40 bg-[#0f9d58]/10 px-2.5 py-1 text-[12px] font-semibold text-[#0f9d58]">
          License verified
        </span>
      )
    }
    if (!m.license_number?.trim()) return null
    return (
      <button
        type="button"
        disabled={busyUser !== null}
        onClick={() => verifyLicense(m.user_id)}
        title={`License ${m.license_number}`}
        className={`${CRM_SECONDARY_BUTTON} !px-3.5 !py-1.5 !text-[12px]`}
      >
        Verify License
      </button>
    )
  }

  async function setStatus(userId: string, status: "active" | "inactive") {
    if (busyUser) return
    setBusyUser(userId)
    setError(null)
    const { error } = await supabase.rpc("lb_set_member_status", { p_user: userId, p_status: status })
    setBusyUser(null)
    if (error) {
      setError(error.message || "Could not update member.")
      return
    }
    router.refresh()
  }

  const pending = members.filter((m) => m.status === "pending")
  const active = members.filter((m) => m.status === "active")
  const inactive = members.filter((m) => m.status === "inactive")

  return (
    <section className="rounded-xl border border-amber-500/30 bg-amber-500/[0.04] p-5">
      <div className="mb-1 flex items-center gap-2">
        <h2 className="text-[15px] font-semibold text-[var(--crm-text-primary)]">Admin</h2>
        <span className="inline-flex items-center rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-400">
          Owner only
        </span>
      </div>
      <p className="mb-4 text-[12px] text-[var(--crm-text-muted)]">
        Approve members after verifying they joined your network.
      </p>

      {error && <p className="mb-3 text-[13px] font-medium text-red-400">{error}</p>}

      <AdminGroup
        title={`Pending approval (${pending.length})`}
        // The count already says there are none; the sentence added nothing.
        empty=""
        members={pending}
        renderLicense={licenseAction}
        renderAction={(m) => (
          <button
            type="button"
            disabled={busyUser !== null}
            onClick={() => setStatus(m.user_id, "active")}
            className={`${CRM_PRIMARY_BUTTON} !px-3.5 !py-1.5 !text-[12px]`}
          >
            {busyUser === m.user_id ? "…" : "Approve"}
          </button>
        )}
      />

      <AdminGroup
        title={`Active (${active.length})`}
        empty="No active members yet."
        members={active}
        renderLicense={licenseAction}
        renderAction={(m) => (
          <button
            type="button"
            disabled={busyUser !== null}
            onClick={() => setStatus(m.user_id, "inactive")}
            className={`${CRM_SECONDARY_BUTTON} !px-3.5 !py-1.5 !text-[12px]`}
          >
            {busyUser === m.user_id ? "…" : "Deactivate"}
          </button>
        )}
      />

      {inactive.length > 0 && (
        <AdminGroup
          title={`Inactive (${inactive.length})`}
          empty=""
          members={inactive}
          renderLicense={licenseAction}
        renderAction={(m) => (
            <button
              type="button"
              disabled={busyUser !== null}
              onClick={() => setStatus(m.user_id, "active")}
              className={`${CRM_SECONDARY_BUTTON} !px-3.5 !py-1.5 !text-[12px]`}
            >
              {busyUser === m.user_id ? "…" : "Reactivate"}
            </button>
          )}
        />
      )}
    </section>
  )
}

function AdminGroup({
  title,
  empty,
  members,
  renderAction,
  renderLicense,
}: {
  title: string
  empty: string
  members: AdminMember[]
  renderAction: (m: AdminMember) => React.ReactNode
  renderLicense?: (m: AdminMember) => React.ReactNode
}) {
  return (
    <div className="mt-4 first:mt-0">
      <p className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-[var(--crm-text-muted)]">{title}</p>
      {members.length === 0 ? (
        empty ? <p className="text-[13px] text-[var(--crm-text-muted)]">{empty}</p> : null
      ) : (
        <div className="space-y-2">
          {members.map((m) => (
            <Card
              key={m.user_id}
              name={m.display_name}
              photoUrl={m.photo_url}
              joinedDate={m.applied_at}
              status={m.status}
              // Same pill as License Verification — one referral treatment across
              // both surfaces, replacing the previous plain-text subtitle.
              meta={<ReferredByPill sponsorName={m.sponsor_name} />}
              action={
                <div className="flex flex-wrap items-center justify-end gap-2">
                  {renderLicense?.(m)}
                  {renderAction(m)}
                </div>
              }
            />
          ))}
        </div>
      )}
    </div>
  )
}
