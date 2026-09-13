"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

// Beast Social → Accounts → Publishing Destinations (admin-only management UI).
//
// Lists ALL Instagram destinations owned by the current Beast Social admin and manages each by its
// connection_id via the connection-ID-scoped backend (/destinations/manage). It NEVER uses the
// legacy owner+provider disconnect, and NEVER shows external account ids, Vault/token ids, owner
// uuids, or tokens — only safe identity/label/status. "+ Add Publishing Destination" mints a
// single-use invitation link (shown once) that the admin sends manually; recipients only authorize
// their own Instagram and get no Beast Social access.

export type Destination = {
  id: string // connection_id — used only to address backend actions; never displayed
  username: string | null
  label: string | null
  status: string
  paused: boolean
  postsPerDay: number | null
  expired: boolean
}

export type PendingInvite = {
  id: string
  label: string | null
  createdAt: string
  expiresAt: string
}

const MANAGE = "/api/admin/social-autopilot/destinations/manage"
const INVITES = "/api/admin/social-autopilot/destinations/invitations"
const CONNECT = "/api/admin/social-autopilot/accounts/instagram/connect"

function fmtDate(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
}

export default function PublishingDestinations({
  configured,
  destinations,
  pendingInvites,
}: {
  configured: boolean
  destinations: Destination[]
  pendingInvites: PendingInvite[]
}) {
  const router = useRouter()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState("")

  // Add-destination invitation flow.
  const [adding, setAdding] = useState(false)
  const [inviteLabel, setInviteLabel] = useState("")
  const [generating, setGenerating] = useState(false)
  const [newLink, setNewLink] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)

  const btn = "text-[12px] font-semibold px-2.5 py-1 rounded-lg border border-[var(--crm-border)] text-[var(--crm-text-secondary)] hover:bg-[var(--crm-card)] transition-colors disabled:opacity-50"
  const btnPrimary = "text-[12.5px] font-semibold px-3 py-1.5 rounded-lg bg-[var(--crm-text-primary)] text-[var(--crm-panel)] disabled:opacity-50"
  const control = "w-full text-[13px] rounded-lg border border-[var(--crm-border)] bg-[var(--crm-card)] text-[var(--crm-text-primary)] px-2.5 py-1.5"
  const dot = (cls: string) => <span className={`h-1.5 w-1.5 rounded-full ${cls}`} />

  const manage = async (id: string, body: Record<string, unknown>) => {
    setBusyId(id)
    try {
      const res = await fetch(MANAGE, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectionId: id, ...body }),
      })
      if (res.ok) router.refresh()
    } finally {
      setBusyId(null)
    }
  }

  const disconnect = (d: Destination) => {
    const who = d.label || (d.username ? `@${d.username}` : "this destination")
    if (!confirm(`Disconnect ${who}? This revokes its Instagram authorization. Scheduled posts stay in the Queue; nothing in your Library is deleted.`)) return
    void manage(d.id, { action: "disconnect" })
  }

  const saveRename = async (id: string) => {
    await manage(id, { action: "label", label: renameValue.trim() })
    setRenamingId(null)
    setRenameValue("")
  }

  const generateLink = async () => {
    setGenerating(true)
    setAddError(null)
    setCopied(false)
    try {
      const res = await fetch(INVITES, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(inviteLabel.trim() ? { label: inviteLabel.trim() } : {}),
      })
      const data = await res.json().catch(() => null)
      if (res.ok && data?.link) {
        setNewLink(data.link as string)
      } else {
        setAddError("Couldn't create the link. Please try again.")
      }
    } catch {
      setAddError("Couldn't create the link. Please try again.")
    } finally {
      setGenerating(false)
    }
  }

  const copyLink = async () => {
    if (!newLink) return
    try {
      await navigator.clipboard.writeText(newLink)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* clipboard blocked — the link stays visible for manual copy */
    }
  }

  const closeAdd = () => {
    setAdding(false)
    setInviteLabel("")
    setNewLink(null)
    setCopied(false)
    setAddError(null)
    router.refresh() // pick up the new pending invitation
  }

  const revokeInvite = async (id: string) => {
    if (!confirm("Revoke this invitation link? It will stop working immediately.")) return
    setBusyId(id)
    try {
      const res = await fetch(`${INVITES}/${id}/revoke`, { method: "POST" })
      if (res.ok) router.refresh()
    } finally {
      setBusyId(null)
    }
  }

  const statusPill = (d: Destination) => {
    if (d.status === "error" || d.expired)
      return <span className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-amber-600 dark:text-amber-400">{dot("bg-amber-500")} Reconnect needed</span>
    if (d.paused)
      return <span className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-[var(--crm-text-muted)]">{dot("bg-[var(--crm-text-muted)]")} Paused</span>
    return <span className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-emerald-600 dark:text-emerald-400">{dot("bg-emerald-500")} Connected</span>
  }

  return (
    <div className="space-y-5">
      {/* ── Publishing Destinations ─────────────────────────────────────────── */}
      <section className="rounded-2xl border border-[var(--crm-border)] bg-[var(--crm-panel)] p-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-[14px] font-bold text-[var(--crm-text-primary)]">Publishing Destinations</h2>
            <p className="text-[11.5px] text-[var(--crm-text-muted)] mt-0.5">Instagram accounts you publish to. Add one by sending a private authorization link.</p>
          </div>
          <button type="button" className={btnPrimary} disabled={!configured} onClick={() => setAdding((v) => !v)}>
            + Add Publishing Destination
          </button>
        </div>

        {!configured && (
          <div className="mt-3 text-[11.5px] text-[var(--crm-text-muted)]">Instagram isn&apos;t configured yet.</div>
        )}

        {/* Add flow — mint a single-use invitation link (shown once). */}
        {adding && (
          <div className="mt-3 rounded-xl border border-[var(--crm-border)] bg-[var(--crm-card)] p-3">
            {!newLink ? (
              <div className="flex items-end gap-2 flex-wrap">
                <label className="block flex-1 min-w-[200px]">
                  <span className="text-[11px] uppercase tracking-wide text-[var(--crm-text-muted)]">Label (optional)</span>
                  <input className={`${control} mt-1`} value={inviteLabel} onChange={(e) => setInviteLabel(e.target.value)} placeholder="e.g. Wife, Sister-in-law, Dallas Account" />
                </label>
                <button type="button" className={btnPrimary} disabled={generating} onClick={() => void generateLink()}>{generating ? "Generating…" : "Generate link"}</button>
                <button type="button" className={btn} disabled={generating} onClick={closeAdd}>Cancel</button>
                {addError && <div className="w-full text-[11.5px] text-amber-600 dark:text-amber-400">{addError}</div>}
              </div>
            ) : (
              <div>
                <div className="text-[12.5px] font-semibold text-[var(--crm-text-primary)]">Private authorization link{inviteLabel.trim() ? ` — ${inviteLabel.trim()}` : ""}</div>
                <div className="text-[11.5px] text-amber-600 dark:text-amber-400 mt-0.5">Copy this now — it&apos;s shown once and can&apos;t be retrieved later.</div>
                <div className="mt-2 flex items-center gap-2 flex-wrap">
                  <input readOnly value={newLink} onFocus={(e) => e.currentTarget.select()} className={`${control} flex-1 min-w-[220px] font-mono text-[12px]`} />
                  <button type="button" className={btnPrimary} onClick={() => void copyLink()}>{copied ? "Copied ✓" : "Copy Link"}</button>
                  <button type="button" className={btn} onClick={closeAdd}>Done</button>
                </div>
                <div className="text-[11px] text-[var(--crm-text-muted)] mt-2">Send this to the account owner. They authorize their own Instagram — no Beast Social account or access is created.</div>
              </div>
            )}
          </div>
        )}

        {/* Destination list. */}
        <div className="mt-3 space-y-2">
          {destinations.length === 0 ? (
            <div className="text-[12.5px] text-[var(--crm-text-muted)] py-2">No destinations connected yet.</div>
          ) : (
            destinations.map((d) => (
              <div key={d.id} className="rounded-xl border border-[var(--crm-border)] bg-[var(--crm-card)] px-3 py-2.5 flex items-center justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[13.5px] font-semibold text-[var(--crm-text-primary)] truncate">@{d.username ?? "instagram"}</span>
                    {d.label && <span className="text-[11.5px] text-[var(--crm-text-secondary)] rounded-full border border-[var(--crm-border)] px-2 py-0.5">{d.label}</span>}
                    {statusPill(d)}
                    {d.postsPerDay != null && (
                      <span className="text-[11px] text-[var(--crm-text-muted)]" title="Scheduling automation is coming later — this is a saved preference only.">
                        {d.postsPerDay} posts/day · scheduling coming soon
                      </span>
                    )}
                  </div>
                  {renamingId === d.id && (
                    <div className="mt-2 flex items-center gap-2">
                      <input autoFocus className={`${control} max-w-[240px]`} value={renameValue} onChange={(e) => setRenameValue(e.target.value)} placeholder="Friendly label" onKeyDown={(e) => { if (e.key === "Enter") void saveRename(d.id); if (e.key === "Escape") setRenamingId(null) }} />
                      <button type="button" className={btnPrimary} disabled={busyId === d.id} onClick={() => void saveRename(d.id)}>Save</button>
                      <button type="button" className={btn} onClick={() => setRenamingId(null)}>Cancel</button>
                    </div>
                  )}
                </div>

                {renamingId !== d.id && (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {(d.status === "error" || d.expired) && <a href={CONNECT} className={btn}>Reconnect</a>}
                    {d.paused ? (
                      <button type="button" className={btn} disabled={busyId === d.id} onClick={() => void manage(d.id, { action: "resume" })}>Resume</button>
                    ) : (
                      <button type="button" className={btn} disabled={busyId === d.id} onClick={() => void manage(d.id, { action: "pause" })}>Pause</button>
                    )}
                    <button type="button" className={btn} disabled={busyId === d.id} onClick={() => { setRenamingId(d.id); setRenameValue(d.label ?? "") }}>Rename</button>
                    <button type="button" className={btn} disabled={busyId === d.id} onClick={() => disconnect(d)}>Disconnect</button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* Secondary: connect the admin's OWN Instagram directly (existing flow, still available). */}
        {configured && (
          <div className="mt-3">
            <a href={CONNECT} className="text-[11.5px] font-semibold text-[var(--crm-text-secondary)] hover:text-[var(--crm-text-primary)]">Connect my own Instagram directly →</a>
          </div>
        )}
      </section>

      {/* ── Pending Invitations ─────────────────────────────────────────────── */}
      {pendingInvites.length > 0 && (
        <section className="rounded-2xl border border-[var(--crm-border)] bg-[var(--crm-panel)] p-4">
          <h2 className="text-[14px] font-bold text-[var(--crm-text-primary)]">Pending Invitations</h2>
          <p className="text-[11.5px] text-[var(--crm-text-muted)] mt-0.5">Links you&apos;ve created that haven&apos;t been used yet. The link itself is shown only once at creation.</p>
          <div className="mt-3 space-y-2">
            {pendingInvites.map((inv) => (
              <div key={inv.id} className="rounded-xl border border-[var(--crm-border)] bg-[var(--crm-card)] px-3 py-2.5 flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2 flex-wrap text-[12.5px]">
                  <span className="font-semibold text-[var(--crm-text-primary)]">{inv.label || "Untitled invitation"}</span>
                  <span className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-[var(--crm-text-secondary)]">{dot("bg-sky-500")} Awaiting authorization</span>
                  <span className="text-[11px] text-[var(--crm-text-muted)]">Created {fmtDate(inv.createdAt)} · Expires {fmtDate(inv.expiresAt)}</span>
                </div>
                <button type="button" className={btn} disabled={busyId === inv.id} onClick={() => void revokeInvite(inv.id)}>Revoke</button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* TikTok / YouTube stay out of scope for now. */}
      <div className="text-[11px] text-[var(--crm-text-muted)]">TikTok and YouTube destinations are coming later.</div>
    </div>
  )
}
