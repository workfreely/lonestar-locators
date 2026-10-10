// WHAT IS ALREADY ON THE CALENDAR — the input that makes a repeating planner idempotent.
//
// ── THE DEFECT THIS CLOSES ───────────────────────────────────────────────────────────────────
// planAutopilot has always accepted `occupancyByConnection`, and planDailyTimes has always honoured
// it ("the approved window is occupied — manual wins"). NOTHING EVER POPULATED IT. With a single
// manual caller that was invisible: one run against an empty calendar needs no occupancy.
//
// A repeating trigger exposes it immediately. Run 1 fills slots 1..5. Run 2's pool no longer
// contains those posts (they are scheduled, so ineligible), but it regenerates the SAME slot list
// from an empty occupancy and assigns the next five posts to slots 1..5 again. Every one of those
// claims hits social_posts_connection_slot_uidx and comes back 23505 → `slot_taken`. Nothing is
// double-booked — the database holds — but nothing new is scheduled either. The queue would never
// grow past its first run, and would report a pile of rejections while doing it.
//
// So this module is not a new scheduling rule. It is the missing argument to an existing parameter.
//
// ── TWO KINDS OF OCCUPIED ────────────────────────────────────────────────────────────────────
//   1. A real row already holds the minute — scheduled, publishing, or published. Published rows
//      count: they keep their scheduled_at, and this morning's 7:30 is spent whether or not the
//      post is still "scheduled".
//   2. The minute has simply PASSED. The trigger replenishes UPCOMING slots; a run at 14:00 must
//      not drop a post into today's 07:30, which is in the past. Without this the publish worker
//      would find scheduled_at <= now on its very next tick and the 7:30 intent would be gone.
//      (isWithinLatenessWindow would likely refuse it, which turns a wrong publish into a post
//      wedged in the past — better, still wrong.)
//
// Both are expressed through the EXISTING Occupancy shape, so planDailyTimes needs no change and
// treats an elapsed slot exactly as it already treats a manually-occupied one: it bumps forward.
//
// ── PER CONNECTION, NOT PER OWNER ────────────────────────────────────────────────────────────
// generateRecurrence has a private owner-scoped buildOccupancy for single-post auto-placement. It
// is deliberately not reused here and not modified: the thing that cannot be double-booked is a
// DESTINATION's minute — which is also exactly what social_posts_connection_slot_uidx keys on —
// and two accounts owned by one person may legitimately post at the same instant.
import {
  dateKeyInTz, slotForMinute, DEFAULT_TIMEZONE,
  type Occupancy, type DayOccupancy, type Slot,
} from "@/lib/social/recurrence"
import { effectiveDailyTimes, BASELINE_DAILY_TIMES } from "@/lib/social/autopilotDestination"

/** The per-connection facts needed to know which of TODAY's times have already elapsed. The
 *  stagger and baseline must be the same values the planner will use, or the minute marked spent
 *  is not the minute it tries to fill. */
export type OccupancyConnection = {
  connectionId: string
  staggerOffsetMinutes: number | null
  dailyTimes?: readonly number[]
  timezone?: string
}

/** A scheduled row, reduced to what occupancy cares about. */
export type ScheduledRow = { connection_id: string | null; scheduled_at: string | null }

function dayOf(occ: Occupancy, dateKey: string): DayOccupancy {
  const d = occ.get(dateKey) ?? { count: 0, slots: new Set<Slot>(), minutes: new Set<number>() }
  occ.set(dateKey, d)
  return d
}

/** Mark one minute on one day as taken, exactly as generateRecurrence's builder does: the EXACT
 *  minute (a daily_times rule at 7:30 must be able to see 7:30 itself is gone) and the approved
 *  window, which three slots cannot express on their own. */
function occupy(occ: Occupancy, dateKey: string, minute: number): void {
  const day = dayOf(occ, dateKey)
  day.minutes.add(minute)
  const slot = slotForMinute(minute)
  if (slot) day.slots.add(slot)
  day.count += 1
}

/** The wall-clock minute of an instant in a timezone. */
function minuteInTz(d: Date, tz: string): number {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: tz, hour12: false, hour: "2-digit", minute: "2-digit" })
      .formatToParts(d).map((x) => [x.type, x.value]),
  )
  return (Number(p.hour) % 24) * 60 + Number(p.minute)
}

/**
 * PURE. Build the occupancy map from rows plus the clock. No I/O, so the elapsed-slot behaviour is
 * testable at any hour of any day without a database.
 *
 * Every listed connection gets an entry, even an empty one: an absent key and an empty map mean the
 * same thing to the planner, but a present key proves this ran for that connection.
 */
export function occupancyFromRows(input: {
  rows: readonly ScheduledRow[]
  connections: readonly OccupancyConnection[]
  now: Date
}): Map<string, Occupancy> {
  const byConnection = new Map<string, Occupancy>()
  for (const c of input.connections) byConnection.set(c.connectionId, new Map())

  // 1. REAL ROWS. Any row holding a minute on a destination, whatever its status — a published post
  //    has spent its slot as surely as a pending one.
  for (const r of input.rows) {
    if (!r.connection_id || !r.scheduled_at) continue
    const occ = byConnection.get(r.connection_id)
    // A row for a connection we were not asked about is ignored rather than creating a phantom
    // entry: the planner only consults the connections it has rules for.
    if (!occ) continue
    const d = new Date(r.scheduled_at)
    if (Number.isNaN(d.getTime())) continue
    const conn = input.connections.find((c) => c.connectionId === r.connection_id)
    const tz = conn?.timezone ?? DEFAULT_TIMEZONE
    occupy(occ, dateKeyInTz(d, tz), minuteInTz(d, tz))
  }

  // 2. ELAPSED TIMES TODAY. Only today's — tomorrow's 7:30 has not passed, and yesterday's is
  //    outside the planning window, which starts at today.
  for (const c of input.connections) {
    const tz = c.timezone ?? DEFAULT_TIMEZONE
    const occ = byConnection.get(c.connectionId)
    if (!occ) continue
    const todayKey = dateKeyInTz(input.now, tz)
    const nowMinute = minuteInTz(input.now, tz)
    for (const t of effectiveDailyTimes(c.connectionId, c.staggerOffsetMinutes, c.dailyTimes ?? BASELINE_DAILY_TIMES)) {
      // STRICTLY PAST. `t === nowMinute` is left open: a trigger firing exactly on the minute may
      // still fill that minute, which is the one case where filling "now" is correct rather than
      // retroactive.
      if (t < nowMinute) occupy(occ, todayKey, t)
    }
  }

  return byConnection
}

/** The narrowest client this module needs — kept local so tests need no Supabase SDK. */
export type OccupancyClient = {
  from: (t: string) => {
    select: (c: string) => {
      not: (c: string, op: "is", v: null) => PromiseLike<{ data: ScheduledRow[] | null; error: { message: string } | null }>
    }
  }
}

/**
 * Read the calendar and build the occupancy map.
 *
 * READ ONLY — one SELECT, no writes, nothing claimed. Safe to call on a dry run, and it is: the dry
 * run must see the same occupied slots the persist would, or the preview would promise placements
 * the real run cannot make.
 */
export async function buildAutopilotOccupancy(
  client: OccupancyClient,
  input: { connections: readonly OccupancyConnection[]; now?: Date },
): Promise<Map<string, Occupancy>> {
  const now = input.now ?? new Date()
  if (input.connections.length === 0) return new Map()
  const { data } = await client
    .from("social_posts")
    .select("connection_id, scheduled_at")
    .not("scheduled_at", "is", null)
  return occupancyFromRows({ rows: data ?? [], connections: input.connections, now })
}
