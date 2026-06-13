"use client"

// ─── Constants ────────────────────────────────────────────────────────────────
// Adjust REVENUE_PER_CLOSE to match actual average commission per closed deal.
const MONTHLY_REVENUE_GOAL = 100_000
const REVENUE_PER_CLOSE    = 1_000   // matches existing pipeline value logic
const LEAD_GOAL_PER_DAY    = 10

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isThisMonth(dateStr: string | null | undefined): boolean {
  if (!dateStr) return false
  const d = new Date(dateStr)
  const now = new Date()
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth()    === now.getMonth()
  )
}

function fmt(n: number): string {
  return n.toLocaleString("en-US")
}

function fmtDollars(n: number): string {
  if (n >= 1_000) return `$${(n / 1_000).toFixed(n % 1_000 === 0 ? 0 : 1)}k`
  return `$${fmt(n)}`
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
  accent = false,
}: {
  label: string
  value: string | number
  sub?: string
  accent?: boolean
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-4 flex flex-col justify-between min-h-[88px]">
      <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest">{label}</p>
      <div>
        <p className={`text-2xl font-bold leading-none mt-1 ${accent ? "text-blue-600" : "text-gray-900"}`}>
          {value}
        </p>
        {sub && (
          <p className="text-[11px] text-gray-400 mt-1">{sub}</p>
        )}
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function DashboardStats({ leads }: { leads: any[] }) {
  const now         = new Date()
  const monthLabel  = now.toLocaleDateString("en-US", { month: "long", year: "numeric" })
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  const leadGoal    = LEAD_GOAL_PER_DAY * daysInMonth

  // Active pipeline — excludes closed leads
  const activeLeads        = leads.filter((l) => l.crm_status !== "closed")
  const activePipelineValue = activeLeads.length * REVENUE_PER_CLOSE

  // Closed this month — uses created_at as proxy (no closed_at column yet).
  // A lead is counted when crm_status === "closed" AND it was created this month.
  // TODO: replace with a dedicated closed_at timestamp once that column exists.
  const closedThisMonth = leads.filter(
    (l) => l.crm_status === "closed" && isThisMonth(l.created_at)
  )

  // Leads generated this month — all leads created this calendar month
  const generatedThisMonth = leads.filter((l) => isThisMonth(l.created_at))

  // Monthly revenue progress
  const revenueThisMonth = closedThisMonth.length * REVENUE_PER_CLOSE
  const revenueProgress  = Math.min(revenueThisMonth / MONTHLY_REVENUE_GOAL, 1)
  const progressPct      = Math.round(revenueProgress * 100)

  return (
    <div className="w-full px-5 py-3 bg-[#f7f8fa] border-b border-gray-200">
      <div className="grid grid-cols-[2fr_1fr_1fr] grid-rows-2 gap-3 max-w-[960px]">

        {/* ── Monthly Goal — large focal card, spans both rows ── */}
        <div className="row-span-2 bg-white rounded-2xl border border-gray-100 shadow-sm px-6 py-5 flex flex-col justify-between">

          {/* Header */}
          <div>
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest">
              Monthly Goal
            </p>
            <p className="text-[11px] text-gray-400 mt-0.5">{monthLabel}</p>
          </div>

          {/* Revenue figures */}
          <div className="my-3">
            <div className="flex items-end gap-2">
              <span className="text-4xl font-bold text-gray-900 leading-none">
                {fmtDollars(revenueThisMonth)}
              </span>
              <span className="text-base text-gray-400 font-medium mb-0.5">
                / {fmtDollars(MONTHLY_REVENUE_GOAL)}
              </span>
            </div>
            <p className="text-[12px] text-gray-400 mt-1">
              {closedThisMonth.length} {closedThisMonth.length === 1 ? "close" : "closes"} this month
            </p>
          </div>

          {/* Progress bar */}
          <div>
            <div className="flex justify-between items-center mb-1.5">
              <span className="text-[11px] text-gray-400">Progress</span>
              <span className="text-[11px] font-semibold text-blue-600">{progressPct}%</span>
            </div>
            <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-600 rounded-full transition-all duration-500"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <p className="text-[11px] text-gray-400 mt-1.5">
              {fmtDollars(MONTHLY_REVENUE_GOAL - revenueThisMonth)} remaining
            </p>
          </div>
        </div>

        {/* ── Row 1, Col 2 — Active Pipeline ── */}
        <StatCard
          label="Active Pipeline"
          value={`$${fmt(activePipelineValue)}`}
          sub={`${activeLeads.length} active ${activeLeads.length === 1 ? "lead" : "leads"}`}
        />

        {/* ── Row 1, Col 3 — Active Leads ── */}
        <StatCard
          label="Active Leads"
          value={activeLeads.length}
          sub="excl. closed"
        />

        {/* ── Row 2, Col 2 — Closed This Month ── */}
        <StatCard
          label="Closed This Month"
          value={closedThisMonth.length}
          sub={`${progressPct}% of monthly goal`}
          accent={closedThisMonth.length > 0}
        />

        {/* ── Row 2, Col 3 — Leads Generated ── */}
        <StatCard
          label="Leads This Month"
          value={generatedThisMonth.length}
          sub={`goal: ${fmt(leadGoal)}`}
        />

      </div>
    </div>
  )
}
