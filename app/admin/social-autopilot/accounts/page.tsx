export const dynamic = "force-dynamic"

import { ensurePlatformAdminPage } from "@/lib/auth/ensurePlatformAdminPage"
import { createClient } from "@/lib/supabase/server"
import { instagramConfigured } from "@/lib/social/instagram"
import { tiktokConfigured } from "@/lib/social/tiktok"
import PublishingDestinations, { type Destination, type PendingInvite, type TikTokConnection } from "@/components/crm/social/PublishingDestinations"
import AutoPostingControl from "@/components/crm/social/AutoPostingControl"
import { readAutoPosting } from "@/lib/social/autoPosting"
import { accountAutomationGate } from "@/lib/social/commentSafety"
import { INSTAGRAM_COMMENTS_SCOPE } from "@/lib/social/commentScope"
import { publishingCapability, autoReplyCapability, actionNeedsAttention, type AutoReplyAttention } from "@/lib/social/accountCapabilities"
import { dmGate } from "@/lib/social/commentSendPolicy"

// Social Autopilot → Accounts. Manages N Instagram Publishing Destinations for the current
// platform-admin owner (was single-connection). Platform-admin gated. Tokens live in Vault and are
// never read here — only safe identity/label/status fields are selected. RLS scopes every query to
// the owner, so this only ever returns the admin's own destinations.
export default async function SocialAutopilotAccountsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await ensurePlatformAdminPage()
  const sp = await searchParams

  const configured = instagramConfigured()
  const ttConfigured = tiktokConfigured()
  const supabase = await createClient()

  // ALL Instagram destinations for this owner (RLS-scoped). NEVER selects token_secret_id /
  // external_account_id / owner_user_id — only safe display fields. connection id is used solely to
  // address connection-ID-scoped backend actions; it is not shown in the UI.
  const { data: connRows } = await supabase
    .from("social_connections")
    // `scopes` joins the existing safe display fields: it is the granted permission list, which is
    // what Auto Reply's status is derived from. Still NEVER token_secret_id / external_account_id /
    // owner_user_id.
    .select("id, username, status, label, posting_paused, posts_per_day, token_expires_at, created_at, agent_user_id, scopes")
    .eq("provider", "instagram")
    .order("created_at", { ascending: true })

  // The admin's single TikTok connection (RLS-scoped). Safe display fields ONLY — never
  // token_secret_id / external_account_id (open_id) / owner_user_id.
  const { data: ttRow } = await supabase
    .from("social_connections")
    .select("username, status, token_expires_at, created_at, avatar_url")
    .eq("provider", "tiktok")
    .maybeSingle()

  // Owner (this platform admin) display identity — used as the TikTok row's primary name so it
  // matches the Instagram row's "agent name" model. Read-only own-profile fetch (presentation
  // only; RLS allows reading one's own profile). Same name/photo resolution as sa_agents_by_ids.
  let ownerName: string | null = null
  let ownerPhotoUrl: string | null = null
  const { data: { user: me } } = await supabase.auth.getUser()
  if (me) {
    const { data: myProfile } = await supabase
      .from("profiles")
      .select("first_name, last_name, preferred_name, profile_photo_url")
      .eq("id", me.id)
      .maybeSingle()
    if (myProfile) {
      ownerName = [myProfile.first_name, myProfile.last_name].filter(Boolean).join(" ").trim() || myProfile.preferred_name || null
      ownerPhotoUrl = myProfile.profile_photo_url ?? null
    }
  }

  const tiktok: TikTokConnection | null = ttRow
    ? {
        username: ttRow.username,
        avatarUrl: ttRow.avatar_url ?? null,
        ownerName,
        ownerPhotoUrl,
        expired: !!ttRow.token_expires_at && new Date(ttRow.token_expires_at).getTime() < Date.now(),
        addedAt: ttRow.created_at,
      }
    : null

  // Active (unused, unrevoked, unexpired) invitations — the safe list; the raw token is NEVER
  // stored or shown again after creation.
  const nowIso = new Date().toISOString()
  const { data: inviteRows } = await supabase
    .from("social_destination_invitations")
    .select("id, label, created_at, expires_at, used_at, revoked_at, agent_user_id")
    .is("used_at", null)
    .is("revoked_at", null)
    .gt("expires_at", nowIso)
    .order("created_at", { ascending: false })

  // Resolve the selected-agent display fields (photo + name) for every referenced agent, via the
  // admin-gated definer RPC — profiles' own-profile-only RLS blocks a direct cross-user read.
  type ConnRow = { id: string; username: string | null; status: string; label: string | null; posting_paused: boolean | null; posts_per_day: number | null; token_expires_at: string | null; created_at: string; agent_user_id: string | null; scopes: string[] | null }
  type InviteRow = { id: string; label: string | null; created_at: string; expires_at: string; agent_user_id: string | null }
  const conns = (connRows ?? []) as ConnRow[]
  const invites = (inviteRows ?? []) as InviteRow[]

  const agentIds = Array.from(
    new Set([...conns, ...invites].map((r) => r.agent_user_id).filter((x): x is string => !!x)),
  )
  const agentMap = new Map<string, { name: string; photoUrl: string | null }>()
  if (agentIds.length > 0) {
    const { data: agentRows } = await supabase.rpc("sa_agents_by_ids", { p_ids: agentIds })
    for (const a of (agentRows ?? []) as { id: string; first_name: string | null; last_name: string | null; preferred_name: string | null; profile_photo_url: string | null }[]) {
      const name = [a.first_name, a.last_name].filter(Boolean).join(" ").trim() || a.preferred_name || ""
      agentMap.set(a.id, { name, photoUrl: a.profile_photo_url })
    }
  }
  const agentOf = (id: string | null) => (id ? agentMap.get(id) ?? null : null)

  // ── CAPABILITY INPUTS ─────────────────────────────────────────────────────────────────────
  // The master Auto Posting switch, read through the SAME helper the publish worker uses, so this
  // page cannot claim posting is on when the worker would treat it as paused. No session id would
  // mean it cannot be read for anyone — reported unreadable, which renders as paused.
  // ensurePlatformAdminPage makes that unreachable; it is explicit rather than a non-null assertion.
  const autoPosting = me
    ? await readAutoPosting(supabase, me.id)
    : { state: "paused" as const, resumedAt: null, unreadable: true }

  // The two comment-automation switches. Either read FAILING yields settingsReadOk: false, and
  // accountAutomationGate then refuses — a page that cannot read its own gate must not render
  // "Enabled". A MISSING ROW is not a failure: both columns default to false, so absence is "off".
  let commentSettingsReadOk = true
  let globalCommentEnabled: boolean | null = false
  const { data: gRow, error: gErr } = await supabase
    .from("comment_automation_settings")
    .select("global_enabled")
    .maybeSingle()
  if (gErr) { commentSettingsReadOk = false } else { globalCommentEnabled = gRow?.global_enabled ?? false }

  const { data: acctRows, error: aErr } = await supabase
    .from("comment_account_settings")
    .select("connection_id, enabled, activated_at")
  if (aErr) commentSettingsReadOk = false
  const acctSettings = new Map(
    ((acctRows ?? []) as { connection_id: string; enabled: boolean | null; activated_at: string | null }[])
      .map((r) => [r.connection_id, r]),
  )

  // Work that needs a person: sends we could not confirm, and DM claims never resolved. Surfaced
  // even when automation is off, because an uncertain send is NEVER retried automatically and would
  // otherwise sit invisible. Both reads tolerate failure and contribute zero.
  const attentionOf = new Map<string, AutoReplyAttention>()
  {
    const { data: stuck } = await supabase
      .from("social_commenters")
      .select("connection_id")
      .not("dm_claimed_at", "is", null)
      .is("dm_sent_at", null)
    for (const r of (stuck ?? []) as { connection_id: string }[]) {
      const a = attentionOf.get(r.connection_id) ?? { unresolvedActions: 0, danglingClaims: 0 }
      a.danglingClaims++
      attentionOf.set(r.connection_id, a)
    }
    // `kind` joins the selection because the tally now distinguishes a public reply from a private
    // one — see actionNeedsAttention. The .in() filter is unchanged, so the same rows are read.
    const { data: acts } = await supabase
      .from("comment_actions")
      .select("kind, status, reason, social_comments!inner(connection_id)")
      .in("status", ["failed", "uncertain"])
    // Read ONCE, from the live gate, so every row in this pass is judged against the same switch.
    const dmEnabled = dmGate(process.env).active
    // PostgREST returns an embedded relation as an ARRAY even for a to-one join, so this is
    // normalised rather than asserted — an object cast here compiles and then reads undefined.
    type ActRow = {
      kind: string | null
      status: string | null
      reason: string | null
      social_comments: { connection_id: string }[] | { connection_id: string } | null
    }
    // Tally the classified reasons so the detail line can name the dominant cause. `reason` is our
    // own vocabulary, not Meta's text; the first word is taken so the numeric code the ledger now
    // appends to `error` can never travel into the UI through here.
    const reasonTally = new Map<string, Map<string, number>>()
    for (const r of (acts ?? []) as ActRow[]) {
      const rel = r.social_comments
      const cid = Array.isArray(rel) ? rel[0]?.connection_id : rel?.connection_id
      if (!cid) continue
      // Skipped BEFORE the tally and before the reason tally, so a row that cannot be acted on
      // contributes neither a count nor the word the detail line names as the dominant cause.
      if (!actionNeedsAttention(r, dmEnabled)) continue
      const a = attentionOf.get(cid) ?? { unresolvedActions: 0, danglingClaims: 0 }
      a.unresolvedActions++
      attentionOf.set(cid, a)
      const word = (r.reason ?? "").trim().split(/\s+/)[0]
      if (!word) continue
      const t = reasonTally.get(cid) ?? new Map<string, number>()
      t.set(word, (t.get(word) ?? 0) + 1)
      reasonTally.set(cid, t)
    }
    for (const [cid, t] of reasonTally) {
      const a = attentionOf.get(cid)
      if (!a) continue
      let top: string | null = null
      let best = 0
      for (const [word, n] of t) if (n > best) { top = word; best = n }
      a.topReason = top
      attentionOf.set(cid, a)
    }
  }

  const destinations: Destination[] = conns.map((row) => {
    const agent = agentOf(row.agent_user_id)
    const expired = !!row.token_expires_at && new Date(row.token_expires_at).getTime() < Date.now()
    const acct = acctSettings.get(row.id)
    // THE GATE IS THE AUTHORITY. This page renders its verdict; it does not re-decide it.
    const gate = accountAutomationGate({
      settingsReadOk: commentSettingsReadOk,
      globalEnabled: globalCommentEnabled,
      accountEnabled: acct?.enabled ?? false,
      activatedAt: acct?.activated_at ?? null,
      permissionsOk: (row.scopes ?? []).includes(INSTAGRAM_COMMENTS_SCOPE),
    })
    return {
      id: row.id,
      username: row.username,
      label: row.label,
      status: row.status,
      paused: !!row.posting_paused,
      postsPerDay: row.posts_per_day,
      expired,
      addedAt: row.created_at,
      agentName: agent?.name ?? null,
      agentPhotoUrl: agent?.photoUrl ?? null,
      publishing: publishingCapability({
        connectionStatus: row.status,
        expired,
        destinationPaused: !!row.posting_paused,
        autoPosting: autoPosting.state,
        autoPostingUnreadable: autoPosting.unreadable,
      }),
      autoReply: autoReplyCapability(gate, attentionOf.get(row.id)),
      // Drives the Re-authorize Comments action. Derived from the granted scopes, never assumed.
      commentsScopeGranted: (row.scopes ?? []).includes(INSTAGRAM_COMMENTS_SCOPE),
    }
  })

  const pendingInvites: PendingInvite[] = invites.map((row) => {
    const agent = agentOf(row.agent_user_id)
    return {
      id: row.id,
      label: row.label,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      agentUserId: row.agent_user_id,
      agentName: agent?.name ?? null,
      agentPhotoUrl: agent?.photoUrl ?? null,
    }
  })

  // Flash from the direct admin-connect callback (?connected / ?error). Provider-aware so both
  // the Instagram and TikTok connect flows land here with the right copy.
  const connectedProvider = sp.connected === "tiktok" ? "TikTok" : sp.connected === "instagram" ? "Instagram" : null
  const errorCode = typeof sp.error === "string" ? sp.error : null
  // EVERY CODE THE CALLBACK CAN EMIT, in the user's words. The codes are a closed set chosen by us
  // — never a provider message echoed through the URL, which is how a token ends up in a browser
  // history. The detail behind each one is in the server log.
  const errorText: Record<string, string> = {
    denied: "Authorization was cancelled, so nothing changed. If you meant to allow it, try again and switch ON every permission before choosing Allow.",
    state: "Couldn't verify the request (state mismatch). Please try connecting again.",
    exchange: "Sign-in failed. Your existing connection was left unchanged. Please try again.",
    store: "Connected but couldn't save the connection. Please try again.",
    not_configured: "This integration isn't configured yet.",
    no_account: "Instagram didn't identify an account. Nothing was changed.",
    would_revoke: "That authorization would have REMOVED a permission this account already uses, so nothing was changed. Try again and switch ON every permission, including publishing.",
    unverified_grant: "Instagram didn't confirm which permissions were granted, so nothing was recorded. Your existing connection is unchanged.",
  }

  return (
    <div>
      {connectedProvider && (
        <div className="mb-3 rounded-lg border border-[var(--crm-border)] bg-[var(--crm-card)] px-4 py-2.5 text-[13px] text-[var(--crm-text-primary)]">
          {connectedProvider} connected.
          {sp.scopes === "unverified" && (
            <span className="text-[var(--crm-text-secondary)]">
              {" "}Instagram didn&apos;t report which permissions were granted, so the recorded permissions were left
              unchanged and the sign-in was refreshed.
            </span>
          )}
        </div>
      )}
      {errorCode && (
        <div className="mb-3 rounded-lg border border-[var(--crm-border)] bg-[var(--crm-panel)] px-4 py-2.5 text-[13px] text-[var(--crm-text-secondary)]">
          {errorText[errorCode] ?? "Something went wrong. Please try again."}
        </div>
      )}

      {/* The MASTER automatic-publishing switch, above the per-destination list on purpose: it
          governs all of them, and a per-destination pause means something narrower. Enforced
          server-side by the Instagram worker — this is the control, not the guard. */}
      <div className="mb-4">
        <AutoPostingControl />
      </div>

      <PublishingDestinations
        configured={configured}
        destinations={destinations}
        pendingInvites={pendingInvites}
        tiktokConfigured={ttConfigured}
        tiktok={tiktok}
      />
    </div>
  )
}
