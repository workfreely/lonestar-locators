"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase/client"
import SettingsShell, { SettingsCard, settingsLabelCls } from "@/components/crm/settings/SettingsShell"
import { DEFAULT_PROJECTION_METHOD, type ProjectionMethod } from "@/lib/leads/commissionEstimate"
import { MONTHS_PER_YEAR, monthlyToYearly, yearlyToMonthly } from "@/lib/leads/goalPeriods"

function formatCurrency(raw: string): string {
  const digits = raw.replace(/[^\d]/g, "")
  return digits ? Number(digits).toLocaleString("en-US") : ""
}
function toNumber(display: string): number | null {
  const digits = display.replace(/[^\d]/g, "")
  return digits ? Number(digits) : null
}

// ONE CANONICAL GOAL. Only the MONTHLY figure is stored (profiles.monthly_commission_goal); the
// yearly field is a view of it at x12 and the dashboard derives the annual goal the same way. A
// second stored column would be a second source of truth that could drift from the first — this
// way $10,000/mo is $120,000/yr on every surface, by construction.
//
// The yearly input stays fully editable: typing in it divides by 12 and writes the MONTHLY value.
// Division is the one direction that can lose precision, so it rounds to whole dollars; a yearly
// figure that is not a multiple of 12 therefore settles on the nearest month that is, which is why
// the field re-renders from the stored monthly value rather than keeping what was typed.
const currencyInputCls =
  "w-full rounded-xl border border-[#e5e7ee] bg-white py-2.5 pl-7 pr-3 text-[14px] font-semibold text-[#111318] outline-none transition-colors focus:border-[#2f6bff]"

export default function SettingsClient({
  monthlyGoal,
  avgCommission,
  projectionMethod = DEFAULT_PROJECTION_METHOD,
}: {
  monthlyGoal: number
  avgCommission: number
  projectionMethod?: ProjectionMethod
}) {
  const router = useRouter()
  const [goal, setGoal] = useState(monthlyGoal.toLocaleString("en-US"))
  // Derived from `goal`, never stored separately.
  const yearlyDisplay = monthlyToYearly(toNumber(goal) ?? 0).toLocaleString("en-US")
  const [avg, setAvg] = useState(avgCommission.toLocaleString("en-US"))
  const [method, setMethod] = useState<ProjectionMethod>(projectionMethod)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  async function saveGoals() {
    setSaving(true)
    setSaved(false)
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (user) {
      await supabase
        .from("profiles")
        .update({
          monthly_commission_goal: toNumber(goal),
          avg_commission_per_lease: toNumber(avg),
          projection_method: method,
        })
        .eq("id", user.id)
    }
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
    router.refresh()
  }


  return (
    <SettingsShell title="Sales Goals" description="These drive your dashboard's monthly progress, projected pipeline, and estimated commission reporting (including Meta ad ROAS). A lead's estimate is frozen when it closes, so changing these never rewrites past closed reporting.">
      <SettingsCard title="Sales Goal Settings">
        {/* Three equal-width fields on desktop, stacked on mobile. Same card, same width, same
            input styling — only the column count and the third field are new. */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="flex flex-col gap-2">
            <label className={settingsLabelCls}>Average Commission per Lease</label>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[14px] font-semibold text-[#9098a8]">$</span>
              <input inputMode="numeric" value={avg} onChange={(e) => setAvg(formatCurrency(e.target.value))} className={currencyInputCls} />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <label className={settingsLabelCls}>Monthly Commission Goal</label>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[14px] font-semibold text-[#9098a8]">$</span>
              <input inputMode="numeric" value={goal} onChange={(e) => setGoal(formatCurrency(e.target.value))} className={currencyInputCls} />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <label className={settingsLabelCls}>Yearly Commission Goal</label>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[14px] font-semibold text-[#9098a8]">$</span>
              {/* Editable, and writes through to the single stored monthly value. */}
              <input
                inputMode="numeric"
                value={yearlyDisplay}
                onChange={(e) => {
                  const yearly = toNumber(formatCurrency(e.target.value))
                  setGoal(yearly === null ? "" : yearlyToMonthly(yearly).toLocaleString("en-US"))
                }}
                className={currencyInputCls}
              />
            </div>
          </div>
        </div>

        {/* Projection Method — how the dashboard estimates commission. */}
        <div className="mt-5">
          <label className={settingsLabelCls}>Projection Method</label>
          <p className="mt-1 mb-2.5 text-[12.5px] text-[#6b7280]">
            How your dashboard estimates commission for pipeline and projections.
          </p>
          <div className="flex flex-col gap-2">
            {[
              {
                value: "avg_commission" as ProjectionMethod,
                label: "Average Commission Per Lease",
                recommended: true,
                desc: "Values every lead at your average commission — simple and predictable.",
              },
              {
                value: "lead_budget" as ProjectionMethod,
                label: "Lead Budget",
                recommended: false,
                desc: "Uses the lower end of each lead's budget range, falling back to your average when no budget is set.",
              },
            ].map((opt) => {
              const active = method === opt.value
              return (
                <label
                  key={opt.value}
                  className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3.5 py-3 transition-colors ${
                    active ? "border-[#2f6bff] bg-[#f4f7ff]" : "border-[#e5e7ee] bg-white hover:bg-[#f4f5f8]"
                  }`}
                >
                  <input
                    type="radio"
                    name="projection-method"
                    className="mt-0.5 h-4 w-4 accent-[#2f6bff]"
                    checked={active}
                    onChange={() => setMethod(opt.value)}
                  />
                  <span className="min-w-0">
                    <span className="text-[13.5px] font-semibold text-[#111318]">
                      {opt.label}
                      {opt.recommended && (
                        <span className="ml-1.5 text-[12px] font-semibold text-[#2f6bff]">(Recommended)</span>
                      )}
                    </span>
                    <span className="mt-0.5 block text-[12px] text-[#6b7280]">{opt.desc}</span>
                  </span>
                </label>
              )
            })}
          </div>
        </div>

        <div className="mt-5 flex items-center gap-3">
          <button
            type="button"
            onClick={saveGoals}
            disabled={saving}
            className="rounded-lg bg-[#2f6bff] px-4 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-[#265fe0] disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save Goals"}
          </button>
          {saved && <span className="text-[12.5px] font-semibold text-emerald-600">✓ Saved</span>}
        </div>
      </SettingsCard>


    </SettingsShell>
  )
}
