"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import AgentSearchField, { type AgentHit } from "@/components/crm/social/AgentSearchField"
import {
  type Capability,
  type CapabilityState,
  type ConnectionStatus,
  CAPABILITY_TONE,
  CONNECTION_STATUS_LABEL,
  CONNECTION_STATUS_TONE,
  CONNECTION_STATUS_DOT,
  connectionStatus,
  autoPostingWord,
  autoReplyWord,
  REAUTHORIZE_COMMENTS_LABEL, REAUTHORIZE_COMMENTS_TITLE,
} from "@/lib/social/accountCapabilities"

// Beast Social → Accounts → Publishing Destinations (admin-only management UI).
//
// ── WHAT THIS SCREEN IS ─────────────────────────────────────────────────────────────────────
// Every account this Beast Social admin publishes to, grouped by WHOSE account it is and then by
// platform. It manages each one by its connection_id through the connection-ID-scoped backend
// (/destinations/manage), never the legacy owner+provider disconnect, and NEVER shows external
// account ids, Vault/token ids, owner uuids or tokens — only safe identity/label/status.
//
// ── THE REDESIGN, AND WHAT IT DELIBERATELY DOES NOT DO ──────────────────────────────────────
// This was a flat list of Instagram rows, a flat list of TikTok rows, and a third list of pending
// invitations at the bottom of the page — so the only way to learn that an invitation belonged to
// an agent was to read its label and remember. Accounts now sit under their owner, an invitation
// sits under the person it was sent to, and each card states three things in three fixed rows.
//
// IT RENDERS DECISIONS, IT DOES NOT MAKE THEM. publishingCapability, autoReplyCapability and
// accountAutomationGate still decide what is true; connectionStatus / autoPostingWord /
// autoReplyWord only translate their verdict into the card's shorter vocabulary. A rule
// re-derived here could disagree with the gate, and the operator would be reading the wrong one.
//
// EVERY ACTION IS THE ONE THAT WAS HERE BEFORE: the same endpoints, the same request bodies, the
// same confirmations. Nothing about connections, invitations, scopes, schedules, cadence,
// rendering, approvals or publishing changed — only where a control sits and what the card says.

export type Destination = {
  id: string // connection_id — used only to address backend actions; never displayed
  username: string | null
  label: string | null
  /** Whose account this is. NULL is the OWNER's own, never "no agent". */
  agentUserId: string | null
  status: string
  paused: boolean
  postsPerDay: number | null
  /** The markets this destination may publish — null = every market. Normalised server-side
   *  through lib/social/marketRestriction, the same helper the planner and both publish workers
   *  consult, so this chip cannot describe a different rule than the one being enforced. */
  marketRestriction: string[] | null
  expired: boolean
  addedAt: string
  agentName: string | null // selected Locator Beast agent (display identity)
  agentPhotoUrl: string | null
  // ── THE TWO CAPABILITIES ──────────────────────────────────────────────────────────────────
  // Computed server-side (lib/social/accountCapabilities) from the master Auto Posting switch and
  // from accountAutomationGate.
  publishing: Capability
  autoReply: Capability
  /** Drives the Re-authorize Comments action. From the granted scopes, never assumed. */
  commentsScopeGranted: boolean
}

// ONE TikTok destination for the current admin (identity/status only — never tokens). There may be
// several: a TikTok connection is a social_connections row exactly as an Instagram one is.
export type TikTokConnection = {
  /** connection_id — addresses the connection-scoped backend actions; never displayed. */
  id: string
  /** Friendly label, set with Rename. The one way to tell two accounts apart at a glance when
   *  their TikTok display names are similar. */
  label: string | null
  /** Whose account this is. NULL is the OWNER's own — what the live TikTok row carries. */
  agentUserId: string | null
  /** This destination's OWN pause switch (social_connections.posting_paused), not the owner-wide
   *  Auto Posting master switch. */
  paused: boolean
  /** The stored TikTok identity (display_name). NOT a real @handle — TikTok does not give us one,
   *  so the card never renders this with an @ in front of it. */
  username: string | null
  /** social_connections.status, so a TikTok row reads the same three statuses an Instagram row
   *  does rather than inferring health from expiry alone. */
  status?: string
  /** The connected account's real TikTok avatar (persisted via user.info.basic on connect). */
  avatarUrl?: string | null
  /** The destination's own cadence. computeAutopilotPlan builds a rule from EVERY connection and
   *  takes its daily times from this column regardless of provider, so this is as real here as it
   *  is on an Instagram card. */
  postsPerDay?: number | null
  ownerName?: string | null
  ownerPhotoUrl?: string | null
  expired: boolean
  addedAt: string | null
  /** Same meaning as the Instagram row's — the restriction is a property of the DESTINATION, not
   *  of the platform, so both rows read the same column through the same helper. */
  marketRestriction?: string[] | null
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

/**
 * One person's accounts, across both platforms.
 *
 * Built in the page from the relationships that already exist — social_connections.agent_user_id
 * and social_destination_invitations.agent_user_id — so a new agent gets a band the moment they
 * have a connection or an invitation, and nothing has to be registered anywhere for them to
 * appear. `kind` is the only thing separating My Accounts from Team Accounts.
 */
export type OwnerGroup = {
  key: string
  kind: "mine" | "team"
  name: string
  photoUrl: string | null
  instagram: Destination[]
  tiktok: TikTokConnection[]
  /** Instagram-only today: the invitation → authorize flow exists for Instagram alone. */
  invites: PendingInvite[]
}

const MANAGE = "/api/admin/social-autopilot/destinations/manage"
const INVITES = "/api/admin/social-autopilot/destinations/invitations"
const CONNECT = "/api/admin/social-autopilot/accounts/instagram/connect"
const COMMENTS_PAGE = "/admin/social-autopilot/comments"
const TT_CONNECT = "/api/integrations/tiktok/connect"

type Platform = "instagram" | "tiktok"

function fmtDate(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
}

function InstagramGlyph({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <rect x="2" y="2" width="20" height="20" rx="5.5" />
      <circle cx="12" cy="12" r="4.4" />
      <circle cx="17.6" cy="6.4" r="1.1" fill="currentColor" stroke="none" />
    </svg>
  )
}
function TikTokGlyph({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M16.6 3c.3 2.03 1.63 3.6 3.4 3.86V9.3c-1.28 0-2.47-.4-3.44-1.07v6.09c0 3.07-2.49 5.56-5.56 5.56S5.44 17.4 5.44 14.32c0-2.97 2.32-5.4 5.24-5.55v2.5c-.2-.04-.4-.06-.6-.06-1.71 0-3.1 1.39-3.1 3.11 0 1.72 1.39 3.11 3.1 3.11 1.72 0 3.11-1.39 3.11-3.11V3h3.41z" />
    </svg>
  )
}

/**
 * The market-restriction chip. ONE renderer for both platforms, because the restriction is a
 * property of the destination rather than of Instagram or TikTok. Absent entirely when
 * unrestricted, so an unrestricted account's card is unchanged.
 */
function marketChip(markets: string[] | null | undefined) {
  if (!markets || markets.length === 0) return null
  return (
    <span
      className="text-[11px] font-semibold text-amber-700 dark:text-amber-400 rounded-full border border-amber-300 dark:border-amber-700/60 px-2 py-0.5"
      title={`This destination may only publish ${markets.join(", ")} content. When no ${markets.join(" / ")} video is available its slot is left empty — another market is never substituted.`}
    >
      {markets.join(", ")} only
    </span>
  )
}

export default function PublishingDestinations({
  configured,
  tiktokConfigured = false,
  groups,
}: {
  configured: boolean
  /** Whether TikTok OAuth credentials (client key + secret) are present server-side. */
  tiktokConfigured?: boolean
  /** Every owner with an account or an invitation, My Accounts first. */
  groups: OwnerGroup[]
}) {
  const router = useRouter()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState("")
  const [openAdvanced, setOpenAdvanced] = useState<string | null>(null)

  // Add-account flow.
  const [adding, setAdding] = useState(false)
  const [addPlatform, setAddPlatform] = useState<Platform | null>(null)
  const [addRoute, setAddRoute] = useState<"self" | "invite" | null>(null)
  const [inviteLabel, setInviteLabel] = useState("")
  const [selectedAgent, setSelectedAgent] = useState<AgentHit | null>(null)
  const [generating, setGenerating] = useState(false)
  const [newLink, setNewLink] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)

  const btn = "text-[12px] font-semibold px-2.5 py-1.5 rounded-lg border border-[var(--crm-border)] text-[var(--crm-text-secondary)] hover:bg-[var(--crm-card)] transition-colors disabled:opacity-50"
  const btnPrimary = "text-[12.5px] font-semibold px-3 py-1.5 rounded-lg bg-[var(--crm-text-primary)] text-[var(--crm-panel)] disabled:opacity-50"
  const control = "w-full text-[13px] rounded-lg border border-[var(--crm-border)] bg-[var(--crm-card)] text-[var(--crm-text-primary)] px-2.5 py-1.5"
  const dot = (cls: string) => <span className={`h-1.5 w-1.5 rounded-full ${cls}`} />

  const avatar = (name: string | null, photoUrl: string | null, size = 24) => {
    const initial = (name || "?").trim().charAt(0).toUpperCase()
    return photoUrl ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={photoUrl} alt="" width={size} height={size} className="rounded-full object-cover flex-none" style={{ width: size, height: size }} />
    ) : (
      <span className="rounded-full flex-none inline-flex items-center justify-center bg-[var(--crm-inset)] text-[var(--crm-text-secondary)] font-semibold" style={{ width: size, height: size, fontSize: size * 0.42 }}>{initial}</span>
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

  // ONE TikTok destination, through the SAME connection-scoped backend the Instagram rows use —
  // sa_disconnect_destination(connection_id), never the argument-less sa_disconnect_tiktok() that
  // removed every TikTok row for the owner while revoking only one of their Vault secrets.
  const tiktokDisconnect = (t: TikTokConnection) => {
    const who = t.label || (t.username ? `@${t.username}` : "this TikTok account")
    if (!confirm(`Disconnect ${who}? This revokes its TikTok authorization. Your other accounts are unaffected, and nothing in your Library is deleted.`)) return
    void manage(t.id, { action: "disconnect" })
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

  // ALWAYS start a fresh flow. Never reopen a previously created show-once link.
  const openAdd = (platform: Platform | null, agent: AgentHit | null = null) => {
    setNewLink(null)
    setInviteLabel("")
    setSelectedAgent(agent)
    setAddError(null)
    setCopied(false)
    setGenerating(false)
    setAddPlatform(platform)
    setAddRoute(platform === "tiktok" ? "self" : agent ? "invite" : null)
    setAdding(true)
  }

  const closeAdd = () => {
    setAdding(false)
    setAddPlatform(null)
    setAddRoute(null)
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
  // SAME label, and show the new raw link ONCE. The old invitation's raw token is never
  // reconstructed or redisplayed — it was shown once, at creation, and is not stored.
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
        setAddPlatform("instagram")
        setAddRoute("invite")
        setNewLink(data.link as string)
        setAdding(true) // surface the created-link view
        router.refresh() // old invite revoked, new one now pending
      } else {
        setAddError("Couldn't create a new link. Please try again.")
        setAddPlatform("instagram")
        setAddRoute("invite")
        setAdding(true)
      }
    } finally {
      setBusyId(null)
    }
  }

  // ── THE STATUS CHIP ───────────────────────────────────────────────────────────────────────
  // Three values, and only three. It answers ONE question — can we reach this account — so a
  // healthy account whose posting is paused reads Connected and says "Paused" on its own line
  // instead. Mixing the two is what made a deliberate pause and a dead token wear the same pill.
  const statusChip = (state: ConnectionStatus) => {
    const tone = CONNECTION_STATUS_TONE[state]
    const marker =
      state === "not_connected"
        ? <span className="h-[9px] w-[9px] rounded-full border-[1.5px] border-current" />
        : dot(CONNECTION_STATUS_DOT[state])
    return (
      <span className={`inline-flex items-center gap-1.5 text-[11.5px] font-semibold rounded-full border px-2.5 py-1 whitespace-nowrap ${tone}`}>
        {marker} {CONNECTION_STATUS_LABEL[state]}
      </span>
    )
  }

  // ── THE THREE FACTS ───────────────────────────────────────────────────────────────────────
  // Label left, value right, in a fixed order on every card and both platforms, so the three read
  // as a column down the page rather than as a sentence to be parsed per account.
  const factRow = (label: string, value: React.ReactNode, title?: string) => (
    <div className="flex items-baseline gap-2 py-[3px]" title={title}>
      <span className="text-[12px] text-[var(--crm-text-muted)] w-[92px] flex-none">{label}</span>
      <span className="text-[12.5px] min-w-0">{value}</span>
    </div>
  )
  // ONE palette, shared with the preview harness. A colour defined here is a colour the harness
  // cannot see, and the two drifted apart once already.
  const toneOf = (state: CapabilityState) => `${CAPABILITY_TONE[state]} font-semibold`
  const toneFor = (cap: Capability) => toneOf(cap.state)

  const cadence = (postsPerDay: number | null | undefined) => (
    <span className="font-semibold text-[var(--crm-text-primary)]">
      {postsPerDay ?? 2}
      <span className="font-normal text-[var(--crm-text-muted)]">
        {postsPerDay == null ? " (default — 7:30 AM & 7:30 PM CT)" : " per day"}
      </span>
    </span>
  )

  const muted = <span className="text-[var(--crm-text-muted)]">—</span>

  // ── THE CARD ──────────────────────────────────────────────────────────────────────────────
  const card = (opts: {
    key: string
    name: string
    handle: React.ReactNode
    sub: React.ReactNode
    photoUrl: string | null
    isOwner: boolean
    glyph: React.ReactNode
    status: ConnectionStatus
    facts: React.ReactNode
    note?: React.ReactNode
    actions?: React.ReactNode
    advanced?: React.ReactNode
    advancedKey?: string
  }) => (
    <div key={opts.key} className="rounded-xl border border-[var(--crm-border)] bg-[var(--crm-card)] px-3.5 py-3">
      <div className="flex items-start gap-3 flex-wrap">
        <div className="flex items-center gap-3 min-w-0 flex-1 basis-[230px]">
          {avatar(opts.name, opts.photoUrl, 40)}
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[14px] font-bold text-[var(--crm-text-primary)]">{opts.name}</span>
              {opts.isOwner && (
                <span className="text-[10px] font-bold uppercase tracking-wide rounded px-1.5 py-[2px] bg-[var(--crm-text-primary)] text-[var(--crm-panel)]">You</span>
              )}
              <span className="text-[var(--crm-text-muted)] inline-flex">{opts.glyph}</span>
            </div>
            <div className="text-[12.5px] text-[var(--crm-text-secondary)] mt-[1px]">{opts.handle}</div>
            <div className="text-[11.5px] text-[var(--crm-text-muted)] mt-[1px]">{opts.sub}</div>
          </div>
        </div>

        <div className="flex-none pt-1">{statusChip(opts.status)}</div>

        <div className="flex-1 basis-[240px] min-w-0 sm:border-l sm:border-[var(--crm-border)] sm:pl-4">
          {opts.facts}
          {opts.note && <div className="text-[11.5px] text-[var(--crm-text-muted)] mt-1.5 leading-snug">{opts.note}</div>}
        </div>

        {opts.actions && <div className="flex-none flex flex-col gap-1.5 w-[162px]">{opts.actions}</div>}
      </div>

      {opts.advanced && opts.advancedKey && openAdvanced === opts.advancedKey && (
        <div className="mt-3 rounded-lg border border-[var(--crm-border)] bg-[var(--crm-panel)] p-3">{opts.advanced}</div>
      )}
    </div>
  )

  const advancedToggle = (key: string) => (
    <button
      type="button"
      className={btn}
      aria-expanded={openAdvanced === key}
      onClick={() => setOpenAdvanced(openAdvanced === key ? null : key)}
    >
      Advanced {openAdvanced === key ? "▲" : "▾"}
    </button>
  )

  const advancedRow = (label: string, detail: React.ReactNode, action: React.ReactNode) => (
    <div className="flex items-center gap-3 flex-wrap py-1.5 border-b border-[var(--crm-border)] last:border-b-0">
      <div className="flex-1 min-w-[160px]">
        <div className="text-[12px] font-semibold text-[var(--crm-text-primary)]">{label}</div>
        <div className="text-[11px] text-[var(--crm-text-muted)]">{detail}</div>
      </div>
      {action}
    </div>
  )

  const renameBox = (id: string) => (
    <div className="mt-2 flex items-center gap-2 flex-wrap">
      <input autoFocus className={`${control} max-w-[240px]`} value={renameValue} onChange={(e) => setRenameValue(e.target.value)} placeholder="Friendly label" onKeyDown={(e) => { if (e.key === "Enter") void saveRename(id); if (e.key === "Escape") setRenamingId(null) }} />
      <button type="button" className={btnPrimary} disabled={busyId === id} onClick={() => void saveRename(id)}>Save</button>
      <button type="button" className={btn} onClick={() => setRenamingId(null)}>Cancel</button>
    </div>
  )

  // ── INSTAGRAM CARD ────────────────────────────────────────────────────────────────────────
  const instagramCard = (d: Destination, isOwner: boolean) => {
    const state = connectionStatus({ status: d.status, expired: d.expired })
    const igMarket = marketChip(d.marketRestriction)
    const needsComments = !d.commentsScopeGranted || d.autoReply.state === "permission_needed"
    return card({
      key: d.id,
      name: d.agentName || (d.username ? `@${d.username}` : "Instagram account"),
      handle: d.agentName && d.username ? `@${d.username}` : d.label && !d.agentName ? d.label : null,
      sub: <>Added {fmtDate(d.addedAt)}{igMarket ? <> · {igMarket}</> : null}</>,
      photoUrl: d.agentPhotoUrl,
      isOwner,
      glyph: <InstagramGlyph />,
      status: state,
      facts: (
        <>
          {factRow("Auto Posting", <span className={toneFor(d.publishing)}>{autoPostingWord(d.publishing)}</span>, d.publishing.detail)}
          {factRow("Posts per day", cadence(d.postsPerDay))}
          {factRow("Auto Reply", <span className={toneFor(d.autoReply)}>{autoReplyWord(d.autoReply)}</span>, d.autoReply.detail)}
        </>
      ),
      note: d.publishing.state !== "active" || d.autoReply.state !== "active" ? (
        <>{d.publishing.state !== "active" ? d.publishing.detail : d.autoReply.detail}</>
      ) : null,
      actions: (
        <>
          {state === "reconnect_needed" && <a href={CONNECT} className={`${btnPrimary} text-center`} title={REAUTHORIZE_COMMENTS_TITLE}>Reconnect</a>}
          {needsComments && (
            <a href={CONNECT} className={`${btn} text-center`} title={REAUTHORIZE_COMMENTS_TITLE}>{REAUTHORIZE_COMMENTS_LABEL}</a>
          )}
          {advancedToggle(d.id)}
        </>
      ),
      advancedKey: d.id,
      advanced: (
        <>
          {renamingId === d.id ? renameBox(d.id) : (
            <>
              {advancedRow(
                d.paused ? "Resume posting to this account" : "Pause just this account",
                "Separate from the master Auto Posting switch — your other accounts are unaffected.",
                d.paused
                  ? <button type="button" className={btn} disabled={busyId === d.id} onClick={() => void manage(d.id, { action: "resume" })}>Resume</button>
                  : <button type="button" className={btn} disabled={busyId === d.id} onClick={() => void manage(d.id, { action: "pause" })}>Pause</button>,
              )}
              {advancedRow("Agent Name", d.label || "Not set", (
                <button type="button" className={btn} disabled={busyId === d.id} onClick={() => { setRenameValue(d.label ?? ""); setRenamingId(d.id) }}>Change</button>
              ))}
              {advancedRow(
                "Market restriction",
                d.marketRestriction && d.marketRestriction.length > 0 ? `${d.marketRestriction.join(", ")} only` : "Every market — unrestricted",
                <span className="text-[11px] text-[var(--crm-text-muted)]">Set by an administrator</span>,
              )}
              {advancedRow("Posting cadence", d.postsPerDay == null ? "Social Beast Default — 2×/day" : `${d.postsPerDay}×/day`, (
                <span className="text-[11px] text-[var(--crm-text-muted)]">Set by an administrator</span>
              ))}
              {advancedRow("Comment permissions", d.autoReply.detail, (
                <a href={COMMENTS_PAGE} className={btn}>Manage in Comments</a>
              ))}
              {state !== "reconnect_needed" && advancedRow("Re-authorize", "Refreshes the sign-in. Settings, schedules and the queue are kept — sign in with the SAME account.", (
                <a href={CONNECT} className={btn} title={REAUTHORIZE_COMMENTS_TITLE}>Reconnect</a>
              ))}
              {advancedRow("Disconnect this account", "Revokes its authorization. Scheduled posts stay in the Queue; nothing in your Library is deleted.", (
                <button type="button" className={`${btn} text-[#c0264b] dark:text-[#ff8097]`} disabled={busyId === d.id} onClick={() => disconnect(d)}>Disconnect</button>
              ))}
            </>
          )}
        </>
      ),
    })
  }

  // ── TIKTOK CARD ───────────────────────────────────────────────────────────────────────────
  const tiktokCard = (t: TikTokConnection, isOwner: boolean) => {
    const state = connectionStatus({ status: t.status ?? "connected", expired: t.expired })
    const ttMarket = marketChip(t.marketRestriction)
    return card({
      key: t.id,
      name: t.label || t.username || t.ownerName || "TikTok account",
      // TikTok reports a DISPLAY NAME, not a handle. Rendering it behind an @ would invent one.
      handle: t.label && t.username ? t.username : null,
      sub: <>Added {t.addedAt ? fmtDate(t.addedAt) : "—"}{ttMarket ? <> · {ttMarket}</> : null}</>,
      photoUrl: t.avatarUrl ?? t.ownerPhotoUrl ?? null,
      isOwner,
      glyph: <TikTokGlyph />,
      status: state,
      facts: (
        <>
          {factRow("Auto Posting", <span className={toneOf(state === "reconnect_needed" ? "attention" : t.paused ? "paused" : "disabled")}>
            {state === "reconnect_needed" ? "Blocked" : t.paused ? "Paused" : "Follows the master switch"}
          </span>)}
          {factRow("Posts per day", cadence(t.postsPerDay))}
          {factRow("Auto Reply", <span className="text-[var(--crm-text-muted)] italic">Not supported on TikTok</span>)}
        </>
      ),
      note: state === "reconnect_needed"
        ? "This account's TikTok sign-in has expired — nothing will publish here until it is reconnected."
        : null,
      actions: (
        <>
          {state === "reconnect_needed" && <a href={TT_CONNECT} className={`${btnPrimary} text-center`} title="Re-authorize this TikTok account. Nothing is disconnected, your other accounts are unaffected, and your scheduled posts stay put — sign in with the SAME TikTok account.">Reconnect TikTok</a>}
          {advancedToggle(t.id)}
        </>
      ),
      advancedKey: t.id,
      advanced: (
        <>
          {renamingId === t.id ? renameBox(t.id) : (
            <>
              {advancedRow(
                t.paused ? "Resume posting to this account" : "Pause just this account",
                "Separate from the master Auto Posting switch — your other accounts are unaffected.",
                t.paused
                  ? <button type="button" className={btn} disabled={busyId === t.id} onClick={() => void manage(t.id, { action: "resume" })}>Resume</button>
                  : <button type="button" className={btn} disabled={busyId === t.id} onClick={() => void manage(t.id, { action: "pause" })}>Pause</button>,
              )}
              {advancedRow("Agent Name", t.label || "Not set", (
                <button type="button" className={btn} disabled={busyId === t.id} onClick={() => { setRenameValue(t.label ?? ""); setRenamingId(t.id) }}>Change</button>
              ))}
              {advancedRow(
                "Market restriction",
                t.marketRestriction && t.marketRestriction.length > 0 ? `${t.marketRestriction.join(", ")} only` : "Every market — unrestricted",
                <span className="text-[11px] text-[var(--crm-text-muted)]">Set by an administrator</span>,
              )}
              {advancedRow("Posting cadence", t.postsPerDay == null ? "Social Beast Default — 2×/day" : `${t.postsPerDay}×/day`, (
                <span className="text-[11px] text-[var(--crm-text-muted)]">Set by an administrator</span>
              ))}
              {state !== "reconnect_needed" && advancedRow("Re-authorize", "Refreshes the sign-in. Nothing is disconnected and your other accounts are unaffected — sign in with the SAME TikTok account.", (
                <a href={TT_CONNECT} className={btn} title="Re-authorize this TikTok account. Nothing is disconnected, your other accounts are unaffected, and your scheduled posts stay put — sign in with the SAME TikTok account.">Reconnect</a>
              ))}
              {advancedRow("Disconnect this account", "Revokes its authorization. Scheduled posts stay in the Queue; nothing in your Library is deleted.", (
                <button type="button" className={`${btn} text-[#c0264b] dark:text-[#ff8097]`} disabled={busyId === t.id} onClick={() => tiktokDisconnect(t)}>Disconnect</button>
              ))}
            </>
          )}
        </>
      ),
    })
  }

  // ── A PENDING INVITATION ──────────────────────────────────────────────────────────────────
  // Rendered UNDER the person it was sent to. Two shapes, because an invitation means different
  // things depending on whether that person already has an account:
  //   • they do   → a strip beneath their card: an unused link, which is worth knowing about
  //   • they don't → the invitation IS their card, status Not Connected
  //
  // THE RAW LINK IS NEVER REDISPLAYED. It is shown once, at creation, and only a hash is stored —
  // so the action is "Create New Link" (revoke + mint a fresh one), never "copy".
  const inviteStrip = (inv: PendingInvite, isOwner: boolean) => (
    <div key={inv.id} className="rounded-xl border border-[var(--crm-border)] border-l-2 border-l-sky-500 bg-[var(--crm-panel)] px-3.5 py-2.5 flex items-center gap-3 flex-wrap">
      <div className="min-w-0 flex-1 basis-[240px]">
        <div className="text-[12.5px] font-semibold text-[var(--crm-text-primary)] flex items-center gap-2">
          {dot("bg-sky-500")}
          <span className="whitespace-nowrap">Invitation link{isOwner ? " (You)" : ""}</span>
          <span className="text-[var(--crm-text-muted)] font-normal inline-flex items-center gap-1 whitespace-nowrap">· <InstagramGlyph size={12} /> Instagram</span>
        </div>
        <div className="text-[11.5px] text-[var(--crm-text-muted)] mt-[1px]">
          Awaiting authorization · Created {fmtDate(inv.createdAt)} · Expires {fmtDate(inv.expiresAt)}
        </div>
      </div>
      <div className="flex items-center gap-1.5 flex-wrap">
        <button type="button" className={btn} disabled={busyId === inv.id} onClick={() => void createNewLink(inv)}>Create New Link</button>
        <button type="button" className={btn} disabled={busyId === inv.id} onClick={() => void revokeInvite(inv.id)}>Revoke</button>
      </div>
    </div>
  )

  const inviteCard = (inv: PendingInvite, group: OwnerGroup) =>
    card({
      key: inv.id,
      name: inv.agentName || inv.label || "Untitled invitation",
      handle: <span className="italic text-[var(--crm-text-muted)]">no account connected yet</span>,
      sub: <>Invitation sent {fmtDate(inv.createdAt)} · expires {fmtDate(inv.expiresAt)}</>,
      photoUrl: inv.agentPhotoUrl,
      isOwner: group.kind === "mine",
      glyph: <InstagramGlyph />,
      status: "not_connected",
      facts: (
        <>
          {factRow("Auto Posting", muted)}
          {factRow("Posts per day", muted)}
          {factRow("Auto Reply", muted)}
        </>
      ),
      note: group.kind === "mine"
        ? "This is your own account, so you can sign in to it directly — which also grants comment access. The invitation link stays valid until you use it or revoke it."
        : "A link invitation cannot grant comment access, so Auto Reply will be unavailable on an account connected this way.",
      actions: (
        <>
          {group.kind === "mine" && (
            <a href={CONNECT} className={`${btnPrimary} text-center`} title="Sign in to this Instagram account yourself. This is the only route that can grant comment management, which Auto Reply needs.">Connect account</a>
          )}
          <button type="button" className={btn} disabled={busyId === inv.id} onClick={() => void createNewLink(inv)}>Create New Link</button>
          <button type="button" className={btn} disabled={busyId === inv.id} onClick={() => void revokeInvite(inv.id)}>Revoke</button>
        </>
      ),
    })

  // ── AN EMPTY SLOT ─────────────────────────────────────────────────────────────────────────
  // Where this owner's next account on this platform goes. Present rather than implied, because
  // "Lisette has no TikTok yet" is a thing to see, not an absence to infer.
  /** empty = nothing in this band at all · pending = only an unused invitation · another = a
 *  connected account already exists. The three read differently and only the last is "another". */
  const emptySlot = (group: OwnerGroup, platform: Platform, slot: "empty" | "pending" | "another" = "empty") => {
    const who = group.kind === "mine" ? "you" : group.name
    const agentHit: AgentHit | null =
      group.kind === "team" ? { id: group.key, name: group.name, photoUrl: group.photoUrl, email: null } : null
    return (
      <div className="rounded-xl border border-dashed border-[var(--crm-border)] px-3.5 py-3 flex items-center gap-3 flex-wrap">
        <span className="h-9 w-9 rounded-full bg-[var(--crm-card)] text-[var(--crm-text-muted)] inline-flex items-center justify-center flex-none">
          {platform === "tiktok" ? <TikTokGlyph size={16} /> : <InstagramGlyph size={16} />}
        </span>
        <div className="min-w-0 flex-1 basis-[230px]">
          <div className="text-[12.5px] font-semibold text-[var(--crm-text-primary)]">
            {slot === "empty"
              ? `No ${platform === "tiktok" ? "TikTok" : "Instagram"} account connected for ${who} yet.`
              : slot === "another"
                ? group.kind === "mine"
                  ? `Add another ${platform === "tiktok" ? "TikTok" : "Instagram"} account of your own.`
                  : `Add another ${platform === "tiktok" ? "TikTok" : "Instagram"} account for ${who}.`
                : group.kind === "mine"
                  ? `Add an ${platform === "tiktok" ? "TikTok" : "Instagram"} account of your own.`
                  : `Add an ${platform === "tiktok" ? "TikTok" : "Instagram"} account for ${who}.`}
          </div>
          <div className="text-[11.5px] text-[var(--crm-text-muted)] mt-[1px]">
            {platform === "tiktok"
              ? "TikTok has no invitation link — it is a direct sign-in, so it has to be done from a browser signed in to that TikTok account."
              : group.kind === "mine"
                ? "Connect an account you can sign in to, or send someone a one-time authorization link."
                : "Send a one-time authorization link. They authorize their own Instagram and get no access to Social Beast."}
          </div>
        </div>
        <button
          type="button"
          className={btnPrimary}
          disabled={platform === "tiktok" ? !tiktokConfigured : !configured}
          onClick={() => openAdd(platform, agentHit)}
        >
          + Add {group.kind === "team" ? `${group.name.split(" ")[0]}'s ` : ""}{platform === "tiktok" ? "TikTok" : "Instagram"}
        </button>
      </div>
    )
  }

  const ownerBand = (group: OwnerGroup, counts: string) => (
    <div className="flex items-center gap-2.5 rounded-lg border border-[#3d3159] bg-[#2a2140] px-3 py-2 mb-2.5">
      <span className="text-[#b9a6e8] inline-flex flex-none" aria-hidden>
        {group.kind === "mine" ? (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7" /></svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><circle cx="9" cy="8" r="3.4" /><path d="M2 20c0-3.9 3.1-6.2 7-6.2s7 2.3 7 6.2" /><path d="M17 11.2A3.2 3.2 0 1 0 17 5" /><path d="M18.5 13.6c2.1.6 3.5 2.3 3.5 4.6" /></svg>
        )}
      </span>
      <span className="text-[13px] font-bold text-white">{group.kind === "mine" ? "My Accounts" : "Team Accounts"}</span>
      <span className="text-[12px] font-semibold text-[#bdb0da]">{group.name}</span>
      <span className="ml-auto text-[11px] font-semibold text-[#a295c4]">{counts}</span>
    </div>
  )

  const countsFor = (connected: number, pending: number) =>
    pending > 0 ? `${connected} connected · ${pending} pending` : `${connected} connected`

  const totals = {
    instagram: groups.reduce((n, g) => n + g.instagram.length, 0),
    instagramPending: groups.reduce((n, g) => n + g.invites.length, 0),
    tiktok: groups.reduce((n, g) => n + g.tiktok.length, 0),
  }

  // ── A PLATFORM SECTION ────────────────────────────────────────────────────────────────────
  const platformSection = (platform: Platform) => {
    const isIg = platform === "instagram"
    const ready = isIg ? configured : tiktokConfigured
    return (
      <section className="rounded-2xl border border-[var(--crm-border)] bg-[var(--crm-panel)] p-4">
        <div className="flex items-center gap-3 flex-wrap mb-3">
          <span className={`h-9 w-9 rounded-[10px] flex-none inline-flex items-center justify-center text-white ${isIg ? "bg-gradient-to-br from-[#f9ce34] via-[#ee2a7b] to-[#6228d7]" : "bg-black border border-[var(--crm-border)]"}`}>
            {isIg ? <InstagramGlyph size={18} /> : <TikTokGlyph size={18} />}
          </span>
          <h2 className="text-[18px] font-extrabold text-[var(--crm-text-primary)]">{isIg ? "Instagram" : "TikTok"}</h2>
          <span className="text-[11.5px] font-semibold text-[var(--crm-text-secondary)] bg-[var(--crm-card)] border border-[var(--crm-border)] rounded-full px-2.5 py-1">
            {isIg ? countsFor(totals.instagram, totals.instagramPending) : countsFor(totals.tiktok, 0)}
          </span>
        </div>

        {!ready ? (
          <div className="text-[12.5px] text-[var(--crm-text-muted)] py-2">
            {isIg ? "Instagram isn't configured yet." : "TikTok isn't configured yet."}
          </div>
        ) : (
          <div className="space-y-4">
            {groups.map((group) => {
              const accounts = isIg ? group.instagram : group.tiktok
              const invites = isIg ? group.invites : []
              // An invitation for someone with NO account on this platform is their card; an
              // invitation for someone who already has one is a strip beneath it.
              const named = new Set(
                accounts.flatMap((a) => [a.label, "agentName" in a ? a.agentName : null, a.username])
                  .filter((n): n is string => !!n)
                  .map((n) => n.trim().toLowerCase()),
              )
              const isSpareLinkFor = (inv: PendingInvite) => {
                const l = (inv.agentName || inv.label || "").trim().toLowerCase()
                return l.length > 0 && named.has(l)
              }
              const asStrips = invites.filter(isSpareLinkFor)
              const asCards = invites.filter((inv) => !isSpareLinkFor(inv))
              return (
                <div key={`${platform}:${group.key}`}>
                  {ownerBand(group, countsFor(accounts.length, invites.length))}
                  <div className="space-y-2">
                    {accounts.map((a) =>
                      isIg
                        ? instagramCard(a as Destination, group.kind === "mine")
                        : tiktokCard(a as TikTokConnection, group.kind === "mine"),
                    )}
                    {asStrips.map((inv) => inviteStrip(inv, group.kind === "mine"))}
                    {asCards.map((inv) => inviteCard(inv, group))}
                    {emptySlot(group, platform, accounts.length > 0 ? "another" : asCards.length > 0 ? "pending" : "empty")}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>
    )
  }

  // ── ADD ACCOUNT ───────────────────────────────────────────────────────────────────────────
  // ONE button. It used to be three — "+ Add Publishing Destination", "Connect My Instagram" and
  // "Connect My TikTok" — whose differences were explained in amber small print underneath.
  //
  // THE TWO INSTAGRAM ROUTES ARE NOT INTERCHANGEABLE AND THE SHEET SAYS SO. The invitation flow
  // requests INSTAGRAM_SCOPES, which does not include instagram_business_manage_comments and
  // cannot, so an account added by link can publish but can never auto-reply. Collapsing the two
  // into one silent path would quietly cost the operator Auto Reply; stating the difference at
  // the moment of choosing is the whole point of merging the buttons.
  const addSheet = (
    <div className="rounded-2xl border border-[var(--crm-border)] bg-[var(--crm-panel)] p-4">
      {newLink ? (
        <div>
          <div className="text-[13px] font-semibold text-[var(--crm-text-primary)]">Authorization link created</div>
          <p className="text-[11.5px] text-[var(--crm-text-muted)] mt-0.5">
            This link can be used once and expires in 7 days. Copy it now — it is never shown again.
          </p>
          <div className="mt-2 flex items-center gap-2 flex-wrap">
            <input readOnly value={newLink} onFocus={(e) => e.currentTarget.select()} className={`${control} flex-1 min-w-[220px] font-mono text-[12px]`} />
            <button type="button" className={btnPrimary} onClick={() => void copyLink()}>{copied ? "Copied ✓" : "Copy Link"}</button>
            <button type="button" className={btn} onClick={closeAdd}>Done</button>
          </div>
        </div>
      ) : !addPlatform ? (
        <div>
          <div className="text-[13px] font-semibold text-[var(--crm-text-primary)]">Add an account</div>
          <p className="text-[11.5px] text-[var(--crm-text-muted)] mt-0.5">Which platform?</p>
          <div className="mt-2.5 flex items-center gap-2 flex-wrap">
            <button type="button" className={btnPrimary} disabled={!configured} onClick={() => openAdd("instagram")}>Instagram</button>
            <button type="button" className={btnPrimary} disabled={!tiktokConfigured} onClick={() => openAdd("tiktok")}>TikTok</button>
            <button type="button" className={btn} onClick={closeAdd}>Cancel</button>
          </div>
        </div>
      ) : addPlatform === "tiktok" ? (
        <div>
          <div className="text-[13px] font-semibold text-[var(--crm-text-primary)]">Add a TikTok account</div>
          <p className="text-[11.5px] text-[var(--crm-text-muted)] mt-0.5">
            TikTok has no invitation link, so this is a direct sign-in: whoever is at this browser authorizes the
            account. Each account connects as its own destination.
          </p>
          <p className="mt-1.5 mb-0 text-[11.5px] text-amber-600 dark:text-amber-400">
            Sign in as the account you want to <strong>add</strong>. Signing in as an account that is already
            connected re-authorizes it instead — its settings are kept, but its access token is replaced.
          </p>
          <div className="mt-2.5 flex items-center gap-2 flex-wrap">
            <a href={TT_CONNECT} className={btnPrimary}>Continue to TikTok</a>
            <button type="button" className={btn} onClick={closeAdd}>Cancel</button>
          </div>
        </div>
      ) : !addRoute ? (
        <div>
          <div className="text-[13px] font-semibold text-[var(--crm-text-primary)]">Add an Instagram account</div>
          <p className="text-[11.5px] text-[var(--crm-text-muted)] mt-0.5">
            Both routes end with a connected publishing destination. They differ in one way that matters.
          </p>
          <button type="button" className="mt-2.5 w-full text-left rounded-xl border border-[var(--crm-border)] bg-[var(--crm-card)] p-3 hover:border-[var(--crm-text-muted)]" onClick={() => setAddRoute("self")}>
            <div className="text-[12.5px] font-semibold text-[var(--crm-text-primary)]">An account I can sign in to right now</div>
            <div className="text-[11.5px] text-[var(--crm-text-muted)] mt-0.5">
              You authorize it yourself in the next step. <strong className="text-[var(--crm-text-secondary)]">The only route that can grant comment
              management</strong>, so this is the one to use if the account needs Auto Reply.
            </div>
          </button>
          <button type="button" className="mt-2 w-full text-left rounded-xl border border-[var(--crm-border)] bg-[var(--crm-card)] p-3 hover:border-[var(--crm-text-muted)]" onClick={() => setAddRoute("invite")}>
            <div className="text-[12.5px] font-semibold text-[var(--crm-text-primary)]">Someone else&apos;s account — send them a link</div>
            <div className="text-[11.5px] text-[var(--crm-text-muted)] mt-0.5">
              Pick the agent, and Social Beast creates a one-time link that expires in 7 days. They authorize their
              own Instagram and get no access to Social Beast.{" "}
              <span className="text-amber-600 dark:text-amber-400">Publishing only — Auto Reply cannot be granted this way.</span>
            </div>
          </button>
          <div className="mt-2.5"><button type="button" className={btn} onClick={closeAdd}>Cancel</button></div>
        </div>
      ) : addRoute === "self" ? (
        <div>
          <div className="text-[13px] font-semibold text-[var(--crm-text-primary)]">Connect an Instagram account you own</div>
          <p className="text-[11.5px] text-[var(--crm-text-muted)] mt-0.5">
            This is the only way to grant comment management, which auto-replies need.
          </p>
          <p className="mt-1.5 mb-0 text-[11.5px] text-amber-600 dark:text-amber-400">
            Sign in as the account you want to <strong>add</strong>. Signing in as an account that is already
            connected re-authorizes it instead — its settings are kept, but its access token is replaced.
          </p>
          <div className="mt-2.5 flex items-center gap-2 flex-wrap">
            <a href={CONNECT} className={btnPrimary}>Continue to Instagram</a>
            <button type="button" className={btn} onClick={() => setAddRoute(null)}>Back</button>
            <button type="button" className={btn} onClick={closeAdd}>Cancel</button>
          </div>
        </div>
      ) : (
        <div>
          <div className="text-[13px] font-semibold text-[var(--crm-text-primary)]">Send an authorization link</div>
          <p className="text-[11.5px] text-[var(--crm-text-muted)] mt-0.5">
            Search for the Locator Beast agent this account belongs to, then create a secure link to send them.
          </p>
          {!selectedAgent ? (
            <div className="mt-2">
              <span className="text-[11px] uppercase tracking-wide text-[var(--crm-text-muted)]">Agent</span>
              <div className="mt-1"><AgentSearchField inputClassName={control} onSelect={(a) => setSelectedAgent(a)} placeholder="Search agents by name" /></div>
              <div className="mt-2 flex items-center gap-2">
                <button type="button" className={btn} disabled={generating} onClick={() => setAddRoute(null)}>Back</button>
                <button type="button" className={btn} disabled={generating} onClick={closeAdd}>Cancel</button>
              </div>
            </div>
          ) : (
            <div className="mt-2">
              <span className="text-[11px] uppercase tracking-wide text-[var(--crm-text-muted)]">Agent</span>
              <div className="mt-1 flex items-center gap-2 flex-wrap">
                <span className="inline-flex items-center gap-2 rounded-full border border-[var(--crm-border)] bg-[var(--crm-card)] pl-1 pr-2.5 py-1">
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
      )}
    </div>
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-[12px] text-[var(--crm-text-muted)] m-0">
          Accounts you publish to, grouped by owner. Pending invitations sit under the person they were sent to.
        </p>
        <button type="button" className={btnPrimary} disabled={!configured && !tiktokConfigured} onClick={() => openAdd(null)}>
          + Add Account
        </button>
      </div>

      {adding && addSheet}

      {platformSection("instagram")}
      {platformSection("tiktok")}

      {/* YouTube stays out of scope for now. */}
      <div className="text-[11px] text-[var(--crm-text-muted)]">YouTube destinations are coming later.</div>
    </div>
  )
}
