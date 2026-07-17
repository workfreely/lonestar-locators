"use client"

// Full-width historical record for the Performance page. "Leads" and
// "Applied" are grouped by the month a lead was created (no applied_at
// column exists to date an actual stage transition, so Applied stays a
// created-that-month + current-status proxy). "Closed" and "Commission"
// are grouped by closed_at — the month a lead actually closed, which may
// differ from the month it was created — so a deal closed the month
// after it came in lands in the right row, and still lands there after
// the monthly Closed cleanup archives it out of the Closed column. The
// current calendar month is always included even with zero activity so
// the table never disappears at the start of a new month; earlier months
// only appear once they have actual lead data — no fake historical rows.

const TOURED_STATUSES = new Set(["done_touring", "applied", "closed"])
const REVENUE_PER_CLOSE = 1_000

function monthKey(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return null
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
}

function monthLabel(key: string): string {
  const [year, month] = key.split("-").map(Number)
  return new Date(year, month - 1, 1).toLocaleString("en-US", { month: "long", year: "numeric" })
}

function fmt(n: number): string {
  return n.toLocaleString("en-US")
}

export default function MonthlyPerformanceHistory({ leads }: { leads: any[] }) {
  const createdBuckets: Record<string, any[]> = {}
  for (const l of leads) {
    const key = monthKey(l.created_at)
    if (!key) continue
    if (!createdBuckets[key]) createdBuckets[key] = []
    createdBuckets[key].push(l)
  }

  const closedBuckets: Record<string, any[]> = {}
  for (const l of leads) {
    if (!l.closed_at) continue
    const key = monthKey(l.closed_at)
    if (!key) continue
    if (!closedBuckets[key]) closedBuckets[key] = []
    closedBuckets[key].push(l)
  }

  const now = new Date()
  const currentKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`

  const allKeys = new Set([
    ...Object.keys(createdBuckets),
    ...Object.keys(closedBuckets),
    currentKey,
  ])

  const rows = Array.from(allKeys)
    .sort((a, b) => (a < b ? 1 : -1))
    .map((key) => {
      const monthLeads = createdBuckets[key] ?? []
      const closedThisMonth = closedBuckets[key] ?? []
      const appliedLeads = monthLeads.filter((l) => l.crm_status === "applied")

      // A lead closed this month is by definition toured, even if it was
      // created in an earlier month's cohort — union both groups by id
      // so it isn't double-counted if it also happens to be in monthLeads.
      const touredIds = new Set<any>()
      for (const l of monthLeads) {
        if (TOURED_STATUSES.has(l.crm_status) || l.closed_at != null) touredIds.add(l.id)
      }
      for (const l of closedThisMonth) touredIds.add(l.id)

      const conversionRate = touredIds.size > 0
        ? Math.round((closedThisMonth.length / touredIds.size) * 100)
        : 0
      const commission = closedThisMonth.length * REVENUE_PER_CLOSE

      return {
        key,
        label: monthLabel(key),
        leadCount: monthLeads.length,
        appliedCount: appliedLeads.length,
        closedCount: closedThisMonth.length,
        conversionRate,
        commission,
      }
    })

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-3">
        Monthly Performance History
      </p>

      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[10px] uppercase tracking-widest text-gray-400 border-b border-gray-100">
            <th className="pb-2 font-semibold">Month</th>
            <th className="pb-2 font-semibold text-right">Leads</th>
            <th className="pb-2 font-semibold text-right">Applied</th>
            <th className="pb-2 font-semibold text-right">Closed</th>
            <th className="pb-2 font-semibold text-right">Conversion Rate</th>
            <th className="pb-2 font-semibold text-right">Commission</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-b border-gray-50 last:border-0">
              <td className="py-2 text-gray-800">{r.label}</td>
              <td className="py-2 text-right text-gray-800">{r.leadCount}</td>
              <td className="py-2 text-right text-gray-800">{r.appliedCount}</td>
              <td className="py-2 text-right text-gray-800">{r.closedCount}</td>
              <td className="py-2 text-right font-semibold text-gray-800">{r.conversionRate}%</td>
              <td className="py-2 text-right font-semibold text-gray-800">${fmt(r.commission)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
