export const dynamic = "force-dynamic"

import { ensurePlatformAdminPage } from "@/lib/auth/ensurePlatformAdminPage"

// Social Autopilot → Accounts (visual shell — NO OAuth/tokens/API). Instagram-first:
// Instagram is the platform we validate end-to-end first; TikTok and YouTube are shown
// but clearly "Coming later." No connection infrastructure is built here.
export default async function SocialAutopilotAccountsPage() {
  await ensurePlatformAdminPage()

  return (
    <div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Instagram — first platform */}
        <div className="rounded-2xl border border-[var(--crm-border)] bg-[var(--crm-panel)] p-4 flex flex-col">
          <div className="flex items-center justify-between">
            <div className="text-[14px] font-bold text-[var(--crm-text-primary)]">Instagram</div>
            <span className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-[var(--crm-text-muted)]">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--crm-text-muted)]" />
              Not connected
            </span>
          </div>
          <button
            type="button"
            disabled
            className="mt-4 text-[12.5px] font-semibold px-3 py-1.5 rounded-lg border border-[var(--crm-border)] text-[var(--crm-text-secondary)] opacity-70 cursor-not-allowed"
          >
            Connect Instagram
          </button>
        </div>

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
