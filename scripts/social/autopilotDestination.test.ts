// Per-connected-account scheduling identity: stagger (WHEN) and market rotation (WHAT ORDER).
//
// The property under test throughout is STABILITY. Time-of-day and market performance can only be
// measured if an account's times and market order are the same every day — so nothing here may
// depend on the date, and the same connection id must always produce the same answer.
import { staggerOffsetMinutes, effectiveDailyTimes, marketOrderFor, fnv1a, BASELINE_DAILY_TIMES, STAGGER_SPREAD_MINUTES } from "@/lib/social/autopilotDestination"
import { normalizeDailyTimes, slotForMinute, planDailyTimes, dayKeysFrom } from "@/lib/social/recurrence"

let pass = 0, fail = 0
const ok = (l: string, c: boolean, d = "") => { if (c) { pass++; console.log("  ✓", l) } else { fail++; console.log("  ✗", l + (d ? ` — ${d}` : "")) } }
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`
const A = "5ea0e810-1111-4111-8111-111111111111"
const B = "ebf475cf-2222-4222-8222-222222222222"
const C = "0c0ffee0-3333-4333-8333-333333333333"

console.log("baseline:")
ok("baseline is 07:30 and 19:30", BASELINE_DAILY_TIMES[0] === 450 && BASELINE_DAILY_TIMES[1] === 1170)
ok("an explicit 0 means EXACTLY the baseline (the primary account)", effectiveDailyTimes(A, 0).join(",") === "450,1170")
ok("…which is 07:30 / 19:30", effectiveDailyTimes(A, 0).map(hhmm).join(" / ") === "07:30 / 19:30")

console.log("\nderived stagger — positive, never zero, within 30:")
for (const id of [A, B, C]) {
  const off = staggerOffsetMinutes(id, null)
  ok(`${id.slice(0, 8)} → +${off} (${effectiveDailyTimes(id, null).map(hhmm).join(" / ")})`, off >= 1 && off <= STAGGER_SPREAD_MINUTES)
}
// The derived range starts at 1 so a derived account can NEVER land on the baseline a pinned
// account occupies. Checked across many ids, not just the three above.
{
  const offs = Array.from({ length: 500 }, (_, i) => staggerOffsetMinutes(`conn-${i}-${i * 7919}`, null))
  ok("500 ids: every derived offset is 1..30", offs.every((o) => o >= 1 && o <= 30))
  ok("500 ids: NONE is 0, so none can collide with a baseline-pinned account", offs.every((o) => o !== 0))
  ok("500 ids: the spread is actually used (not all one value)", new Set(offs).size > 20, String(new Set(offs).size))
  ok("500 ids: every offset is storable in stagger_offset_minutes (0..1440)", offs.every((o) => o >= 0 && o <= 1440))
}

console.log("\nSTABILITY — the whole point:")
ok("same connection id → same offset, every call", staggerOffsetMinutes(B, null) === staggerOffsetMinutes(B, null))
ok("different connections → generally different offsets", staggerOffsetMinutes(A, null) !== staggerOffsetMinutes(B, null))
// No date is an input anywhere, so there is nothing that COULD vary by day.
ok("the offset function takes no date argument", staggerOffsetMinutes.length === 2)
ok("explicit overrides win over the derived value", staggerOffsetMinutes(B, 7) === 7)
ok("an explicit 0 is honoured, not treated as absent", staggerOffsetMinutes(B, 0) === 0)
ok("a negative explicit value is clamped to 0, never earlier than baseline", staggerOffsetMinutes(B, -15) === 0)

console.log("\nthe stagger keeps both times inside the approved windows:")
{
  const ids = Array.from({ length: 200 }, (_, i) => `c-${i}`)
  const all = ids.map((i) => effectiveDailyTimes(i, null))
  ok("every AM time lands in the morning window", all.every((t) => slotForMinute(t[0]) === "morning"), hhmm(all[0][0]))
  ok("every PM time lands in the evening window", all.every((t) => slotForMinute(t[1]) === "evening"), hhmm(all[0][1]))
  ok("times are sorted, so AM is always first", all.every((t) => t[0] < t[1]))
  ok("every emitted time survives normalizeDailyTimes (none dropped as out of range)",
    all.every((t) => normalizeDailyTimes(t).length === 2))
}

console.log("\nit feeds the EXISTING scheduler — no new timing mode:")
{
  // The integration is simply: shifted minutes in, placements out. planDailyTimes is unchanged.
  const times = effectiveDailyTimes(B, null)
  const days = dayKeysFrom("2026-10-08", 5)
  const placements = planDailyTimes({ intervalDays: 1, dailyTimes: times, days, occupancy: new Map(), maxOccurrences: 6 })
  ok("planDailyTimes accepts the staggered times unmodified", placements.length === 6)
  ok("it produces exactly the account's two minutes, every day",
    placements.every((p) => times.includes(p.minute)))
  ok("AM then PM, chronologically within a day",
    placements[0].minute === times[0] && placements[1].minute === times[1] && placements[0].dateKey === placements[1].dateKey)
  ok("the same minutes repeat on later days — stable day to day",
    placements[2].minute === times[0] && placements[2].dateKey !== placements[0].dateKey)
  // An occupied slot advances to that account's NEXT fixed slot, never to an arbitrary minute.
  const occ = new Map([[days[0], { count: 1, slots: new Set(["morning" as const]), minutes: new Set([times[0]]) }]])
  const bumped = planDailyTimes({ intervalDays: 1, dailyTimes: times, days, occupancy: occ, maxOccurrences: 2 })
  ok("an occupied AM slot moves to the next DAY at the same time, not a nearby minute",
    bumped[0].minute === times[0] && bumped[0].dateKey === days[1])
  ok("…and that day's PM slot is still filled independently", bumped[1].minute === times[1] && bumped[1].dateKey === days[0])
}

console.log("\nmarket rotation — inverted per account:")
{
  const MARKETS = ["Dallas", "San Antonio"]
  // Pinned seeds reproduce the requested arrangement exactly.
  ok("seed 0 → Dallas AM / San Antonio PM", marketOrderFor(A, MARKETS, 0).join(" / ") === "Dallas / San Antonio")
  ok("seed 1 → San Antonio AM / Dallas PM (inverted)", marketOrderFor(B, MARKETS, 1).join(" / ") === "San Antonio / Dallas")
  ok("two different seeds on two markets always invert",
    marketOrderFor(A, MARKETS, 0)[0] !== marketOrderFor(B, MARKETS, 1)[0])
  ok("rotation is stable for a connection", marketOrderFor(C, MARKETS).join() === marketOrderFor(C, MARKETS).join())
  ok("it is a ROTATION — every market still appears, none dropped",
    [...marketOrderFor(C, MARKETS)].sort().join() === [...MARKETS].sort().join())
  // Three markets rotate too, so this is not a two-market special case.
  const M3 = ["Dallas", "San Antonio", "Houston"]
  ok("three markets rotate without loss", [...marketOrderFor(C, M3)].sort().join() === [...M3].sort().join())
  ok("seed 2 of three rotates by two", marketOrderFor(A, M3, 2).join() === "Houston,Dallas,San Antonio")
  ok("an out-of-range seed wraps instead of throwing", marketOrderFor(A, M3, 7).length === 3)
  ok("a negative seed wraps to a valid rotation", marketOrderFor(A, M3, -1).length === 3)
  ok("no markets → empty, never a crash", marketOrderFor(A, []).length === 0)
  // Austin has no content today; the planner filters the pool, so an absent market simply never
  // reaches this function — it must not need special-casing here.
  ok("rotation does not special-case any market name",
    marketOrderFor(A, ["Austin", "Dallas"], 0).join() === "Austin,Dallas")
}

console.log("\nfnv1a is the SAME primitive the existing scheduler uses:")
ok("stable across calls", fnv1a("abc") === fnv1a("abc"))
ok("differs on different input", fnv1a("abc") !== fnv1a("abd"))
ok("always a 32-bit unsigned value", [fnv1a(""), fnv1a("x"), fnv1a(A)].every((h) => h >= 0 && h <= 0xffffffff))

console.log(`\nAutopilot destination: ${pass} passed, ${fail} failed`)
if (fail) process.exit(1)
