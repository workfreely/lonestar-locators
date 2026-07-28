"use client"

import { useMemo, useRef, useState } from "react"

// A fully self-contained date + time picker. Unlike a native
// <input type="date/datetime-local">, the calendar, the time controls, and the
// Apply button all live inside ONE popover we render — so the whole selection
// (pick day → pick time → Apply) happens without ever leaving the picker, and
// the value only commits when Apply is pressed.

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"]
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
]

const pad = (n: number) => String(n).padStart(2, "0")

// Parse a "YYYY-MM-DDTHH:mm" local value into its parts (null if empty/invalid).
function parseValue(value: string): { date: Date; hour24: number; minute: number } | null {
  if (!value) return null
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/)
  if (!m) return null
  const [, y, mo, d, h, min] = m
  const date = new Date(Number(y), Number(mo) - 1, Number(d))
  if (isNaN(date.getTime())) return null
  return { date, hour24: Number(h), minute: Number(min) }
}

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

export default function DateTimePicker({
  value,
  onApply,
  onCancel,
}: {
  // Current committed value, "YYYY-MM-DDTHH:mm" or "".
  value: string
  // Called with the new "YYYY-MM-DDTHH:mm" value when Apply is pressed.
  onApply: (value: string) => void
  onCancel: () => void
}) {
  const initial = useMemo(() => parseValue(value), [value])
  const now = useMemo(() => new Date(), [])

  // The picked day (null until the user selects one). Editing pre-selects it.
  const [selectedDate, setSelectedDate] = useState<Date | null>(initial?.date ?? null)
  // The month currently shown in the grid (independent of the selection).
  const [viewMonth, setViewMonth] = useState<Date>(() => {
    const base = initial?.date ?? now
    return new Date(base.getFullYear(), base.getMonth(), 1)
  })
  // Time — default to a sensible 9:00 AM for new tasks.
  const init12 = initial ? ((initial.hour24 % 12) || 12) : 9
  const [hour12, setHour12] = useState<number>(init12)
  const [minute, setMinute] = useState<number>(initial?.minute ?? 0)
  const [period, setPeriod] = useState<"AM" | "PM">(initial ? (initial.hour24 >= 12 ? "PM" : "AM") : "AM")

  const year = viewMonth.getFullYear()
  const month = viewMonth.getMonth()

  // Calendar cells: leading blanks to align the 1st under its weekday, then days.
  const cells = useMemo(() => {
    const firstWeekday = new Date(year, month, 1).getDay()
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const out: (number | null)[] = []
    for (let i = 0; i < firstWeekday; i++) out.push(null)
    for (let d = 1; d <= daysInMonth; d++) out.push(d)
    return out
  }, [year, month])

  function goMonth(delta: number) {
    setViewMonth(new Date(year, month + delta, 1))
  }

  function handleApply() {
    if (!selectedDate) return
    let h24 = hour12 % 12
    if (period === "PM") h24 += 12
    const v = `${selectedDate.getFullYear()}-${pad(selectedDate.getMonth() + 1)}-${pad(selectedDate.getDate())}T${pad(h24)}:${pad(minute)}`
    onApply(v)
  }

  // Selects inherit big full-width styling from a global `select { … }` rule, so
  // every control here sets its own box explicitly to stay compact.
  const selectCls =
    "w-auto min-w-0 appearance-none cursor-pointer text-[12px] leading-none border border-[var(--crm-border)] rounded-md pl-2 pr-5 py-1.5 bg-[var(--crm-panel)] text-[var(--crm-text-primary)] [background-image:none] [color-scheme:dark]"

  const navBtnCls =
    "w-7 h-7 flex items-center justify-center rounded-md text-[var(--crm-text-secondary)] hover:bg-[var(--crm-card)] transition-colors"

  return (
    <div className="mt-2 rounded-xl border border-[var(--crm-border)] bg-[var(--crm-inset)] p-3 shadow-lg">
      {/* Month navigation */}
      <div className="flex items-center justify-between mb-2">
        <button type="button" onClick={() => goMonth(-1)} className={navBtnCls} aria-label="Previous month">
          ‹
        </button>
        <div className="text-[13px] font-semibold text-[var(--crm-text-primary)]">
          {MONTHS[month]} {year}
        </div>
        <button type="button" onClick={() => goMonth(1)} className={navBtnCls} aria-label="Next month">
          ›
        </button>
      </div>

      {/* Weekday header */}
      <div className="grid grid-cols-7 gap-0.5 mb-1">
        {WEEKDAYS.map((w, i) => (
          <div key={i} className="h-6 flex items-center justify-center text-[10px] font-semibold text-[var(--crm-text-muted)]">
            {w}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7 gap-0.5">
        {cells.map((d, i) => {
          if (d === null) return <div key={i} className="h-8" />
          const cellDate = new Date(year, month, d)
          const isSelected = selectedDate && sameDay(cellDate, selectedDate)
          const isToday = sameDay(cellDate, now)
          return (
            <button
              key={i}
              type="button"
              onClick={() => setSelectedDate(cellDate)}
              className={
                "h-8 rounded-md text-[12px] font-medium transition-colors " +
                (isSelected
                  ? "crm-cta"
                  : isToday
                    ? "text-[var(--crm-text-primary)] ring-1 ring-inset ring-[var(--crm-border)] hover:bg-[var(--crm-card)]"
                    : "text-[var(--crm-text-secondary)] hover:bg-[var(--crm-card)]")
              }
            >
              {d}
            </button>
          )
        })}
      </div>

      {/* Time row */}
      <div className="flex items-center gap-1.5 mt-3 pt-3 border-t border-[var(--crm-border)]">
        <span className="text-[10px] font-semibold text-[var(--crm-text-muted)] uppercase tracking-widest mr-1">Time</span>
        <select className={selectCls} value={hour12} onChange={(e) => setHour12(Number(e.target.value))} aria-label="Hour">
          {Array.from({ length: 12 }, (_, i) => i + 1).map((h) => (
            <option key={h} value={h}>{h}</option>
          ))}
        </select>
        <span className="text-[13px] font-semibold text-[var(--crm-text-secondary)]">:</span>
        <select className={selectCls} value={minute} onChange={(e) => setMinute(Number(e.target.value))} aria-label="Minute">
          {Array.from({ length: 60 }, (_, i) => i).map((m) => (
            <option key={m} value={m}>{pad(m)}</option>
          ))}
        </select>
        <select className={selectCls} value={period} onChange={(e) => setPeriod(e.target.value as "AM" | "PM")} aria-label="AM or PM">
          <option value="AM">AM</option>
          <option value="PM">PM</option>
        </select>
      </div>

      {/* Confirmation controls — inside the picker */}
      <div className="flex justify-end gap-2 mt-3">
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-1.5 rounded-lg border border-[var(--crm-border)] text-[12px] font-semibold text-[var(--crm-text-secondary)] hover:bg-[var(--crm-card)] transition-colors"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleApply}
          disabled={!selectedDate}
          className="crm-cta px-4 py-1.5 rounded-lg text-[12px] font-semibold disabled:opacity-50"
        >
          Apply
        </button>
      </div>
    </div>
  )
}
