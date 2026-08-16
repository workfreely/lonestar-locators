"use client"

import { useMemo, useState } from "react"
import { to24Hour, from24Hour } from "@bc/companion-shared"

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
  onChange,
  compact = false,
}: {
  // Current committed value, "YYYY-MM-DDTHH:mm" or "".
  value: string
  // Confirm-mode (Add Task): called with the new value only when Apply is pressed.
  onApply?: (value: string) => void
  onCancel?: () => void
  // Live-commit mode (Reschedule): when provided, EVERY selection immediately
  // emits the composed value and the internal Cancel/Apply footer is hidden — the
  // caller's own Save Changes is the single commit. Confirm-mode is unchanged.
  onChange?: (value: string) => void
  // SIZING ONLY (opt-in): a denser calendar for tight surfaces (the Reschedule
  // modal). Purely CSS class swaps — no behavior, state, or logic changes. Add
  // Task does not pass this, so its picker keeps the default dimensions.
  compact?: boolean
}) {
  const live = !!onChange
  // Compact size tokens (default = current dimensions, unchanged for Add Task).
  const boxPad = compact ? "p-2.5" : "p-3"
  const cellSize = compact ? "h-7" : "h-8"
  const weekdaySize = compact ? "h-5" : "h-6"
  const gridGap = compact ? "gap-px" : "gap-0.5"
  const navMb = compact ? "mb-1.5" : "mb-2"
  const timeRowSpacing = compact ? "mt-2.5 pt-2.5" : "mt-3 pt-3"
  const initial = useMemo(() => parseValue(value), [value])
  const now = useMemo(() => new Date(), [])

  // The picked day (null until the user selects one). Editing pre-selects it.
  const [selectedDate, setSelectedDate] = useState<Date | null>(initial?.date ?? null)
  // The month currently shown in the grid (independent of the selection).
  const [viewMonth, setViewMonth] = useState<Date>(() => {
    const base = initial?.date ?? now
    return new Date(base.getFullYear(), base.getMonth(), 1)
  })
  // Time — default to a sensible 9:00 AM for new tasks. The 12h↔24h split is the
  // shared helper (from24Hour), the same one the Companion Tour Time picker uses.
  const initTime = initial ? from24Hour(`${pad(initial.hour24)}:${pad(initial.minute)}`) : { hour12: 9, minute: 0, period: "AM" as const }
  const [hour12, setHour12] = useState<number>(initTime.hour12)
  const [minute, setMinute] = useState<number>(initTime.minute)
  const [period, setPeriod] = useState<"AM" | "PM">(initTime.period)

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

  const composeValue = (date: Date, h: number, m: number, p: "AM" | "PM") =>
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${to24Hour(h, m, p)}`

  // Live-commit: emit on every selection (no Apply). Confirm-mode ignores this.
  function emit(date: Date | null, h: number, m: number, p: "AM" | "PM") {
    if (onChange && date) onChange(composeValue(date, h, m, p))
  }

  function handleApply() {
    if (!selectedDate) return
    onApply?.(composeValue(selectedDate, hour12, minute, period))
  }

  // Selects inherit big full-width styling from a global `select { … }` rule, so
  // every control here sets its own box explicitly to stay compact.
  const selectCls =
    "w-auto min-w-0 appearance-none cursor-pointer text-[12px] leading-none border border-[var(--crm-border)] rounded-md pl-2 pr-5 py-1.5 bg-[var(--crm-panel)] text-[var(--crm-text-primary)] [background-image:none] [color-scheme:dark]"

  const navBtnCls =
    "w-7 h-7 flex items-center justify-center rounded-md text-[var(--crm-text-secondary)] hover:bg-[var(--crm-card)] transition-colors"

  return (
    <div className={`mt-2 rounded-xl border border-[var(--crm-border)] bg-[var(--crm-inset)] shadow-lg ${boxPad}`}>
      {/* Month navigation */}
      <div className={`flex items-center justify-between ${navMb}`}>
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
      <div className={`grid grid-cols-7 ${gridGap} mb-1`}>
        {WEEKDAYS.map((w, i) => (
          <div key={i} className={`${weekdaySize} flex items-center justify-center text-[10px] font-semibold text-[var(--crm-text-muted)]`}>
            {w}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div className={`grid grid-cols-7 ${gridGap}`}>
        {cells.map((d, i) => {
          if (d === null) return <div key={i} className={cellSize} />
          const cellDate = new Date(year, month, d)
          const isSelected = selectedDate && sameDay(cellDate, selectedDate)
          const isToday = sameDay(cellDate, now)
          return (
            <button
              key={i}
              type="button"
              onClick={() => { setSelectedDate(cellDate); emit(cellDate, hour12, minute, period) }}
              className={
                `${cellSize} rounded-md text-[12px] font-medium transition-colors ` +
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
      <div className={`flex items-center gap-1.5 border-t border-[var(--crm-border)] ${timeRowSpacing}`}>
        <span className="text-[10px] font-semibold text-[var(--crm-text-muted)] uppercase tracking-widest mr-1">Time</span>
        <select className={selectCls} value={hour12} onChange={(e) => { const h = Number(e.target.value); setHour12(h); emit(selectedDate, h, minute, period) }} aria-label="Hour">
          {Array.from({ length: 12 }, (_, i) => i + 1).map((h) => (
            <option key={h} value={h}>{h}</option>
          ))}
        </select>
        <span className="text-[13px] font-semibold text-[var(--crm-text-secondary)]">:</span>
        <select className={selectCls} value={minute} onChange={(e) => { const m = Number(e.target.value); setMinute(m); emit(selectedDate, hour12, m, period) }} aria-label="Minute">
          {Array.from({ length: 60 }, (_, i) => i).map((m) => (
            <option key={m} value={m}>{pad(m)}</option>
          ))}
        </select>
        <select className={selectCls} value={period} onChange={(e) => { const p = e.target.value as "AM" | "PM"; setPeriod(p); emit(selectedDate, hour12, minute, p) }} aria-label="AM or PM">
          <option value="AM">AM</option>
          <option value="PM">PM</option>
        </select>
      </div>

      {/* Confirmation controls — CONFIRM-MODE ONLY. In live-commit mode the caller
          owns the single Save/Cancel, so the picker shows no internal buttons. */}
      {!live && (
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
      )}
    </div>
  )
}
