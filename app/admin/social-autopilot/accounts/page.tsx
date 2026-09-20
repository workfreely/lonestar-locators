export const dynamic = "force-dynamic"

import { ensurePlatformAdminPage } from "@/lib/auth/ensurePlatformAdminPage"
import { createClient } from "@/lib/supabase/server"
import { instagramConfigured } from "@/lib/social/instagram"
import { tiktokConfigured } from "@/lib/social/tiktok"
import PublishingDestinations, { type Destination, type PendingInvite, type TikTokConnection } from "@/components/crm/social/PublishingDestinations"

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
    .select("id, username, status, label, posting_paused, posts_per_day, token_expires_at, created_at, agent_user_id")
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
  type ConnRow = { id: string; username: string | null; status: string; label: string | null; posting_paused: boolean | null; posts_per_day: number | null; token_expires_at: string | null; created_at: string; agent_user_id: string | null }
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

  const destinations: Destination[] = conns.map((row) => {
    const agent = agentOf(row.agent_user_id)
    return {
      id: row.id,
      username: row.username,
      label: row.label,
      status: row.status,
      paused: !!row.posting_paused,
      postsPerDay: row.posts_per_day,
      expired: !!row.token_expires_at && new Date(row.token_expires_at).getTime() < Date.now(),
      addedAt: row.created_at,
      agentName: agent?.name ?? null,
      agentPhotoUrl: agent?.photoUrl ?? null,
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
  const errorText: Record<string, string> = {
    denied: "Authorization was cancelled.",
    state: "Couldn't verify the request (state mismatch). Please try connecting again.",
    exchange: "Sign-in failed. Please try again.",
    store: "Connected but couldn't save the connection. Please try again.",
    not_configured: "This integration isn't configured yet.",
  }

  return (
    <div>
      {connectedProvider && (
        <div className="mb-3 rounded-lg border border-[var(--crm-border)] bg-[var(--crm-card)] px-4 py-2.5 text-[13px] text-[var(--crm-text-primary)]">
          {connectedProvider} connected.
        </div>
      )}
      {errorCode && (
        <div className="mb-3 rounded-lg border border-[var(--crm-border)] bg-[var(--crm-panel)] px-4 py-2.5 text-[13px] text-[var(--crm-text-secondary)]">
          {errorText[errorCode] ?? "Something went wrong. Please try again."}
        </div>
      )}

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
