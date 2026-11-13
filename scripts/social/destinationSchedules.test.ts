// SOCIAL BEAST — INDEPENDENT PER-DESTINATION SCHEDULES (Phase 2).
//
// Four destinations across two brands, each with its own schedule, its own daily limit and its own
// pause switch:
//
//   Real Estate Pro   Instagram @realestatepro_tx   every market   2/day   07:30 / 19:30
//   Real Estate Pro   TikTok                        every market   2/day   07:30 / 19:30
//   Locator Beast     Instagram @locatorbeast       Dallas only    2/day   07:30 / 19:30 (+stagger)
//   Locator Beast     TikTok                        Dallas only    2/day   07:30 / 19:30 (+stagger)
//
// THREE DEFECTS, all of them cross-destination coupling:
//
//   1. posts_per_day DID NOT MEAN POSTS PER DAY. The per-day count is dailyTimes.length, and the
//      column was never wired to it — it only capped `maxDays * postsPerDay`, the total across the
//      horizon. So 1 meant "two a day for half the horizon, then nothing", and 3 meant two.
//   2. IT WAS SHARED. The planner took `Math.min(...groupRules.map(r => r.postsPerDay), 3)` — one
//      number for a whole platform — so setting @locatorbeast to 1 halved @realestatepro_tx's queue.
//   3. posting_paused WAS NOT ENFORCED AT PUBLISH TIME on TikTok at all. Planning excluded a paused
//      destination, so a pause kept NEW posts off the queue, but anything already queued published
//      regardless — and the manual TikTok button ignored it too.
//
// And one found while verifying requirement 8: wallClockToUtcISO was an hour late on every
// spring-forward day. See its own section.
//
// Run: npx tsx scripts/social/destinationSchedules.test.ts
import { readFileSync } from "node:fs"
import { execSync } from "node:child_process"
import { planAutopilot, type AutopilotRule, type PoolPost } from "@/lib/social/autopilotPlanner"
import { planRotation } from "@/lib/social/autopilotRotation"
import { occupancyFromRows } from "@/lib/social/autopilotOccupancy"
import {
  dailyTimesForPostsPerDay, destinationCadence, effectiveDailyTimes, staggerOffsetMinutes,
  BASELINE_DAILY_TIMES, STAGGER_SPREAD_MINUTES,
} from "@/lib/social/autopilotDestination"
import {
  wallClockToUtcISO, dateKeyInTz, dayKeysFrom, slotForMinute, SLOT_WINDOWS, DEFAULT_TIMEZONE,
} from "@/lib/social/recurrence"

let pass = 0, fail = 0
const ok = (what: string, cond: boolean, detail = "") => {
  if (cond) { pass++; console.log(`  ✓ ${what}`) } else { fail++; console.log(`  ✗ ${what}${detail ? ` — ${detail}` : ""}`) }
}
const eq = (what: string, got: unknown, want: unknown) =>
  ok(what, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`)

const read = (p: string) => readFileSync(`${process.cwd()}/${p}`, "utf8")
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1")
const IG_WORKER = code(read("app/api/cron/social-instagram-publish/route.ts"))
const TT_WORKER = code(read("app/api/cron/social-tiktok-publish/route.ts"))
const PLANNER = code(read("lib/social/autopilotPlanner.ts"))
const PLAN_RUN = code(read("lib/social/autopilotPlanRun.ts"))

const TZ = "America/Chicago"
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`
/** The local wall-clock time an ISO instant lands on, in Central. */
const localOf = (iso: string) =>
  new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour12: false, hour: "2-digit", minute: "2-digit" }).format(new Date(iso))

// The four destinations.
const REP_IG = "rep-instagram", REP_TT = "rep-tiktok"
const LB_IG = "lb-instagram", LB_TT = "lb-tiktok"

const READY = {
  status: "ready", renderStatus: "ready", renderedStoragePath: "p/x.mp4", scheduledAt: null,
  publishedAt: null, externalPostId: null, connectionId: null, approvedAt: "2026-10-01T00:00:00Z",
}
const post = (id: string, market: string | null, platform = "instagram", place = id): PoolPost =>
  ({ id, sourceContentId: `src-${id}`, placeId: `place-${place}`, market, propertyName: id, ...READY, platform })

const rule = (connectionId: string, over: Partial<AutopilotRule> = {}): AutopilotRule => ({
  connectionId, platform: "instagram", enabled: true, timezone: DEFAULT_TIMEZONE,
  dailyTimes: BASELINE_DAILY_TIMES, postsPerDay: 2, marketWeights: {},
  allowedMarkets: null, marketRotationSeed: null, staggerOffsetMinutes: 0, startIndex: 0, ...over,
})
/** A rule as computeAutopilotPlan would build it: the times follow from posts_per_day. */
const liveRule = (connectionId: string, postsPerDay: number | null, over: Partial<AutopilotRule> = {}): AutopilotRule =>
  rule(connectionId, {
    postsPerDay: postsPerDay ?? BASELINE_DAILY_TIMES.length,
    dailyTimes: dailyTimesForPostsPerDay(postsPerDay),
    ...over,
  })

const plan = (rules: AutopilotRule[], pool: PoolPost[], over: { maxDays?: number; occupancy?: Map<string, Map<string, { count: number; slots: Set<never>; minutes: Set<number> }>>; start?: string } = {}) =>
  planAutopilot({
    rules, pool, startDateKey: over.start ?? "2026-11-16", wallClockToUtc: wallClockToUtcISO,
    maxDays: over.maxDays ?? 4,
    occupancyByConnection: over.occupancy as never,
  })

const DALLAS = Array.from({ length: 20 }, (_, i) => post(`d${i}`, "Dallas"))
const MIXED = [...DALLAS, ...Array.from({ length: 10 }, (_, i) => post(`s${i}`, "San Antonio"))]

// ── 1. posts_per_day MEANS POSTS PER CALENDAR DAY ─────────────────────────────────────────────
console.log("posts_per_day — the column now means what it says:")
{
  eq("2 → both approved times", dailyTimesForPostsPerDay(2), [450, 1170])
  eq("1 → ONE time, the first", dailyTimesForPostsPerDay(1), [450])
  // NULL is what both live destinations carry, and it must keep meaning today's behaviour.
  eq("null → the whole baseline (today's behaviour for every existing destination)", dailyTimesForPostsPerDay(null), BASELINE_DAILY_TIMES)
  eq("undefined → the whole baseline", dailyTimesForPostsPerDay(undefined), BASELINE_DAILY_TIMES)
  eq("0 → the baseline, not silence (a destination is not switched off by a cadence of zero)", dailyTimesForPostsPerDay(0), BASELINE_DAILY_TIMES)
  eq("a negative is ignored", dailyTimesForPostsPerDay(-3), BASELINE_DAILY_TIMES)
  // It CANNOT invent a window. More than two a day needs a per-destination times column.
  eq("3 → still two, because there is no third approved time to place one at", dailyTimesForPostsPerDay(3), [450, 1170])
  const c3 = destinationCadence(3)
  ok("…and the shortfall is reported rather than discovered", c3.capped && c3.requested === 3 && c3.perDay === 2)
  const c2 = destinationCadence(2)
  ok("2 is not a shortfall", !c2.capped && c2.perDay === 2)
  const c1 = destinationCadence(1)
  ok("1 is not a shortfall either", !c1.capped && c1.perDay === 1 && c1.requested === 1)
}

console.log("\n…and the live planner derives each destination's times from its own column:")
{
  ok("computeAutopilotPlan builds dailyTimes from posts_per_day",
    /dailyTimes: dailyTimesForPostsPerDay\(/.test(PLAN_RUN))
  // LOAD-BEARING: the occupancy builder marks today's elapsed times as spent by recomputing them.
  // If it used a different baseline than the planner fills, the minute marked spent would not be
  // the minute the planner tries to use — which is how the same slot gets scheduled twice.
  ok("…and hands the SAME value to the occupancy builder", /dailyTimes: r\.dailyTimes/.test(PLAN_RUN))
  ok("the group-wide minimum is gone", !/Math\.min\(\.\.\.groupRules\.map/.test(PLANNER))
  ok("…replaced by each rule's own rate", /const rulePostsPerDay = rateOf\(rule\)/.test(PLANNER)
    && /maxOccurrences: maxDays \* rulePostsPerDay/.test(PLANNER))
}

// ── 2. INDEPENDENCE ──────────────────────────────────────────────────────────────────────────
console.log("\nINDEPENDENCE — one destination's cadence cannot touch another's:")
{
  const repTwo = liveRule(REP_IG, null)                                   // the live shape: NULL
  const lbTwo = liveRule(LB_IG, 2, { allowedMarkets: ["Dallas"], staggerOffsetMinutes: null })
  const lbOne = liveRule(LB_IG, 1, { allowedMarkets: ["Dallas"], staggerOffsetMinutes: null })

  const withTwo = plan([repTwo, lbTwo], MIXED)
  const withOne = plan([repTwo, lbOne], MIXED)
  const forConn = (p: typeof withTwo, id: string) =>
    p.planned.filter((x) => x.connectionId === id).map((x) => `${x.dateKey} ${hhmm(x.minute)}`)

  // THE DEFECT, as a test. Under the group minimum, dropping Locator Beast to 1 halved Real Estate
  // Pro's maxOccurrences too.
  eq("Real Estate Pro's schedule is IDENTICAL whether Locator Beast posts once or twice a day",
    forConn(withOne, REP_IG), forConn(withTwo, REP_IG))
  ok("…and it is a real schedule, not two empty lists", forConn(withTwo, REP_IG).length > 0)

  const lbDays = (p: typeof withOne) => {
    const byDay = new Map<string, number>()
    for (const x of p.planned.filter((y) => y.connectionId === LB_IG)) byDay.set(x.dateKey, (byDay.get(x.dateKey) ?? 0) + 1)
    return [...byDay.values()]
  }
  ok("Locator Beast at 1/day gets exactly one post on every day it posts", lbDays(withOne).every((n) => n === 1),
    JSON.stringify(lbDays(withOne)))
  ok("…on every day of the window, not two a day for half of it",
    lbDays(withOne).length === 4, JSON.stringify(lbDays(withOne)))
  ok("Locator Beast at 2/day gets exactly two", lbDays(withTwo).every((n) => n === 2), JSON.stringify(lbDays(withTwo)))
}

console.log("\nINDEPENDENCE — across all four destinations at once:")
{
  const pool = [
    ...DALLAS, ...Array.from({ length: 10 }, (_, i) => post(`s${i}`, "San Antonio")),
    ...DALLAS.map((p, i) => post(`d${i}t`, "Dallas", "tiktok", `d${i}`)),
    ...Array.from({ length: 10 }, (_, i) => post(`s${i}t`, "San Antonio", "tiktok", `s${i}`)),
  ]
  const p = plan([
    liveRule(REP_IG, null),
    liveRule(LB_IG, 2, { allowedMarkets: ["Dallas"], staggerOffsetMinutes: null }),
    liveRule(REP_TT, null, { platform: "tiktok" }),
    liveRule(LB_TT, 2, { platform: "tiktok", allowedMarkets: ["Dallas"], staggerOffsetMinutes: null }),
  ], pool)

  for (const id of [REP_IG, REP_TT, LB_IG, LB_TT]) {
    const mine = p.planned.filter((x) => x.connectionId === id)
    const byDay = new Map<string, number>()
    for (const x of mine) byDay.set(x.dateKey, (byDay.get(x.dateKey) ?? 0) + 1)
    ok(`${id}: exactly 2 posts on each of its days`, byDay.size > 0 && [...byDay.values()].every((n) => n === 2),
      JSON.stringify([...byDay.entries()]))
  }
  // Requirement 6, still true after the cadence work.
  for (const id of [LB_IG, LB_TT]) {
    eq(`${id} is still Dallas only`, [...new Set(p.planned.filter((x) => x.connectionId === id).map((x) => x.market))], ["Dallas"])
  }
  for (const id of [REP_IG, REP_TT]) {
    ok(`${id} still reaches other markets`, p.planned.some((x) => x.connectionId === id && x.market !== "Dallas"))
  }
  eq("no restriction was broken anywhere", p.inventory.marketRestrictionViolations, 0)
  eq("no daily limit was exceeded anywhere", p.inventory.dailyCapSkips, 0)
  eq("no cooldown was violated", p.inventory.cooldownViolations, 0)
}

// ── 3. THE HARD PER-DAY CEILING ──────────────────────────────────────────────────────────────
console.log("\nTHE CEILING — a bumped occurrence cannot overfill a day:")
{
  // Deriving the times is not enough on its own. planDailyTimes BUMPS an occurrence to the next day
  // when its minute is already taken, so without a per-day count a day could receive its own two
  // placements plus a bumped one.
  ok("the planner counts placements per calendar day", /const placedOnDay = new Map<string, number>\(\)/.test(PLANNER))
  ok("…and skips one that would exceed the destination's limit",
    /if \(\(placedOnDay\.get\(pl\.dateKey\) \?\? 0\) >= rulePostsPerDay\) \{/.test(PLANNER))
  ok("…reporting it rather than discarding it silently", /dailyCapSkips/.test(PLANNER))

  // Occupy BOTH of day 1's minutes for this destination, so both of its occurrences bump into
  // day 2 — which already has its own two.
  const occ = new Map([[LB_IG, new Map([
    ["2026-11-16", { count: 2, slots: new Set(), minutes: new Set([450, 1170]) }],
  ])]])
  const p = plan([liveRule(LB_IG, 2, { allowedMarkets: ["Dallas"], staggerOffsetMinutes: 0 })], DALLAS,
    { occupancy: occ as never, maxDays: 4 })
  const byDay = new Map<string, number>()
  for (const x of p.planned) byDay.set(x.dateKey, (byDay.get(x.dateKey) ?? 0) + 1)
  ok("no calendar day exceeds 2 for this destination", [...byDay.values()].every((n) => n <= 2),
    JSON.stringify([...byDay.entries()]))
  eq("the occupied day gets nothing more", byDay.get("2026-11-16") ?? 0, 0)
  // planDailyTimes tracks minutes per day and bumps, so with the times DERIVED from posts_per_day
  // it already cannot overfill — times.length and the limit are the same number. The ceiling is
  // therefore belt-and-braces here, and 0 skips is the correct reading, not a silent pass.
  eq("…and nothing had to be dropped at the limit, because the bump handled it", p.inventory.dailyCapSkips, 0)
}
{
  // THE SHAPE THE CEILING EXISTS FOR: a rule whose dailyTimes are LONGER than its posts_per_day.
  // That is precisely the old shape — every rule got the whole baseline and posts_per_day only
  // capped the horizon — so a future caller that forgets to derive the times gets a hard limit
  // rather than twice the posts it asked for.
  const p = plan([rule(LB_IG, { postsPerDay: 1, dailyTimes: BASELINE_DAILY_TIMES, allowedMarkets: ["Dallas"] })],
    DALLAS, { maxDays: 4 })
  const byDay = new Map<string, number>()
  for (const x of p.planned) byDay.set(x.dateKey, (byDay.get(x.dateKey) ?? 0) + 1)
  ok("a rule asking for 1/day with two times still gets ONE a day",
    byDay.size > 0 && [...byDay.values()].every((n) => n === 1), JSON.stringify([...byDay.entries()]))
  ok("…and the dropped placements are reported", p.inventory.dailyCapSkips > 0, String(p.inventory.dailyCapSkips))
  ok("…and the plan says so in words", p.notes.some((n) => /daily limit/.test(n)), JSON.stringify(p.notes))
}
{
  // The same shape at 1/day: one occupied minute, and the day must still not end up with two.
  const occ = new Map([[LB_IG, new Map([
    ["2026-11-17", { count: 1, slots: new Set(), minutes: new Set([450]) }],
  ])]])
  const p = plan([liveRule(LB_IG, 1, { allowedMarkets: ["Dallas"], staggerOffsetMinutes: 0 })], DALLAS,
    { occupancy: occ as never, maxDays: 4 })
  const byDay = new Map<string, number>()
  for (const x of p.planned) byDay.set(x.dateKey, (byDay.get(x.dateKey) ?? 0) + 1)
  ok("a 1/day destination never gets two on a day", [...byDay.values()].every((n) => n === 1),
    JSON.stringify([...byDay.entries()]))
}

// ── 4. EXISTING SCHEDULED POSTS ──────────────────────────────────────────────────────────────
console.log("\nEXISTING SCHEDULED POSTS — a filled slot is not filled twice:")
{
  const now = new Date("2026-11-16T03:00:00Z") // 21:00 on the 15th in Central: nothing elapsed today
  const occ = occupancyFromRows({
    rows: [
      { connection_id: LB_IG, scheduled_at: wallClockToUtcISO("2026-11-16", 450, TZ) },
      { connection_id: REP_IG, scheduled_at: wallClockToUtcISO("2026-11-17", 1170, TZ) },
    ],
    connections: [
      { connectionId: LB_IG, staggerOffsetMinutes: 0, dailyTimes: dailyTimesForPostsPerDay(2), timezone: TZ },
      { connectionId: REP_IG, staggerOffsetMinutes: 0, dailyTimes: dailyTimesForPostsPerDay(null), timezone: TZ },
    ],
    now,
  })
  ok("an existing row marks ITS OWN destination's minute spent",
    occ.get(LB_IG)?.get("2026-11-16")?.minutes.has(450) === true)
  // PER DESTINATION. Two accounts may legitimately post at the same instant — the slot index keys
  // on (connection_id, scheduled_at) — so one account's row must not block the other's.
  ok("…and does NOT mark the other destination's", occ.get(REP_IG)?.get("2026-11-16")?.minutes.has(450) !== true)
  ok("the other destination's own row is marked on its own day",
    occ.get(REP_IG)?.get("2026-11-17")?.minutes.has(1170) === true)

  const p = plan([
    liveRule(LB_IG, 2, { allowedMarkets: ["Dallas"], staggerOffsetMinutes: 0 }),
    liveRule(REP_IG, null, { staggerOffsetMinutes: 0 }),
  ], MIXED, { occupancy: occ as never, maxDays: 3 })
  ok("the planner does not re-fill the taken 07:30",
    !p.planned.some((x) => x.connectionId === LB_IG && x.dateKey === "2026-11-16" && x.minute === 450))
  ok("…but still fills that destination's 19:30 the same day",
    p.planned.some((x) => x.connectionId === LB_IG && x.dateKey === "2026-11-16" && x.minute === 1170))
  ok("…and the other destination's 07:30 that day is untouched by it",
    p.planned.some((x) => x.connectionId === REP_IG && x.dateKey === "2026-11-16" && x.minute === 450))

  // The DATABASE is the backstop, not this arithmetic.
  const guards = read("supabase/migrations/20261007000004_autopilot_write_guards.sql")
  ok("a destination's instant is unique in the database",
    /unique index[\s\S]{0,200}social_posts_connection_slot_uidx[\s\S]{0,200}\(connection_id, scheduled_at\)/i.test(guards))
  ok("…and the write path classifies that collision rather than throwing",
    /if \(code === "23505"\) return \{ ok: false, reason: "slot_taken" \}/.test(code(read("lib/social/autopilotWrite.ts"))))
}

// ── 5. CENTRAL TIME AND DST ──────────────────────────────────────────────────────────────────
console.log("\nCENTRAL TIME — and the spring-forward hour this found:")
{
  eq("the default timezone is Central", DEFAULT_TIMEZONE, "America/Chicago")

  // THE BUG. wallClockToUtcISO probed the zone offset ONCE, at the requested wall clock treated as
  // UTC. On a spring-forward day that instant is still on the OLD offset, so 07:30 resolved to
  // 13:30Z — which is 08:30 CDT. An hour late, every year, on exactly one day.
  const cases: [string, number, string][] = [
    ["2026-03-07", 450, "2026-03-07T13:30:00.000Z"], // CST, the day before
    ["2026-03-08", 450, "2026-03-08T12:30:00.000Z"], // SPRING FORWARD — was 13:30Z
    ["2026-03-09", 450, "2026-03-09T12:30:00.000Z"], // CDT, the day after
    ["2026-10-31", 450, "2026-10-31T12:30:00.000Z"], // CDT, the day before
    ["2026-11-01", 450, "2026-11-01T13:30:00.000Z"], // FALL BACK
    ["2026-11-02", 450, "2026-11-02T13:30:00.000Z"], // CST, the day after
    ["2027-03-14", 450, "2027-03-14T12:30:00.000Z"], // the next spring forward
    ["2027-11-07", 450, "2027-11-07T13:30:00.000Z"], // the next fall back
  ]
  for (const [key, minute, want] of cases) {
    eq(`${key} ${hhmm(minute)} Central → ${want}`, wallClockToUtcISO(key, minute, TZ), want)
  }
  // The round trip is the claim that matters: whatever the offset, 07:30 local stays 07:30 local.
  for (const [key, minute] of cases.map(([k, m]) => [k, m] as const)) {
    const iso = wallClockToUtcISO(key, minute, TZ)
    eq(`…and reads back as ${hhmm(minute)} local on ${key}`, localOf(iso), hhmm(minute))
    eq(`…on the same calendar day`, dateKeyInTz(new Date(iso), TZ), key)
  }
  // Both evening times too, which cross into the next UTC day.
  for (const key of ["2026-03-08", "2026-11-01"]) {
    const iso = wallClockToUtcISO(key, 1170, TZ)
    eq(`${key} 19:30 Central reads back as 19:30`, localOf(iso), "19:30")
    eq(`…and stays on ${key} locally`, dateKeyInTz(new Date(iso), TZ), key)
  }

  // THE ARITHMETIC PROOF, independent of any expected string: a spring-forward day is 23 hours
  // after the previous day's same wall clock, a fall-back day is 25, everything else 24. The old
  // implementation produced 24 for all three, which is what made it wrong.
  const gap = (a: string, b: string) =>
    (Date.parse(wallClockToUtcISO(b, 450, TZ)) - Date.parse(wallClockToUtcISO(a, 450, TZ))) / 3_600_000
  eq("07:30 to 07:30 across spring forward is 23 hours", gap("2026-03-07", "2026-03-08"), 23)
  eq("…across fall back it is 25", gap("2026-10-31", "2026-11-01"), 25)
  eq("…and on an ordinary pair it is 24", gap("2026-06-01", "2026-06-02"), 24)
  ok("the implementation probes the offset at the ANSWER, not at the guess",
    /const candidate = wanted - offsetAt\(wanted\)/.test(code(read("lib/social/recurrence.ts")))
    && /offsetAt\(candidate\)/.test(code(read("lib/social/recurrence.ts"))))

  // A PLAN SPANNING THE TRANSITION. Every placement must be 07:30 / 19:30 local on its own day,
  // which is the thing an operator would actually notice going wrong.
  const p = plan([liveRule(LB_IG, 2, { allowedMarkets: ["Dallas"], staggerOffsetMinutes: 0 })], DALLAS,
    { start: "2026-03-06", maxDays: 5 })
  ok("a plan across the spring transition places something on every day", new Set(p.planned.map((x) => x.dateKey)).size === 5,
    JSON.stringify([...new Set(p.planned.map((x) => x.dateKey))]))
  ok("…and EVERY placement is 07:30 or 19:30 Central, including the 8th",
    p.planned.every((x) => ["07:30", "19:30"].includes(localOf(x.scheduledAtUtc))),
    JSON.stringify(p.planned.map((x) => `${x.dateKey} ${localOf(x.scheduledAtUtc)}`)))
  ok("…and every placement's local date is the day it was planned for",
    p.planned.every((x) => dateKeyInTz(new Date(x.scheduledAtUtc), TZ) === x.dateKey))
  // dayKeysFrom walks calendar days, so a transition cannot drop or duplicate one.
  eq("the day list across the transition is the five consecutive calendar days",
    dayKeysFrom("2026-03-06", 4), ["2026-03-06", "2026-03-07", "2026-03-08", "2026-03-09", "2026-03-10"])
}

// ── 6. THE 7:30 WINDOWS ──────────────────────────────────────────────────────────────────────
console.log("\nTHE 7:30 WINDOWS — both Locator Beast destinations, and Real Estate Pro untouched:")
{
  // Real Estate Pro carries an EXPLICIT stagger of 0, and an explicit value always wins, so its
  // times are the baseline exactly — unchanged by anything in this phase.
  eq("Real Estate Pro Instagram posts at exactly 07:30 / 19:30",
    effectiveDailyTimes(REP_IG, 0, dailyTimesForPostsPerDay(null)).map(hhmm), ["07:30", "19:30"])
  eq("…and so does its TikTok", effectiveDailyTimes(REP_TT, 0, dailyTimesForPostsPerDay(null)).map(hhmm), ["07:30", "19:30"])
  eq("an explicit 0 is honoured rather than replaced by a derived offset", staggerOffsetMinutes(REP_IG, 0), 0)

  // The derived spread was 30, which put a new destination as late as 07:59 — inside the approved
  // window, so nothing refused it, but not the time anyone asked for.
  eq("the derived stagger spread is 5 minutes", STAGGER_SPREAD_MINUTES, 5)
  for (const id of [LB_IG, LB_TT]) {
    const off = staggerOffsetMinutes(id, null)
    const times = effectiveDailyTimes(id, null, dailyTimesForPostsPerDay(2))
    ok(`${id}: derived stagger is 1..5 (+${off}) → ${times.map(hhmm).join(" / ")}`, off >= 1 && off <= 5)
    ok(`${id}: both times are still 7:3x and 19:3x`,
      times.every((t) => Math.floor(t / 60) === 7 || Math.floor(t / 60) === 19)
      && times.every((t) => t % 60 >= 30 && t % 60 <= 35))
    eq(`${id}: the morning time is in the morning window`, slotForMinute(times[0]), "morning")
    eq(`${id}: the evening time is in the evening window`, slotForMinute(times[1]), "evening")
  }
  ok("the approved windows are unchanged (morning 07:00–10:00, evening 18:00–21:00)",
    SLOT_WINDOWS.morning.startMin === 420 && SLOT_WINDOWS.morning.endMin === 600
    && SLOT_WINDOWS.evening.startMin === 1080 && SLOT_WINDOWS.evening.endMin === 1260)
  // The stagger is cosmetic, not required: the slot index keys on (connection_id, scheduled_at), so
  // two destinations may share an instant.
  ok("two destinations at the identical minute are not a conflict — the index is per connection",
    /\(connection_id, scheduled_at\)/i.test(read("supabase/migrations/20261007000004_autopilot_write_guards.sql")))
}

// ── 7. PAUSE AND RESUME ──────────────────────────────────────────────────────────────────────
console.log("\nPAUSE — per destination, on every path that can publish:")
{
  ok("planning excludes a paused destination", /c\.posting_paused !== true/.test(PLAN_RUN))
  // Instagram already refused a paused destination in the due loop. What this phase added is that
  // the RECONCILE path says so — and that path can complete a publish, so it is a publishing path.
  ok("Instagram: the due loop leaves a paused destination's post untouched",
    /if \(dest\.kind === "paused"\) \{\s*\n\s*result\.skippedDestinationPaused\+\+/.test(IG_WORKER))
  ok("Instagram: the recovery sweep counts the pause rather than skipping it silently",
    /if \(dest\.kind === "paused"\) result\.reconcileSkippedPaused\+\+/.test(IG_WORKER))
  ok("Instagram: the manual publish button refuses a paused destination too",
    /destination_unavailable[\s\S]{0,120}paused/.test(code(read("app/api/admin/social-autopilot/posts/[id]/publish/route.ts"))))

  // TikTok had NO pause enforcement at publish time at all.
  ok("TikTok: the due loop now leaves a paused destination's post untouched",
    /if \(postTok\.postingPaused\) \{\s*\n\s*result\.skippedDestinationPaused\+\+/.test(TT_WORKER))
  const pauseAt = TT_WORKER.indexOf("postTok.postingPaused")
  const claimAt = TT_WORKER.indexOf('.update({ status: "publishing"')
  ok("TikTok: checked BEFORE the claim, so a paused post keeps its slot", pauseAt > 0 && pauseAt < claimAt)
  ok("TikTok: the stranded sweep defers a paused destination instead of failing its row",
    /strandedTok\?\.postingPaused/.test(TT_WORKER) && /reconcileSkippedPaused/.test(TT_WORKER))
  ok("TikTok: the manual publish button refuses a paused destination",
    /if \(tok\.postingPaused\)/.test(code(read("app/api/integrations/tiktok/publish/route.ts"))))
  // The one path a pause deliberately does NOT stop: recording what TikTok already did. Refusing to
  // observe would leave a live video reading 'publishing' for ever.
  ok("TikTok: the OBSERVING sweep still records a publish that already happened",
    /fetchTikTokPostStatus\(rowTok\.accessToken, String\(r\.external_post_id\)\)/.test(TT_WORKER))
  ok("…and says why a pause does not apply there", /cannot initiate a publish/.test(read("app/api/cron/social-tiktok-publish/route.ts")))
}

console.log("\nPAUSE — pausing one destination never pauses another:")
{
  const pool = [...DALLAS, ...Array.from({ length: 10 }, (_, i) => post(`s${i}`, "San Antonio"))]
  const p = plan([
    liveRule(LB_IG, 2, { allowedMarkets: ["Dallas"], staggerOffsetMinutes: null, enabled: false }),
    liveRule(REP_IG, null, { staggerOffsetMinutes: 0 }),
  ], pool, { maxDays: 3 })
  ok("the paused destination is planned nothing", !p.planned.some((x) => x.connectionId === LB_IG))
  ok("…and the other destination is planned exactly as before", p.planned.every((x) => x.connectionId === REP_IG)
    && p.planned.length > 0)
  const resumed = plan([
    liveRule(LB_IG, 2, { allowedMarkets: ["Dallas"], staggerOffsetMinutes: null }),
    liveRule(REP_IG, null, { staggerOffsetMinutes: 0 }),
  ], pool, { maxDays: 3 })
  ok("RESUME: the destination is planned again with no other change",
    resumed.planned.some((x) => x.connectionId === LB_IG))
  eq("…and the other destination's schedule is identical across the pause and the resume",
    p.planned.filter((x) => x.connectionId === REP_IG).map((x) => `${x.dateKey} ${hhmm(x.minute)}`),
    resumed.planned.filter((x) => x.connectionId === REP_IG).map((x) => `${x.dateKey} ${hhmm(x.minute)}`))
  // The controls themselves are connection-scoped RPCs, so one row's pause cannot reach another's.
  const mgmt = read("supabase/migrations/20260913000002_publishing_destination_authorization.sql")
  ok("sa_pause_destination writes one row, by id, ownership-verified",
    /sa_pause_destination\(p_connection_id uuid\)[\s\S]{0,400}where id = p_connection_id and owner_user_id = v_uid/.test(mgmt))
  ok("sa_resume_destination likewise",
    /sa_resume_destination\(p_connection_id uuid\)[\s\S]{0,400}where id = p_connection_id and owner_user_id = v_uid/.test(mgmt))
}

// ── 8. EMPTY DALLAS INVENTORY ────────────────────────────────────────────────────────────────
console.log("\nEMPTY DALLAS — the slot stays empty, at every cadence:")
{
  const noDallas = Array.from({ length: 10 }, (_, i) => post(`s${i}`, "San Antonio"))
  for (const perDay of [1, 2]) {
    const p = plan([
      liveRule(LB_IG, perDay, { allowedMarkets: ["Dallas"], staggerOffsetMinutes: null }),
      liveRule(REP_IG, null, { staggerOffsetMinutes: 0 }),
    ], noDallas, { maxDays: 3 })
    ok(`at ${perDay}/day the restricted destination is scheduled NOTHING rather than San Antonio`,
      !p.planned.some((x) => x.connectionId === LB_IG))
    ok(`…and the unrestricted one still fills its slots`, p.planned.some((x) => x.connectionId === REP_IG))
    ok(`…and the plan names the starved destination`,
      p.notes.some((n) => n.includes(LB_IG) && n.includes("Dallas") && /UNFILLED/.test(n)))
  }
}

// ── 9. ONE DALLAS VIDEO, BOTH LOCATOR BEAST ACCOUNTS ─────────────────────────────────────────
console.log("\nSHARING — the same Dallas video on both accounts, once each:")
{
  const pool = [
    post("ig-a", "Dallas", "instagram", "shared"), post("ig-b", "Dallas", "instagram", "shared"),
    post("tt-a", "Dallas", "tiktok", "shared"), post("tt-b", "Dallas", "tiktok", "shared"),
  ]
  const p = plan([
    liveRule(LB_IG, 2, { allowedMarkets: ["Dallas"], staggerOffsetMinutes: null }),
    liveRule(LB_TT, 2, { platform: "tiktok", allowedMarkets: ["Dallas"], staggerOffsetMinutes: null }),
  ], pool, { maxDays: 1 })
  eq("both accounts are scheduled the shared property",
    [...new Set(p.planned.map((x) => x.connectionId))].sort(), [LB_IG, LB_TT])
  eq("…and it is the SAME building on each", [...new Set(p.planned.map((x) => x.propertyKey))], ["place:place-shared"])
  ok("neither account blocked the other", p.planned.filter((x) => x.connectionId === LB_IG).length > 0
    && p.planned.filter((x) => x.connectionId === LB_TT).length > 0)
  // WITHIN one account, the building is not repeated inside its cooldown.
  for (const id of [LB_IG, LB_TT]) {
    const mine = p.planned.filter((x) => x.connectionId === id)
    ok(`${id} does not repeat the building inside its cooldown`, mine.every((x) => !x.isRecycled))
  }
  eq("no cooldown violation anywhere", p.inventory.cooldownViolations, 0)

  // The database says the same thing from the other direction: one content row may reach many
  // connections, but not the same connection twice while it is unpublished.
  const beta = read("supabase/migrations/20261010000001_social_agent_beta_foundation.sql")
  ok("uniqueness is per (content, connection, destination), so two accounts may share one video",
    /social_posts_content_connection_dest_uidx[\s\S]{0,200}\(source_content_id, connection_id, destination\)/i.test(beta))
  ok("…and only while unpublished, so history is never blocked by it",
    /social_posts_content_connection_dest_uidx[\s\S]{0,300}published_at is null/i.test(beta))
}

// ── 10. ROTATION AT INDEPENDENT RATES ────────────────────────────────────────────────────────
console.log("\nROTATION — each connection consumes the pool at its own rate:")
{
  const r = planRotation({
    connections: [
      { connectionId: REP_IG, startIndex: 0, postsPerDay: 2 },
      { connectionId: LB_IG, startIndex: 10, postsPerDay: 1 },
    ],
    poolSize: 20, postsPerDay: 2, dayKeys: ["d1", "d2", "d3"],
  })
  eq("the 2/day connection takes two entries a day", r.assignments.get(REP_IG), [0, 1, 2, 3, 4, 5])
  eq("the 1/day connection takes one", r.assignments.get(LB_IG), [10, 11, 12])
  // A SUM, not a product: the pool must carry what the accounts actually consume in a day.
  eq("requiredPoolSize is the sum of the rates", r.requiredPoolSize, 3)
  eq("no collision between them", r.collisions, [])
  // Unchanged when no per-connection rate is given — every existing caller.
  const shared = planRotation({
    connections: [{ connectionId: REP_IG, startIndex: 0 }, { connectionId: LB_IG, startIndex: 10 }],
    poolSize: 20, postsPerDay: 2, dayKeys: ["d1", "d2", "d3"],
  })
  eq("without a per-connection rate both use the shared one", shared.assignments.get(LB_IG), [10, 11, 12, 13, 14, 15])
  eq("…and requiredPoolSize is then the old product", shared.requiredPoolSize, 4)
}

// ── 11. RELEASE SCOPE ────────────────────────────────────────────────────────────────────────
console.log("\nRELEASE SCOPE — Phase 2 only:")
{
  const BASELINE = "abe0b1c"
  // The END of Phase 2, not the working tree — the same pinning the earlier guards carry. Phase 2's
  // scope claim is about a pair of commits and is therefore permanently checkable; diffed against
  // the tree it would break on every later release, which is what it did the moment the integration
  // audit moved the two prepared migrations.
  const RELEASE = "1c5ebed"
  const has = (() => {
    try { execSync(`git cat-file -e ${BASELINE}^{commit}`, { stdio: "ignore" }); return true } catch { return false }
  })()
  if (!has) {
    console.log(`  – skipped: ${BASELINE} is not in this clone`)
  } else {
    const lines = (cmd: string) =>
      execSync(cmd, { encoding: "utf8" }).trim().split("\n").map((l) => l.trim()).filter(Boolean)
    const changed = lines(`git diff --name-only ${BASELINE} ${RELEASE} -- . ':!next-env.d.ts'`).sort()
    const APPROVED = [
      // Independent cadences.
      "lib/social/autopilotDestination.ts",
      "lib/social/autopilotPlanner.ts",
      "lib/social/autopilotPlanRun.ts",
      "lib/social/autopilotRotation.ts",
      // The spring-forward hour, found while verifying requirement 8.
      "lib/social/recurrence.ts",
      // posting_paused on every publishing path.
      "app/api/cron/social-instagram-publish/route.ts",
      "app/api/cron/social-tiktok-publish/route.ts",
      "app/api/integrations/tiktok/publish/route.ts",
      "lib/social/tiktokServer.ts",
      // This file.
      "scripts/social/destinationSchedules.test.ts",
      // The dry run reports what the live planner would do, so it derives times the same way.
      "scripts/social/marketRestrictionDryRun.ts",
      // Restated with their claims intact — see the comments at each site.
      "scripts/social/autopilotDestination.test.ts",
      "scripts/social/tiktokAccountIsolation.test.ts",
    ].sort()
    eq(`exactly the ${APPROVED.length} approved files changed`, changed, APPROVED)
    ok("NO migration is part of this phase — posts_per_day and posting_paused already exist",
      !changed.some((f) => f.startsWith("supabase/")))

    for (const [label, re] of [
      ["OAuth, connect and callback", /tiktok\/(connect|callback)\/|instagram\/(connect|callback)\//],
      ["the destination invitation flow", /destinationInvite|destinations\/invitations/],
      ["the market restriction itself", /lib\/social\/marketRestriction\.ts/],
      ["the per-connection TikTok token decisions", /tiktokConnectionChoice/],
      ["captions, templates and hashtags", /composePost|hashtags\.ts|overlaySpec|templateFamilies|loadedCopy|commentKeywords/],
      ["the post editor and the accounts screen", /PostEditor|PublishingDestinations|social-autopilot\/accounts/],
      ["the eligibility predicate and the write path", /autopilotEligibility|autopilotWrite|postingHistory|autopilotOccupancy/],
      ["Quick Match", /lib\/quickMatch\//],
      ["the CRM workspace outside Social Beast", /components\/crm\/(?!social\/)/],
      ["the client-facing pages", /app\/r\/|app\/share|app\/\(site\)/],
      ["the unrelated failing suites", /scripts\/(leads|tests|auth|share|notifications|companion)\//],
    ] as const) {
      ok(`${label} is untouched`, !changed.some((f) => re.test(f)))
    }

    for (const [f, allowed, why] of [
      ["lib/social/autopilotDestination.ts", 3, "the spread constant and its doc line, the derived-range comment"],
      ["lib/social/autopilotPlanner.ts", 7, "the group minimum (5), the maxOccurrences line, the counter line"],
      ["lib/social/autopilotPlanRun.ts", 3, "the import, the dailyTimes line, the postsPerDay anchor"],
      ["lib/social/autopilotRotation.ts", 9, "the ConnectionSlot type (4) and the rate loop (5)"],
      ["lib/social/recurrence.ts", 16, "wallClockToUtcISO's body, replaced by the two-pass version"],
      ["app/api/cron/social-instagram-publish/route.ts", 3, "the result line, the reconcile skip line, its comment anchor"],
      ["app/api/cron/social-tiktok-publish/route.ts", 8, "the result tail, the Phase-2 comment (4), the stranded select, the sweep's two lines"],
      ["app/api/integrations/tiktok/publish/route.ts", 1, "the token guard line"],
      ["lib/social/tiktokServer.ts", 3, "the return type and the return line"],
      ["scripts/social/autopilotDestination.test.ts", 3, "two spread assertions and a heading"],
      ["scripts/social/marketRestrictionDryRun.ts", 6, "the import, the live rule's times line, and the two simulated rules' times and stagger"],
      // Twelve, every one a REPLACEMENT: the three-line "Phase 2 has not happened yet" comment and
      // the two assertions it introduced (3), the four-line `changed` expression, the `removed`
      // command, and the byte-identical comparison now pinned to Phase 1's own commit.
      ["scripts/social/tiktokAccountIsolation.test.ts", 12, "the Phase-2-pending assertions (6) and the diff range (6)"],
    ] as const) {
      const removed = lines(`git diff --unified=0 ${BASELINE} ${RELEASE} -- ${f}`)
        .filter((l) => l.startsWith("-") && !l.startsWith("---"))
      ok(`${f} removes at most the ${allowed} line(s) it replaces (${why})`, removed.length <= allowed,
        `removed ${removed.length}`)
    }

    // Byte-identical: Phase 2 is schedules and pausing. The market restriction, the TikTok token
    // decisions and the eligibility predicate are where a stray edit would do the most damage.
    for (const f of [
      "lib/social/marketRestriction.ts",
      "lib/social/tiktokConnectionChoice.ts",
      "lib/social/autopilotEligibility.ts",
      "lib/social/autopilotWrite.ts",
      "lib/social/autopilotOccupancy.ts",
      "lib/social/postingHistory.ts",
      "components/crm/social/PublishingDestinations.tsx",
    ]) {
      ok(`${f} was byte-identical across ${BASELINE}..${RELEASE}`,
        execSync(`git show ${BASELINE}:${f}`, { encoding: "utf8" })
        === execSync(`git show ${RELEASE}:${f}`, { encoding: "utf8" }))
    }
    // Every guard both workers had is still present.
    for (const guard of ["CRON_SECRET", "readAutoPosting", "publishHoldDecision", "isWithinLatenessWindow",
      "marketRestrictionViolation", "media_publish_claimed_at"]) {
      ok(`both workers still carry ${guard}`, IG_WORKER.includes(guard) && TT_WORKER.includes(guard))
    }
  }
}

console.log(`\nDestination schedules: ${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
