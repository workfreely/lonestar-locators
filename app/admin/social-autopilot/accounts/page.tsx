export const dynamic = "force-dynamic"

import { ensurePlatformAdminPage } from "@/lib/auth/ensurePlatformAdminPage"

// Social Autopilot → Accounts (visual shell only — NO OAuth/tokens/API calls).
export default async function SocialAutopilotAccountsPage() {
  await ensurePlatformAdminPage()

  const PLATFORMS = [
    { name: "Instagram", note: "Reels + Stories publishing (Business/Creator account required)." },
    { name: "TikTok", note: "Direct Post or Upload-to-TikTok draft." },
    { name: "YouTube", note: "Shorts upload to your channel." },
  ]

  return (
    <div>
      <div className="mb-4">
        <h2 className="text-[16px] font-bold text-[var(--crm-text-primary)]">Accounts</h2>
        <p className="text-[13px] text-[var(--crm-text-secondary)] mt-1">
          Connect your own social accounts here. Connecting isn&apos;t enabled yet — this is where it will live.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {PLATFORMS.map((p) => (
          <div key={p.name} className="rounded-2xl border border-[var(--crm-border)] bg-[var(--crm-panel)] p-4 flex flex-col">
            <div className="flex items-center justify-between">
              <div className="text-[14px] font-bold text-[var(--crm-text-primary)]">{p.name}</div>
              <span className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-[var(--crm-text-muted)]">
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--crm-text-muted)]" />
                Not connected
              </span>
            </div>
            <p className="text-[12px] text-[var(--crm-text-secondary)] mt-2 flex-1">{p.note}</p>
            <button
              type="button"
              disabled
              title="Account connections arrive in a later checkpoint"
              className="mt-3 text-[12.5px] font-semibold px-3 py-1.5 rounded-lg border border-[var(--crm-border)] text-[var(--crm-text-muted)] opacity-60 cursor-not-allowed"
            >
              Connect (coming soon)
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
