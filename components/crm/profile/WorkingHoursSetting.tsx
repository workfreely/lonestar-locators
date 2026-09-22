"use client"

import { useState } from "react"
import { SettingsCard, settingsInputCls } from "@/components/crm/settings/SettingsShell"

/**
 * Account Profile → Working Hours control. Sets the locator-local window that
 * system-generated SCHEDULED / relative Next Actions are clamped into (a due time
 * before the start moves to the start that day; at/after the end moves to the
 * start next day). Persists via the dedicated /api/admin/profile/work-hours route
 * (server-validated, writes only the caller's own profile).
 *
 * Unconfigured → the app's 9 AM–9 PM default; "Reset to default" clears the
 * columns back to NULL. This is a personal scheduling preference — it does NOT
 * affect immediate/do-it-now actions or genuine tour/appointment timestamps.
 *
 * Mirrors TimezoneSetting's view/edit treatment and shared SettingsCard chrome.
 */

const DEFAULT_START = 9
const DEFAULT_END = 21

// Start hours 0–23; end hours 1–24 (24 = midnight, i.e. first disallowed hour).
const START_HOURS = Array.from({ length: 24 }, (_, h) => h) // 0..23
const END_HOURS = Array.from({ length: 24 }, (_, h) => h + 1) // 1..24

function hourLabel(h: number): string {
  const hour = h % 24 // 24 → 0 (midnight)
  const period = hour < 12 ? "AM" : "PM"
  const twelve = hour % 12 === 0 ? 12 : hour % 12
  return `${twelve}:00 ${period}`
}

export default function WorkingHoursSetting({
  initialStart,
  initialEnd,
}: {
  initialStart: number | null
  initialEnd: number | null
}) {
  const [start, setStart] = useState<number | null>(initialStart)
  const [end, setEnd] = useState<number | null>(initialEnd)
  const [editing, setEditing] = useState(false)
  // Edit-mode selections seed from the current window, or the default when unset.
  const [selStart, setSelStart] = useState<number>(initialStart ?? DEFAULT_START)
  const [selEnd, setSelEnd] = useState<number>(initialEnd ?? DEFAULT_END)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isCustom = start != null && end != null
  const displayStart = start ?? DEFAULT_START
  const displayEnd = end ?? DEFAULT_END

  async function persist(nextStart: number | null, nextEnd: number | null) {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch("/api/admin/profile/work-hours", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workHoursStart: nextStart, workHoursEnd: nextEnd }),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || "Save failed")
      setStart(nextStart)
      setEnd(nextEnd)
      setEditing(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed")
    } finally {
      setSaving(false)
    }
  }

  function save() {
    if (selStart >= selEnd) {
      setError("Start time must be before end time.")
      return
    }
    void persist(selStart, selEnd)
  }

  return (
    <SettingsCard
      title="Working Hours"
      description="Automatic follow-up reminders are scheduled inside this window, in your time zone."
    >
      {!editing ? (
        <div className="flex items-center justify-between gap-3">
          <span className="text-[14px] text-[#111318]">
            {hourLabel(displayStart)} – {hourLabel(displayEnd)}
            {!isCustom && <span className="ml-2 text-[12px] text-[#6b7280]">(default)</span>}
          </span>
          <button
            type="button"
            onClick={() => {
              setSelStart(displayStart)
              setSelEnd(displayEnd)
              setError(null)
              setEditing(true)
            }}
            className="flex-none rounded-lg border border-[#d9deea] bg-white px-4 py-2 text-[13px] font-semibold text-[#111318] transition-colors hover:border-[#2f6bff] hover:text-[#2f6bff]"
          >
            Change
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <label className="flex flex-1 flex-col gap-1">
              <span className="text-[12px] font-semibold text-[#6b7280]">Start</span>
              <select value={selStart} onChange={(e) => setSelStart(Number(e.target.value))} className={settingsInputCls}>
                {START_HOURS.map((h) => (
                  <option key={h} value={h}>{hourLabel(h)}</option>
                ))}
              </select>
            </label>
            <span className="mt-5 text-[#6b7280]">–</span>
            <label className="flex flex-1 flex-col gap-1">
              <span className="text-[12px] font-semibold text-[#6b7280]">End</span>
              <select value={selEnd} onChange={(e) => setSelEnd(Number(e.target.value))} className={settingsInputCls}>
                {END_HOURS.map((h) => (
                  <option key={h} value={h}>{hourLabel(h)}</option>
                ))}
              </select>
            </label>
          </div>
          {error && <p className="text-[12px] text-red-600">{error}</p>}
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              disabled={saving || !isCustom}
              onClick={() => void persist(null, null)}
              className="flex-none rounded-lg border border-[#d9deea] bg-white px-3 py-2 text-[12px] font-semibold text-[#6b7280] transition-colors hover:border-[#2f6bff] hover:text-[#2f6bff] disabled:opacity-40"
              title="Revert to the default 9 AM–9 PM window"
            >
              Reset to default
            </button>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={saving}
                onClick={() => {
                  setEditing(false)
                  setError(null)
                }}
                className="flex-none rounded-lg border border-[#d9deea] bg-white px-4 py-2 text-[13px] font-semibold text-[#111318] transition-colors hover:border-[#2f6bff] disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={save}
                className="flex-none rounded-lg bg-[#2f6bff] px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-[#265fe0] disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </SettingsCard>
  )
}
