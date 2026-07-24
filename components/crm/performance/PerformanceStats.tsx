"use client"

// KPI card row for the Performance page. Same visual language as
// components/crm/DashboardStats.tsx (white rounded cards, uppercase label,
// large number) — kept as its own component so Phase 2 (ROI, spend,
// funnels) can add more cards without touching the existing Dashboard.
//
// The Top Source value reuses the exact same colored pill/badge styling
// as LeadSourcesCard.tsx (same lib/leads/sourceStyles.ts module, same
// classes) so the two stay visually consistent.

import { getSourceStyle } from "@/lib/leads/sourceStyles"

const TOURED_STATUSES = new Set(["done_touring", "applied", "closed"])

function topByCount(counts: Record<string, number>): string | null {
  const keys = Object.keys(counts)
  if (keys.length === 0) return null
  return keys.sort((a, b) => counts[b] - counts[a])[0]
}

export default function PerformanceStats({ leads }: { leads: any[] }) {
  const totalLeads = leads.length

  // closed_at (not crm_status) is the resilient signal here — a lead
  // stays counted as toured/closed after the monthly Closed cleanup
  // archives it out of the Closed column.
  const closedLeads = leads.filter((l) => l.closed_at != null)
  const touredLeads = leads.filter((l) => TOURED_STATUSES.has(l.crm_status) || l.closed_at != null)
  const conversionRate = touredLeads.length > 0
    ? Math.round((closedLeads.length / touredLeads.length) * 100)
    : 0

  const sourceCounts: Record<string, number> = {}
  const campaignCounts: Record<string, number> = {}
  for (const l of leads) {
    const source = (l.source || "unknown").toLowerCase()
    sourceCounts[source] = (sourceCounts[source] ?? 0) + 1
    if (l.utm_campaign) {
      campaignCounts[l.utm_campaign] = (campaignCounts[l.utm_campaign] ?? 0) + 1
    }
  }

  const topSource = topByCount(sourceCounts)
  const topCampaign = topByCount(campaignCounts)

  const cardCls =
    "bg-[var(--crm-panel)] rounded-xl border border-[var(--crm-border)] shadow-sm px-4 py-2 flex flex-col justify-between transition-shadow transition-colors duration-200 hover:border-blue-200 hover:shadow-[0_4px_20px_rgba(59,130,246,0.12),0_8px_24px_rgba(0,0,0,0.08)]"
  const labelCls = "text-[10px] font-semibold text-[var(--crm-text-muted)] uppercase tracking-widest"
  const valueCls = "text-xl font-bold text-[var(--crm-text-primary)] leading-none"

  return (
    <div className="grid grid-cols-4 gap-3">
      <div className={cardCls}>
        <p className={labelCls}>Total Leads</p>
        <p className={`${valueCls} mt-1`}>{totalLeads}</p>
      </div>

      <div className={cardCls}>
        <p className={labelCls}>Top Source</p>
        <div className="mt-1">
          {topSource ? (
            <span
              className={`inline-block text-sm font-semibold px-2.5 py-1 rounded-full border ${getSourceStyle(topSource).badgeClassName}`}
            >
              {getSourceStyle(topSource).label}
            </span>
          ) : (
            <p className={valueCls}>—</p>
          )}
        </div>
      </div>

      <div className={cardCls}>
        <p className={labelCls}>Top Campaign</p>
        <p className={`${valueCls} mt-1 truncate`} title={topCampaign ?? undefined}>
          {topCampaign ?? "—"}
        </p>
      </div>

      <div className={cardCls}>
        <p className={labelCls}>Conversion Rate</p>
        <div className="mt-1">
          <p className={valueCls}>{conversionRate}%</p>
          <p className="text-[10px] text-[var(--crm-text-muted)] mt-1">
            {closedLeads.length} / {touredLeads.length} tours
          </p>
        </div>
      </div>
    </div>
  )
}
