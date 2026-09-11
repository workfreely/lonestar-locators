"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { POST_STATUS_LABEL, type PostStatus } from "@/lib/social/postStatus"

// Social Autopilot → Calendar. Month | Week | List over REAL scheduled posts
// (social_posts, status='scheduled'). Interactive: single-click selects a day (theme-aware
// glow, reusing the CRM selected-card --kb-accent treatment), double-click / Enter / the
// selected-day "Open" chip opens a Day Detail modal, and clicking an individual post opens
// the editor. Tiny cell previews → medium Day Detail list → large editor preview. Read-only
// placement (no drag-reschedule); no external publishing; scheduled ≠ published.
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
const HOURS = [8, 10, 12, 14, 16, 18] // representative 2-hour buckets for Week view
const MONTH_CELL_MAX = 3 // posts shown in a month cell before "+N more"
type View = "Month" | "Week" | "List"

type CalPost = {
  id: string
  status: PostStatus
  platform: string
  scheduledAt: string | null
  postName: string | null
  caption: string | null
  source: { displayName: string | null; propertyName: string | null; market: string | null; originalFilename: string | null; kind: string | null } | null
  previewUrl: string | null
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
const dateKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
const STATUS_DOT: Record<PostStatus, string> = {
  draft: "bg-[var(--crm-text-muted)]",
  rendering: "bg-amber-500",
  ready: "bg-sky-500",
  scheduled: "bg-emerald-500",
  publishing: "bg-violet-500",
  needs_attention: "bg-red-500",
  published: "bg-[var(--crm-text-muted)]",
}

function InstagramIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <rect x="2.5" y="2.5" width="19" height="19" rx="5" />
      <circle cx="12" cy="12" r="4.4" />
      <circle cx="17.6" cy="6.4" r="1.3" fill="currentColor" stroke="none" />
    </svg>
  )
}

function Thumb({ p, className }: { p: CalPost; className?: string }) {
  if (!p.previewUrl) return <div className={`bg-[var(--crm-card)] ${className ?? ""}`} aria-hidden />
  if (p.source?.kind === "image") {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={p.previewUrl} alt="" className={`object-cover ${className ?? ""}`} />
  }
  return <video src={p.previewUrl} muted playsInline preload="metadata" className={`object-cover bg-black ${className ?? ""}`} />
}

export default function CalendarShell() {
  const router = useRouter()
  const today = new Date()
  const [view, setView] = useState<View>("Month")
  const [cursor, setCursor] = useState(() => new Date())
  const [posts, setPosts] = useState<CalPost[]>([])
  const [selected, setSelected] = useState<Date | null>(null) // one selected day at a time
  const [dayDetail, setDayDetail] = useState<Date | null>(null) // open Day Detail modal

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

  const openPost = useCallback((id: string) => router.push(`/admin/social-autopilot/posts/${encodeURIComponent(id)}`), [router])

  const byDay = useMemo(() => {
    const m = new Map<string, CalPost[]>()
    for (const p of posts) {
      if (!p.scheduledAt) continue
      const d = new Date(p.scheduledAt)
      if (isNaN(d.getTime())) continue
      const arr = m.get(dateKey(d)) ?? []
      arr.push(p)
      m.set(dateKey(d), arr)
    }
    for (const arr of m.values()) arr.sort((a, b) => new Date(a.scheduledAt!).getTime() - new Date(b.scheduledAt!).getTime())
    return m
  }, [posts])

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

        {view === "Month" && (
          <MonthGrid
            cursor={cursor}
            today={today}
            byDay={byDay}
            onOpenPost={openPost}
            selected={selected}
            onSelectDate={setSelected}
            onOpenDay={setDayDetail}
          />
        )}
        {view === "Week" && <WeekGrid cursor={cursor} today={today} byDay={byDay} onOpenPost={openPost} />}
        {view === "List" && <ListView cursor={cursor} today={today} byDay={byDay} onOpenPost={openPost} />}
      </div>

      {dayDetail && (
        <DayDetail
          date={dayDetail}
          posts={byDay.get(dateKey(dayDetail)) ?? []}
          onClose={() => setDayDetail(null)}
          onOpenPost={openPost}
          onCreate={() => router.push(`/admin/social-autopilot?scheduleDate=${dateKey(dayDetail)}`)}
        />
      )}
    </div>
  )
}

// ── Compact month-cell preview ───────────────────────────────────────────────
function CellPost({ p, onOpenPost }: { p: CalPost; onOpenPost: (id: string) => void }) {
  const stop = (e: React.SyntheticEvent) => e.stopPropagation() // never trigger the cell select/open
  return (
    <button
      type="button"
      onClick={(e) => {
        stop(e)
        onOpenPost(p.id)
      }}
      onDoubleClick={stop}
      title={`${label(p)} · Instagram · ${timeLabel(p.scheduledAt)}`}
      className="w-full flex items-center gap-1 rounded px-1 py-0.5 text-left bg-[var(--crm-card)] hover:bg-[var(--crm-border)] transition-colors"
    >
      <Thumb p={p} className="h-4 w-3 flex-none rounded-[2px]" />
      <InstagramIcon className="h-2.5 w-2.5 flex-none text-[var(--crm-text-muted)]" />
      <span className="text-[10px] font-semibold text-[var(--crm-text-secondary)] tabular-nums flex-none">{timeLabel(p.scheduledAt)}</span>
      <span className="text-[10px] text-[var(--crm-text-muted)] truncate">{label(p)}</span>
    </button>
  )
}

type MonthProps = {
  cursor: Date
  today: Date
  byDay: Map<string, CalPost[]>
  onOpenPost: (id: string) => void
  selected: Date | null
  onSelectDate: (d: Date) => void
  onOpenDay: (d: Date) => void
}

function MonthGrid({ cursor, today, byDay, onOpenPost, selected, onSelectDate, onOpenDay }: MonthProps) {
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
          const dayPosts = cellDate ? byDay.get(dateKey(cellDate)) ?? [] : []
          const isSelected = !!(cellDate && selected && sameDay(cellDate, selected))
          return (
            <div
              key={i}
              role={cellDate ? "button" : undefined}
              tabIndex={cellDate ? 0 : undefined}
              aria-pressed={cellDate ? isSelected : undefined}
              aria-label={cellDate ? `${cellDate.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}${dayPosts.length ? `, ${dayPosts.length} scheduled` : ""}` : undefined}
              onClick={cellDate ? () => onSelectDate(cellDate) : undefined}
              onDoubleClick={cellDate ? () => onOpenDay(cellDate) : undefined}
              onKeyDown={
                cellDate
                  ? (e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault()
                        onOpenDay(cellDate) // keyboard fallback for double-click
                      }
                    }
                  : undefined
              }
              className={
                "relative min-h-[92px] border-b border-r border-[var(--crm-border)] p-1.5 align-top outline-none " +
                ((i + 1) % 7 === 0 ? "border-r-0 " : "") +
                (d == null ? "bg-[var(--crm-card)]/30 " : "cursor-pointer focus-visible:ring-1 focus-visible:ring-[var(--kb-accent,var(--crm-accent))] ") +
                (isSelected ? "sa-cal-day--selected" : "")
              }
            >
              {d != null && (
                <>
                  <div className="flex items-center justify-between">
                    <div className={"text-[12px] font-semibold w-6 h-6 flex items-center justify-center rounded-full " + (isToday(d) ? "bg-[var(--crm-text-primary)] text-[var(--crm-panel)]" : "text-[var(--crm-text-secondary)]")}>{d}</div>
                    {/* Obvious, accessible way to open Day Detail without a double-click (touch/keyboard). */}
                    {isSelected && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          onOpenDay(cellDate!)
                        }}
                        className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-[var(--crm-card)] text-[var(--crm-text-secondary)] hover:bg-[var(--crm-border)]"
                      >
                        Open
                      </button>
                    )}
                  </div>
                  <div className="mt-1 flex flex-col gap-0.5">
                    {dayPosts.slice(0, MONTH_CELL_MAX).map((p) => <CellPost key={p.id} p={p} onOpenPost={onOpenPost} />)}
                    {dayPosts.length > MONTH_CELL_MAX && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          onOpenDay(cellDate!)
                        }}
                        className="text-[10px] text-[var(--crm-text-muted)] pl-1 text-left hover:text-[var(--crm-text-secondary)]"
                      >
                        +{dayPosts.length - MONTH_CELL_MAX} more
                      </button>
                    )}
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

type GridProps = { cursor: Date; today: Date; byDay: Map<string, CalPost[]>; onOpenPost: (id: string) => void }

function WeekGrid({ cursor, today, byDay, onOpenPost }: GridProps) {
  const s = startOfWeek(cursor)
  const days = Array.from({ length: 7 }, (_, i) => addDays(s, i))
  const bucket = (d: Date, h: number) =>
    (byDay.get(dateKey(d)) ?? []).filter((p) => {
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
                {bucket(d, h).map((p) => <CellPost key={p.id} p={p} onOpenPost={onOpenPost} />)}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

function ListView({ cursor, today, byDay, onOpenPost }: GridProps) {
  const s = startOfWeek(cursor)
  const days = Array.from({ length: 7 }, (_, i) => addDays(s, i))
  return (
    <div className="divide-y divide-[var(--crm-border)]">
      {days.map((d, i) => {
        const dayPosts = byDay.get(dateKey(d)) ?? []
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
                    <button key={p.id} type="button" onClick={() => onOpenPost(p.id)} className="flex items-center gap-2 text-left rounded px-2 py-1 hover:bg-[var(--crm-card)] transition-colors">
                      <span className={"h-1.5 w-1.5 rounded-full flex-none " + (STATUS_DOT[p.status] ?? "bg-[var(--crm-text-muted)]")} />
                      <span className="text-[12.5px] text-[var(--crm-text-primary)] font-semibold tabular-nums">{timeLabel(p.scheduledAt)}</span>
                      <InstagramIcon className="h-3 w-3 flex-none text-[var(--crm-text-muted)]" />
                      <span className="text-[12.5px] text-[var(--crm-text-secondary)] truncate">{label(p)}</span>
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

// ── Day Detail modal — medium preview list for one date ──────────────────────
function DayDetail({
  date,
  posts,
  onClose,
  onOpenPost,
  onCreate,
}: {
  date: Date
  posts: CalPost[]
  onClose: () => void
  onOpenPost: (id: string) => void
  onCreate: () => void
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-md max-h-[85vh] overflow-y-auto rounded-2xl border border-[var(--crm-border)] bg-[var(--crm-panel)] p-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <div className="text-[15px] font-bold text-[var(--crm-text-primary)]">
            {date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded p-1 text-[var(--crm-text-muted)] hover:text-[var(--crm-text-primary)]">✕</button>
        </div>

        {posts.length === 0 ? (
          <div className="rounded-xl border border-[var(--crm-border)] px-4 py-8 text-center">
            <div className="text-[13px] text-[var(--crm-text-secondary)]">No posts scheduled</div>
            <button type="button" onClick={onCreate} className="mt-3 text-[12.5px] font-semibold px-3.5 py-2 rounded-lg bg-[var(--crm-text-primary)] text-[var(--crm-panel)]">+ Create Post</button>
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-2">
              {posts.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => onOpenPost(p.id)}
                  className="flex items-stretch gap-3 text-left rounded-xl border border-[var(--crm-border)] p-2 hover:bg-[var(--crm-card)] transition-colors"
                >
                  <Thumb p={p} className="w-10 h-[57px] flex-none rounded-md" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <InstagramIcon className="h-3 w-3 flex-none text-[var(--crm-text-muted)]" />
                      <span className="text-[12px] font-semibold text-[var(--crm-text-primary)] tabular-nums">{timeLabel(p.scheduledAt)}</span>
                      <span className={"ml-auto flex items-center gap-1 text-[10.5px] font-semibold text-[var(--crm-text-secondary)]"}>
                        <span className={"h-1.5 w-1.5 rounded-full " + (STATUS_DOT[p.status] ?? "bg-[var(--crm-text-muted)]")} />
                        {POST_STATUS_LABEL[p.status] ?? p.status}
                      </span>
                    </div>
                    <div className="text-[12.5px] font-semibold text-[var(--crm-text-primary)] truncate mt-0.5">{label(p)}</div>
                    {p.caption && <div className="text-[11.5px] text-[var(--crm-text-muted)] line-clamp-2">{p.caption}</div>}
                  </div>
                </button>
              ))}
            </div>
            <button type="button" onClick={onCreate} className="mt-3 w-full text-[12.5px] font-semibold px-3 py-2 rounded-lg border border-[var(--crm-border)] text-[var(--crm-text-secondary)] hover:bg-[var(--crm-card)] transition-colors">+ Create Post</button>
          </>
        )}
      </div>
    </div>
  )
}
