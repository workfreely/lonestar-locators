"use client"

// Grouped lead counts by `source` (the existing collapsed field — left
// untouched everywhere else in the app). Simple bar-per-row list, no
// charting library. Phase 2 can swap the bars for a real chart without
// changing how this component is consumed.

const SOURCE_PILL: Record<string, string> = {
  tiktok:    "bg-gray-900 text-white",
  instagram: "bg-pink-500 text-white",
  facebook:  "bg-blue-600 text-white",
  website:   "bg-gray-500 text-white",
  manual:    "bg-slate-400 text-white",
  referral:  "bg-violet-500 text-white",
  google:    "bg-green-600 text-white",
}

function sourcePillCls(source: string): string {
  return SOURCE_PILL[source?.toLowerCase()] ?? "bg-gray-400 text-white"
}

export default function LeadSourcesCard({ leads }: { leads: any[] }) {
  const counts: Record<string, number> = {}
  for (const l of leads) {
    const source = l.source || "unknown"
    counts[source] = (counts[source] ?? 0) + 1
  }

  const total = leads.length
  const rows = Object.entries(counts).sort((a, b) => b[1] - a[1])

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-3">
        Lead Sources
      </p>

      {rows.length === 0 && (
        <p className="text-sm text-gray-400">No leads yet.</p>
      )}

      <div className="space-y-2">
        {rows.map(([source, count]) => {
          const pct = total > 0 ? Math.round((count / total) * 100) : 0
          return (
            <div key={source} className="flex items-center gap-3">
              <span
                className={`flex-none text-[11px] font-semibold px-2 py-0.5 rounded-full capitalize ${sourcePillCls(source)}`}
              >
                {source}
              </span>
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
    </div>
  )
}
