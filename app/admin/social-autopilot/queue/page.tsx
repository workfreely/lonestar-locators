export const dynamic = "force-dynamic"

import { ensurePlatformAdminPage } from "@/lib/auth/ensurePlatformAdminPage"

// Social Autopilot → Queue (visual shell only — no status engine yet).
export default async function SocialAutopilotQueuePage() {
  await ensurePlatformAdminPage()

  const STATUSES = ["Draft", "Rendering", "Ready", "Scheduled", "Publishing", "Needs Attention"]

  return (
    <div>
      <div className="mb-4">
        <h2 className="text-[16px] font-bold text-[var(--crm-text-primary)]">Queue</h2>
        <p className="text-[13px] text-[var(--crm-text-secondary)] mt-1">
          The operating list for upcoming content. Each post will move through these statuses as it is prepared and published.
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5 mb-5">
        {STATUSES.map((s) => (
          <span
            key={s}
            className="text-[11.5px] font-semibold px-2.5 py-1 rounded-full border border-[var(--crm-border)] text-[var(--crm-text-muted)] bg-[var(--crm-panel)]"
          >
            {s}
          </span>
        ))}
      </div>

      <div className="rounded-2xl border border-[var(--crm-border)] bg-[var(--crm-panel)] px-6 py-12 text-center">
        <p className="text-[15px] font-semibold text-[var(--crm-text-primary)]">Nothing queued yet</p>
        <p className="text-[13px] text-[var(--crm-text-secondary)] mt-1.5 max-w-md mx-auto">
          Once scheduling is enabled, posts you create from Library videos will appear here with their status, target
          platform, and scheduled time.
        </p>
      </div>
    </div>
  )
}
