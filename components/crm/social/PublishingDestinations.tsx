"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import AgentSearchField, { type AgentHit } from "@/components/crm/social/AgentSearchField"

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
  addedAt: string
  agentName: string | null // selected Locator Beast agent (display identity)
  agentPhotoUrl: string | null
}

export type PendingInvite = {
  id: string
  label: string | null
  createdAt: string
  expiresAt: string
  agentUserId: string | null // to recreate the link for the same agent
  agentName: string | null
  agentPhotoUrl: string | null
}

const MANAGE = "/api/admin/social-autopilot/destinations/manage"
const INVITES = "/api/admin/social-autopilot/destinations/invitations"
const CONNECT = "/api/admin/social-autopilot/accounts/instagram/connect"
const TT_CONNECT = "/api/integrations/tiktok/connect"
const TT_DISCONNECT = "/api/integrations/tiktok/disconnect"

// A single TikTok connection for the current admin (identity/status only — never tokens).
export type TikTokConnection = {
  username: string | null
  expired: boolean
  addedAt: string | null
}

function fmtDate(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
}

export default function PublishingDestinations({
  configured,
  destinations,
  pendingInvites,
  tiktokConfigured = false,
  tiktok = null,
}: {
  configured: boolean
  destinations: Destination[]
  pendingInvites: PendingInvite[]
  /** Whether TikTok OAuth credentials (client key + secret) are present server-side. */
  tiktokConfigured?: boolean
  /** The admin's TikTok connection, or null when not connected. */
  tiktok?: TikTokConnection | null
}) {
  const router = useRouter()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [ttBusy, setTtBusy] = useState(false)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState("")

  // Add-destination invitation flow.
  const [adding, setAdding] = useState(false)
  const [inviteLabel, setInviteLabel] = useState("")
  const [selectedAgent, setSelectedAgent] = useState<AgentHit | null>(null)
  const [generating, setGenerating] = useState(false)
  const [newLink, setNewLink] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)

  const btn = "text-[12px] font-semibold px-2.5 py-1 rounded-lg border border-[var(--crm-border)] text-[var(--crm-text-secondary)] hover:bg-[var(--crm-card)] transition-colors disabled:opacity-50"
  const btnPrimary = "text-[12.5px] font-semibold px-3 py-1.5 rounded-lg bg-[var(--crm-text-primary)] text-[var(--crm-panel)] disabled:opacity-50"
  const control = "w-full text-[13px] rounded-lg border border-[var(--crm-border)] bg-[var(--crm-card)] text-[var(--crm-text-primary)] px-2.5 py-1.5"
  const dot = (cls: string) => <span className={`h-1.5 w-1.5 rounded-full ${cls}`} />

  // Small avatar (photo or initial) for agent identity on cards / pending rows.
  const avatar = (name: string | null, photoUrl: string | null, size = 24) => {
    const initial = (name || "?").trim().charAt(0).toUpperCase()
    return photoUrl ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={photoUrl} alt="" width={size} height={size} className="rounded-full object-cover flex-none" style={{ width: size, height: size }} />
    ) : (
      <span className="rounded-full flex-none inline-flex items-center justify-center bg-[var(--crm-inset)] text-[var(--crm-text-secondary)] font-semibold" style={{ width: size, height: size, fontSize: size * 0.45 }}>{initial}</span>
    )
  }

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

  const tiktokDisconnect = async () => {
    const who = tiktok?.username ? `@${tiktok.username}` : "TikTok"
    if (!confirm(`Disconnect ${who}? This revokes its TikTok authorization. Nothing in your Library is deleted.`)) return
    setTtBusy(true)
    try {
      const res = await fetch(TT_DISCONNECT, { method: "POST" })
      if (res.ok) router.refresh()
    } finally {
      setTtBusy(false)
    }
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
      // Carry the selected agent (id + name) so the invitation — and later the connected
      // destination — is associated with that Locator Beast agent. Label mirrors the agent name.
      const payload: Record<string, unknown> = {}
      if (selectedAgent) {
        payload.agentUserId = selectedAgent.id
        payload.label = selectedAgent.name
      } else if (inviteLabel.trim()) {
        payload.label = inviteLabel.trim()
      }
      const res = await fetch(INVITES, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
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

  // ALWAYS start a fresh invitation flow. Never reopen a previously created show-once link:
  // clear newLink + label + flags before opening, so "+ Add Publishing Destination" is always a
  // clean, empty form regardless of prior state (connected/pending/used destinations never block it).
  const openAdd = () => {
    setNewLink(null)
    setInviteLabel("")
    setSelectedAgent(null)
    setAddError(null)
    setCopied(false)
    setGenerating(false)
    setAdding(true)
  }

  const closeAdd = () => {
    setAdding(false)
    setInviteLabel("")
    setSelectedAgent(null)
    setNewLink(null)
    setCopied(false)
    setAddError(null)
    router.refresh() // pick up the new pending invitation; drop any just-revoked one
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

  // Create New Link for a PENDING invitation: revoke the old one, mint a fresh invitation with the
  // SAME label, and show the new raw link ONCE (in the add panel's created-link view). The old
  // invitation's raw token is never reconstructed or redisplayed.
  const createNewLink = async (inv: PendingInvite) => {
    const who = inv.label || "this invitation"
    if (!confirm(`Replace the link for ${who}? The old link stops working immediately and a new one-time link is created.`)) return
    setBusyId(inv.id)
    setAddError(null)
    try {
      const rev = await fetch(`${INVITES}/${inv.id}/revoke`, { method: "POST" })
      if (!rev.ok) return
      const payload: Record<string, unknown> = {}
      if (inv.agentUserId) payload.agentUserId = inv.agentUserId
      if (inv.label) payload.label = inv.label
      const res = await fetch(INVITES, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const data = await res.json().catch(() => null)
      if (res.ok && data?.link) {
        setInviteLabel(inv.label ?? "")
        setSelectedAgent(inv.agentUserId ? { id: inv.agentUserId, name: inv.agentName ?? inv.label ?? "Agent", photoUrl: inv.agentPhotoUrl, email: null } : null)
        setCopied(false)
        setNewLink(data.link as string)
        setAdding(true) // surface the created-link view
        router.refresh() // old invite revoked, new one now pending
      } else {
        setAddError("Couldn't create a new link. Please try again.")
        setAdding(true)
      }
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
          <button type="button" className={btnPrimary} disabled={!configured} onClick={openAdd}>
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
              <div>
                <div className="text-[13px] font-semibold text-[var(--crm-text-primary)]">Add Publishing Destination</div>
                <p className="text-[11.5px] text-[var(--crm-text-muted)] mt-0.5">Search for the Locator Beast agent this account belongs to, then create a secure link to send them.</p>
                {!selectedAgent ? (
                  <div className="mt-2">
                    <span className="text-[11px] uppercase tracking-wide text-[var(--crm-text-muted)]">Agent</span>
                    <div className="mt-1"><AgentSearchField inputClassName={control} onSelect={(a) => setSelectedAgent(a)} placeholder="Search agents by name" /></div>
                    <div className="mt-2 flex items-center gap-2">
                      <button type="button" className={btn} disabled={generating} onClick={closeAdd}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-2">
                    <span className="text-[11px] uppercase tracking-wide text-[var(--crm-text-muted)]">Agent</span>
                    <div className="mt-1 flex items-center gap-2 flex-wrap">
                      <span className="inline-flex items-center gap-2 rounded-full border border-[var(--crm-border)] bg-[var(--crm-panel)] pl-1 pr-2.5 py-1">
                        {avatar(selectedAgent.name, selectedAgent.photoUrl, 22)}
                        <span className="text-[12.5px] font-semibold text-[var(--crm-text-primary)]">{selectedAgent.name}</span>
                        <button type="button" aria-label="Clear agent" className="text-[var(--crm-text-muted)] hover:text-[var(--crm-text-primary)]" disabled={generating} onClick={() => setSelectedAgent(null)}>×</button>
                      </span>
                      <button type="button" className={btnPrimary} disabled={generating} onClick={() => void generateLink()}>{generating ? "Creating…" : "Create Authorization Link"}</button>
                      <button type="button" className={btn} disabled={generating} onClick={closeAdd}>Cancel</button>
                    </div>
                  </div>
                )}
                {addError && <div className="mt-2 text-[11.5px] text-amber-600 dark:text-amber-400">{addError}</div>}
              </div>
            ) : (
              <div>
                <div className="text-[13px] font-semibold text-[var(--crm-text-primary)]">Authorization link created</div>
                <p className="text-[11.5px] text-[var(--crm-text-muted)] mt-0.5">This link can be used once and expires in 7 days.</p>
                <div className="mt-2 flex items-center gap-2 flex-wrap">
                  <input readOnly value={newLink} onFocus={(e) => e.currentTarget.select()} className={`${control} flex-1 min-w-[220px] font-mono text-[12px]`} />
                  <button type="button" className={btnPrimary} onClick={() => void copyLink()}>{copied ? "Copied ✓" : "Copy Link"}</button>
                  <button type="button" className={btn} onClick={closeAdd}>Done</button>
                </div>
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
                <div className="min-w-0 flex items-center gap-2.5">
                  {d.agentName && avatar(d.agentName, d.agentPhotoUrl, 32)}
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[13.5px] font-semibold text-[var(--crm-text-primary)] truncate">{d.agentName || `@${d.username ?? "instagram"}`}</span>
                      {!d.agentName && d.label && <span className="text-[11.5px] text-[var(--crm-text-secondary)] rounded-full border border-[var(--crm-border)] px-2 py-0.5">{d.label}</span>}
                      {statusPill(d)}
                      {d.postsPerDay != null && (
                        <span className="text-[11px] text-[var(--crm-text-muted)]" title="Scheduling automation is coming later — this is a saved preference only.">
                          {d.postsPerDay} posts/day · scheduling coming soon
                        </span>
                      )}
                    </div>
                    <div className="text-[11.5px] text-[var(--crm-text-muted)] mt-0.5">
                      {d.agentName && <span className="text-[var(--crm-text-secondary)]">@{d.username ?? "instagram"} · </span>}
                      Added {fmtDate(d.addedAt)}
                    </div>
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
                  {inv.agentName && avatar(inv.agentName, inv.agentPhotoUrl, 22)}
                  <span className="font-semibold text-[var(--crm-text-primary)]">{inv.agentName || inv.label || "Untitled invitation"}</span>
                  <span className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-[var(--crm-text-secondary)]">{dot("bg-sky-500")} Awaiting authorization</span>
                  <span className="text-[11px] text-[var(--crm-text-muted)]">Created {fmtDate(inv.createdAt)} · Expires {fmtDate(inv.expiresAt)}</span>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <button type="button" className={btn} disabled={busyId === inv.id} onClick={() => void createNewLink(inv)}>Create New Link</button>
                  <button type="button" className={btn} disabled={busyId === inv.id} onClick={() => void revokeInvite(inv.id)}>Revoke</button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── TikTok (Sandbox) ────────────────────────────────────────────────── */}
      <section className="rounded-2xl border border-[var(--crm-border)] bg-[var(--crm-panel)] p-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-[14px] font-bold text-[var(--crm-text-primary)]">TikTok</h2>
            <p className="text-[11.5px] text-[var(--crm-text-muted)] mt-0.5">Connect a TikTok account to publish to. Sandbox connection for testing.</p>
          </div>
          {tiktokConfigured && !tiktok && (
            <a href={TT_CONNECT} className={btnPrimary}>Connect TikTok</a>
          )}
        </div>

        {!tiktokConfigured ? (
          <div className="mt-3 text-[11.5px] text-[var(--crm-text-muted)]">TikTok isn&apos;t configured yet.</div>
        ) : !tiktok ? (
          <div className="mt-3 text-[12.5px] text-[var(--crm-text-muted)] py-2">No TikTok account connected yet.</div>
        ) : (
          <div className="mt-3 rounded-xl border border-[var(--crm-border)] bg-[var(--crm-card)] px-3 py-2.5 flex items-center justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[13.5px] font-semibold text-[var(--crm-text-primary)] truncate">{tiktok.username ? `@${tiktok.username}` : "TikTok account"}</span>
                {tiktok.expired ? (
                  <span className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-amber-600 dark:text-amber-400">{dot("bg-amber-500")} Reconnect needed</span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-emerald-600 dark:text-emerald-400">{dot("bg-emerald-500")} Connected</span>
                )}
              </div>
              {tiktok.addedAt && <div className="text-[11.5px] text-[var(--crm-text-muted)] mt-0.5">Added {fmtDate(tiktok.addedAt)}</div>}
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              {tiktok.expired && <a href={TT_CONNECT} className={btn}>Reconnect</a>}
              <button type="button" className={btn} disabled={ttBusy} onClick={() => void tiktokDisconnect()}>Disconnect</button>
            </div>
          </div>
        )}
      </section>

      {/* YouTube stays out of scope for now. */}
      <div className="text-[11px] text-[var(--crm-text-muted)]">YouTube destinations are coming later.</div>
    </div>
  )
}
