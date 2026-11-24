export const dynamic = "force-dynamic"

import { ensurePlatformAdminPage } from "@/lib/auth/ensurePlatformAdminPage"
import { createClient } from "@/lib/supabase/server"
import { loadAgentRoster, connectionIdsFor, resolveSelection } from "@/lib/social/agentRoster"
import { instagramConfigured } from "@/lib/social/instagram"
import { tiktokConfigured } from "@/lib/social/tiktok"
import PublishingDestinations, { type Destination, type OwnerGroup, type PendingInvite, type TikTokConnection } from "@/components/crm/social/PublishingDestinations"
import AutoPostingControl from "@/components/crm/social/AutoPostingControl"
import { readAutoPosting } from "@/lib/social/autoPosting"
import { accountAutomationGate } from "@/lib/social/commentSafety"
import { INSTAGRAM_COMMENTS_SCOPE } from "@/lib/social/commentScope"
import { publishingCapability, autoReplyCapability, actionNeedsAttention, type AutoReplyAttention } from "@/lib/social/accountCapabilities"
import { isBufferRouted } from "@/lib/social/bufferRoute"
import { dmGate } from "@/lib/social/commentSendPolicy"
import { parseMarketRestriction } from "@/lib/social/marketRestriction"

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
    // `market_restriction` joins the safe display fields: it is this destination's permitted
    // market list (NULL = every market), which the operator has to be able to SEE — a Dallas-only
    // account that quietly stopped posting looks identical to a broken one otherwise.
    .select("id, username, status, label, posting_paused, posts_per_day, token_expires_at, created_at, agent_user_id, scopes, market_restriction, buffer_account_id, buffer_channel_id, avatar_url")
    .eq("provider", "instagram")
    .order("created_at", { ascending: true })

  // ALL of the admin's TikTok connections (RLS-scoped). Safe display fields ONLY — never
  // token_secret_id / external_account_id (open_id) / owner_user_id.
  //
  // THIS WAS .maybeSingle(), AND THAT WAS A HIDING PLACE. With two TikTok rows PostgREST answers
  // .maybeSingle() with PGRST116 and no data; this page destructures only `data`, so ttRow went
  // null and the screen rendered "No TikTok account connected yet." — both live accounts gone from
  // the UI, with "Connect TikTok directly" left as the only visible control. A list, ordered the
  // same way the Instagram destinations are, so the two sections behave identically.
  const { data: ttRows } = await supabase
    .from("social_connections")
    .select("id, username, label, status, posting_paused, posts_per_day, token_expires_at, created_at, avatar_url, market_restriction, agent_user_id, buffer_account_id, buffer_channel_id")
    .eq("provider", "tiktok")
    .order("created_at", { ascending: true })

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

  type TtRow = { id: string; username: string | null; label: string | null; status: string; posting_paused: boolean | null; posts_per_day: number | null; token_expires_at: string | null; created_at: string; avatar_url: string | null; market_restriction: string[] | null; agent_user_id: string | null; buffer_account_id: string | null; buffer_channel_id: string | null }
  const tiktoks: TikTokConnection[] = ((ttRows ?? []) as TtRow[]).map((r) => ({
    // The connection id addresses the connection-scoped backend actions (pause / resume / label /
    // disconnect) — the same ones the Instagram rows use. It is never displayed.
    id: r.id,
    username: r.username,
    label: r.label,
    // Whose account this is. NULL is the OWNER's own — never "no agent" — which is what the live
    // TikTok row carries and why it groups under My Accounts without a special case.
    agentUserId: r.agent_user_id,
    paused: !!r.posting_paused,
    // The SAME column the Instagram row shows, read for the same reason: computeAutopilotPlan
    // builds a rule from every connection regardless of provider and takes its daily times from
    // this value, so a TikTok destination's cadence is as real as an Instagram one's and was
    // simply never selected.
    postsPerDay: r.posts_per_day,
    status: r.status,
    avatarUrl: r.avatar_url ?? null,
    expired: !!r.token_expires_at && new Date(r.token_expires_at).getTime() < Date.now(),
    // Routed through Buffer? Decided by isBufferRouted — the same predicate the planner and both
    // publish workers use — so the badge cannot disagree with where a post actually goes. A routed
    // destination publishes with the Buffer key and holds none of our tokens, so `expired` above
    // describes a credential it does not use.
    bufferRouted: isBufferRouted(r),
    addedAt: r.created_at,
    marketRestriction: parseMarketRestriction(r.market_restriction),
  }))

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
  type ConnRow = { id: string; username: string | null; status: string; label: string | null; posting_paused: boolean | null; posts_per_day: number | null; token_expires_at: string | null; created_at: string; agent_user_id: string | null; scopes: string[] | null; market_restriction: string[] | null; buffer_account_id: string | null; buffer_channel_id: string | null; avatar_url: string | null }
  type InviteRow = { id: string; label: string | null; created_at: string; expires_at: string; agent_user_id: string | null }
  const conns = (connRows ?? []) as ConnRow[]
  const invites = (inviteRows ?? []) as InviteRow[]

  const agentIds = Array.from(
    new Set([...conns, ...invites, ...((ttRows ?? []) as TtRow[])].map((r) => r.agent_user_id).filter((x): x is string => !!x)),
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

  // ── AGENT FILTER ──────────────────────────────────────────────────────────────────────────
  // Presentation only, applied AFTER every row has been built, so the filter cannot change what a
  // row says about itself — only whether it is on screen. `null` means no selection; an empty
  // array is a real selection that holds nothing and must hide everything rather than show all.
  const roster = await loadAgentRoster(supabase, ownerName)
  // resolveSelection, not the raw parameter: an ?agent= that names nobody must leave the page
  // unfiltered AND unlabelled, rather than showing every account under a banner claiming it is
  // showing one agent.
  const { id: selectedAgent, name: selectedName } = resolveSelection(roster, typeof sp.agent === "string" ? sp.agent : null)
  const visibleIds = connectionIdsFor(roster, selectedAgent)
  const visible = (id: string) => visibleIds === null || visibleIds.includes(id)

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
      agentUserId: row.agent_user_id,
      status: row.status,
      paused: !!row.posting_paused,
      postsPerDay: row.posts_per_day,
      // Normalised through the SAME helper the planner and both publish workers use, so the chip
      // the operator reads is derived from the same value those three consult — not a second
      // interpretation of the column that could disagree with them.
      marketRestriction: parseMarketRestriction(row.market_restriction),
      expired,
      addedAt: row.created_at,
      agentName: agent?.name ?? null,
      agentPhotoUrl: agent?.photoUrl ?? null,
      bufferRouted: isBufferRouted(row),
      // The ACCOUNT's own face, from Buffer where the destination is Buffer-routed. Distinct from
      // agentPhotoUrl, which is the PERSON's. The card prefers the account and falls back to the
      // person whose band it sits in — never to a third party's.
      avatarUrl: row.avatar_url ?? null,
      publishing: publishingCapability({
        connectionStatus: row.status,
        expired,
        destinationPaused: !!row.posting_paused,
        autoPosting: autoPosting.state,
        autoPostingUnreadable: autoPosting.unreadable,
        bufferRouted: isBufferRouted(row),
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

  // ── GROUPED BY OWNER ──────────────────────────────────────────────────────────────────────
  // The page used to be a list of Instagram rows and a list of TikTok rows, with every pending
  // invitation in a third list at the bottom of the page — so the only way to learn that an
  // invitation belonged to a particular agent was to read its label and remember.
  //
  // The grouping is derived, never configured. An owner appears because a connection or an
  // invitation names them, which is the same relationship loadAgentRoster is built from, so a new
  // agent gets their own band the moment they have either and nothing has to be registered
  // anywhere. NOTHING HERE WRITES: this reorganises rows already loaded above.
  //
  // A NULL agent_user_id is the OWNER's own account, not "no agent" — the live TikTok destination
  // carries one, and so does the invitation created without choosing an agent. Both belong under
  // My Accounts rather than in a bucket of their own, which is also where an operator looks for
  // them.
  const OWNER_KEY = "owner"
  const keyOf = (agentUserId: string | null) =>
    !agentUserId || (me && agentUserId === me.id) ? OWNER_KEY : agentUserId

  const groups: OwnerGroup[] = []
  const groupBy = new Map<string, OwnerGroup>()
  const groupFor = (agentUserId: string | null): OwnerGroup => {
    const key = keyOf(agentUserId)
    const existing = groupBy.get(key)
    if (existing) return existing
    const agent = key === OWNER_KEY ? null : agentOf(key)
    const group: OwnerGroup = {
      key,
      kind: key === OWNER_KEY ? "mine" : "team",
      // The owner's own band is named from their profile, exactly as the TikTok row already is.
      name: key === OWNER_KEY ? ownerName ?? "My Accounts" : agent?.name || "Agent",
      photoUrl: key === OWNER_KEY ? ownerPhotoUrl : agent?.photoUrl ?? null,
      instagram: [],
      tiktok: [],
      invites: [],
    }
    groupBy.set(key, group)
    groups.push(group)
    return group
  }

  // The owner's band exists even with nothing in it, so the page always offers somewhere to
  // connect a first account rather than rendering as empty.
  groupFor(null)

  for (const d of destinations) if (visible(d.id)) groupFor(d.agentUserId).instagram.push(d)
  for (const t of tiktoks) if (visible(t.id)) groupFor(t.agentUserId).tiktok.push(t)
  for (const i of pendingInvites) {
    if (selectedAgent && i.agentUserId !== selectedAgent) continue
    groupFor(i.agentUserId).invites.push(i)
  }

  // Mine first, then the team by name — a stable order, so the page does not reshuffle itself
  // when a token is refreshed or an invitation is used.
  groups.sort((a, b) =>
    a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === "mine" ? -1 : 1,
  )

  // Under a selected-agent filter, a band holding nothing is noise rather than an empty slot to
  // fill: the operator asked to see ONE agent. Unfiltered, an empty team band is kept on purpose —
  // it is where that agent's next account goes.
  const visibleGroups = selectedAgent
    ? groups.filter((g) => g.instagram.length + g.tiktok.length + g.invites.length > 0)
    : groups

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

      {selectedAgent && (
        <div className="mb-3 flex items-center gap-2 rounded-lg border border-[var(--crm-border)] bg-[var(--crm-panel)] px-4 py-2 text-[12.5px] text-[var(--crm-text-secondary)]">
          <span>
            Showing <strong className="text-[var(--crm-text-primary)]">{selectedName ?? "one agent"}</strong> only.
          </span>
          <a href="/admin/social-autopilot/accounts" className="font-semibold text-[var(--crm-text-primary)] underline">
            Show all accounts
          </a>
        </div>
      )}

      <PublishingDestinations
        configured={configured}
        tiktokConfigured={ttConfigured}
        groups={visibleGroups}
      />
    </div>
  )
}
