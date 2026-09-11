"use client"

import { useState } from "react"

// Social Autopilot → Calendar VISUAL SHELL. A native monthly grid with month
// navigation so the scheduling area's permanent home is reviewable. NO scheduling
// logic and NO fake posts — day cells are empty placeholders where scheduled-post
// cards will later render.
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

export default function CalendarShell() {
  const today = new Date()
  const [cursor, setCursor] = useState({ year: today.getFullYear(), month: today.getMonth() }) // month 0-11

  const firstOfMonth = new Date(cursor.year, cursor.month, 1)
  const daysInMonth = new Date(cursor.year, cursor.month + 1, 0).getDate()
  const leadingBlanks = firstOfMonth.getDay() // 0 = Sunday
  const cells: (number | null)[] = [
    ...Array.from({ length: leadingBlanks }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]
  while (cells.length % 7 !== 0) cells.push(null)

  const monthLabel = firstOfMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" })
  const isToday = (d: number | null) =>
    d != null && cursor.year === today.getFullYear() && cursor.month === today.getMonth() && d === today.getDate()

  const shift = (delta: number) => {
    const m = cursor.month + delta
    setCursor({ year: cursor.year + Math.floor(m / 12), month: ((m % 12) + 12) % 12 })
  }
  const navBtn =
    "text-[13px] font-semibold px-2.5 py-1.5 rounded-lg border border-[var(--crm-border)] text-[var(--crm-text-secondary)] hover:bg-[var(--crm-card)] transition-colors"

  return (
    <div>
      <div className="mb-4">
        <h2 className="text-[16px] font-bold text-[var(--crm-text-primary)]">Calendar</h2>
        <p className="text-[13px] text-[var(--crm-text-secondary)] mt-1">
          Where your scheduled social posts will live. Scheduling isn&apos;t enabled yet — this is the layout preview.
        </p>
      </div>

      <div className="rounded-2xl border border-[var(--crm-border)] bg-[var(--crm-panel)] overflow-hidden">
        {/* Month navigation */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--crm-border)]">
          <button type="button" className={navBtn} onClick={() => shift(-1)} aria-label="Previous month">‹ Prev</button>
          <div className="text-[14px] font-bold text-[var(--crm-text-primary)]">{monthLabel}</div>
          <button type="button" className={navBtn} onClick={() => shift(1)} aria-label="Next month">Next ›</button>
        </div>

        {/* Weekday header */}
        <div className="grid grid-cols-7 border-b border-[var(--crm-border)]">
          {WEEKDAYS.map((w) => (
            <div key={w} className="px-2 py-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--crm-text-muted)] text-center">
              {w}
            </div>
          ))}
        </div>

        {/* Day grid */}
        <div className="grid grid-cols-7">
          {cells.map((d, i) => (
            <div
              key={i}
              className={
                "min-h-[92px] border-b border-r border-[var(--crm-border)] p-1.5 " +
                ((i + 1) % 7 === 0 ? "border-r-0 " : "") +
                (d == null ? "bg-[var(--crm-card)]/30" : "")
              }
            >
              {d != null && (
                <div
                  className={
                    "text-[12px] font-semibold w-6 h-6 flex items-center justify-center rounded-full " +
                    (isToday(d) ? "bg-[var(--crm-text-primary)] text-[var(--crm-panel)]" : "text-[var(--crm-text-secondary)]")
                  }
                >
                  {d}
                </div>
              )}
              {/* Scheduled-post cards will render here in a later checkpoint. */}
            </div>
          ))}
        </div>
      </div>

      <p className="text-[12px] text-[var(--crm-text-muted)] mt-3 text-center">
        Scheduled posts will appear on their target days once the scheduler is built.
      </p>
    </div>
  )
}
