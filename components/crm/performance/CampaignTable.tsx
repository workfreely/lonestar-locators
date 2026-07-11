"use client"

// Plain grouped table of leads by utm_campaign. No spend/ROI data — that's
// explicitly Phase 2. Existing leads (pre-attribution-tracking) have no
// utm_campaign, so they roll into a single "(no campaign data)" row rather
// than being silently dropped from the count.

export default function CampaignTable({ leads }: { leads: any[] }) {
  const groups: Record<string, { count: number; source: string | null }> = {}

  for (const l of leads) {
    const key = l.utm_campaign || "(no campaign data)"
    if (!groups[key]) groups[key] = { count: 0, source: l.utm_source || l.source || null }
    groups[key].count += 1
  }

  const rows = Object.entries(groups).sort((a, b) => b[1].count - a[1].count)

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-3">
        Campaigns
      </p>

      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[10px] uppercase tracking-widest text-gray-400 border-b border-gray-100">
            <th className="pb-2 font-semibold">Campaign</th>
            <th className="pb-2 font-semibold">Source</th>
            <th className="pb-2 font-semibold text-right">Leads</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([campaign, data]) => (
            <tr key={campaign} className="border-b border-gray-50 last:border-0">
              <td className="py-2 text-gray-800">{campaign}</td>
              <td className="py-2 text-gray-500 capitalize">{data.source ?? "—"}</td>
              <td className="py-2 text-right font-semibold text-gray-800">{data.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
