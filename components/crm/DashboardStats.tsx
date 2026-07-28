"use client"

import { useEffect, useState } from "react"
import { getSourceBarColor } from "@/lib/leads/sourceStyles"

// ─── Constants ────────────────────────────────────────────────────────────────
// Fallbacks when a profile hasn't set its own goals (real operator today).
// Demo / goal-driven callers pass monthlyGoal + avgCommission explicitly.
const MONTHLY_REVENUE_GOAL = 100_000
const REVENUE_PER_CLOSE    = 1_000
const MONTHLY_LEAD_GOAL    = 300

// Active Pipeline counts only leads still moving through the workflow —
// never Closed (won) or Archived (dead/lost).
const ACTIVE_STATUSES = new Set([
  "new", "contacted", "searching", "list_sent", "ready_to_tour", "done_touring", "applied",
])

// Five tracked marketing sources shown in the stacked bar legend. This is a
// deliberately curated subset for this specific compact card (short
// abbreviated labels, limited legend width) — NOT the full source list;
// the Performance page's Lead Sources section shows every source that
// actually appears in the data. Colors come from the shared
// lib/leads/sourceStyles.ts module so they can't drift from the badges
// shown elsewhere in the CRM.
const TRACKED_SOURCES = [
  { key: "website",   label: "Web",    barColor: getSourceBarColor("website") },
  { key: "tiktok",    label: "TikTok", barColor: getSourceBarColor("tiktok") },
  { key: "facebook",  label: "FB",     barColor: getSourceBarColor("facebook") },
  { key: "instagram", label: "IG",     barColor: getSourceBarColor("instagram") },
  { key: "youtube",   label: "YT",     barColor: getSourceBarColor("youtube") },
]

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

// Count a number up from 0 to `target` on mount (easeOutCubic) so the demo /
// dashboard analytics feel alive. Disabled → renders the target immediately.
function useCountUp(target: number, enabled: boolean, durationMs = 1200): number {
  const [value, setValue] = useState(enabled ? 0 : target)
  useEffect(() => {
    if (!enabled) {
      setValue(target)
      return
    }
    let raf = 0
    const start = performance.now()
    const tick = (now: number) => {
      const t = Math.min((now - start) / durationMs, 1)
      const eased = 1 - Math.pow(1 - t, 3)
      setValue(target * eased)
      if (t < 1) raf = requestAnimationFrame(tick)
      else setValue(target)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, enabled, durationMs])
  return value
}

function CountNum({ value, prefix = "", enabled }: { value: number; prefix?: string; enabled: boolean }) {
  const v = useCountUp(value, enabled)
  return <>{prefix}{fmt(Math.round(v))}</>
}

export default function DashboardStats({
  leads,
  monthlyGoal = MONTHLY_REVENUE_GOAL,
  avgCommission = REVENUE_PER_CLOSE,
  animate = true,
}: {
  leads: any[]
  monthlyGoal?: number
  avgCommission?: number
  animate?: boolean
}) {

  // Active pipeline — only leads still in the active workflow (excludes
  // both Closed and Archived)
  const activeLeads         = leads.filter((l) => ACTIVE_STATUSES.has(l.crm_status))
  const activePipelineValue = activeLeads.length * avgCommission

  // Closed this month — keyed off closed_at (the lead's actual closed
  // date), not crm_status, so this stays correct after the monthly Closed
  // cleanup archives a lead out of the Closed column.
  const closedThisMonth  = leads.filter((l) => l.closed_at && isThisMonth(l.closed_at))
  const revenueThisMonth = closedThisMonth.length * avgCommission
  const progressPct      = Math.min(Math.round((revenueThisMonth / monthlyGoal) * 100), 100)

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

  // Projected commission — simple version: Applied leads only, using the
  // same per-lead dollar figure (REVENUE_PER_CLOSE) already used above for
  // Active Pipeline / Monthly Goal. Not estimating from any other stage
  // yet (Searching, List Sent, Ready to Tour, etc.) — intentionally simple
  // until there's more production data to base a smarter model on.
  const appliedLeads = leads.filter((l) => l.crm_status === "applied")
  const projectedCommission = appliedLeads.length * avgCommission

  return (
    <div className="flex-none bg-[var(--crm-card)] border-b border-[var(--crm-border)] px-5 pt-3 pb-5">
      <div className="grid grid-cols-5 gap-3">

        {/* 1 — Monthly Goal */}
        <div className="bg-[var(--crm-panel)] rounded-xl border border-[var(--crm-border)] shadow-sm px-4 py-2 flex flex-col justify-between transition-shadow transition-colors duration-200 hover:border-blue-200 hover:shadow-[0_4px_20px_rgba(59,130,246,0.12),0_8px_24px_rgba(0,0,0,0.08)]">
          <p className="text-[10px] font-semibold text-[var(--crm-text-muted)] uppercase tracking-widest">Monthly Goal</p>
          <div className="mt-1">
            <div className="flex items-baseline gap-1.5">
              <span className="text-xl font-bold text-[var(--crm-text-primary)] leading-none">
                <CountNum value={revenueThisMonth} prefix="$" enabled={animate} />
              </span>
              <span className="text-xs text-[var(--crm-text-muted)]">/ ${fmt(monthlyGoal)}</span>
            </div>
            <div className="mt-1.5 h-1 w-full bg-[var(--crm-inset)] rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-600 rounded-full transition-all duration-500"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <p className="text-[10px] text-[var(--crm-text-muted)] mt-1">{progressPct}% complete</p>
          </div>
        </div>

        {/* 2 — Active Pipeline */}
        <div className="bg-[var(--crm-panel)] rounded-xl border border-[var(--crm-border)] shadow-sm px-4 py-2 flex flex-col justify-between transition-shadow transition-colors duration-200 hover:border-blue-200 hover:shadow-[0_4px_20px_rgba(59,130,246,0.12),0_8px_24px_rgba(0,0,0,0.08)]">
          <p className="text-[10px] font-semibold text-[var(--crm-text-muted)] uppercase tracking-widest">Active Pipeline</p>
          <div className="mt-1">
            <p className="text-xl font-bold text-[var(--crm-text-primary)] leading-none"><CountNum value={activePipelineValue} prefix="$" enabled={animate} /></p>
            <p className="text-[10px] text-[var(--crm-text-muted)] mt-1">{activeLeads.length} active {activeLeads.length === 1 ? "lead" : "leads"}</p>
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
            <div className="bg-[var(--crm-panel)] rounded-xl border border-[var(--crm-border)] shadow-sm px-4 py-2 flex flex-col justify-between transition-shadow transition-colors duration-200 hover:border-blue-200 hover:shadow-[0_4px_20px_rgba(59,130,246,0.12),0_8px_24px_rgba(0,0,0,0.08)]">
              <p className="text-[10px] font-semibold text-[var(--crm-text-muted)] uppercase tracking-widest">Leads This Month</p>
              <div className="mt-1">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-xl font-bold text-[var(--crm-text-primary)] leading-none"><CountNum value={total} enabled={animate} /></span>
                  <span className="text-xs text-[var(--crm-text-muted)]">/ {MONTHLY_LEAD_GOAL}</span>
                </div>

                {/* Stacked bar — only sources with leads */}
                <div className="mt-1.5 h-1.5 w-full rounded-full overflow-hidden flex bg-[var(--crm-inset)]">
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
                      className={`flex items-center gap-1 text-[10px] ${s.count === 0 ? "text-[var(--crm-text-muted)]/60" : "text-[var(--crm-text-secondary)]"}`}
                    >
                      <span
                        className="w-1.5 h-1.5 rounded-full flex-none"
                        style={{ backgroundColor: s.count === 0 ? "#d1d5db" : s.barColor }}
                      />
                      {s.label}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )
        })()}

        {/* 4 — Projected Commission */}
        <div className="bg-[var(--crm-panel)] rounded-xl border border-[var(--crm-border)] shadow-sm px-4 py-2 flex flex-col justify-between transition-shadow transition-colors duration-200 hover:border-blue-200 hover:shadow-[0_4px_20px_rgba(59,130,246,0.12),0_8px_24px_rgba(0,0,0,0.08)]">
          <p className="text-[10px] font-semibold text-[var(--crm-text-muted)] uppercase tracking-widest">Projected Commission</p>
          <div className="mt-1">
            <p className="text-xl font-bold text-[var(--crm-text-primary)] leading-none"><CountNum value={projectedCommission} prefix="$" enabled={animate} /></p>
            <p className="text-[10px] text-[var(--crm-text-muted)] mt-1">{appliedLeads.length} applied {appliedLeads.length === 1 ? "lead" : "leads"}</p>
          </div>
        </div>

        {/* 5 — Closed This Month */}
        <div className="bg-[var(--crm-panel)] rounded-xl border border-[var(--crm-border)] shadow-sm px-4 py-2 flex flex-col justify-between transition-shadow transition-colors duration-200 hover:border-blue-200 hover:shadow-[0_4px_20px_rgba(59,130,246,0.12),0_8px_24px_rgba(0,0,0,0.08)]">
          <p className="text-[10px] font-semibold text-[var(--crm-text-muted)] uppercase tracking-widest">Closed This Month</p>
          <div className="mt-1">
            <p className="text-xl font-bold text-[var(--crm-text-primary)] leading-none"><CountNum value={closedThisMonth.length} enabled={animate} /></p>
            <p className="text-[10px] text-[var(--crm-text-muted)] mt-1">{progressPct}% of revenue goal</p>
          </div>
        </div>

      </div>
    </div>
  )
}
