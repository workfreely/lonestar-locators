"use client"

// Grouped lead counts by city — the four markets we operate in, always
// shown even at zero (never hidden), sorted by count. Percentages and the
// Total Leads figure are computed against ALL leads (not just these four
// cities), so they match PerformanceStats' "Total Leads" KPI exactly.

const CITIES = ["San Antonio", "Dallas", "Houston", "Austin"]

export default function LeadsByCityCard({ leads }: { leads: any[] }) {
  const total = leads.length

  const counts: Record<string, number> = {}
  for (const city of CITIES) counts[city] = 0
  for (const l of leads) {
    const city = String(l.city || "").trim()
    if (counts[city] !== undefined) counts[city] += 1
  }

  const rows = CITIES
    .map((city) => ({ city, count: counts[city] }))
    .sort((a, b) => b.count - a.count)

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-3">
        Leads by City
      </p>

      <div className="space-y-2">
        {rows.map(({ city, count }) => {
          const pct = total > 0 ? Math.round((count / total) * 100) : 0
          return (
            <div key={city} className="flex items-center gap-3">
              <span className="flex-none text-sm text-gray-700 w-28 truncate">{city}</span>
              <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 rounded-full transition-all duration-500"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="flex-none text-sm font-semibold text-gray-700 w-10 text-right">
                {count}
              </span>
              <span className="flex-none text-[11px] text-gray-400 w-9 text-right">
                {pct}%
              </span>
            </div>
          )
        })}
      </div>

      <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
        <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">
          Total Leads
        </span>
        <span className="text-sm font-bold text-gray-900">{total}</span>
      </div>
    </div>
  )
}
