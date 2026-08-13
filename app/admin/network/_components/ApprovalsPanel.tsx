"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase/client"
import { CRM_PRIMARY_BUTTON, CRM_SECONDARY_BUTTON } from "@/lib/crmButtonStyles"
import Card from "./MemberCard"
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
        <h2 className="text-[15px] font-semibold text-[var(--crm-text-primary)]">Admin · Network Members</h2>
        <span className="inline-flex items-center rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-400">
          Owner only
        </span>
      </div>
      <p className="mb-4 text-[12px] text-[var(--crm-text-muted)]">
        Approve members after verifying they joined the organization. Deactivating removes
        complimentary access but keeps all of their data.
      </p>

      {error && <p className="mb-3 text-[13px] font-medium text-red-400">{error}</p>}

      <AdminGroup
        title={`Pending approval (${pending.length})`}
        empty="No members awaiting approval."
        members={pending}
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
}: {
  title: string
  empty: string
  members: AdminMember[]
  renderAction: (m: AdminMember) => React.ReactNode
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
              subtitle={m.sponsor_name ? `Referred by ${m.sponsor_name}` : null}
              action={renderAction(m)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
