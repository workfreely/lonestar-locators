export const dynamic = "force-dynamic"

import { ensurePlatformAdminPage } from "@/lib/auth/ensurePlatformAdminPage"
import { createClient } from "@/lib/supabase/server"
import { instagramConfigured } from "@/lib/social/instagram"
import PublishingDestinations, { type Destination, type PendingInvite } from "@/components/crm/social/PublishingDestinations"

// Social Autopilot → Accounts. Manages N Instagram Publishing Destinations for the current
// platform-admin owner (was single-connection). Platform-admin gated. Tokens live in Vault and are
// never read here — only safe identity/label/status fields are selected. RLS scopes every query to
// the owner, so this only ever returns the admin's own destinations.
export default async function SocialAutopilotAccountsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await ensurePlatformAdminPage()
  const sp = await searchParams

  const configured = instagramConfigured()
  const supabase = await createClient()

  // ALL Instagram destinations for this owner (RLS-scoped). NEVER selects token_secret_id /
  // external_account_id / owner_user_id — only safe display fields. connection id is used solely to
  // address connection-ID-scoped backend actions; it is not shown in the UI.
  const { data: connRows } = await supabase
    .from("social_connections")
    .select("id, username, status, label, posting_paused, posts_per_day, token_expires_at")
    .eq("provider", "instagram")
    .order("created_at", { ascending: true })

  const destinations: Destination[] = (connRows ?? []).map((r) => {
    const row = r as {
      id: string
      username: string | null
      status: string
      label: string | null
      posting_paused: boolean | null
      posts_per_day: number | null
      token_expires_at: string | null
    }
    return {
      id: row.id,
      username: row.username,
      label: row.label,
      status: row.status,
      paused: !!row.posting_paused,
      postsPerDay: row.posts_per_day,
      expired: !!row.token_expires_at && new Date(row.token_expires_at).getTime() < Date.now(),
    }
  })

  // Active (unused, unrevoked, unexpired) invitations — the safe list; the raw token is NEVER
  // stored or shown again after creation.
  const nowIso = new Date().toISOString()
  const { data: inviteRows } = await supabase
    .from("social_destination_invitations")
    .select("id, label, created_at, expires_at, used_at, revoked_at")
    .is("used_at", null)
    .is("revoked_at", null)
    .gt("expires_at", nowIso)
    .order("created_at", { ascending: false })

  const pendingInvites: PendingInvite[] = (inviteRows ?? []).map((r) => {
    const row = r as { id: string; label: string | null; created_at: string; expires_at: string }
    return { id: row.id, label: row.label, createdAt: row.created_at, expiresAt: row.expires_at }
  })

  // Flash from the direct admin-connect callback (?connected / ?error).
  const connected = sp.connected === "instagram"
  const errorCode = typeof sp.error === "string" ? sp.error : null
  const errorText: Record<string, string> = {
    denied: "Instagram authorization was cancelled.",
    state: "Couldn't verify the request (state mismatch). Please try connecting again.",
    exchange: "Instagram sign-in failed. Please try again.",
    store: "Connected to Instagram but couldn't save the connection. Please try again.",
    not_configured: "Instagram isn't configured yet.",
  }

  return (
    <div>
      {connected && (
        <div className="mb-3 rounded-lg border border-[var(--crm-border)] bg-[var(--crm-card)] px-4 py-2.5 text-[13px] text-[var(--crm-text-primary)]">
          Instagram connected.
        </div>
      )}
      {errorCode && (
        <div className="mb-3 rounded-lg border border-[var(--crm-border)] bg-[var(--crm-panel)] px-4 py-2.5 text-[13px] text-[var(--crm-text-secondary)]">
          {errorText[errorCode] ?? "Something went wrong. Please try again."}
        </div>
      )}

      <PublishingDestinations configured={configured} destinations={destinations} pendingInvites={pendingInvites} />
    </div>
  )
}
