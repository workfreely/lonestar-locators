"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import type { PostStatus } from "@/lib/social/postStatus"

// Social Autopilot → Calendar. Month | Week | List over REAL scheduled posts
// (social_posts with status='scheduled'). Each item shows the source/property identity,
// Instagram, scheduled time and status, and clicking it opens the post editor. Read-only
// placement (no drag-reschedule) — rescheduling is done safely in the editor. No external
// publishing; scheduled ≠ published.
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
const HOURS = [8, 10, 12, 14, 16, 18] // representative 2-hour buckets for Week view
type View = "Month" | "Week" | "List"

type CalPost = {
  id: string
  status: PostStatus
  scheduledAt: string | null
  postName: string | null
  source: { displayName: string | null; propertyName: string | null; market: string | null } | null
}

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
const timeLabel = (iso: string | null) => {
  if (!iso) return ""
  const d = new Date(iso)
  return isNaN(d.getTime()) ? "" : d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
}
const label = (p: CalPost) => p.source?.propertyName || p.source?.displayName || p.postName || "Post"
const STATUS_DOT: Record<PostStatus, string> = {
  draft: "bg-[var(--crm-text-muted)]",
  rendering: "bg-amber-500",
  ready: "bg-sky-500",
  scheduled: "bg-emerald-500",
  publishing: "bg-violet-500",
  needs_attention: "bg-red-500",
  published: "bg-[var(--crm-text-muted)]",
}

export default function CalendarShell() {
  const router = useRouter()
  const today = new Date()
  const [view, setView] = useState<View>("Month")
  const [cursor, setCursor] = useState(() => new Date())
  const [posts, setPosts] = useState<CalPost[]>([])

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/social-autopilot/posts?scope=scheduled", { headers: { Accept: "application/json" } })
      if (!res.ok) return
      const json = (await res.json()) as { items?: CalPost[] }
      setPosts(Array.isArray(json.items) ? json.items : [])
    } catch {
      /* leave empty on failure */
    }
  }, [])
  useEffect(() => {
    void load()
  }, [load])

  const open = useCallback((id: string) => router.push(`/admin/social-autopilot/posts/${encodeURIComponent(id)}`), [router])

  // Bucket scheduled posts by local day key (YYYY-MM-DD).
  const byDay = useMemo(() => {
    const m = new Map<string, CalPost[]>()
    for (const p of posts) {
      if (!p.scheduledAt) continue
      const d = new Date(p.scheduledAt)
      if (isNaN(d.getTime())) continue
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
      const arr = m.get(key) ?? []
      arr.push(p)
      m.set(key, arr)
    }
    for (const arr of m.values()) arr.sort((a, b) => new Date(a.scheduledAt!).getTime() - new Date(b.scheduledAt!).getTime())
    return m
  }, [posts])
  const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`

  const shift = (dir: number) => {
    if (view === "Month") setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + dir, 1))
    else setCursor(addDays(cursor, dir * 7))
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
      <div className="mb-3 flex justify-end">
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

        {view === "Month" && <MonthGrid cursor={cursor} today={today} byDay={byDay} dayKey={dayKey} onOpen={open} />}
        {view === "Week" && <WeekGrid cursor={cursor} today={today} byDay={byDay} dayKey={dayKey} onOpen={open} />}
        {view === "List" && <ListView cursor={cursor} today={today} byDay={byDay} dayKey={dayKey} onOpen={open} />}
      </div>
    </div>
  )
}

type GridProps = {
  cursor: Date
  today: Date
  byDay: Map<string, CalPost[]>
  dayKey: (d: Date) => string
  onOpen: (id: string) => void
}

function Pill({ p, onOpen }: { p: CalPost; onOpen: (id: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(p.id)}
      title={`${label(p)} · Instagram · ${timeLabel(p.scheduledAt)}`}
      className="w-full flex items-center gap-1 rounded px-1 py-0.5 text-left text-[10.5px] bg-[var(--crm-card)] hover:bg-[var(--crm-border)] transition-colors"
    >
      <span className={"h-1.5 w-1.5 rounded-full flex-none " + (STATUS_DOT[p.status] ?? "bg-[var(--crm-text-muted)]")} />
      <span className="truncate text-[var(--crm-text-secondary)]">{timeLabel(p.scheduledAt)} {label(p)}</span>
    </button>
  )
}

function MonthGrid({ cursor, today, byDay, dayKey, onOpen }: GridProps) {
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
        {cells.map((d, i) => {
          const cellDate = d != null ? new Date(cursor.getFullYear(), cursor.getMonth(), d) : null
          const dayPosts = cellDate ? byDay.get(dayKey(cellDate)) ?? [] : []
          return (
            <div key={i} className={"min-h-[84px] border-b border-r border-[var(--crm-border)] p-1.5 align-top " + ((i + 1) % 7 === 0 ? "border-r-0 " : "") + (d == null ? "bg-[var(--crm-card)]/30" : "")}>
              {d != null && (
                <>
                  <div className={"text-[12px] font-semibold w-6 h-6 flex items-center justify-center rounded-full " + (isToday(d) ? "bg-[var(--crm-text-primary)] text-[var(--crm-panel)]" : "text-[var(--crm-text-secondary)]")}>{d}</div>
                  <div className="mt-1 flex flex-col gap-0.5">
                    {dayPosts.slice(0, 3).map((p) => <Pill key={p.id} p={p} onOpen={onOpen} />)}
                    {dayPosts.length > 3 && <div className="text-[10px] text-[var(--crm-text-muted)] pl-1">+{dayPosts.length - 3} more</div>}
                  </div>
                </>
              )}
            </div>
          )
        })}
      </div>
    </>
  )
}

function WeekGrid({ cursor, today, byDay, dayKey, onOpen }: GridProps) {
  const s = startOfWeek(cursor)
  const days = Array.from({ length: 7 }, (_, i) => addDays(s, i))
  // Bucket a day's posts into the representative 2-hour rows (clamped to 8–20).
  const bucket = (d: Date, h: number) =>
    (byDay.get(dayKey(d)) ?? []).filter((p) => {
      const hr = p.scheduledAt ? new Date(p.scheduledAt).getHours() : -1
      const clamped = Math.min(19, Math.max(8, hr))
      return clamped >= h && clamped < h + 2
    })
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
            {days.map((d, i) => (
              <div key={i} className="min-h-[48px] border-l border-[var(--crm-border)] p-1 flex flex-col gap-0.5">
                {bucket(d, h).map((p) => <Pill key={p.id} p={p} onOpen={onOpen} />)}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

function ListView({ cursor, today, byDay, dayKey, onOpen }: GridProps) {
  const s = startOfWeek(cursor)
  const days = Array.from({ length: 7 }, (_, i) => addDays(s, i))
  return (
    <div className="divide-y divide-[var(--crm-border)]">
      {days.map((d, i) => {
        const dayPosts = byDay.get(dayKey(d)) ?? []
        return (
          <div key={i} className="flex items-start gap-4 px-4 py-3">
            <div className="w-28 flex-none">
              <div className={"text-[13px] font-semibold " + (sameDay(d, today) ? "text-[var(--crm-text-primary)]" : "text-[var(--crm-text-secondary)]")}>
                {d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
              </div>
            </div>
            <div className="flex-1">
              {dayPosts.length === 0 ? (
                <div className="text-[12.5px] text-[var(--crm-text-muted)]">No posts scheduled</div>
              ) : (
                <div className="flex flex-col gap-1">
                  {dayPosts.map((p) => (
                    <button key={p.id} type="button" onClick={() => onOpen(p.id)} className="flex items-center gap-2 text-left rounded px-2 py-1 hover:bg-[var(--crm-card)] transition-colors">
                      <span className={"h-1.5 w-1.5 rounded-full flex-none " + (STATUS_DOT[p.status] ?? "bg-[var(--crm-text-muted)]")} />
                      <span className="text-[12.5px] text-[var(--crm-text-primary)] font-semibold">{timeLabel(p.scheduledAt)}</span>
                      <span className="text-[12.5px] text-[var(--crm-text-secondary)] truncate">{label(p)} · Instagram</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
