export const dynamic = "force-dynamic"

import { ensurePlatformAdminPage } from "@/lib/auth/ensurePlatformAdminPage"
import { DEMO_QUEUE } from "@/components/crm/social/demoFixtures"

// Social Autopilot → Queue (visual shell). Representative rows via isolated UI-only
// demo fixtures (never DB) so the operating-queue structure is reviewable. No status
// engine, no real posts.
const STATUS_STYLE: Record<string, string> = {
  Draft: "text-[var(--crm-text-muted)] bg-[var(--crm-card)]",
  Rendering: "text-amber-700 bg-amber-500/12 dark:text-amber-400",
  Ready: "text-sky-700 bg-sky-500/12 dark:text-sky-400",
  Scheduled: "text-emerald-700 bg-emerald-500/12 dark:text-emerald-400",
  Publishing: "text-violet-700 bg-violet-500/12 dark:text-violet-400",
  "Needs Attention": "text-red-700 bg-red-500/12 dark:text-red-400",
}

export default async function SocialAutopilotQueuePage() {
  await ensurePlatformAdminPage()

  return (
    <div>
      <div className="rounded-2xl border border-[var(--crm-border)] bg-[var(--crm-panel)] overflow-hidden divide-y divide-[var(--crm-border)]">
        {DEMO_QUEUE.map((q) => (
          <div key={q.id} className="flex items-center gap-3 px-3 py-2.5">
            <div
              className="w-10 h-[71px] flex-none rounded-md"
              style={{ background: `linear-gradient(160deg, hsl(${q.hue} 55% 42%), hsl(${q.hue + 30} 55% 28%))` }}
              aria-hidden
            />
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-bold text-[var(--crm-text-primary)] truncate">{q.propertyName}</div>
              <div className="text-[11.5px] text-[var(--crm-text-secondary)] truncate">
                {q.platform} · {q.market}
              </div>
              <div className="text-[11px] text-[var(--crm-text-muted)] mt-0.5">{q.whenLabel}</div>
            </div>
            <span className={"flex-none text-[11.5px] font-semibold px-2.5 py-1 rounded-full " + (STATUS_STYLE[q.status] ?? "text-[var(--crm-text-muted)] bg-[var(--crm-card)]")}>
              {q.status}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
