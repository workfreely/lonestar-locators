"use client"

// Grouped lead counts by `source` (the existing collapsed field — left
// untouched everywhere else in the app). Simple bar-per-row list, no
// charting library. Phase 2 can swap the bars for a real chart without
// changing how this component is consumed.
//
// Labels/colors come from lib/leads/sourceStyles.ts — the same canonical
// module used by DashboardStats, LeadCard, and LeadPanel — so a source
// never has to be hardcoded here separately, and a source that doesn't
// exist in the known list yet still shows up (graceful fallback) instead
// of being silently dropped.

import ChannelLabel from "@/lib/leads/channelMeta"
import { marketingLeads, resolveChannel } from "@/lib/leads/resolveChannel"

export default function LeadSourcesCard({ leads }: { leads: any[] }) {
  // Grouped by the CANONICAL channel, not the raw leads.source string. That column mixes site
  // labels ("Lone Star Website"), test labels and the submit route's fallback, so grouping on it
  // put two paid Google leads and a YouTube lead inside one "Lone Star Website" bucket. Raw fields
  // are untouched — this is read-time only.
  //
  // Internal/test records are excluded entirely rather than shown as a channel; they are not
  // acquisition, and leaving them in inflates the denominator behind every percentage here.
  const scoped = marketingLeads(leads)
  const counts: Record<string, number> = {}
  for (const l of scoped) {
    const source = resolveChannel(l)
    counts[source] = (counts[source] ?? 0) + 1
  }

  const total = scoped.length
  const rows = Object.entries(counts).sort((a, b) => b[1] - a[1])

  return (
    <div className="bg-[var(--crm-panel)] rounded-xl border border-[var(--crm-border)] shadow-sm p-4">
      <p className="text-[10px] font-semibold text-[var(--crm-text-muted)] uppercase tracking-widest mb-3">
        Lead Sources
      </p>

      {rows.length === 0 && (
        <p className="text-sm text-[var(--crm-text-muted)]">No leads yet.</p>
      )}

      <div className="space-y-2">
        {rows.map(([source, count]) => {
          const pct = total > 0 ? Math.round((count / total) * 100) : 0
          return (
            <div key={source} className="flex items-center gap-3">
              {/* Icon + label replaces the filled badge: the mark is the identifier, the brand
                  colour a restrained accent. Bars, counts and percentages are untouched. */}
              <ChannelLabel channel={source} className="flex-none w-28 text-[12px] text-[var(--crm-text-secondary)]" />
              <div className="flex-1 h-2 bg-[var(--crm-inset)] rounded-full overflow-hidden">
                <div
                  className="h-full bg-[var(--kb-accent)] rounded-full transition-all duration-500"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="flex-none text-sm font-semibold text-[var(--crm-text-secondary)] w-10 text-right">
                {count}
              </span>
              <span className="flex-none text-[11px] text-[var(--crm-text-muted)] w-9 text-right">
                {pct}%
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
