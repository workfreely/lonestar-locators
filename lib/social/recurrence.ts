// Beast Social — recurring-post SCHEDULER (pure, deterministic). Turns a recurrence rule into a set
// of occurrence PLACEMENTS across three approved posting WINDOWS, without random timestamps and
// without ever moving an already-placed occupant. The API layer feeds real occupancy (manual +
// existing posts) in and writes the resulting social_posts instances out; nothing here publishes.
//
// Determinism/idempotency: every time-within-window and slot choice is derived from STABLE inputs
// (rule id, occurrence index, calendar day, slot), so re-planning the same occurrence yields the
// same result. The DB's unique(recurring_rule_id, recurrence_index) makes generation idempotent.

export const RECURRENCE_SLOTS = ["morning", "midday", "evening"] as const
export type Slot = (typeof RECURRENCE_SLOTS)[number]

// APPROVED posting windows (minutes from local midnight). Auto placement stays strictly inside.
// Morning 7:00–10:00 · Midday 11:30–2:30 · Evening 6:00–9:00.
export const SLOT_WINDOWS: Record<Slot, { startMin: number; endMin: number; label: string }> = {
  morning: { startMin: 7 * 60, endMin: 10 * 60, label: "Morning" },
  midday: { startMin: 11 * 60 + 30, endMin: 14 * 60 + 30, label: "Afternoon" }, // slot key stays 'midday'; window 11:30–2:30 unchanged
  evening: { startMin: 18 * 60, endMin: 21 * 60, label: "Evening" },
}

export type RuleState = "active" | "paused" | "stopped"
/** Only an ACTIVE rule generates new occurrences. Paused/stopped never create more (existing
 *  future instances are preserved — deletion is never implicit). */
export function isGeneratingState(state: string | null | undefined): boolean {
  return state === "active"
}

export const DEFAULT_POSTS_PER_DAY = 2
export const DEFAULT_TIMEZONE = "America/Chicago"
export const DEFAULT_HORIZON_DAYS = 30 // rolling first horizon generated on save (see API)
const MAX_BUMP_DAYS = 21 // how far forward to search when a target day's slots/goal are full

export type PlacementPref = Slot | "any"
export type EndMode = "after_days" | "on_date" | "until_stopped"

// FNV-1a (32-bit) — stable across runs/deploys. Same string → same number. No RNG.
function hashStr(s: string): number {
  let h = 2166136261 >>> 0
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619) >>> 0
  }
  return h >>> 0
}

/** Deterministic minute-of-day INSIDE the slot window from stable inputs. Varies the exact time
 *  (never a round hour, not a constant minute) yet is idempotent and never leaves the window. */
export function slotMinute(ruleId: string, index: number, dateKey: string, slot: Slot): number {
  const w = SLOT_WINDOWS[slot]
  const span = w.endMin - w.startMin
  const h = hashStr(`${ruleId}|${index}|${dateKey}|${slot}`)
  let m = w.startMin + (h % span)
  if (m % 60 === 0) m += 1 + (h % 17) // avoid round-hour timestamps
  if (m >= w.endMin) m = w.endMin - 1 - (h % 5)
  if (m < w.startMin) m = w.startMin + 1
  return m
}

/** Which approved window (if any) a given minute-of-day falls into — used to map EXISTING posts
 *  (manual or prior occurrences) onto a slot so auto placement never double-books it. */
export function slotForMinute(minute: number): Slot | null {
  for (const s of RECURRENCE_SLOTS) {
    const w = SLOT_WINDOWS[s]
    if (minute >= w.startMin && minute < w.endMin) return s
  }
  return null
}

/** Deterministic slot search order for a day. A fixed preference pins that slot; "any" ROTATES the
 *  three windows by a day/rule-derived offset so usage distributes (never a hard-coded pair). */
export function slotOrder(ruleId: string, dateKey: string, pref: PlacementPref): Slot[] {
  if (pref !== "any") return [pref, ...RECURRENCE_SLOTS.filter((s) => s !== pref)]
  const off = hashStr(`${ruleId}|${dateKey}`) % RECURRENCE_SLOTS.length
  return RECURRENCE_SLOTS.map((_, i) => RECURRENCE_SLOTS[(i + off) % RECURRENCE_SLOTS.length])
}

export type DayOccupancy = { count: number; slots: Set<Slot> }
export type Occupancy = Map<string, DayOccupancy>
export type Placement = { index: number; dateKey: string; slot: Slot; minute: number }

function cloneOccupancy(o: Occupancy): Occupancy {
  const m: Occupancy = new Map()
  for (const [k, v] of o) m.set(k, { count: v.count, slots: new Set(v.slots) })
  return m
}

export type PlanInput = {
  ruleId: string
  intervalDays: number
  placementPref: PlacementPref
  postsPerDay: number
  days: string[] // consecutive calendar dateKeys ("YYYY-MM-DD") from the start day through the horizon (+buffer)
  occupancy: Occupancy // existing occupancy (manual + other posts), keyed by dateKey
  maxOccurrences: number
}

/** Plan occurrence placements. Occurrence N targets day index N·intervalDays; if that day already
 *  meets the posting goal OR has no free approved window, the occurrence moves FORWARD to the next
 *  valid day/slot (never backward, never onto an occupied slot — manual posts always win). Pure:
 *  given the same inputs it returns the same placements. */
export function planOccurrences(input: PlanInput): Placement[] {
  const { ruleId, intervalDays, placementPref, postsPerDay, days, maxOccurrences } = input
  const occ = cloneOccupancy(input.occupancy)
  const out: Placement[] = []
  for (let index = 0; index < maxOccurrences; index++) {
    const base = index * intervalDays
    let placed = false
    for (let step = 0; step < MAX_BUMP_DAYS; step++) {
      const p = base + step
      if (p >= days.length) break
      const dk = days[p]
      const day = occ.get(dk) ?? { count: 0, slots: new Set<Slot>() }
      if (day.count >= postsPerDay) continue // day's posting goal already satisfied → next day
      const slot = slotOrder(ruleId, dk, placementPref).find((s) => !day.slots.has(s))
      if (!slot) continue // every approved window for this day is taken → next day
      out.push({ index, dateKey: dk, slot, minute: slotMinute(ruleId, index, dk, slot) })
      day.slots.add(slot)
      day.count += 1
      occ.set(dk, day)
      placed = true
      break
    }
    if (!placed) break // ran out of horizon room
  }
  return out
}

// ── calendar / timezone helpers ──────────────────────────────────────────────────────────────
const pad2 = (n: number) => String(n).padStart(2, "0")

/** dateKey ("YYYY-MM-DD") for a Date's calendar day in the given IANA timezone. */
export function dateKeyInTz(d: Date, tz: string = DEFAULT_TIMEZONE): string {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" })
      .formatToParts(d)
      .map((x) => [x.type, x.value]),
  )
  return `${p.year}-${p.month}-${p.day}`
}

/** Build the consecutive dateKey list [startKey .. startKey+countDays]. */
export function dayKeysFrom(startKey: string, countDays: number): string[] {
  const [y, m, d] = startKey.split("-").map(Number)
  const out: string[] = []
  // Anchor at UTC noon to step whole days without DST slippage; we only read the calendar date.
  const anchor = Date.UTC(y, m - 1, d, 12, 0, 0)
  for (let i = 0; i <= countDays; i++) {
    const dt = new Date(anchor + i * 86400000)
    out.push(`${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`)
  }
  return out
}

/** Convert a wall-clock (dateKey + minute-of-day) in `tz` to the correct UTC instant (ISO). DST-safe. */
export function wallClockToUtcISO(dateKey: string, minute: number, tz: string = DEFAULT_TIMEZONE): string {
  const [y, mo, d] = dateKey.split("-").map(Number)
  const h = Math.floor(minute / 60)
  const mi = minute % 60
  const asUTC = Date.UTC(y, mo - 1, d, h, mi, 0)
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: tz, hour12: false, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
      .formatToParts(asUTC)
      .map((x) => [x.type, x.value]),
  )
  let hour = Number(p.hour)
  if (hour === 24) hour = 0 // some engines format midnight as 24
  const asTz = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), hour, Number(p.minute), Number(p.second))
  return new Date(asUTC - (asTz - asUTC)).toISOString()
}

/** Effective first-horizon length (days) to generate on save. Rolling — capped at DEFAULT_HORIZON_DAYS
 *  even for "until stopped" so we never create unbounded records. `durationDays` is the rule's own
 *  end constraint (Infinity for until_stopped). */
export function horizonDays(durationDays: number): number {
  return Math.max(1, Math.min(DEFAULT_HORIZON_DAYS, Math.floor(durationDays)))
}

/** Occurrence count to attempt within the horizon for a given interval (occurrences land on days
 *  0, interval, 2·interval, … ≤ horizon). */
export function maxOccurrencesFor(intervalDays: number, horizon: number): number {
  return Math.floor(horizon / Math.max(1, intervalDays)) + 1
}

/** Least-recently-used ordering of candidate source ids for controlled (non-random) distribution
 *  when multiple recurring sources compete for slots. Sources never used sort first (by a stable
 *  tiebreak); otherwise oldest last-used first. */
export function orderSourcesByLeastRecent(sourceIds: string[], lastUsedAt: Map<string, number>): string[] {
  return [...sourceIds].sort((a, b) => {
    const ta = lastUsedAt.get(a)
    const tb = lastUsedAt.get(b)
    if (ta == null && tb == null) return a < b ? -1 : a > b ? 1 : 0
    if (ta == null) return -1
    if (tb == null) return 1
    return ta - tb || (a < b ? -1 : 1)
  })
}
