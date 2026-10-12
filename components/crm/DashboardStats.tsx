"use client"

import { useEffect, useState } from "react"
import { getSourceBarColor } from "@/lib/leads/sourceStyles"
import { sumEstimatedCommission, sumClosedEstimatedCommission, DEFAULT_PROJECTION_METHOD, type ProjectionMethod } from "@/lib/leads/commissionEstimate"
import ChannelLabel from "@/lib/leads/channelMeta"
import { MONTHS_PER_YEAR, monthlyToYearly } from "@/lib/leads/goalPeriods"

// ─── Constants ────────────────────────────────────────────────────────────────
// Fallbacks when a profile hasn't set its own goals (real operator today).
// Demo / goal-driven callers pass monthlyGoal + avgCommission explicitly.
const MONTHLY_REVENUE_GOAL = 100_000
const REVENUE_PER_CLOSE    = 1_000
const MONTHLY_LEAD_GOAL    = 300
// The annual lead target is the monthly one over twelve months — derived, not a second number to
// keep in step. The commission goal is derived the same way (see MONTHS_PER_YEAR below).
const YEARLY_LEAD_GOAL     = MONTHLY_LEAD_GOAL * MONTHS_PER_YEAR

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

// Calendar-year boundary, read the same way the month boundary is: local year equality. Using the
// same style keeps the two rows consistent about what "this period" means.
function isThisYear(dateStr: string | null | undefined): boolean {
  if (!dateStr) return false
  return new Date(dateStr).getFullYear() === new Date().getFullYear()
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
  yearLeads,
  monthlyGoal = MONTHLY_REVENUE_GOAL,
  avgCommission = REVENUE_PER_CLOSE,
  projectionMethod = DEFAULT_PROJECTION_METHOD,
  animate = true,
}: {
  leads: any[]
  // Year-scoped leads for the Yearly row ONLY — created this year OR closed this year, so a lead
  // created last year that closed this year is counted in the revenue it actually produced.
  // Absent (or on surfaces that don't fetch it) the yearly row simply does not render, and the
  // monthly row is untouched either way.
  yearLeads?: any[]
  monthlyGoal?: number
  avgCommission?: number
  projectionMethod?: ProjectionMethod
  animate?: boolean
}) {

  // Every commission figure below is an ESTIMATE governed by the account's
  // Projection Method: "avg_commission" values each lead at avgCommission
  // (identical to the old count × avg), "lead_budget" uses the lower end of the
  // lead's budget range (falling back to avg). One helper keeps them consistent.
  const estimate = (ls: any[]) => sumEstimatedCommission(ls, projectionMethod, avgCommission)

  // Active pipeline — only leads still in the active workflow (excludes
  // both Closed and Archived)
  const activeLeads         = leads.filter((l) => ACTIVE_STATUSES.has(l.crm_status))
  const activePipelineValue = estimate(activeLeads)

  // Closed this month — keyed off closed_at (the lead's actual closed
  // date), not crm_status, so this stays correct after the monthly Closed
  // cleanup archives a lead out of the Closed column. (A reopened lead has its
  // closed_at cleared server-side, so it correctly drops out here.)
  const closedThisMonth  = leads.filter((l) => l.closed_at && isThisMonth(l.closed_at))
  // Historical closed revenue uses the FROZEN per-lead snapshot taken at close
  // (falls back to a live estimate only for pre-snapshot closes), so changing
  // Sales Goals never rewrites past closed reporting. Open pipeline below stays
  // on the live estimate — intentional, since forecasts should track new assumptions.
  const revenueThisMonth = sumClosedEstimatedCommission(closedThisMonth, projectionMethod, avgCommission)
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
  const projectedCommission = estimate(appliedLeads)

  // ─── YEARLY ────────────────────────────────────────────────────────────────
  //
  // Computed from the YEAR-SCOPED set, never from `leads` above: that one is the newest-100 window
  // and would under-count a full year the moment the workspace outgrows it. Every monthly figure
  // above is untouched by anything below.
  const yearly = (() => {
    if (!yearLeads) return null
    const closedThisYear = yearLeads.filter((l) => l.closed_at && isThisYear(l.closed_at))
    // Same FROZEN per-lead snapshot the monthly card uses, so changing Sales Goals never rewrites
    // historical closed reporting — and the two rows can never disagree about a closed lease.
    const revenueThisYear = sumClosedEstimatedCommission(closedThisYear, projectionMethod, avgCommission)
    const goal = monthlyToYearly(monthlyGoal)
    const generatedThisYear = yearLeads.filter((l) => isThisYear(l.created_at))

    // Projected = banked + in flight. The two sets CANNOT overlap: a closed lead's status is not
    // "applied" (verified against production: zero leads are both), so this is a sum, not a
    // double count. Applied leads are NOT restricted to the current year — there is no expected-
    // closing-date field on a lead to restrict them by, so the card says so in its subtitle rather
    // than implying a precision the data does not have.
    const appliedNow = (yearLeads as any[]).filter((l) => l.crm_status === "applied")
    const projectedThisYear = revenueThisYear + estimate(appliedNow)

    return {
      revenueThisYear,
      goal,
      progressPct: goal > 0 ? Math.min(Math.round((revenueThisYear / goal) * 100), 100) : 0,
      generatedThisYear,
      closedCount: closedThisYear.length,
      appliedCount: appliedNow.length,
      projectedThisYear,
    }
  })()

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

                {/* Legend — all five sources always visible.
                    The icon is the identifier now, not a coloured dot: an inactive source keeps its
                    real mark at reduced opacity, so the legend still reads
                    "Web / TikTok / FB / IG / YT" when a source has no leads yet, instead of
                    collapsing into five anonymous grey dots. Counts, tracked sources and the
                    stacked bar above are unchanged. */}
                <div className="mt-1.5 flex items-center flex-wrap gap-x-2.5 gap-y-0.5">
                  {withCounts.map((s) => (
                    <ChannelLabel
                      key={s.key}
                      channel={s.key}
                      label={s.label}
                      size={11}
                      dim={s.count === 0}
                      className={`text-[10px] ${s.count === 0 ? "text-[var(--crm-text-muted)]" : "text-[var(--crm-text-secondary)]"}`}
                    />
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

      {/* ─── YEARLY OVERVIEW ──────────────────────────────────────────────────────────────────
          The SAME five-column grid, the same card classes, the same progress bars — the monthly
          row above is not touched by a single character of this. It renders only when a
          year-scoped set was supplied, so any surface that does not fetch one keeps exactly the
          one-row dashboard it has today. */}
      {yearly && (
        <div className="grid grid-cols-5 gap-3 mt-3">

          {/* 1 — Yearly Goal */}
          <div className="bg-[var(--crm-panel)] rounded-xl border border-[var(--crm-border)] shadow-sm px-4 py-2 flex flex-col justify-between transition-shadow transition-colors duration-200 hover:border-blue-200 hover:shadow-[0_4px_20px_rgba(59,130,246,0.12),0_8px_24px_rgba(0,0,0,0.08)]">
            <p className="text-[10px] font-semibold text-[var(--crm-text-muted)] uppercase tracking-widest">Yearly Goal</p>
            <div className="mt-1">
              <div className="flex items-baseline gap-1.5">
                <span className="text-xl font-bold text-[var(--crm-text-primary)] leading-none">
                  <CountNum value={yearly.revenueThisYear} prefix="$" enabled={animate} />
                </span>
                {/* Derived as the monthly goal x 12 — one stored goal, so the two can never drift. */}
                <span className="text-xs text-[var(--crm-text-muted)]">/ ${fmt(yearly.goal)}</span>
              </div>
              <div className="mt-1.5 h-1 w-full bg-[var(--crm-inset)] rounded-full overflow-hidden">
                <div className="h-full bg-blue-600 rounded-full transition-all duration-500" style={{ width: `${yearly.progressPct}%` }} />
              </div>
              <p className="text-[10px] text-[var(--crm-text-muted)] mt-1">{yearly.progressPct}% complete</p>
            </div>
          </div>

          {/* 2 — Active Pipeline. The SAME value as the monthly row by design: pipeline is a
              point-in-time snapshot with no period, so "reuse the existing calculation" means
              showing the identical figure rather than inventing a year-shaped variant of it. */}
          <div className="bg-[var(--crm-panel)] rounded-xl border border-[var(--crm-border)] shadow-sm px-4 py-2 flex flex-col justify-between transition-shadow transition-colors duration-200 hover:border-blue-200 hover:shadow-[0_4px_20px_rgba(59,130,246,0.12),0_8px_24px_rgba(0,0,0,0.08)]">
            <p className="text-[10px] font-semibold text-[var(--crm-text-muted)] uppercase tracking-widest">Active Pipeline</p>
            <div className="mt-1">
              <p className="text-xl font-bold text-[var(--crm-text-primary)] leading-none"><CountNum value={activePipelineValue} prefix="$" enabled={animate} /></p>
              <p className="text-[10px] text-[var(--crm-text-muted)] mt-1">{activeLeads.length} active {activeLeads.length === 1 ? "lead" : "leads"}</p>
            </div>
          </div>

          {/* 3 — Leads This Year */}
          {(() => {
            const total = yearly.generatedThisYear.length
            const counts: Record<string, number> = {}
            for (const l of yearly.generatedThisYear) {
              const k = (l.source ?? "unknown").toLowerCase()
              counts[k] = (counts[k] ?? 0) + 1
            }
            const withCounts = TRACKED_SOURCES.map((s) => ({
              ...s,
              count: counts[s.key] ?? 0,
              pct: total > 0 ? Math.round(((counts[s.key] ?? 0) / total) * 100) : 0,
            }))
            const barSources = withCounts.filter((s) => s.count > 0)
            return (
              <div className="bg-[var(--crm-panel)] rounded-xl border border-[var(--crm-border)] shadow-sm px-4 py-2 flex flex-col justify-between transition-shadow transition-colors duration-200 hover:border-blue-200 hover:shadow-[0_4px_20px_rgba(59,130,246,0.12),0_8px_24px_rgba(0,0,0,0.08)]">
                <p className="text-[10px] font-semibold text-[var(--crm-text-muted)] uppercase tracking-widest">Leads This Year</p>
                <div className="mt-1">
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-xl font-bold text-[var(--crm-text-primary)] leading-none"><CountNum value={total} enabled={animate} /></span>
                    <span className="text-xs text-[var(--crm-text-muted)]">/ {fmt(YEARLY_LEAD_GOAL)}</span>
                  </div>
                  <div className="mt-1.5 h-1.5 w-full rounded-full overflow-hidden flex bg-[var(--crm-inset)]">
                    {barSources.map((s) => (
                      <div key={s.key} style={{ width: `${s.pct}%`, backgroundColor: s.barColor }} className="h-full transition-all duration-500" />
                    ))}
                  </div>
                  <div className="mt-1.5 flex items-center flex-wrap gap-x-2.5 gap-y-0.5">
                    {withCounts.map((s) => (
                      <ChannelLabel
                        key={s.key}
                        channel={s.key}
                        label={s.label}
                        size={11}
                        dim={s.count === 0}
                        className={`text-[10px] ${s.count === 0 ? "text-[var(--crm-text-muted)]" : "text-[var(--crm-text-secondary)]"}`}
                      />
                    ))}
                  </div>
                </div>
              </div>
            )
          })()}

          {/* 4 — Projected Commission (year) */}
          <div className="bg-[var(--crm-panel)] rounded-xl border border-[var(--crm-border)] shadow-sm px-4 py-2 flex flex-col justify-between transition-shadow transition-colors duration-200 hover:border-blue-200 hover:shadow-[0_4px_20px_rgba(59,130,246,0.12),0_8px_24px_rgba(0,0,0,0.08)]">
            <p className="text-[10px] font-semibold text-[var(--crm-text-muted)] uppercase tracking-widest">Projected Commission</p>
            <div className="mt-1">
              <p className="text-xl font-bold text-[var(--crm-text-primary)] leading-none"><CountNum value={yearly.projectedThisYear} prefix="$" enabled={animate} /></p>
              {/* States exactly what is in the number, because the two halves are different in
                  kind: one is banked, the other is not, and applied leads carry no expected
                  closing date to bound them to this year. */}
              <p className="text-[10px] text-[var(--crm-text-muted)] mt-1">YTD closed + {yearly.appliedCount} applied {yearly.appliedCount === 1 ? "lead" : "leads"} (may close later)</p>
            </div>
          </div>

          {/* 5 — Closed This Year */}
          <div className="bg-[var(--crm-panel)] rounded-xl border border-[var(--crm-border)] shadow-sm px-4 py-2 flex flex-col justify-between transition-shadow transition-colors duration-200 hover:border-blue-200 hover:shadow-[0_4px_20px_rgba(59,130,246,0.12),0_8px_24px_rgba(0,0,0,0.08)]">
            <p className="text-[10px] font-semibold text-[var(--crm-text-muted)] uppercase tracking-widest">Closed This Year</p>
            <div className="mt-1">
              <p className="text-xl font-bold text-[var(--crm-text-primary)] leading-none"><CountNum value={yearly.closedCount} enabled={animate} /></p>
              <p className="text-[10px] text-[var(--crm-text-muted)] mt-1">{yearly.progressPct}% of revenue goal</p>
            </div>
          </div>

        </div>
      )}
    </div>
  )
}
