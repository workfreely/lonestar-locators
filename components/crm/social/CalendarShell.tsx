"use client"

import { useState } from "react"

// Social Autopilot → Calendar VISUAL SHELL: Month | Week | List views with working
// switching + view-appropriate navigation + Today. No scheduling logic, no fake posts —
// day/slot cells are placeholders where scheduled-post cards will render later.
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
const HOURS = [8, 10, 12, 14, 16, 18] // representative posting-time rows for Week view
type View = "Month" | "Week" | "List"

const startOfWeek = (d: Date) => {
  const s = new Date(d)
  s.setDate(s.getDate() - s.getDay())
  s.setHours(0, 0, 0, 0)
  return s
}
const addDays = (d: Date, n: number) => {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}
const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString()
const hourLabel = (h: number) => `${((h + 11) % 12) + 1} ${h < 12 ? "AM" : "PM"}`

export default function CalendarShell() {
  const today = new Date()
  const [view, setView] = useState<View>("Month")
  const [cursor, setCursor] = useState(() => new Date())

  const shift = (dir: number) => {
    if (view === "Month") setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + dir, 1))
    else setCursor(addDays(cursor, dir * 7)) // Week + List step by a week
  }
  const goToday = () => setCursor(new Date())

  const rangeLabel =
    view === "Month"
      ? cursor.toLocaleDateString("en-US", { month: "long", year: "numeric" })
      : (() => {
          const s = startOfWeek(cursor)
          const e = addDays(s, 6)
          const sameMonth = s.getMonth() === e.getMonth()
          return sameMonth
            ? `${s.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${e.getDate()}, ${e.getFullYear()}`
            : `${s.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${e.toLocaleDateString("en-US", { month: "short", day: "numeric" })}, ${e.getFullYear()}`
        })()

  const navBtn = "text-[13px] font-semibold px-2.5 py-1.5 rounded-lg border border-[var(--crm-border)] text-[var(--crm-text-secondary)] hover:bg-[var(--crm-card)] transition-colors"
  const tab = (active: boolean) =>
    "text-[12.5px] font-semibold px-2.5 py-1.5 rounded-lg transition-colors " +
    (active ? "bg-[var(--crm-text-primary)] text-[var(--crm-panel)]" : "text-[var(--crm-text-secondary)] hover:bg-[var(--crm-card)]")

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-[16px] font-bold text-[var(--crm-text-primary)]">Calendar</h2>
          <p className="text-[13px] text-[var(--crm-text-secondary)] mt-0.5">Your posting schedule.</p>
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-[var(--crm-border)] p-0.5 bg-[var(--crm-panel)]">
          {(["Month", "Week", "List"] as View[]).map((v) => (
            <button key={v} type="button" className={tab(view === v)} onClick={() => setView(v)}>{v}</button>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-[var(--crm-border)] bg-[var(--crm-panel)] overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--crm-border)]">
          <div className="flex items-center gap-1.5">
            <button type="button" className={navBtn} onClick={() => shift(-1)} aria-label="Previous">‹</button>
            <button type="button" className={navBtn} onClick={goToday}>Today</button>
            <button type="button" className={navBtn} onClick={() => shift(1)} aria-label="Next">›</button>
          </div>
          <div className="text-[14px] font-bold text-[var(--crm-text-primary)]">{rangeLabel}</div>
          <div className="w-[92px]" />
        </div>

        {view === "Month" && <MonthGrid cursor={cursor} today={today} />}
        {view === "Week" && <WeekGrid cursor={cursor} today={today} />}
        {view === "List" && <ListView cursor={cursor} today={today} />}
      </div>
    </div>
  )
}

function MonthGrid({ cursor, today }: { cursor: Date; today: Date }) {
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1)
  const days = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate()
  const cells: (number | null)[] = [...Array.from({ length: first.getDay() }, () => null), ...Array.from({ length: days }, (_, i) => i + 1)]
  while (cells.length % 7 !== 0) cells.push(null)
  const isToday = (d: number | null) => d != null && cursor.getFullYear() === today.getFullYear() && cursor.getMonth() === today.getMonth() && d === today.getDate()
  return (
    <>
      <div className="grid grid-cols-7 border-b border-[var(--crm-border)]">
        {WEEKDAYS.map((w) => (
          <div key={w} className="px-2 py-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--crm-text-muted)] text-center">{w}</div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((d, i) => (
          <div key={i} className={"min-h-[84px] border-b border-r border-[var(--crm-border)] p-1.5 " + ((i + 1) % 7 === 0 ? "border-r-0 " : "") + (d == null ? "bg-[var(--crm-card)]/30" : "")}>
            {d != null && (
              <div className={"text-[12px] font-semibold w-6 h-6 flex items-center justify-center rounded-full " + (isToday(d) ? "bg-[var(--crm-text-primary)] text-[var(--crm-panel)]" : "text-[var(--crm-text-secondary)]")}>{d}</div>
            )}
          </div>
        ))}
      </div>
    </>
  )
}

function WeekGrid({ cursor, today }: { cursor: Date; today: Date }) {
  const s = startOfWeek(cursor)
  const days = Array.from({ length: 7 }, (_, i) => addDays(s, i))
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[720px]">
        <div className="grid grid-cols-[64px_repeat(7,1fr)] border-b border-[var(--crm-border)]">
          <div />
          {days.map((d, i) => (
            <div key={i} className="px-2 py-2 text-center border-l border-[var(--crm-border)]">
              <div className="text-[11px] uppercase tracking-wide text-[var(--crm-text-muted)]">{WEEKDAYS[d.getDay()]}</div>
              <div className={"text-[13px] font-semibold mt-0.5 " + (sameDay(d, today) ? "text-[var(--crm-text-primary)]" : "text-[var(--crm-text-secondary)]")}>{d.getDate()}</div>
            </div>
          ))}
        </div>
        {HOURS.map((h) => (
          <div key={h} className="grid grid-cols-[64px_repeat(7,1fr)] border-b border-[var(--crm-border)]">
            <div className="px-2 py-3 text-[11px] text-[var(--crm-text-muted)] text-right">{hourLabel(h)}</div>
            {days.map((_, i) => (
              <div key={i} className="min-h-[48px] border-l border-[var(--crm-border)]" />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

function ListView({ cursor, today }: { cursor: Date; today: Date }) {
  const s = startOfWeek(cursor)
  const days = Array.from({ length: 7 }, (_, i) => addDays(s, i))
  return (
    <div className="divide-y divide-[var(--crm-border)]">
      {days.map((d, i) => (
        <div key={i} className="flex items-center gap-4 px-4 py-3">
          <div className="w-28 flex-none">
            <div className={"text-[13px] font-semibold " + (sameDay(d, today) ? "text-[var(--crm-text-primary)]" : "text-[var(--crm-text-secondary)]")}>
              {d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
            </div>
          </div>
          <div className="flex-1 text-[12.5px] text-[var(--crm-text-muted)]">No posts scheduled</div>
        </div>
      ))}
    </div>
  )
}
