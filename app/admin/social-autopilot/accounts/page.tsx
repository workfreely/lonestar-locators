export const dynamic = "force-dynamic"

import { ensurePlatformAdminPage } from "@/lib/auth/ensurePlatformAdminPage"
import { createClient } from "@/lib/supabase/server"
import { instagramConfigured } from "@/lib/social/instagram"
import InstagramAccountCard, { type InstagramConnection } from "@/components/crm/social/InstagramAccountCard"

// Social Autopilot → Accounts. Instagram is real (Instagram Login connection); TikTok and
// YouTube stay "Coming later". Platform-admin gated. Tokens live server-side (Vault) and are
// never read here — only safe identity fields are shown.
export default async function SocialAutopilotAccountsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await ensurePlatformAdminPage()
  const sp = await searchParams

  const configured = instagramConfigured()

  // Read the admin's own connection under RLS (never the token — token_secret_id is omitted).
  let connection: InstagramConnection = null
  const supabase = await createClient()
  const { data } = await supabase
    .from("social_connections")
    .select("username, account_type, status, token_expires_at")
    .eq("provider", "instagram")
    .maybeSingle()
  if (data) {
    const row = data as { username: string | null; account_type: string | null; status: string; token_expires_at: string | null }
    const expired = !!row.token_expires_at && new Date(row.token_expires_at).getTime() < Date.now()
    connection = { username: row.username, accountType: row.account_type, status: row.status, expired }
  }

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

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <InstagramAccountCard configured={configured} connection={connection} />

        {/* TikTok / YouTube — later in the sequence */}
        {["TikTok", "YouTube"].map((name) => (
          <div key={name} className="rounded-2xl border border-[var(--crm-border)] bg-[var(--crm-panel)] p-4 flex flex-col">
            <div className="flex items-center justify-between">
              <div className="text-[14px] font-bold text-[var(--crm-text-primary)]">{name}</div>
              <span className="text-[11.5px] font-semibold text-[var(--crm-text-muted)]">Coming later</span>
            </div>
            <div className="mt-4 h-[30px]" aria-hidden />
          </div>
        ))}
      </div>
    </div>
  )
}
