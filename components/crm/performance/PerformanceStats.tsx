"use client"

// KPI card row for the Performance page. Same visual language as
// components/crm/DashboardStats.tsx (white rounded cards, uppercase label,
// large number) — kept as its own component so Phase 2 (ROI, spend,
// funnels) can add more cards without touching the existing Dashboard.

function isThisWeek(dateStr: string | null | undefined): boolean {
  if (!dateStr) return false
  const d = new Date(dateStr)
  const now = new Date()
  const weekAgo = new Date(now)
  weekAgo.setDate(now.getDate() - 7)
  return d.getTime() >= weekAgo.getTime() && d.getTime() <= now.getTime()
}

function topByCount(counts: Record<string, number>): string | null {
  const keys = Object.keys(counts)
  if (keys.length === 0) return null
  return keys.sort((a, b) => counts[b] - counts[a])[0]
}

export default function PerformanceStats({ leads }: { leads: any[] }) {
  const totalLeads = leads.length
  const leadsThisWeek = leads.filter((l) => isThisWeek(l.created_at)).length

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
    "bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-2 flex flex-col justify-between transition-shadow transition-colors duration-200 hover:border-blue-200 hover:shadow-[0_4px_20px_rgba(59,130,246,0.12),0_8px_24px_rgba(0,0,0,0.08)]"
  const labelCls = "text-[10px] font-semibold text-gray-400 uppercase tracking-widest"
  const valueCls = "text-xl font-bold text-gray-900 leading-none"

  return (
    <div className="grid grid-cols-4 gap-3">
      <div className={cardCls}>
        <p className={labelCls}>Total Leads</p>
        <p className={`${valueCls} mt-1`}>{totalLeads}</p>
      </div>

      <div className={cardCls}>
        <p className={labelCls}>Leads This Week</p>
        <p className={`${valueCls} mt-1`}>{leadsThisWeek}</p>
      </div>

      <div className={cardCls}>
        <p className={labelCls}>Top Source</p>
        <p className={`${valueCls} mt-1 capitalize`}>{topSource ?? "—"}</p>
      </div>

      <div className={cardCls}>
        <p className={labelCls}>Top Campaign</p>
        <p className={`${valueCls} mt-1 truncate`} title={topCampaign ?? undefined}>
          {topCampaign ?? "—"}
        </p>
      </div>
    </div>
  )
}
