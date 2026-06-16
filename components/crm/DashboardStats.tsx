"use client"

// ─── Constants ────────────────────────────────────────────────────────────────
const MONTHLY_REVENUE_GOAL = 100_000
const REVENUE_PER_CLOSE    = 1_000
const MONTHLY_LEAD_GOAL    = 300

// Statuses that mean the lead has been toured (reached touring stage or beyond)
const TOURED_STATUSES = new Set(["done_touring", "applied", "closed"])

// ─── Source pill colors ───────────────────────────────────────────────────────
const SOURCE_PILL: Record<string, string> = {
  tiktok:    "bg-gray-900 text-white",
  instagram: "bg-pink-500 text-white",
  facebook:  "bg-blue-600 text-white",
  website:   "bg-gray-500 text-white",
  manual:    "bg-slate-400 text-white",
  referral:  "bg-violet-500 text-white",
  google:    "bg-green-600 text-white",
}

// Five tracked marketing sources shown in the stacked bar legend
const TRACKED_SOURCES = [
  { key: "website",   label: "Web",    barColor: "#6b7280", dotColor: "#6b7280" },
  { key: "tiktok",    label: "TikTok", barColor: "#111827", dotColor: "#111827" },
  { key: "facebook",  label: "FB",     barColor: "#2563eb", dotColor: "#2563eb" },
  { key: "instagram", label: "IG",     barColor: "#ec4899", dotColor: "#ec4899" },
  { key: "youtube",   label: "YT",     barColor: "#dc2626", dotColor: "#dc2626" },
]

function sourcePillCls(source: string): string {
  return SOURCE_PILL[source?.toLowerCase()] ?? "bg-gray-400 text-white"
}

function sourceLabel(source: string): string {
  if (!source) return "Unknown"
  return source.charAt(0).toUpperCase() + source.slice(1).toLowerCase()
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isThisMonth(dateStr: string | null | undefined): boolean {
  if (!dateStr) return false
  const d = new Date(dateStr)
  const now = new Date()
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
}

function fmt(n: number): string {
  return n.toLocaleString("en-US")
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function DashboardStats({ leads }: { leads: any[] }) {

  // Active pipeline — excludes closed
  const activeLeads         = leads.filter((l) => l.crm_status !== "closed")
  const activePipelineValue = activeLeads.length * REVENUE_PER_CLOSE

  // Closed this month — uses created_at as proxy (no closed_at column yet)
  const closedThisMonth  = leads.filter((l) => l.crm_status === "closed" && isThisMonth(l.created_at))
  const revenueThisMonth = closedThisMonth.length * REVENUE_PER_CLOSE
  const progressPct      = Math.min(Math.round((revenueThisMonth / MONTHLY_REVENUE_GOAL) * 100), 100)

  // Leads generated this month
  const generatedThisMonth = leads.filter((l) => isThisMonth(l.created_at))

  // Top source this month
  const sourceCounts: Record<string, number> = {}
  for (const l of generatedThisMonth) {
    const s = (l.source ?? "unknown").toLowerCase()
    sourceCounts[s] = (sourceCounts[s] ?? 0) + 1
  }
  const topSourceKey = Object.keys(sourceCounts).sort((a, b) => sourceCounts[b] - sourceCounts[a])[0] ?? null
  const topSourcePct = topSourceKey && generatedThisMonth.length > 0
    ? Math.round((sourceCounts[topSourceKey] / generatedThisMonth.length) * 100)
    : 0

  // Conversion rate — closed / toured (done_touring + applied + closed)
  const touredLeads = leads.filter((l) => TOURED_STATUSES.has(l.crm_status))
  const closedLeads = leads.filter((l) => l.crm_status === "closed")
  const conversionRate = touredLeads.length > 0
    ? Math.round((closedLeads.length / touredLeads.length) * 100)
    : 0

  return (
    <div className="flex-none bg-zinc-100 border-b border-zinc-200 px-5 pt-3 pb-5">
      <div className="grid grid-cols-5 gap-3">

        {/* 1 — Monthly Goal */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-2 flex flex-col justify-between transition-shadow transition-colors duration-200 hover:border-blue-200 hover:shadow-[0_4px_20px_rgba(59,130,246,0.12),0_8px_24px_rgba(0,0,0,0.08)]">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Monthly Goal</p>
          <div className="mt-1">
            <div className="flex items-baseline gap-1.5">
              <span className="text-xl font-bold text-gray-900 leading-none">
                ${fmt(revenueThisMonth)}
              </span>
              <span className="text-xs text-gray-400">/ ${fmt(MONTHLY_REVENUE_GOAL)}</span>
            </div>
            <div className="mt-1.5 h-1 w-full bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-600 rounded-full transition-all duration-500"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <p className="text-[10px] text-gray-400 mt-1">{progressPct}% complete</p>
          </div>
        </div>

        {/* 2 — Active Pipeline */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-2 flex flex-col justify-between transition-shadow transition-colors duration-200 hover:border-blue-200 hover:shadow-[0_4px_20px_rgba(59,130,246,0.12),0_8px_24px_rgba(0,0,0,0.08)]">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Active Pipeline</p>
          <div className="mt-1">
            <p className="text-xl font-bold text-gray-900 leading-none">${fmt(activePipelineValue)}</p>
            <p className="text-[10px] text-gray-400 mt-1">{activeLeads.length} active {activeLeads.length === 1 ? "lead" : "leads"}</p>
          </div>
        </div>

        {/* 3 — Leads This Month */}
        {(() => {
          const total = generatedThisMonth.length
          const withCounts = TRACKED_SOURCES.map((s) => ({
            ...s,
            count: sourceCounts[s.key] ?? 0,
            pct: total > 0 ? Math.round(((sourceCounts[s.key] ?? 0) / total) * 100) : 0,
          }))
          const barSources = withCounts.filter((s) => s.count > 0)

          return (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-2 flex flex-col justify-between transition-shadow transition-colors duration-200 hover:border-blue-200 hover:shadow-[0_4px_20px_rgba(59,130,246,0.12),0_8px_24px_rgba(0,0,0,0.08)]">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Leads This Month</p>
              <div className="mt-1">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-xl font-bold text-gray-900 leading-none">{total}</span>
                  <span className="text-xs text-gray-400">/ {MONTHLY_LEAD_GOAL}</span>
                </div>

                {/* Stacked bar — only sources with leads */}
                <div className="mt-1.5 h-1.5 w-full rounded-full overflow-hidden flex bg-gray-100">
                  {barSources.map((s) => (
                    <div
                      key={s.key}
                      style={{ width: `${s.pct}%`, backgroundColor: s.barColor }}
                      className="h-full transition-all duration-500"
                    />
                  ))}
                </div>

                {/* Legend — all five sources always visible */}
                <div className="mt-1.5 flex items-center flex-wrap gap-x-2.5 gap-y-0.5">
                  {withCounts.map((s) => (
                    <span
                      key={s.key}
                      className={`flex items-center gap-1 text-[10px] ${s.count === 0 ? "text-gray-300" : "text-gray-500"}`}
                    >
                      <span
                        className="w-1.5 h-1.5 rounded-full flex-none"
                        style={{ backgroundColor: s.count === 0 ? "#d1d5db" : s.dotColor }}
                      />
                      {s.label}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )
        })()}

        {/* 4 — Conversion Rate */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-2 flex flex-col justify-between transition-shadow transition-colors duration-200 hover:border-blue-200 hover:shadow-[0_4px_20px_rgba(59,130,246,0.12),0_8px_24px_rgba(0,0,0,0.08)]">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Conversion Rate</p>
          <div className="mt-1">
            <p className="text-xl font-bold text-gray-900 leading-none">{conversionRate}%</p>
            <p className="text-[10px] text-gray-400 mt-1">
              {closedLeads.length} / {touredLeads.length} tours
            </p>
          </div>
        </div>

        {/* 5 — Closed This Month */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-2 flex flex-col justify-between transition-shadow transition-colors duration-200 hover:border-blue-200 hover:shadow-[0_4px_20px_rgba(59,130,246,0.12),0_8px_24px_rgba(0,0,0,0.08)]">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Closed This Month</p>
          <div className="mt-1">
            <p className="text-xl font-bold text-gray-900 leading-none">{closedThisMonth.length}</p>
            <p className="text-[10px] text-gray-400 mt-1">{progressPct}% of revenue goal</p>
          </div>
        </div>

      </div>
    </div>
  )
}
