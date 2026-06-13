"use client"

// ─── Constants ────────────────────────────────────────────────────────────────
const MONTHLY_REVENUE_GOAL = 100_000
const REVENUE_PER_CLOSE    = 1_000
const MONTHLY_LEAD_GOAL    = 220   // 10 leads × 22 work days

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
  const now = new Date()

  // Active pipeline — excludes closed
  const activeLeads         = leads.filter((l) => l.crm_status !== "closed")
  const activePipelineValue = activeLeads.length * REVENUE_PER_CLOSE

  // Closed this month — uses created_at as proxy (no closed_at column yet)
  const closedThisMonth  = leads.filter((l) => l.crm_status === "closed" && isThisMonth(l.created_at))
  const revenueThisMonth = closedThisMonth.length * REVENUE_PER_CLOSE
  const progressPct      = Math.min(Math.round((revenueThisMonth / MONTHLY_REVENUE_GOAL) * 100), 100)

  // Leads generated this month
  const generatedThisMonth = leads.filter((l) => isThisMonth(l.created_at))

  // Overdue follow-ups
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const overdueCount = leads.filter((l) => {
    if (!l.next_action_date || l.crm_status === "closed") return false
    const d = new Date(l.next_action_date)
    d.setHours(0, 0, 0, 0)
    return d.getTime() <= today.getTime()
  }).length

  return (
    <div className="flex-none bg-[#f7f8fa] border-b border-gray-200 px-5 py-1.5">
      <div className="grid grid-cols-5 gap-3">

        {/* 1 — Monthly Goal */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-2 flex flex-col justify-between">
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
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-2 flex flex-col justify-between">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Active Pipeline</p>
          <div className="mt-1">
            <p className="text-xl font-bold text-gray-900 leading-none">${fmt(activePipelineValue)}</p>
            <p className="text-[10px] text-gray-400 mt-1">{activeLeads.length} active {activeLeads.length === 1 ? "lead" : "leads"}</p>
          </div>
        </div>

        {/* 3 — Leads This Month */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-2 flex flex-col justify-between">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Leads This Month</p>
          <div className="mt-1">
            <div className="flex items-baseline gap-1.5">
              <span className="text-xl font-bold text-gray-900 leading-none">{generatedThisMonth.length}</span>
              <span className="text-xs text-gray-400">/ {MONTHLY_LEAD_GOAL}</span>
            </div>
            <p className="text-[10px] text-gray-400 mt-1">
              {Math.round((generatedThisMonth.length / MONTHLY_LEAD_GOAL) * 100)}% of goal
            </p>
          </div>
        </div>

        {/* 4 — Closed This Month */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-2 flex flex-col justify-between">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Closed This Month</p>
          <div className="mt-1">
            <p className="text-xl font-bold text-gray-900 leading-none">{closedThisMonth.length}</p>
            <p className="text-[10px] text-gray-400 mt-1">{progressPct}% of revenue goal</p>
          </div>
        </div>

        {/* 5 — Overdue Follow-Ups */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-2 flex flex-col justify-between">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Overdue Follow-Ups</p>
          <div className="mt-1">
            <p className={`text-xl font-bold leading-none ${overdueCount > 0 ? "text-gray-900" : "text-gray-400"}`}>
              {overdueCount}
            </p>
            <p className="text-[10px] text-gray-400 mt-1">
              {overdueCount === 0 ? "all caught up" : `${overdueCount === 1 ? "lead" : "leads"} need attention`}
            </p>
          </div>
        </div>

      </div>
    </div>
  )
}
