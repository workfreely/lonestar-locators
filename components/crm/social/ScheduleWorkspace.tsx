"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { type CalPost, MONTH_CELL_MAX, WEEKDAYS, sameDay, dateKey, timeLabel, marketAbbr, shortLabel, groupByDay, monthCells } from "@/lib/social/calendar"

// Beast Social — in-editor Schedule workspace. Replaces the RIGHT-side editor fields while the
// video preview stays on the LEFT (no full-screen modal, no scrolling to a picker, no leaving
// for the Calendar tab). Reuses the SHARED calendar data + formatting (lib/social/calendar) and
// the same scheduled-post query the Calendar tab uses, so the two never disagree. Rendering is
// NOT triggered here — scheduling only writes scheduled_at (a background render worker comes later).

const pad2 = (n: number) => String(n).padStart(2, "0")
const MINUTES = ["00", "05", "10", "15", "20", "25", "30", "35", "40", "45", "50", "55"]
const HOURS12 = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]

// Parse a local "YYYY-MM-DDTHH:mm" into {date, h12, min, ampm}; fall back to today @ 9:00 AM.
function parseInitial(v: string): { date: Date; h12: number; min: string; ampm: "AM" | "PM" } {
  const d = v ? new Date(v) : null
  if (d && !isNaN(d.getTime())) {
    const h = d.getHours()
    return { date: d, h12: ((h + 11) % 12) + 1, min: pad2(d.getMinutes() - (d.getMinutes() % 5)), ampm: h < 12 ? "AM" : "PM" }
  }
  const t = new Date()
  return { date: t, h12: 9, min: "00", ampm: "AM" }
}
// Compose the local "YYYY-MM-DDTHH:mm" string the editor's existing schedule logic expects.
function toLocalValue(date: Date, h12: number, min: string, ampm: "AM" | "PM"): string {
  const h24 = ampm === "PM" ? (h12 % 12) + 12 : h12 % 12
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}T${pad2(h24)}:${min}`
}

export type RepeatConfig = {
  intervalDays: number
  placementPref: "any" | "morning" | "midday" | "evening"
  duration: { mode: "days" | "date" | "until_stopped"; days?: number; endDate?: string }
}

export default function ScheduleWorkspace({
  initialValue,
  currentPostId,
  busy,
  onCancel,
  onSchedule,
  onRepeat,
}: {
  initialValue: string
  currentPostId: string
  busy: boolean
  onCancel: () => void
  onSchedule: (localValue: string) => void
  onRepeat?: (cfg: RepeatConfig) => void
}) {
  // Primary choice: Post Once (manual date/time) OR Repeat (Beast Social auto-places occurrences).
  const [mode, setMode] = useState<"once" | "repeat">("once")
  const [repeatEvery, setRepeatEvery] = useState<number>(7)
  const [durationMode, setDurationMode] = useState<"days" | "date" | "until_stopped">("days")
  const [durationDays, setDurationDays] = useState<number>(30)
  const [endDate, setEndDate] = useState<string>("")
  const [placement, setPlacement] = useState<"any" | "morning" | "midday" | "evening">("any")
  const init = useMemo(() => parseInitial(initialValue), [initialValue])
  const [cursor, setCursor] = useState(() => new Date(init.date.getFullYear(), init.date.getMonth(), 1))
  const [selected, setSelected] = useState<Date>(init.date)
  const [h12, setH12] = useState(init.h12)
  const [min, setMin] = useState(init.min)
  const [ampm, setAmpm] = useState<"AM" | "PM">(init.ampm)
  const [posts, setPosts] = useState<CalPost[]>([])

  // Same scheduled-post query the Calendar tab uses (one source of truth).
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch("/api/admin/social-autopilot/posts?scope=scheduled", { headers: { Accept: "application/json" } })
        if (!res.ok) return
        const json = (await res.json()) as { items?: CalPost[] }
        if (!cancelled) setPosts(Array.isArray(json.items) ? json.items : [])
      } catch { /* leave empty on failure */ }
    })()
    return () => { cancelled = true }
  }, [])

  const byDay = useMemo(() => groupByDay(posts), [posts])
  const cells = useMemo(() => monthCells(cursor), [cursor])
  const today = new Date()
  const dayPosts = byDay.get(dateKey(selected)) ?? []
  const selectedTimeLabel = `${h12}:${min} ${ampm}` // matches timeLabel() formatting ("8:30 AM")
  // Exact-time collision (excluding this post itself) — awareness only; never blocks/overwrites.
  const conflict = dayPosts.find((p) => p.id !== currentPostId && timeLabel(p.scheduledAt) === selectedTimeLabel) ?? null

  const shiftMonth = useCallback((dir: number) => setCursor((c) => new Date(c.getFullYear(), c.getMonth() + dir, 1)), [])

  const monthLabel = cursor.toLocaleDateString("en-US", { month: "long", year: "numeric" })
  const isToday = (d: number) => today.getFullYear() === cursor.getFullYear() && today.getMonth() === cursor.getMonth() && d === today.getDate()

  const navBtn = "text-[13px] font-semibold px-2 py-1 rounded-lg border border-[var(--crm-border)] text-[var(--crm-text-secondary)] hover:bg-[var(--crm-card)] transition-colors"
  const primaryBtn = "text-[12.5px] font-semibold px-3.5 py-2 rounded-lg bg-[var(--crm-text-primary)] text-[var(--crm-panel)] disabled:opacity-50"
  const btn = "text-[12.5px] font-semibold px-3 py-1.5 rounded-lg border border-[var(--crm-border)] text-[var(--crm-text-secondary)] hover:bg-[var(--crm-card)] transition-colors disabled:opacity-50"
  const sel = "text-[12.5px] rounded-lg border border-[var(--crm-border)] bg-[var(--crm-card)] text-[var(--crm-text-primary)] px-2 py-1.5"

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className="text-[15px] font-bold text-[var(--crm-text-primary)]">Schedule Post</span>
        <button type="button" className={`${btn} ml-auto`} onClick={onCancel}>← Back to Post</button>
      </div>

      {/* PRIMARY choice: Post Once (manual) or Repeat (Beast Social auto-places occurrences). */}
      {onRepeat && (
        <div className="inline-flex self-start rounded-lg border border-[var(--crm-border)] p-0.5">
          {([["once", "Post Once"], ["repeat", "Repeat"]] as const).map(([val, label]) => (
            <button
              key={val}
              type="button"
              onClick={() => setMode(val)}
              aria-pressed={mode === val}
              className={"text-[12px] font-semibold px-3 py-1 rounded-md transition-colors " + (mode === val ? "bg-[var(--crm-text-primary)] text-[var(--crm-panel)]" : "text-[var(--crm-text-secondary)] hover:bg-[var(--crm-card)]")}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {mode === "repeat" && onRepeat ? (
        <div className="rounded-xl border border-[var(--crm-border)] p-3 flex flex-col gap-3">
          <div className="text-[12px] text-[var(--crm-text-muted)]">Social Beast auto-places each occurrence into an open posting window (Morning 7–10a · Midday 11:30a–2:30p · Evening 6–9p). Manual posts always keep their slot.</div>

          <div>
            <div className="text-[10.5px] uppercase tracking-wide text-[var(--crm-text-muted)] font-semibold mb-1">Repeat every</div>
            <div className="flex flex-wrap gap-1.5">
              {[7, 14, 30].map((d) => (
                <button key={d} type="button" onClick={() => setRepeatEvery(d)} className={repeatEvery === d ? primaryBtn : btn}>{d} days</button>
              ))}
            </div>
          </div>

          <div>
            <div className="text-[10.5px] uppercase tracking-wide text-[var(--crm-text-muted)] font-semibold mb-1">Duration</div>
            <div className="flex flex-wrap items-center gap-1.5">
              {[30, 60, 90].map((d) => (
                <button key={d} type="button" onClick={() => { setDurationMode("days"); setDurationDays(d) }} className={durationMode === "days" && durationDays === d ? primaryBtn : btn}>{d} days</button>
              ))}
              <button type="button" onClick={() => setDurationMode("date")} className={durationMode === "date" ? primaryBtn : btn}>Custom end date</button>
              <button type="button" onClick={() => setDurationMode("until_stopped")} className={durationMode === "until_stopped" ? primaryBtn : btn}>Repeat until stopped</button>
            </div>
            {durationMode === "date" && (
              <input type="date" className={`${sel} mt-2`} value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            )}
          </div>

          <div>
            <div className="text-[10.5px] uppercase tracking-wide text-[var(--crm-text-muted)] font-semibold mb-1">Placement</div>
            <div className="flex flex-wrap gap-1.5">
              {([["any", "Let Social Beast choose"], ["morning", "Morning"], ["midday", "Midday"], ["evening", "Evening"]] as const).map(([val, label]) => (
                <button key={val} type="button" onClick={() => setPlacement(val)} className={placement === val ? primaryBtn : btn}>{label}</button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-1">
            <button type="button" className={btn} onClick={onCancel}>Cancel</button>
            <button
              type="button"
              className={primaryBtn}
              disabled={busy || (durationMode === "date" && !endDate)}
              onClick={() => onRepeat({
                intervalDays: repeatEvery,
                placementPref: placement,
                duration: durationMode === "days" ? { mode: "days", days: durationDays } : durationMode === "date" ? { mode: "date", endDate } : { mode: "until_stopped" },
              })}
            >
              {busy ? "Setting up…" : "Set up recurring"}
            </button>
          </div>
        </div>
      ) : (
      <>
      {/* Month calendar — same compact scheduled-post entries as the Calendar tab. */}
      <div className="rounded-xl border border-[var(--crm-border)] overflow-hidden">
        <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--crm-border)]">
          <button type="button" className={navBtn} onClick={() => shiftMonth(-1)} aria-label="Previous month">‹</button>
          <div className="text-[13px] font-bold text-[var(--crm-text-primary)]">{monthLabel}</div>
          <button type="button" className={navBtn} onClick={() => shiftMonth(1)} aria-label="Next month">›</button>
        </div>
        <div className="grid grid-cols-7 border-b border-[var(--crm-border)]">
          {WEEKDAYS.map((w) => (
            <div key={w} className="px-1 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--crm-text-muted)] text-center">{w}</div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((d, i) => {
            const cellDate = d != null ? new Date(cursor.getFullYear(), cursor.getMonth(), d) : null
            const cp = cellDate ? byDay.get(dateKey(cellDate)) ?? [] : []
            const isSel = !!(cellDate && sameDay(cellDate, selected))
            return (
              <div
                key={i}
                role={cellDate ? "button" : undefined}
                tabIndex={cellDate ? 0 : undefined}
                aria-pressed={cellDate ? isSel : undefined}
                onClick={cellDate ? () => setSelected(cellDate) : undefined}
                onKeyDown={cellDate ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelected(cellDate) } } : undefined}
                className={
                  "relative min-h-[62px] border-b border-r border-[var(--crm-border)] p-1 align-top outline-none " +
                  ((i + 1) % 7 === 0 ? "border-r-0 " : "") +
                  (d == null ? "bg-[var(--crm-card)]/30 " : "cursor-pointer hover:bg-[var(--crm-card)]/60 focus-visible:ring-1 focus-visible:ring-[var(--kb-accent,var(--crm-accent))] ") +
                  (isSel ? "sa-cal-day--selected" : "")
                }
              >
                {d != null && (
                  <>
                    <div className={"text-[11px] font-semibold w-5 h-5 flex items-center justify-center rounded-full " + (isToday(d) ? "bg-[var(--crm-text-primary)] text-[var(--crm-panel)]" : "text-[var(--crm-text-secondary)]")}>{d}</div>
                    <div className="mt-0.5 flex flex-col gap-0.5">
                      {cp.slice(0, MONTH_CELL_MAX).map((p) => (
                        <div key={p.id} className="flex items-baseline gap-1 leading-tight" title={`${timeLabel(p.scheduledAt)} · ${shortLabel(p)}`}>
                          <span className="text-[9px] font-semibold text-[var(--crm-text-secondary)] tabular-nums flex-none">{timeLabel(p.scheduledAt)}</span>
                          <span className="text-[9px] text-[var(--crm-text-muted)] truncate">{marketAbbr(p.source?.market) ? `· ${marketAbbr(p.source?.market)} ` : ""}· {shortLabel(p)}</span>
                        </div>
                      ))}
                      {cp.length > MONTH_CELL_MAX && <div className="text-[9px] text-[var(--crm-text-muted)] pl-0.5">+{cp.length - MONTH_CELL_MAX} more</div>}
                    </div>
                  </>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Selected-day detail + time selector */}
      <div className="rounded-xl border border-[var(--crm-border)] p-3 flex flex-col gap-2">
        <div className="text-[13px] font-bold text-[var(--crm-text-primary)]">{selected.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</div>
        <div>
          <div className="text-[10.5px] uppercase tracking-wide text-[var(--crm-text-muted)] font-semibold">Already scheduled</div>
          {dayPosts.length === 0 ? (
            <div className="text-[12px] text-[var(--crm-text-muted)] mt-0.5">Nothing scheduled this day.</div>
          ) : (
            <div className="mt-0.5 flex flex-col gap-0.5">
              {dayPosts.map((p) => (
                <div key={p.id} className="text-[12px] text-[var(--crm-text-secondary)] tabular-nums">
                  {timeLabel(p.scheduledAt)} <span className="text-[var(--crm-text-muted)]">· {marketAbbr(p.source?.market)} · {shortLabel(p)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <div className="text-[10.5px] uppercase tracking-wide text-[var(--crm-text-muted)] font-semibold mb-1">Post this at</div>
          <div className="flex items-center gap-1.5">
            <select className={sel} value={h12} onChange={(e) => setH12(Number(e.target.value))} aria-label="Hour">
              {HOURS12.map((h) => <option key={h} value={h}>{h}</option>)}
            </select>
            <span className="text-[var(--crm-text-muted)]">:</span>
            <select className={sel} value={min} onChange={(e) => setMin(e.target.value)} aria-label="Minute">
              {MINUTES.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
            <select className={sel} value={ampm} onChange={(e) => setAmpm(e.target.value as "AM" | "PM")} aria-label="AM/PM">
              <option value="AM">AM</option>
              <option value="PM">PM</option>
            </select>
          </div>
          {conflict && (
            <div className="mt-2 text-[11.5px] text-amber-600 dark:text-amber-400">
              A post is already scheduled for {selectedTimeLabel} ({shortLabel(conflict)}). You can still schedule this one — nothing is overwritten.
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center justify-end gap-2">
        <button type="button" className={btn} onClick={onCancel}>Cancel</button>
        <button type="button" className={primaryBtn} disabled={busy} onClick={() => onSchedule(toLocalValue(selected, h12, min, ampm))}>{busy ? "Scheduling…" : "Schedule"}</button>
      </div>
      </>
      )}
    </div>
  )
}
