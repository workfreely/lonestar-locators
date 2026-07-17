"use client"

// Grouped CLOSED lead counts by city — same four markets and shape as
// LeadsByCityCard. Scoped by closed_at (not crm_status) so a lead stays
// counted here after the monthly Closed cleanup archives it out of the
// Closed column. Percentages and Total Closed Deals are computed against
// all closed leads (not just these four cities).

const CITIES = ["San Antonio", "Dallas", "Houston", "Austin"]

export default function ClosedDealsByCityCard({ leads }: { leads: any[] }) {
  const closed = leads.filter((l) => l.closed_at != null)
  const total = closed.length

  const counts: Record<string, number> = {}
  for (const city of CITIES) counts[city] = 0
  for (const l of closed) {
    const city = String(l.city || "").trim()
    if (counts[city] !== undefined) counts[city] += 1
  }

  const rows = CITIES
    .map((city) => ({ city, count: counts[city] }))
    .sort((a, b) => b.count - a.count)

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-3">
        Closed Deals by City
      </p>

      <div className="space-y-2">
        {rows.map(({ city, count }) => {
          const pct = total > 0 ? Math.round((count / total) * 100) : 0
          return (
            <div key={city} className="flex items-center gap-3">
              <span className="flex-none text-sm text-gray-700 w-28 truncate">{city}</span>
              <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-green-500 rounded-full transition-all duration-500"
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
          Total Closed Deals
        </span>
        <span className="text-sm font-bold text-gray-900">{total}</span>
      </div>
    </div>
  )
}
