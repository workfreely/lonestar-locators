// Beast Social — shared calendar data + formatting. ONE source of truth for the scheduled-post
// shape, month/date math, compact labels, and time formatting, so the Calendar tab
// (CalendarShell) and the Post Editor's scheduling workspace (ScheduleWorkspace) can never
// disagree about what is scheduled or how it reads. Pure + client-safe (no React, no fetch).
import type { PostStatus } from "@/lib/social/postStatus"

export type CalPost = {
  id: string
  status: PostStatus
  platform: string
  scheduledAt: string | null
  postName: string | null
  caption: string | null
  source: { displayName: string | null; propertyName: string | null; propertyType: string | null; market: string | null; originalFilename: string | null; kind: string | null } | null
  previewUrl: string | null
  recurring?: boolean // auto-placed by a Repeat rule (shown with a small "Recurring" badge)
}

export const MONTH_CELL_MAX = 3 // posts shown in a month cell before "+N more"

export const addDays = (d: Date, n: number) => {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}
export const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString()
export const dateKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`

/** Wall-clock time with AM/PM, e.g. "8:30 AM". Empty for a missing/invalid date. */
export const timeLabel = (iso: string | null) => {
  if (!iso) return ""
  const d = new Date(iso)
  return isNaN(d.getTime()) ? "" : d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
}

// Market → abbreviation for compact entries. Unknown markets fall back to their first 3 letters.
const MARKET_ABBR: Record<string, string> = { "San Antonio": "SA", Dallas: "DAL", DFW: "DAL", Houston: "HOU", Austin: "AUS" }
export const marketAbbr = (m: string | null | undefined) => (m ? MARKET_ABBR[m] ?? m.replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase() : "")

/** Full recognizable label (Day Detail / titles): property name → display name → post name. */
export const calLabel = (p: CalPost) => p.source?.propertyName || p.source?.displayName || p.postName || "Post"
/** Shortest recognizable label (compact month entries): property name → type → display name. */
export const shortLabel = (p: CalPost) => p.source?.propertyName || p.source?.propertyType || p.source?.displayName || p.postName || "Post"

/** Group posts by local calendar day (YYYY-MM-DD), each day sorted chronologically. */
export function groupByDay(posts: CalPost[]): Map<string, CalPost[]> {
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
}

/** Month cell slots for `cursor`'s month: leading blanks (nulls) + day numbers, padded to a
 *  whole number of 7-day weeks. */
export function monthCells(cursor: Date): (number | null)[] {
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1)
  const days = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate()
  const cells: (number | null)[] = [...Array.from({ length: first.getDay() }, () => null), ...Array.from({ length: days }, (_, i) => i + 1)]
  while (cells.length % 7 !== 0) cells.push(null)
  return cells
}

export const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
