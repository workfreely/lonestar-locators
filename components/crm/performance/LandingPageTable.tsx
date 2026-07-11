"use client"

// Plain grouped table of leads by landing_page. Same simplicity constraint
// as CampaignTable — no conversion-rate math yet (that needs page-view
// counts, which aren't tracked until the Landing Page Viewed event exists).

export default function LandingPageTable({ leads }: { leads: any[] }) {
  const counts: Record<string, number> = {}

  for (const l of leads) {
    const key = l.landing_page || "(unknown page)"
    counts[key] = (counts[key] ?? 0) + 1
  }

  const rows = Object.entries(counts).sort((a, b) => b[1] - a[1])

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-3">
        Landing Pages
      </p>

      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[10px] uppercase tracking-widest text-gray-400 border-b border-gray-100">
            <th className="pb-2 font-semibold">Page</th>
            <th className="pb-2 font-semibold text-right">Leads</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([page, count]) => (
            <tr key={page} className="border-b border-gray-50 last:border-0">
              <td className="py-2 text-gray-800 font-mono text-[13px]">{page}</td>
              <td className="py-2 text-right font-semibold text-gray-800">{count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
