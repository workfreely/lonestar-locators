export const dynamic = "force-dynamic"

import { ensurePlatformAdminPage } from "@/lib/auth/ensurePlatformAdminPage"

// Social Autopilot → History (visual shell only — no history engine yet).
export default async function SocialAutopilotHistoryPage() {
  await ensurePlatformAdminPage()

  const COLUMNS = ["Platform", "Source video", "Property", "Published", "Caption variation", "On-video text", "Status", "Post link", "Reuse"]

  return (
    <div>
      <div className="mb-4">
        <h2 className="text-[16px] font-bold text-[var(--crm-text-primary)]">History</h2>
        <p className="text-[13px] text-[var(--crm-text-secondary)] mt-1">
          Everything you&apos;ve published, and how each source video has been reused. Populates once publishing is live.
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5 mb-5">
        {COLUMNS.map((c) => (
          <span key={c} className="text-[11.5px] font-semibold px-2.5 py-1 rounded-full border border-[var(--crm-border)] text-[var(--crm-text-muted)] bg-[var(--crm-panel)]">
            {c}
          </span>
        ))}
      </div>

      <div className="rounded-2xl border border-[var(--crm-border)] bg-[var(--crm-panel)] px-6 py-12 text-center">
        <p className="text-[15px] font-semibold text-[var(--crm-text-primary)]">No published posts yet</p>
        <p className="text-[13px] text-[var(--crm-text-secondary)] mt-1.5 max-w-md mx-auto">
          Published content will be logged here with its platform, source video, property, caption/on-video-text variation,
          and a link to the live post — so you can see what&apos;s been used and what to rotate next.
        </p>
      </div>
    </div>
  )
}
