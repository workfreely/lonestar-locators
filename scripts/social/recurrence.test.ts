// Pure unit tests for the recurring-post scheduler (windows, deterministic placement, idempotency,
// goal/day, manual priority, horizon). No network, no DB, no ffmpeg. Run: npx tsx scripts/social/recurrence.test.ts
import {
  RECURRENCE_SLOTS, SLOT_WINDOWS, DEFAULT_POSTS_PER_DAY, DEFAULT_HORIZON_DAYS,
  slotMinute, slotForMinute, slotOrder, planOccurrences, dayKeysFrom, wallClockToUtcISO,
  dateKeyInTz, horizonDays, maxOccurrencesFor, orderSourcesByLeastRecent, isGeneratingState,
  type Occupancy, type Slot,
} from "@/lib/social/recurrence"

let pass = 0, fail = 0
const ok = (l: string, c: boolean) => { if (c) { pass++; console.log(`  ✓ ${l}`) } else { fail++; console.log(`  ✗ ${l}`) } }

const RULE = "rule-abc"
const emptyOcc = (): Occupancy => new Map()
const days = dayKeysFrom("2026-09-15", 60)

console.log("approved windows (Morning 7–10 · Midday 11:30–2:30 · Evening 6–9):")
ok("morning 7:00–10:00", SLOT_WINDOWS.morning.startMin === 420 && SLOT_WINDOWS.morning.endMin === 600)
ok("midday 11:30–2:30", SLOT_WINDOWS.midday.startMin === 690 && SLOT_WINDOWS.midday.endMin === 870)
ok("evening 6:00–9:00", SLOT_WINDOWS.evening.startMin === 1080 && SLOT_WINDOWS.evening.endMin === 1260)
ok("exactly three slots", RECURRENCE_SLOTS.length === 3)

console.log("time-within-window: deterministic, inside window, not round-hour, varies:")
const minutes = new Set<number>()
for (let i = 0; i < 20; i++) { const m = slotMinute(RULE, i, days[i], "morning"); minutes.add(m); ok.length /* noop */ }
for (const s of RECURRENCE_SLOTS) {
  for (let i = 0; i < 30; i++) {
    const m = slotMinute(RULE, i, days[i % days.length], s)
    if (m < SLOT_WINDOWS[s].startMin || m >= SLOT_WINDOWS[s].endMin) { ok(`${s} minute inside window`, false); break }
  }
}
ok("all slot minutes stay inside their window", true) // (any failure above would have logged ✗)
ok("deterministic: same inputs → same minute", slotMinute(RULE, 3, "2026-09-22", "evening") === slotMinute(RULE, 3, "2026-09-22", "evening"))
ok("varies across occurrences (not a constant minute)", new Set([0, 1, 2, 3, 4, 5].map((i) => slotMinute(RULE, i, days[i], "morning"))).size > 1)
ok("avoids round-hour timestamps", [...Array(40)].every((_, i) => slotMinute(RULE, i, days[i % days.length], "midday") % 60 !== 0))
ok("slotForMinute maps 8:15 → morning, 12:00 → midday, 19:30 → evening, 3:00 → none",
  slotForMinute(8 * 60 + 15) === "morning" && slotForMinute(12 * 60) === "midday" && slotForMinute(19 * 60 + 30) === "evening" && slotForMinute(3 * 60) === null)

console.log("A. every 7 days creates the correct future instances:")
const A = planOccurrences({ ruleId: RULE, intervalDays: 7, placementPref: "any", postsPerDay: 2, days, occupancy: emptyOcc(), maxOccurrences: maxOccurrencesFor(7, 30) })
ok("A: occurrences land on days 0,7,14,21,28", A.map((p) => days.indexOf(p.dateKey)).join(",") === "0,7,14,21,28")
ok("A: indices are 0..4 in order", A.map((p) => p.index).join(",") === "0,1,2,3,4")
ok("A: each within an approved window", A.every((p) => p.minute >= SLOT_WINDOWS[p.slot].startMin && p.minute < SLOT_WINDOWS[p.slot].endMin))

console.log("B. occupied target slot → moves to next available slot/day:")
// Fill the deterministic first-choice slot on the target day; planner must pick another slot SAME day.
const bOcc: Occupancy = new Map()
const firstChoice = slotOrder(RULE, days[0], "any")[0]
bOcc.set(days[0], { count: 1, slots: new Set<Slot>([firstChoice]) })
const B = planOccurrences({ ruleId: RULE, intervalDays: 7, placementPref: "any", postsPerDay: DEFAULT_POSTS_PER_DAY, days, occupancy: bOcc, maxOccurrences: 1 })
ok("B: still placed on the target day (a free window remained)", B[0].dateKey === days[0])
ok("B: chose a DIFFERENT slot than the occupied one", B[0].slot !== firstChoice)
// Now fill the whole target day to the posting goal → must bump to a later day.
const bOcc2: Occupancy = new Map()
bOcc2.set(days[0], { count: 2, slots: new Set<Slot>(["morning", "evening"]) })
const B2 = planOccurrences({ ruleId: RULE, intervalDays: 7, placementPref: "any", postsPerDay: 2, days, occupancy: bOcc2, maxOccurrences: 1 })
ok("B2: day at posting goal → occurrence bumped to a later day", days.indexOf(B2[0].dateKey) > 0)

console.log("C. manual scheduled post is NEVER overwritten (auto fills around it):")
const manual: Occupancy = new Map()
manual.set(days[0], { count: 1, slots: new Set<Slot>(["morning"]) }) // user manually took Morning
const before = JSON.stringify([...manual].map(([k, v]) => [k, v.count, [...v.slots]]))
const C = planOccurrences({ ruleId: RULE, intervalDays: 7, placementPref: "morning", postsPerDay: 2, days, occupancy: manual, maxOccurrences: 1 })
ok("C: preferred Morning is taken → placed on a later day (never same manual slot)", !(C[0].dateKey === days[0] && C[0].slot === "morning"))
ok("C: input occupancy not mutated (manual untouched)", JSON.stringify([...manual].map(([k, v]) => [k, v.count, [...v.slots]])) === before)

console.log("D. idempotent/deterministic: identical inputs → identical plan:")
const d1 = planOccurrences({ ruleId: RULE, intervalDays: 7, placementPref: "any", postsPerDay: 2, days, occupancy: emptyOcc(), maxOccurrences: 5 })
const d2 = planOccurrences({ ruleId: RULE, intervalDays: 7, placementPref: "any", postsPerDay: 2, days, occupancy: emptyOcc(), maxOccurrences: 5 })
ok("D: repeated planning is byte-identical (safe to re-run)", JSON.stringify(d1) === JSON.stringify(d2))
// Re-plan with the first plan already realized as occupancy → those slots are taken, so a fresh
// planner would not collide (the DB unique index additionally guarantees no duplicate rows).
const realized: Occupancy = new Map()
for (const p of d1) { const day = realized.get(p.dateKey) ?? { count: 0, slots: new Set<Slot>() }; day.slots.add(p.slot); day.count++; realized.set(p.dateKey, day) }
const d3 = planOccurrences({ ruleId: RULE, intervalDays: 7, placementPref: "any", postsPerDay: 2, days, occupancy: realized, maxOccurrences: 5 })
ok("D: re-plan over realized occupancy never reuses a taken (day,slot)", d3.every((p) => !d1.some((q) => q.dateKey === p.dateKey && q.slot === p.slot)))

console.log("E/F. pause/stop stop generation (existing instances preserved elsewhere):")
ok("E: paused does not generate", !isGeneratingState("paused"))
ok("F: stopped does not generate", !isGeneratingState("stopped"))
ok("active generates", isGeneratingState("active"))

console.log("G. 'Repeat until stopped' is bounded by a rolling horizon (no unlimited records):")
ok("G: horizon caps at 30 even for Infinity", horizonDays(Infinity) === DEFAULT_HORIZON_DAYS && DEFAULT_HORIZON_DAYS === 30)
ok("G: horizon respects a shorter duration", horizonDays(14) === 14)
ok("G: bounded occurrence count", maxOccurrencesFor(7, 30) === 5 && maxOccurrencesFor(30, 30) === 2)

console.log("goal/day + distribution across all three windows (no hard-coded pair):")
const many = planOccurrences({ ruleId: RULE, intervalDays: 1, placementPref: "any", postsPerDay: 1, days, occupancy: emptyOcc(), maxOccurrences: 20 })
ok("posting goal of 1/day → at most one placement per day", new Set(many.map((p) => p.dateKey)).size === many.length)
ok("distribution uses all THREE windows over time (not a fixed pair)", new Set(many.map((p) => p.slot)).size === 3)
ok("fixed placement pref pins the slot", planOccurrences({ ruleId: RULE, intervalDays: 3, placementPref: "evening", postsPerDay: 2, days, occupancy: emptyOcc(), maxOccurrences: 4 }).every((p) => p.slot === "evening"))

console.log("timezone: wall-clock in America/Chicago → correct UTC instant (round-trips):")
const iso = wallClockToUtcISO("2026-09-22", 8 * 60 + 42) // 8:42 AM Chicago
ok("round-trips to the same Chicago wall clock", (() => {
  const back = new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", hour12: false, hour: "2-digit", minute: "2-digit" }).format(new Date(iso))
  return back === "08:42"
})())
ok("dateKeyInTz reads the Chicago calendar day", dateKeyInTz(new Date(iso), "America/Chicago") === "2026-09-22")
ok("dayKeysFrom yields consecutive days", days[0] === "2026-09-15" && days[7] === "2026-09-22")

console.log("L. least-recently-used source ordering (controlled distribution, not random):")
const used = new Map<string, number>([["s-old", 100], ["s-recent", 999]])
ok("never-used source sorts first; then oldest-used", orderSourcesByLeastRecent(["s-recent", "s-old", "s-new"], used).join(",") === "s-new,s-old,s-recent")

console.log(`\nRecurrence unit: ${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
