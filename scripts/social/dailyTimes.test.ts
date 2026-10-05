/**
 * SOCIAL BEAST — the twice-daily cadence.
 *
 * The existing planner maps occurrence index N to DAY N·interval_days, so one index is one day and
 * two posts per day is structurally impossible. posts_per_day only ever BLOCKS a second post; it
 * cannot create one. This cadence maps an index to a (day, EXPLICIT minute) pair instead.
 *
 * Two properties carry the feature, and both are about exactness:
 *   - exactly two occurrences per local calendar day, in configured order
 *   - 9:00 AM stays 9:00 AM across a DST boundary, because the stored value is a wall-clock
 *     MINUTE, not an instant
 *
 * The rest of this file is about not breaking the cadence that already works.
 *
 * Run: npx tsx scripts/social/dailyTimes.test.ts
 */
import { readFileSync } from "node:fs"
import path from "node:path"
import {
  planDailyTimes, planOccurrences, normalizeDailyTimes, normalizeCadence,
  DEFAULT_DAILY_TIMES, dayKeysFrom, wallClockToUtcISO, slotForMinute,
  DEFAULT_TIMEZONE, type Occupancy, type Slot,
} from "@/lib/social/recurrence"

let pass = 0, fail = 0
const ok = (l: string, c: boolean, d = "") => {
  if (c) { pass++; console.log(`  ✓ ${l}`) } else { fail++; console.log(`  ✗ ${l}${d ? `\n      ${d}` : ""}`) }
}
const read = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8")

const NINE = 9 * 60      // 540
const SEVEN_PM = 19 * 60 // 1140
const emptyOcc = (): Occupancy => new Map()
const day = (count = 0, slots: Slot[] = [], minutes: number[] = []) => ({ count, slots: new Set(slots), minutes: new Set(minutes) })

/** Local wall-clock HH:MM an instant renders as, in the scheduling timezone. */
function localHM(iso: string, tz = DEFAULT_TIMEZONE): string {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: tz, hour12: false, hour: "2-digit", minute: "2-digit" })
      .formatToParts(new Date(iso)).map((x) => [x.type, x.value]),
  )
  return `${p.hour}:${p.minute}`
}

async function main() {
  console.log("\nTWICE-DAILY CADENCE\n")

  const days = dayKeysFrom("2026-11-02", 20)

  console.log("EXACTLY TWO PER DAY, IN ORDER:")
  {
    const out = planDailyTimes({ intervalDays: 1, dailyTimes: [NINE, SEVEN_PM], days, occupancy: emptyOcc(), maxOccurrences: 8 })
    ok("8 occurrences are planned", out.length === 8, String(out.length))

    // Group by day and assert the shape the user described.
    const byDay = new Map<string, number[]>()
    for (const p of out) byDay.set(p.dateKey, [...(byDay.get(p.dateKey) ?? []), p.minute])
    ok("they land on exactly 4 days", byDay.size === 4, JSON.stringify([...byDay.keys()]))
    ok("every day has exactly 2", [...byDay.values()].every((v) => v.length === 2), JSON.stringify([...byDay.values()]))
    ok("…at 9:00 and 19:00", [...byDay.values()].every((v) => v[0] === NINE && v[1] === SEVEN_PM))

    // Day 1: A@9, B@19 · Day 2: C@9, D@19 — the exact sequence from the requirement.
    ok("the sequence is day0@9, day0@19, day1@9, day1@19",
      out.slice(0, 4).map((p) => `${p.dateKey}@${p.minute}`).join(",") ===
      `${days[0]}@${NINE},${days[0]}@${SEVEN_PM},${days[1]}@${NINE},${days[1]}@${SEVEN_PM}`,
      out.slice(0, 4).map((p) => `${p.dateKey}@${p.minute}`).join(","))
    ok("indices are sequential and unique", out.every((p, i) => p.index === i))
    ok("no duplicate (day, minute) pair",
      new Set(out.map((p) => `${p.dateKey}|${p.minute}`)).size === out.length)
    ok("no duplicate occurrence timestamps once converted",
      new Set(out.map((p) => wallClockToUtcISO(p.dateKey, p.minute, DEFAULT_TIMEZONE))).size === out.length)
    // The windows are still respected incidentally: 9am is morning, 7pm is evening.
    ok("9:00 maps to the morning window", out[0].slot === "morning")
    ok("19:00 maps to the evening window", out[1].slot === "evening")
  }

  console.log("\nNO HASHING — THE TIMES ARE THE CADENCE:")
  {
    // The interval planner's defining behaviour is that the minute varies by rule id. If this one
    // did the same, the configured 9:00 would not survive.
    const a = planDailyTimes({ intervalDays: 1, dailyTimes: [NINE, SEVEN_PM], days, occupancy: emptyOcc(), maxOccurrences: 6 })
    ok("every minute is exactly one of the configured times",
      a.every((p) => p.minute === NINE || p.minute === SEVEN_PM))
    ok("…never a round-hour-avoiding hashed minute", a.every((p) => p.minute % 60 === 0))
    // planDailyTimes takes no ruleId at all, so it cannot hash on one.
    const src = read("lib/social/recurrence.ts")
    const fn = src.slice(src.indexOf("export function planDailyTimes"))
    ok("planDailyTimes calls neither slotMinute nor slotOrder",
      !/slotMinute\(|slotOrder\(/.test(fn.slice(0, fn.indexOf("\n}"))))
    ok("…and does not take a ruleId to hash", !/ruleId/.test(fn.slice(0, fn.indexOf("\n}"))))
  }

  console.log("\nDST — 9:00 AM AND 7:00 PM STAY LOCAL WALL-CLOCK:")
  {
    // US DST ends 2026-11-01. Spanning it proves the stored minute is wall-clock, not an offset.
    const acrossFall = dayKeysFrom("2026-10-30", 8)
    const out = planDailyTimes({ intervalDays: 1, dailyTimes: [NINE, SEVEN_PM], days: acrossFall, occupancy: emptyOcc(), maxOccurrences: 8 })
    const times = out.map((p) => ({ d: p.dateKey, hm: localHM(wallClockToUtcISO(p.dateKey, p.minute, DEFAULT_TIMEZONE)) }))
    ok("every 9:00 slot renders as 09:00 local, before AND after the change",
      times.filter((_, i) => i % 2 === 0).every((t) => t.hm === "09:00"), JSON.stringify(times))
    ok("every 19:00 slot renders as 19:00 local", times.filter((_, i) => i % 2 === 1).every((t) => t.hm === "19:00"))
    // And the UTC offset genuinely changed across the boundary — otherwise the test proves nothing.
    const before = wallClockToUtcISO("2026-10-30", NINE, DEFAULT_TIMEZONE)
    const after = wallClockToUtcISO("2026-11-03", NINE, DEFAULT_TIMEZONE)
    ok("…while the UTC hour DID shift (so this is a real DST crossing)",
      new Date(before).getUTCHours() !== new Date(after).getUTCHours(),
      `${before} vs ${after}`)

    // Spring forward, 2027-03-14.
    const acrossSpring = dayKeysFrom("2027-03-12", 6)
    const sp = planDailyTimes({ intervalDays: 1, dailyTimes: [NINE, SEVEN_PM], days: acrossSpring, occupancy: emptyOcc(), maxOccurrences: 6 })
    ok("spring-forward keeps 09:00 local too",
      sp.filter((_, i) => i % 2 === 0).every((p) => localHM(wallClockToUtcISO(p.dateKey, p.minute, DEFAULT_TIMEZONE)) === "09:00"))
  }

  console.log("\nCOLLISION — A MANUAL POST STILL WINS:")
  {
    // A manual post already at 9:00 on day 0.
    const occ: Occupancy = new Map([[days[0], day(1, [slotForMinute(NINE)!], [NINE])]])
    const out = planDailyTimes({ intervalDays: 1, dailyTimes: [NINE, SEVEN_PM], days, occupancy: occ, maxOccurrences: 4 })
    ok("the 9:00 occurrence does NOT take the occupied slot",
      !out.some((p) => p.dateKey === days[0] && p.minute === NINE))
    ok("…it bumps FORWARD to the next day at the same time",
      out[0].dateKey === days[1] && out[0].minute === NINE, `${out[0].dateKey}@${out[0].minute}`)
    ok("…and never backward", out.every((p) => p.dateKey >= days[0]))
    ok("the 19:00 occurrence on day 0 is unaffected",
      out.some((p) => p.dateKey === days[0] && p.minute === SEVEN_PM))

    // A manual post merely in the same WINDOW (9:45, still morning) also blocks — existing rule.
    const occ2: Occupancy = new Map([[days[0], day(1, ["morning"], [9 * 60 + 45])]])
    const out2 = planDailyTimes({ intervalDays: 1, dailyTimes: [NINE], days, occupancy: occ2, maxOccurrences: 2 })
    ok("a manual post in the same approved WINDOW also wins",
      out2[0].dateKey === days[1], `${out2[0].dateKey}`)
    ok("…so two posts never share an approved window on one day",
      out2.every((p) => p.dateKey !== days[0]))
  }

  console.log("\nINPUT NORMALISATION:")
  {
    ok("times are sorted, so 'first/second' is always earlier/later",
      normalizeDailyTimes([SEVEN_PM, NINE]).join(",") === `${NINE},${SEVEN_PM}`)
    ok("duplicates collapse", normalizeDailyTimes([NINE, NINE]).length === 1)
    ok("out-of-range values are dropped", normalizeDailyTimes([-1, 1440, 2000, NINE]).join(",") === String(NINE))
    ok("non-finite values are dropped", normalizeDailyTimes([NaN, Infinity, NINE] as number[]).join(",") === String(NINE))
    ok("no times → no occurrences, rather than a guessed one",
      planDailyTimes({ intervalDays: 1, dailyTimes: [], days, occupancy: emptyOcc(), maxOccurrences: 4 }).length === 0)
    ok("the approved default is 9:00 AM and 7:00 PM",
      DEFAULT_DAILY_TIMES[0] === NINE && DEFAULT_DAILY_TIMES[1] === SEVEN_PM)
    // Unknown cadence must never resolve to the publishing-heavier mode.
    ok("an unrecognised cadence resolves to 'interval'",
      [null, undefined, "", "DAILY_TIMES", "twice", 2, {}].every((v) => normalizeCadence(v) === "interval"))
    ok("only the exact string selects daily_times", normalizeCadence("daily_times") === "daily_times")
    // One configured time is a legitimate once-daily rule.
    const once = planDailyTimes({ intervalDays: 1, dailyTimes: [NINE], days, occupancy: emptyOcc(), maxOccurrences: 3 })
    ok("one configured time → one post per day", once.length === 3 && new Set(once.map((p) => p.dateKey)).size === 3)
    // intervalDays still applies: every 2 days, twice a day.
    const every2 = planDailyTimes({ intervalDays: 2, dailyTimes: [NINE, SEVEN_PM], days, occupancy: emptyOcc(), maxOccurrences: 4 })
    ok("intervalDays 2 → two posts on day 0, two on day 2",
      every2[0].dateKey === days[0] && every2[1].dateKey === days[0] && every2[2].dateKey === days[2])
  }

  console.log("\nTHE EXISTING INTERVAL CADENCE IS UNCHANGED:")
  {
    // The same call the old code made, asserted to still produce one-per-interval placements with
    // hash-derived minutes inside approved windows.
    const out = planOccurrences({
      ruleId: "rule-abc", intervalDays: 14, placementPref: "any", postsPerDay: 2,
      days: dayKeysFrom("2026-11-02", 80), occupancy: emptyOcc(), maxOccurrences: 4,
    })
    ok("interval planning still yields one occurrence per index", out.length === 4)
    ok("…spaced intervalDays apart",
      out.every((p, i) => i === 0 || Date.parse(p.dateKey) - Date.parse(out[i - 1].dateKey) === 14 * 86400000),
      out.map((p) => p.dateKey).join(","))
    ok("…one per day, never two", new Set(out.map((p) => p.dateKey)).size === out.length)
    ok("…still inside an approved window", out.every((p) => p.slot !== null && slotForMinute(p.minute) === p.slot))
    ok("…and still hash-placed (not a round hour)", out.every((p) => p.minute % 60 !== 0))

    // Determinism is the property the whole scheduler rests on.
    const again = planOccurrences({
      ruleId: "rule-abc", intervalDays: 14, placementPref: "any", postsPerDay: 2,
      days: dayKeysFrom("2026-11-02", 80), occupancy: emptyOcc(), maxOccurrences: 4,
    })
    ok("…and identical across runs", JSON.stringify(out) === JSON.stringify(again))
  }

  console.log("\nTHE GENERATOR BRANCHES, IT DOES NOT REINTERPRET:")
  {
    const gen = read("lib/social/generateRecurrence.ts")
    ok("cadence selects the planner", /cadence === "daily_times"\s*\n?\s*\? planDailyTimes\(/.test(gen))
    ok("…and interval rules still call planOccurrences", /: planOccurrences\(\{/.test(gen))
    ok("posts_per_day is NOT passed to the daily-times planner",
      !/planDailyTimes\(\{[\s\S]{0,260}postsPerDay/.test(gen))
    ok("both cadences share one insert path (no second writer)",
      (gen.match(/\.from\("social_posts"\)\s*\.insert\(/g) ?? []).length === 1)
    ok("both go through the DST-safe wall-clock conversion",
      /scheduled_at: wallClockToUtcISO\(p\.dateKey, p\.minute, tz\)/.test(gen))

    const mig = read("supabase/manual/20261005_social_recurring_daily_times.sql")
    ok("cadence defaults to 'interval' (no rule changes behaviour)",
      /add column if not exists cadence text not null default 'interval'/.test(mig))
    ok("daily_times is nullable with no default", /add column if not exists daily_times smallint\[\]/.test(mig))
    ok("the migration performs NO update/backfill", !/\bupdate\s+public\.social_recurring_rules\b/i.test(mig))
    ok("a daily_times rule must carry 1-3 valid times",
      /array_length\(daily_times, 1\) between 1 and 3/.test(mig) && /t >= 0 and t < 1440/.test(mig))
    ok("…and an interval rule must carry none", /cadence = 'interval' and daily_times is null/.test(mig))
  }

  console.log("\nTHE UI ADDS AN OPTION WITHOUT CHANGING THE OLD ONES:")
  {
    const ui = read("components/crm/social/PostEditor.tsx")
    ok("Twice Daily is offered", /<option value="twice-daily">Twice Daily<\/option>/.test(ui))
    ok("the existing 14/30/60 options are unchanged",
      /<option value="14">Every 14 days<\/option><option value="30">Every 30 days<\/option><option value="60">Every 60 days<\/option>/.test(ui))
    ok("two time controls exist", /First post/.test(ui) && /Second post/.test(ui))
    ok("…defaulting to 9:00 AM and 7:00 PM",
      /useState\(9 \* 60\)/.test(ui) && /useState\(19 \* 60\)/.test(ui))
    ok("times are sent as minutes from local midnight", /dailyTimes: \[firstTimeMin, secondTimeMin\]/.test(ui))
    ok("a Twice Daily rule pins intervalDays to 1 rather than carrying a stale 14/30/60",
      /cadence === "daily_times" \? 1 : repeatEvery/.test(ui))
    ok("the time pickers only show for the new cadence", /cadence === "daily_times" && \(/.test(ui))
  }

  console.log(`\n${pass} passed, ${fail} failed\n`)
  if (fail > 0) process.exit(1)
}

void main()
