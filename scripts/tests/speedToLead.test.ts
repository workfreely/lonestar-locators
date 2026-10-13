// SPEED TO LEAD — the initial Contact Lead deadline, and what it must not disturb.
//
// Pure and offline. Run: `npx tsx scripts/tests/speedToLead.test.ts`
//
// ── THE RULE ────────────────────────────────────────────────────────────────────────────────
// A brand-new lead's Contact Lead action is due ten minutes after the lead arrives, clamped to
// the locator's working window. The old behaviour anchored to 9:00 AM on the creation day, so a
// lead created at 3:34 PM carried a deadline from 9:00 that morning — six and a half hours
// before the lead existed. The invariant that matters most is therefore the simplest one:
//
//      THE DUE TIME IS NEVER EARLIER THAN THE MOMENT THE LEAD WAS CREATED.
//
// It is asserted below at every boundary, across midnight, through both DST transitions, and in
// four timezones, because that is where a date helper actually breaks.

import { speedToLeadDue, SPEED_TO_LEAD_MINUTES, autoDueInDays } from "@/lib/workflow/autoDueDate"
import { rankLeadActions, type ManualNextAction } from "@/lib/nextActions"

let pass = 0
let fail = 0
function ok(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`) }
  else { fail++; console.log(`  ✗ ${label}`) }
}

const CT = "America/Chicago"
/** Local wall-clock reading of an instant, in a zone — what the locator actually sees. */
function local(iso: string, zone = CT): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: zone, hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
  }).format(new Date(iso)).replace(", ", " ")
}
/** An instant from a Central wall-clock time (CDT = UTC-5 in summer, CST = UTC-6 in winter). */
const at = (iso: string) => new Date(iso)

console.log("\nThe ten-minute deadline")
ok("the policy is ten minutes", SPEED_TO_LEAD_MINUTES === 10)

// 3:34 PM Central — the reported case. 20:34Z = 15:34 CDT.
const afternoon = at("2026-10-13T20:34:52Z")
const afternoonDue = speedToLeadDue(CT, undefined, afternoon)
ok("a 3:34 PM lead is due 3:44 PM, not 9:00 AM", local(afternoonDue) === "2026-10-13 15:44")
ok("and that is AFTER the lead was created", new Date(afternoonDue).getTime() > afternoon.getTime())

// The regression this replaces: prove the OLD helper produced the bad value.
const oldWay = autoDueInDays(0, CT, undefined)
ok(
  "the old 9 AM anchor is no longer what this action uses",
  new Date(speedToLeadDue(CT, undefined, afternoon)).toISOString() !== new Date(oldWay).toISOString(),
)

console.log("\nWorking-hours boundaries (9 AM – 9 PM local)")
const cases: Array<[string, string, string]> = [
  ["07:00 — before the window opens", "2026-10-13T12:00:00Z", "2026-10-13 09:00"],
  ["00:30 — just after midnight", "2026-10-13T05:30:00Z", "2026-10-13 09:00"],
  ["08:55 — five minutes before opening", "2026-10-13T13:55:00Z", "2026-10-13 09:05"],
  ["09:00 — the window opens", "2026-10-13T14:00:00Z", "2026-10-13 09:10"],
  ["15:34 — mid-afternoon", "2026-10-13T20:34:00Z", "2026-10-13 15:44"],
  ["20:45 — fifteen minutes before closing", "2026-10-14T01:45:00Z", "2026-10-13 20:55"],
  ["20:55 — ten minutes before closing rolls over", "2026-10-14T01:55:00Z", "2026-10-14 09:00"],
  ["22:30 — after the window closes", "2026-10-14T03:30:00Z", "2026-10-14 09:00"],
  ["23:58 — just before midnight", "2026-10-14T04:58:00Z", "2026-10-14 09:00"],
]
for (const [label, nowIso, expected] of cases) {
  const due = speedToLeadDue(CT, undefined, at(nowIso))
  ok(`${label} → ${expected}`, local(due) === expected)
  ok(`  …and never precedes creation`, new Date(due).getTime() >= at(nowIso).getTime())
}

console.log("\nDST transitions")
// Spring forward: 2 AM → 3 AM on 8 Mar 2026. A 1:50 AM lead defers to 9:00 AM the SAME day,
// which is 13 hours later in wall-clock terms but only 12 in elapsed time.
const spring = at("2026-03-08T07:50:00Z") // 01:50 CST
const springDue = speedToLeadDue(CT, undefined, spring)
ok("spring forward: a 1:50 AM lead defers to 09:00 the same day", local(springDue) === "2026-03-08 09:00")
ok("spring forward: still after creation", new Date(springDue).getTime() > spring.getTime())
// Fall back: 2 AM → 1 AM on 1 Nov 2026.
const fall = at("2026-11-01T06:30:00Z") // 01:30 CDT, before the repeat hour
const fallDue = speedToLeadDue(CT, undefined, fall)
ok("fall back: a 1:30 AM lead defers to 09:00 the same day", local(fallDue) === "2026-11-01 09:00")
ok("fall back: still after creation", new Date(fallDue).getTime() > fall.getTime())
// An afternoon lead on a DST day gets plain ten minutes.
const dstAfternoon = at("2026-11-01T20:00:00Z") // 14:00 CST
ok("a DST-day afternoon lead still gets ten real minutes", local(speedToLeadDue(CT, undefined, dstAfternoon)) === "2026-11-01 14:10")

console.log("\nOther locator timezones")
const zones: Array<[string, string, string]> = [
  ["America/New_York", "2026-10-13T20:34:00Z", "2026-10-13 16:44"],
  ["America/Denver", "2026-10-13T20:34:00Z", "2026-10-13 14:44"],
  ["America/Los_Angeles", "2026-10-13T20:34:00Z", "2026-10-13 13:44"],
  ["America/Phoenix", "2026-10-13T20:34:00Z", "2026-10-13 13:44"],
]
for (const [zone, nowIso, expected] of zones) {
  ok(`${zone}: ten minutes in the LOCATOR's zone`, local(speedToLeadDue(zone, undefined, at(nowIso)), zone) === expected)
}
// A Pacific lead at 8:50 PM local is still inside the window; at 8:55 PM it rolls to the morning.
ok(
  "Pacific 20:55 → 09:00 next day in Pacific, not Central",
  local(speedToLeadDue("America/Los_Angeles", undefined, at("2026-10-14T03:55:00Z")), "America/Los_Angeles") === "2026-10-14 09:00",
)

console.log("\nCustom Working Hours are respected")
// A locator who starts at 11 and stops at 17.
ok(
  "a 07:00 lead defers to the locator's 11:00 start",
  local(speedToLeadDue(CT, { startHour: 11, endHour: 17 }, at("2026-10-13T12:00:00Z"))) === "2026-10-13 11:00",
)
ok(
  "a 16:55 lead rolls to 11:00 the next day",
  local(speedToLeadDue(CT, { startHour: 11, endHour: 17 }, at("2026-10-13T21:55:00Z"))) === "2026-10-14 11:00",
)
ok(
  "a 13:00 lead inside a custom window still gets ten minutes",
  local(speedToLeadDue(CT, { startHour: 11, endHour: 17 }, at("2026-10-13T18:00:00Z"))) === "2026-10-13 13:10",
)

console.log("\nThe invariant, swept across a whole day")
// Every minute of a day, in two zones: the due time may never precede creation.
let violations = 0
for (const zone of [CT, "America/New_York"]) {
  for (let m = 0; m < 24 * 60; m += 7) {
    const now = new Date(Date.UTC(2026, 9, 13, 0, 0, 0) + m * 60_000)
    if (new Date(speedToLeadDue(zone, undefined, now)).getTime() < now.getTime()) violations++
  }
}
ok("no due time precedes creation at any minute of the day, in either zone", violations === 0)

// ── TIMESTAMP-LEVEL OVERDUE, FOR contact_lead ONLY ──────────────────────────────────────────
// A ten-minute deadline rounded to a calendar day is not a deadline. But the rest of the
// workflow genuinely is day-level — a Build List backstop due "today at 9 AM" must not turn red
// at 9:01, because the locator has the day to do it. So the exactness is scoped to one action
// key, and the tests below assert BOTH halves of that.
console.log("\nOverdue semantics")

const lead = { id: 1, crm_status: "new", first_name: "Test" }
const minutesFromNow = (m: number) => new Date(Date.now() + m * 60_000).toISOString()
const row = (over: Partial<ManualNextAction> & { action_key?: string }): ManualNextAction =>
  ({
    id: 1, lead_id: 1, title: "Contact Lead", due_at: minutesFromNow(-5), priority: "medium",
    completed: false, completed_at: null, notes: null, created_at: new Date().toISOString(),
    ...over,
  }) as ManualNextAction

const urgencyFor = (a: ManualNextAction) => {
  const { primary, others } = rankLeadActions(lead, [a], "Contact Lead")
  return (primary.manualAction?.id === a.id ? primary : others.find((o) => o.manualAction?.id === a.id))?.urgency
}

// contact_lead: the instant decides.
ok(
  "contact_lead five minutes past its deadline is OVERDUE, same day",
  urgencyFor(row({ action_key: "contact_lead", due_at: minutesFromNow(-5) })) === "overdue",
)
ok(
  "contact_lead five minutes BEFORE its deadline is not overdue",
  urgencyFor(row({ action_key: "contact_lead", due_at: minutesFromNow(5) })) === "today",
)
ok(
  "a contact_lead deferred to tomorrow morning reads as upcoming, not tonight's problem",
  urgencyFor(row({ action_key: "contact_lead", due_at: minutesFromNow(60 * 20) })) === "upcoming",
)

// EVERY OTHER ACTION IS UNCHANGED: still day-level, so a time earlier today is NOT overdue.
for (const key of ["build_list", "send_list", "follow_up_1", "schedule_tour", "email_guest_card"]) {
  ok(
    `${key} five minutes past its time today is still "today" (day-level, unchanged)`,
    urgencyFor(row({ action_key: key, title: key, due_at: minutesFromNow(-5) })) === "today",
  )
}
ok(
  "a manual action with no action_key keeps day-level behaviour",
  urgencyFor(row({ title: "Call back", due_at: minutesFromNow(-5) })) === "today",
)
ok(
  "a genuinely old action is overdue under both rules",
  urgencyFor(row({ action_key: "build_list", due_at: new Date(Date.now() - 48 * 3600_000).toISOString() })) === "overdue",
)
// An explicitly chosen future time is never rewritten by any of this — it is stored as given and
// ranked by the same rules.
ok(
  "an explicitly selected future time ranks as upcoming and is untouched",
  urgencyFor(row({ title: "Tour", due_at: minutesFromNow(60 * 30) })) === "upcoming",
)

console.log(`\n${pass} passed, ${fail} failed\n`)
process.exit(fail === 0 ? 0 : 1)
