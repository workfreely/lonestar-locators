export const dynamic = "force-dynamic"

import { ensurePlatformAdminPage } from "@/lib/auth/ensurePlatformAdminPage"
import { DEMO_HISTORY } from "@/components/crm/social/demoFixtures"
import { formatPublishedAt } from "@/lib/social/formatPublishedAt"

// Social Autopilot → History (visual shell). A published-post history table via
// isolated UI-only demo rows (never DB). Shows the reuse model: one source video →
// many published variations. No history persistence yet.
export default async function SocialAutopilotHistoryPage() {
  await ensurePlatformAdminPage()

  return (
    <div>
      <div className="rounded-2xl border border-[var(--crm-border)] bg-[var(--crm-panel)] overflow-x-auto">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-[var(--crm-text-muted)]">
              <th className="px-3 py-3 font-semibold">Source</th>
              <th className="px-3 py-3 font-semibold">Platform</th>
              <th className="px-3 py-3 font-semibold">Property</th>
              <th className="px-3 py-3 font-semibold">Published</th>
              <th className="px-3 py-3 font-semibold">Caption</th>
              <th className="px-3 py-3 font-semibold">On-video text</th>
              <th className="px-3 py-3 font-semibold text-right">Reuse</th>
              <th className="px-3 py-3 font-semibold">Post</th>
            </tr>
          </thead>
          <tbody>
            {DEMO_HISTORY.map((h) => (
              <tr key={h.id} className="border-t border-[var(--crm-border)]">
                <td className="px-3 py-2.5">
                  <div className="w-8 h-[57px] rounded" style={{ background: `linear-gradient(160deg, hsl(${h.hue} 55% 42%), hsl(${h.hue + 30} 55% 28%))` }} aria-hidden />
                </td>
                <td className="px-3 py-2.5 text-[var(--crm-text-secondary)] whitespace-nowrap">{h.platform}</td>
                <td className="px-3 py-2.5 font-semibold text-[var(--crm-text-primary)] whitespace-nowrap">
                  {h.propertyName}
                  <div className="text-[11px] font-normal text-[var(--crm-text-muted)]">{h.market}</div>
                </td>
                <td className="px-3 py-2.5 text-[var(--crm-text-secondary)] whitespace-nowrap">{formatPublishedAt(h.publishedAt)}</td>
                <td className="px-3 py-2.5 text-[var(--crm-text-secondary)] whitespace-nowrap">{h.captionVariation}</td>
                <td className="px-3 py-2.5 text-[var(--crm-text-secondary)] whitespace-nowrap">{h.onVideoText}</td>
                <td className="px-3 py-2.5 text-[var(--crm-text-secondary)] text-right tabular-nums">×{h.reuseCount}</td>
                <td className="px-3 py-2.5 whitespace-nowrap">
                  <span className="text-[12px] font-semibold text-[var(--crm-text-muted)]">View post ↗</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
