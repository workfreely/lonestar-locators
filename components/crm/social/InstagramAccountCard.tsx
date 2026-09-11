"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

// Instagram Accounts card — real connection state (Instagram Login). Shows only SAFE data
// (username, account type, status); never a token. Connect is a normal navigation to the
// server connect route (which redirects to Instagram); Disconnect POSTs to the disconnect
// route. TikTok/YouTube stay "Coming later" (rendered by the page, not here).

export type InstagramConnection = {
  username: string | null
  accountType: string | null
  status: string
  expired: boolean
} | null

export default function InstagramAccountCard({ configured, connection }: { configured: boolean; connection: InstagramConnection }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  const connectHref = "/api/admin/social-autopilot/accounts/instagram/connect"
  const needsReconnect = !!connection && (connection.status === "error" || connection.expired)

  const disconnect = async () => {
    if (!confirm("Disconnect this Instagram account? Scheduled posts stay in the Queue; nothing is deleted from your Library.")) return
    setBusy(true)
    try {
      const res = await fetch("/api/admin/social-autopilot/accounts/instagram/disconnect", { method: "POST" })
      if (res.ok) router.refresh()
    } finally {
      setBusy(false)
    }
  }

  const dot = (cls: string) => <span className={`h-1.5 w-1.5 rounded-full ${cls}`} />
  const btnPrimary = "mt-4 text-[12.5px] font-semibold px-3 py-1.5 rounded-lg bg-[var(--crm-text-primary)] text-[var(--crm-panel)] inline-flex items-center justify-center disabled:opacity-50"
  const btnGhost = "text-[12.5px] font-semibold px-3 py-1.5 rounded-lg border border-[var(--crm-border)] text-[var(--crm-text-secondary)] hover:bg-[var(--crm-card)] transition-colors disabled:opacity-50"

  return (
    <div className="rounded-2xl border border-[var(--crm-border)] bg-[var(--crm-panel)] p-4 flex flex-col">
      <div className="flex items-center justify-between">
        <div className="text-[14px] font-bold text-[var(--crm-text-primary)]">Instagram</div>
        {!configured ? (
          <span className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-[var(--crm-text-muted)]">{dot("bg-[var(--crm-text-muted)]")} Not configured</span>
        ) : !connection ? (
          <span className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-[var(--crm-text-muted)]">{dot("bg-[var(--crm-text-muted)]")} Not connected</span>
        ) : needsReconnect ? (
          <span className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-amber-600 dark:text-amber-400">{dot("bg-amber-500")} Reconnect needed</span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-emerald-600 dark:text-emerald-400">{dot("bg-emerald-500")} Connected</span>
        )}
      </div>

      {/* Connected identity (safe fields only). */}
      {connection && (
        <div className="mt-2 text-[12.5px]">
          <div className="font-semibold text-[var(--crm-text-primary)] truncate">@{connection.username ?? "instagram"}</div>
          {connection.accountType && <div className="text-[11.5px] text-[var(--crm-text-muted)] capitalize">{connection.accountType.toLowerCase().replace(/_/g, " ")}</div>}
        </div>
      )}

      {!configured ? (
        <>
          <button type="button" disabled className="mt-4 text-[12.5px] font-semibold px-3 py-1.5 rounded-lg border border-[var(--crm-border)] text-[var(--crm-text-secondary)] opacity-70 cursor-not-allowed">
            Connect Instagram
          </button>
          <div className="mt-2 text-[11px] text-[var(--crm-text-muted)]">Instagram isn&apos;t configured yet.</div>
        </>
      ) : !connection ? (
        <a href={connectHref} className={btnPrimary}>Connect Instagram</a>
      ) : needsReconnect ? (
        <div className="mt-4 flex items-center gap-2">
          <a href={connectHref} className="text-[12.5px] font-semibold px-3 py-1.5 rounded-lg bg-[var(--crm-text-primary)] text-[var(--crm-panel)]">Reconnect</a>
          <button type="button" className={btnGhost} disabled={busy} onClick={() => void disconnect()}>Disconnect</button>
        </div>
      ) : (
        <div className="mt-4">
          <button type="button" className={btnGhost} disabled={busy} onClick={() => void disconnect()}>{busy ? "Disconnecting…" : "Disconnect"}</button>
        </div>
      )}
    </div>
  )
}
