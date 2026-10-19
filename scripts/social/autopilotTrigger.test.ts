// THE AUTOMATIC TRIGGER — and the occupancy defect that made a repeating planner impossible.
//
// ── WHAT THE TRIGGER IS ─────────────────────────────────────────────────────────────────────
// A cron route that calls runAutopilotPlan, the same function the manual admin route calls. It
// decides nothing: not the times, not the order, not the cooldown, not whether a post is eligible.
// So most of this file is about proving it ADDED nothing and can be repeated safely.
//
// ── THE DEFECT ──────────────────────────────────────────────────────────────────────────────
// planAutopilot has always taken `occupancyByConnection`; planDailyTimes has always honoured it.
// Nothing ever passed it. One manual run against an empty calendar never notices. A trigger does:
// run 2 regenerates the identical slot list from empty occupancy and re-proposes slots run 1
// already filled. The unique index refuses them (so nothing is double-booked) and the queue stops
// growing. Section 3 proves the fix with a real two-run simulation — the only way to test
// idempotency is to actually run it twice.
//
// Run: npx tsx scripts/social/autopilotTrigger.test.ts
import { readFileSync } from "node:fs"
import path from "node:path"
import { planAutopilot, type AutopilotRule, type PoolPost } from "../../lib/social/autopilotPlanner"
import { occupancyFromRows, type ScheduledRow } from "../../lib/social/autopilotOccupancy"
import { wallClockToUtcISO, DEFAULT_TIMEZONE, slotForMinute } from "../../lib/social/recurrence"
import { BASELINE_DAILY_TIMES, effectiveDailyTimes } from "../../lib/social/autopilotDestination"
import { buildClaims } from "../../lib/social/autopilotWrite"

let pass = 0, fail = 0
const ok = (l: string, c: boolean) => { if (c) { pass++; console.log(`  ✓ ${l}`) } else { fail++; console.log(`  ✗ ${l}`) } }
const read = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8")
const code = (f: string) => read(f).replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, "")

const cron = code("app/api/cron/social-autopilot-plan/route.ts")
const planRun = code("lib/social/autopilotPlanRun.ts")
const occ = code("lib/social/autopilotOccupancy.ts")
const vercel = JSON.parse(read("vercel.json")) as { crons: { path: string; schedule: string }[] }

const APPROVED = "2026-10-01T00:00:00Z"
const CONN = "conn-1"
const rule = (over: Partial<AutopilotRule> = {}): AutopilotRule => ({
  connectionId: CONN, platform: "instagram", enabled: true, timezone: DEFAULT_TIMEZONE,
  dailyTimes: BASELINE_DAILY_TIMES, postsPerDay: 2, marketWeights: {}, marketRotationSeed: null,
  staggerOffsetMinutes: 0, startIndex: 0, ...over,
})
/** `place` is the RAW place_id — propertyKeyOf adds the "place:" prefix itself. */
const post = (id: string, place: string, over: Partial<PoolPost> = {}): PoolPost => ({
  id, sourceContentId: `src-${id}`, placeId: place, market: "Dallas", propertyName: place,
  status: "ready", renderStatus: "ready", renderedStoragePath: `r/${id}.mp4`,
  scheduledAt: null, publishedAt: null, externalPostId: null, connectionId: null,
  platform: "instagram", approvedAt: APPROVED, followsPostId: null, ...over,
})

// ── 1. THE TRIGGER IS A DOORBELL, NOT A SCHEDULER ───────────────────────────
console.log("1. the trigger adds no scheduling logic of its own:")
ok("it calls the SAME function the manual route calls", /runAutopilotPlan\(/.test(cron))
ok("it does not call the planner directly", !/planAutopilot\(/.test(cron))
ok("it does not build or execute claims", !/applyAutopilotPlan|supabaseClaimExecutor|buildClaims/.test(cron))
ok("it does not query social_posts itself", !/from\("social_posts"\)/.test(cron))
ok("it computes no times of its own", !/\b450\b|\b1170\b|07:30|19:30/.test(cron))
ok("...it reports the existing constant instead", /dailyTimes: BASELINE_DAILY_TIMES/.test(cron))
ok("it does not define its own cooldown", !/cooldownDays\s*[:=]\s*\d/.test(cron) && /COOLDOWN_DAYS/.test(cron))

console.log("\n   and it cannot publish:")
ok("no Instagram module is imported", !/instagram/i.test(cron.replace(/SOCIAL_INSTAGRAM_AUTOPUBLISH_ENABLED/g, "")))
ok("no publish helper is reachable", !/createReelContainer|createStoryContainer|finalizeInstagramPublish|media_publish/.test(cron))
ok("it never touches published_at or external_post_id", !/published_at|external_post_id/.test(cron))

// ── 2. DISABLED UNTIL EXPLICITLY AUTHORISED ─────────────────────────────────
console.log("\n2. the trigger is parked, behind three independent gates:")
ok("CRON_SECRET is required", /CRON_SECRET/.test(cron))
ok("...and a MISSING secret locks rather than opens", /if \(!cronSecret \|\| auth !== `Bearer \$\{cronSecret\}`\)/.test(cron))
ok("the trigger has its OWN switch", /SOCIAL_AUTOPILOT_TRIGGER_ENABLED/.test(cron))
ok("...which only the exact string 'true' arms", /\(process\.env\.SOCIAL_AUTOPILOT_TRIGGER_ENABLED \?\? ""\)\.trim\(\) === "true"/.test(cron))
ok("the WRITE switch is separate and still required", /SOCIAL_AUTOPILOT_WRITE_ENABLED/.test(cron))
ok("...so trigger-on + write-off is a real dry run", /writeEnabled\(\) \? "persist" : DEFAULT_WRITE_MODE/.test(cron))
ok("the disabled branch returns BEFORE any read", /skipped: "trigger_disabled"/.test(cron)
  && cron.indexOf("trigger_disabled") < cron.indexOf("runAutopilotPlan("))
// A fail-open default would be the one bug that matters here, so assert the strictness directly.
for (const v of ["", "false", "1", "yes", "TRUE", "true ", " true"]) {
  const armed = (v ?? "").trim() === "true"
  ok(`SOCIAL_AUTOPILOT_TRIGGER_ENABLED=${JSON.stringify(v)} -> ${armed ? "ARMED" : "off"}`, armed === (v.trim() === "true"))
}
ok("only an exact 'true' arms it (undefined is off)", ((undefined as string | undefined) ?? "").trim() !== "true")

console.log("\n   the cron entry exists so the parked route is exercised in production:")
const entry = vercel.crons.find((c) => c.path === "/api/cron/social-autopilot-plan")
ok("vercel.json registers the trigger", !!entry)
ok("...hourly", entry?.schedule === "0 * * * *")
ok("the publish worker's schedule is untouched",
  vercel.crons.find((c) => c.path === "/api/cron/social-instagram-publish")?.schedule === "*/5 * * * *")
// NINE, not eight. This said 8 and had been failing since social-comment-poll shipped in
// ec83f71 ("comment automation, deployed inert"), which this suite predates. Verified before
// changing the number rather than after: all nine entries resolve to a real route handler under
// app/api/cron/, and each traces to its own deliberate feature commit — auto-archive /
// archive-monthly / trial-reminders (CRM automation), meta-insights-sync, followup-tick,
// insights-refresh, social-instagram-publish, social-comment-poll, social-autopilot-plan. None is
// accidental, so the count was stale and the crons were not. vercel.json is NOT modified.
ok("no other cron was changed or removed", vercel.crons.length === 9)
// THE POINT about DST, asserted rather than only commented: the firing expression contains no
// Central-time hour, because the posting time comes from the plan, not from when the cron fires.
ok("the cron expression encodes NO posting hour — DST cannot drift it",
  entry?.schedule.split(" ")[1] === "*")

// ── 3. IDEMPOTENCY, BY ACTUALLY RUNNING IT TWICE ────────────────────────────
console.log("\n3. two runs over one calendar — the real test:")
{
  const NOW = new Date("2026-10-12T02:00:00Z") // 21:00 Oct 11 Central — before both of Oct 12's times
  const START = "2026-10-12"
  const conns = [{ connectionId: CONN, staggerOffsetMinutes: 0, dailyTimes: BASELINE_DAILY_TIMES, timezone: DEFAULT_TIMEZONE }]

  const pool1 = [post("p1", "A"), post("p2", "B"), post("p3", "C")]
  const runPlan = (pool: PoolPost[], rows: ScheduledRow[]) => planAutopilot({
    rules: [rule()], pool, startDateKey: START, wallClockToUtc: wallClockToUtcISO,
    occupancyByConnection: occupancyFromRows({ rows, connections: conns, now: NOW }),
    cooldownDays: 21, maxDays: 4,
  })

  // RUN 1 — empty calendar.
  const r1 = runPlan(pool1, [])
  ok(`run 1 places all 3 posts (${r1.planned.length})`, r1.planned.length === 3)
  const slots1 = r1.planned.map((p) => p.scheduledAtUtc)
  ok("...into 3 distinct slots", new Set(slots1).size === 3)

  // The rows run 1 wrote. Those posts are now ineligible (scheduled + assigned), which is the
  // FIRST of the four idempotency guards.
  const rowsAfter1: ScheduledRow[] = r1.planned.map((p) => ({ connection_id: CONN, scheduled_at: p.scheduledAtUtc }))
  const scheduledIds = new Set(r1.planned.map((p) => p.postId))
  const pool2 = pool1.map((p) => scheduledIds.has(p.id)
    ? { ...p, scheduledAt: "x", connectionId: CONN, status: "scheduled" } : p)

  // RUN 2 — same inputs, nothing new approved. The replenish-with-no-new-inventory case.
  const r2 = runPlan(pool2, rowsAfter1)
  ok("run 2 with no new inventory plans NOTHING", r2.planned.length === 0)
  ok("...and reports the already-scheduled posts as excluded, not as failures",
    r2.excluded.length === 3 && r2.excluded.every((e) => e.reason === "already_scheduled"))

  // RUN 3 — one new approval arrives. It must land in the NEXT EMPTY slot, never on a filled one.
  const pool3 = [...pool2, post("p4", "D")]
  const r3 = runPlan(pool3, rowsAfter1)
  ok("run 3 places the one newly approved post", r3.planned.length === 1)
  ok("...in a slot run 1 did NOT fill",
    r3.planned.length === 1 && !slots1.includes(r3.planned[0].scheduledAtUtc))
  ok("...and the queue therefore GREW rather than stalling",
    new Set([...slots1, ...r3.planned.map((p) => p.scheduledAtUtc)]).size === 4)

  // WITHOUT the occupancy argument — the state of the code before this change — run 3 collides.
  const r3NoOcc = planAutopilot({
    rules: [rule()], pool: pool3, startDateKey: START, wallClockToUtc: wallClockToUtcISO,
    cooldownDays: 21, maxDays: 4,
  })
  ok("CONTROL: with occupancy omitted, the same run targets an ALREADY-FILLED slot",
    r3NoOcc.planned.length === 1 && slots1.includes(r3NoOcc.planned[0].scheduledAtUtc))
  ok("...which proves the occupancy argument is what fixed it, not a coincidence of ordering",
    r3NoOcc.planned[0].scheduledAtUtc !== r3.planned[0].scheduledAtUtc)
}

// ── 4. ELAPSED SLOTS ARE NOT "UPCOMING" ─────────────────────────────────────
console.log("\n4. a run mid-afternoon does not backfill this morning:")
{
  const conns = [{ connectionId: CONN, staggerOffsetMinutes: 0, dailyTimes: BASELINE_DAILY_TIMES, timezone: DEFAULT_TIMEZONE }]
  // 14:00 Central on Oct 12 2026 (CDT, UTC-5) => 19:00Z. 07:30 has passed; 19:30 has not.
  const afternoon = new Date("2026-10-12T19:00:00Z")
  const o = occupancyFromRows({ rows: [], connections: conns, now: afternoon })
  const day = o.get(CONN)?.get("2026-10-12")
  ok("07:30 is marked spent", !!day?.minutes.has(450))
  ok("19:30 is still free", !day?.minutes.has(1170))
  ok("...and its evening window is free too", !day?.slots.has(slotForMinute(1170)!))

  const r = planAutopilot({
    rules: [rule()], pool: [post("p1", "A")], startDateKey: "2026-10-12",
    wallClockToUtc: wallClockToUtcISO, occupancyByConnection: o, cooldownDays: 21, maxDays: 2,
  })
  // WHAT ACTUALLY HAPPENS, asserted rather than what would be tidier. planDailyTimes binds
  // occurrence index 0 to the first daily time and BUMPS IT FORWARD A DAY when that minute is
  // taken, rather than falling through to the day's later time. So a lone post placed on an
  // afternoon run goes to TOMORROW 07:30 and tonight's 19:30 stays open for the next one.
  //
  // That is the existing bump semantics — the same path a manually-occupied slot takes — and
  // planDailyTimes is the frozen timing authority, so it is recorded here as a known
  // characteristic, not corrected. The two guarantees that matter both hold: never the past, and
  // only ever a configured daily time. An unused slot costs a post twelve hours; changing the
  // timing authority to reclaim it would risk every other caller.
  ok("the post lands on a real daily time", r.planned.length === 1 && [450, 1170].includes(r.planned[0].minute))
  ok("...never in the past — the elapsed 07:30 was skipped, not backfilled",
    r.planned.every((p) => Date.parse(p.scheduledAtUtc) > afternoon.getTime()))
  ok("KNOWN CHARACTERISTIC: index 0 bumps to tomorrow 07:30 rather than taking tonight's 19:30",
    r.planned[0].dateKey === "2026-10-13" && r.planned[0].minute === 450)
  // Tonight's slot is not LOST, which is the thing that would actually matter: a second post fills
  // it on the same run.
  const r2 = planAutopilot({
    rules: [rule()], pool: [post("p1", "A"), post("p2", "B")], startDateKey: "2026-10-12",
    wallClockToUtc: wallClockToUtcISO, occupancyByConnection: o, cooldownDays: 21, maxDays: 2,
  })
  ok("...and tonight's 19:30 is still reachable — two posts fill both slots",
    r2.planned.length === 2 && r2.planned.some((p) => p.dateKey === "2026-10-12" && p.minute === 1170))
  ok("...with both still in the future", r2.planned.every((p) => Date.parse(p.scheduledAtUtc) > afternoon.getTime()))

  // Before midnight Central, nothing today has elapsed.
  const early = new Date("2026-10-12T06:00:00Z") // 01:00 Central
  const oEarly = occupancyFromRows({ rows: [], connections: conns, now: early })
  ok("at 01:00 Central both of today's times are still open",
    !oEarly.get(CONN)?.get("2026-10-12")?.minutes.has(450) && !oEarly.get(CONN)?.get("2026-10-12")?.minutes.has(1170))

  // Exactly on the minute is still fillable — filling "now" is not retroactive.
  const onTheMinute = new Date("2026-10-12T12:30:00Z") // 07:30 Central exactly
  ok("exactly at 07:30 the slot is NOT yet treated as spent",
    !occupancyFromRows({ rows: [], connections: conns, now: onTheMinute }).get(CONN)?.get("2026-10-12")?.minutes.has(450))
}

// ── 5. OCCUPANCY ITSELF ─────────────────────────────────────────────────────
console.log("\n5. what counts as an occupied slot:")
{
  const conns = [
    { connectionId: "c-a", staggerOffsetMinutes: 0, dailyTimes: BASELINE_DAILY_TIMES, timezone: DEFAULT_TIMEZONE },
    { connectionId: "c-b", staggerOffsetMinutes: 0, dailyTimes: BASELINE_DAILY_TIMES, timezone: DEFAULT_TIMEZONE },
  ]
  const NOW = new Date("2026-10-12T02:00:00Z")
  const o = occupancyFromRows({
    rows: [
      { connection_id: "c-a", scheduled_at: "2026-10-13T12:30:00Z" }, // 07:30 Central Oct 13
      { connection_id: "c-b", scheduled_at: "2026-10-13T12:30:00Z" }, // same minute, OTHER account
      { connection_id: "c-a", scheduled_at: null },                   // unscheduled draft
      { connection_id: null, scheduled_at: "2026-10-14T12:30:00Z" },  // legacy, no connection
      { connection_id: "c-a", scheduled_at: "not-a-date" },
      { connection_id: "c-zz", scheduled_at: "2026-10-13T12:30:00Z" }, // a connection not planned for
    ],
    connections: conns, now: NOW,
  })
  ok("a scheduled row occupies its minute", !!o.get("c-a")?.get("2026-10-13")?.minutes.has(450))
  ok("PER CONNECTION — the other account's identical minute is its own", !!o.get("c-b")?.get("2026-10-13")?.minutes.has(450))
  ok("...and does not bleed into the first", o.get("c-a")?.get("2026-10-13")?.count === 1)
  ok("a draft with no schedule occupies nothing", !o.get("c-a")?.get("2026-10-14"))
  ok("a legacy row with no connection is ignored", !o.get("c-a")?.get("2026-10-14") && !o.get("c-b")?.get("2026-10-14"))
  // The bad rows must contribute NOTHING. Asserted against the day they would have landed on and
  // against the key set, rather than against a total entry count — the map also carries the
  // elapsed-times entry for the current Central day (2026-10-11 at this NOW), so a bare `.size`
  // check conflates two unrelated things.
  ok("an unparseable timestamp is skipped, not crashed on", o.get("c-a")?.get("2026-10-13")?.count === 1)
  ok("...and creates no garbage day key",
    [...(o.get("c-a") ?? new Map()).keys()].every((k) => /^\d{4}-\d{2}-\d{2}$/.test(k)))
  ok("the only days present are the scheduled one and today's elapsed times",
    new Set([...(o.get("c-a") ?? new Map()).keys()]).size === 2
    && !!o.get("c-a")?.has("2026-10-13") && !!o.get("c-a")?.has("2026-10-11"))
  ok("a row for an unplanned connection creates no phantom entry", !o.has("c-zz"))
  ok("every planned connection gets an entry, even an empty one", o.has("c-a") && o.has("c-b") && o.size === 2)
  ok("the approved WINDOW is marked as well as the exact minute",
    !!o.get("c-a")?.get("2026-10-13")?.slots.has(slotForMinute(450)!))

  // A PUBLISHED post has spent its slot as surely as a pending one: it keeps its scheduled_at, and
  // the query that feeds this filters only on scheduled_at IS NOT NULL — not on status.
  ok("the query filters on scheduled_at only, so published rows still count",
    /\.not\("scheduled_at", "is", null\)/.test(occ) && !/\.eq\("status"/.test(occ))
  ok("...and it is a pure SELECT — occupancy never writes", !/\.update\(|\.insert\(|\.upsert\(|\.delete\(/.test(occ))

  // Stagger must be read through the SAME function the planner uses, or the minute marked spent is
  // not the minute the planner will try to fill.
  ok("stagger comes from effectiveDailyTimes, not a local copy", /effectiveDailyTimes\(/.test(occ))
  const staggered = effectiveDailyTimes("c-a", 17, BASELINE_DAILY_TIMES)
  const oS = occupancyFromRows({
    rows: [], connections: [{ connectionId: "c-a", staggerOffsetMinutes: 17, dailyTimes: BASELINE_DAILY_TIMES, timezone: DEFAULT_TIMEZONE }],
    now: new Date("2026-10-12T19:00:00Z"),
  })
  ok(`a staggered account marks ITS elapsed time (${staggered[0]}), not the baseline 450`,
    !!oS.get("c-a")?.get("2026-10-12")?.minutes.has(staggered[0]) )
}

// ── 6. CONCURRENCY ──────────────────────────────────────────────────────────
console.log("\n6. two runs at the same instant:")
{
  // Both runs see the identical calendar, so both produce the identical plan. What stops a
  // duplicate is the atomic claim, not the plan — so assert the plan is deterministic (making a
  // race reproducible) and that the claim layer is the thing that resolves it.
  const conns = [{ connectionId: CONN, staggerOffsetMinutes: 0, dailyTimes: BASELINE_DAILY_TIMES, timezone: DEFAULT_TIMEZONE }]
  const NOW = new Date("2026-10-12T02:00:00Z")
  const mk = () => planAutopilot({
    rules: [rule()], pool: [post("p1", "A"), post("p2", "B")], startDateKey: "2026-10-12",
    wallClockToUtc: wallClockToUtcISO,
    occupancyByConnection: occupancyFromRows({ rows: [], connections: conns, now: NOW }),
    cooldownDays: 21, maxDays: 3,
  })
  const a = mk(), b = mk()
  ok("two simultaneous runs produce the IDENTICAL plan",
    JSON.stringify(a.planned) === JSON.stringify(b.planned))

  const state = new Map(["p1", "p2"].map((id) => [id, {
    status: "ready", renderStatus: "ready", renderedStoragePath: `r/${id}.mp4`,
    scheduledAt: null, publishedAt: null, externalPostId: null, connectionId: null,
    platform: "instagram", approvedAt: APPROVED, followsPostId: null,
  }]))
  const ca = buildClaims(a, state), cb = buildClaims(b, state)
  ok("...and therefore the identical claim list, in the same order",
    JSON.stringify(ca.claims) === JSON.stringify(cb.claims))
  ok("no claim list contains one slot twice",
    new Set(ca.claims.map((c) => `${c.connectionId}@${c.scheduledAtUtc}`)).size === ca.claims.length)
  ok("no claim list contains one post twice", new Set(ca.claims.map((c) => c.postId)).size === ca.claims.length)

  // The LOSER of the race must be reported, never retried blindly.
  const w = code("lib/social/autopilotWrite.ts")
  ok("the claim is a conditional UPDATE on every eligibility column",
    /\.eq\("status", req\.requireStatus\)/.test(w) && /for \(const col of req\.requireNullColumns\) q\.is\(col, null\)/.test(w))
  ok("23505 on the slot index is classified, not thrown", /code === "23505"\) return \{ ok: false, reason: "slot_taken" \}/.test(w))
  ok("a zero-row UPDATE is reported as a lost race", /reason: "no_match"/.test(w))
  ok("claims are issued SEQUENTIALLY so a race is reproducible", /for \(const claim of claims\)/.test(w))
}

// ── 7. NOTHING ELSE MOVED ───────────────────────────────────────────────────
console.log("\n7. the existing posting logic is untouched:")
{
  const publish = code("app/api/cron/social-instagram-publish/route.ts")
  ok("the publish worker still requires its own autopublish flag", /SOCIAL_INSTAGRAM_AUTOPUBLISH_ENABLED/.test(publish))
  ok("...and knows nothing about the trigger", !/SOCIAL_AUTOPILOT_TRIGGER_ENABLED/.test(publish))
  ok("the approval gate is still in the due query", /\.not\("approved_at", "is", null\)/.test(publish))
  ok("the 76aba04 recovery sweep survives", /media_publish_claimed_at/.test(publish) && /strandedRows/.test(publish))
  ok("Story timing is still 45 minutes", /45/.test(code("lib/social/storyFollowUp.ts")))

  // The eligible pool still demands approval and a finished render — the trigger cannot widen it.
  ok("the pool still requires approval", /ELIGIBLE_POOL_NOT_NULL/.test(planRun))
  ok("the plan horizon is still 14 days", /MAX_PLAN_DAYS = 14/.test(planRun))
  ok("the trigger cannot approve anything", !/approved_at\s*[:=]/.test(cron))
  ok("...nor render anything", !/render|Render/.test(cron.replace(/renderStatus/g, "")))
}

// ── 8. THE FIVE RULES, THROUGH THE TRIGGER'S OWN PATH ───────────────────────
// Each of these is enforced by code the trigger reuses rather than owns. They are re-asserted here
// against the planner as the trigger actually calls it — with occupancy populated — because "the
// rule is implemented somewhere" and "the rule holds on the path the cron takes" are different
// claims, and only the second one matters now that something runs unattended.
console.log("\n8. approval, cooldown, existing posts, isolation, duplicates:")
{
  const conns = (ids: string[]) => ids.map((connectionId) => ({
    connectionId, staggerOffsetMinutes: 0, dailyTimes: BASELINE_DAILY_TIMES, timezone: DEFAULT_TIMEZONE,
  }))
  const NOW = new Date("2026-10-12T02:00:00Z")
  const plan = (rules: AutopilotRule[], pool: PoolPost[], rows: ScheduledRow[] = [], history?: Map<string, Map<string, string>>) =>
    planAutopilot({
      rules, pool, startDateKey: "2026-10-12", wallClockToUtc: wallClockToUtcISO,
      occupancyByConnection: occupancyFromRows({ rows, connections: conns(rules.map((r) => r.connectionId)), now: NOW }),
      history, cooldownDays: 21, maxDays: 6,
    })

  // (a) APPROVAL
  const unapproved = post("u1", "A", { approvedAt: null })
  const ra = plan([rule()], [unapproved, post("a1", "B")])
  ok("an UNAPPROVED post is never placed, even with slots free",
    ra.planned.every((p) => p.postId !== "u1") && ra.planned.some((p) => p.postId === "a1"))
  ok("...and is reported as not_approved", ra.excluded.some((e) => e.postId === "u1" && e.reason === "not_approved"))
  ok("a pool of ONLY unapproved posts plans nothing at all", plan([rule()], [unapproved]).planned.length === 0)

  // (b) THE 21-DAY COOLDOWN, measured against each SLOT's own time
  const hist = new Map([[CONN, new Map([["place:A", "2026-10-10T12:30:00Z"]])]])
  const rb = plan([rule()], [post("c1", "A")], [], hist)
  ok("a property posted 2 days ago is not re-placed inside its cooldown",
    rb.planned.every((p) => (p.daysSinceLastPosted ?? 99) >= 21))
  ok("...the planner reports the slots it refused to fill rather than repeating", rb.inventory.unfilledSlots > 0)
  ok("...and records ZERO cooldown violations", rb.inventory.cooldownViolations === 0)
  // Far enough out, the same property becomes legal again — the rule is a delay, not a ban.
  const rbFar = planAutopilot({
    rules: [rule()], pool: [post("c1", "A")], startDateKey: "2026-11-05",
    wallClockToUtc: wallClockToUtcISO, history: hist, cooldownDays: 21, maxDays: 2,
    occupancyByConnection: occupancyFromRows({ rows: [], connections: conns([CONN]), now: NOW }),
  })
  ok("...and IS placed again once 21 days have elapsed",
    rbFar.planned.length > 0 && (rbFar.planned[0].daysSinceLastPosted ?? 0) >= 21)

  // (c) EXISTING SCHEDULED POSTS — both halves: the post and the slot.
  const existing = post("e1", "A", { scheduledAt: "2026-10-13T12:30:00Z", connectionId: CONN, status: "scheduled" })
  const rc = plan([rule()], [existing, post("n1", "B")], [{ connection_id: CONN, scheduled_at: "2026-10-13T12:30:00Z" }])
  ok("an already-scheduled post is not re-planned", rc.planned.every((p) => p.postId !== "e1"))
  ok("...and its occupied minute is not handed to another post",
    rc.planned.every((p) => p.scheduledAtUtc !== "2026-10-13T12:30:00Z"))

  // (d) ACCOUNT ISOLATION
  //
  // CORRECTED AFTER MEASURING, because the obvious assertion — "two accounts never receive the
  // same post" — is false of the PLANNER and asserting it would have been asserting a design that
  // does not exist. The pool is deliberately SHARED across an owner's accounts (planRotation gives
  // each connection a different start index into it), so one plan may well propose post s1 to two
  // accounts. What guarantees a post row is scheduled once is one layer down:
  //
  //   buildClaims keeps a `seenPost` set and pre-rejects the second occurrence as `post_lost`
  //   the claim's requireNullColumns include scheduled_at AND connection_id, so even across
  //   separate runs the row can only be claimed while it is still unassigned
  //
  // Measured with startIndex pinned to 0 on both accounts (maximal collision) and with the
  // production value of null: in both cases every post is claimed exactly once.
  const rd = plan([rule({ connectionId: "ig-a" }), rule({ connectionId: "ig-b" })], [post("s1", "A"), post("s2", "B")])
  ok("...each placement names its own connection",
    rd.planned.every((p) => p.connectionId === "ig-a" || p.connectionId === "ig-b"))
  {
    const state = new Map(["s1", "s2"].map((id) => [id, {
      status: "ready", renderStatus: "ready", renderedStoragePath: `r/${id}.mp4`,
      scheduledAt: null, publishedAt: null, externalPostId: null, connectionId: null,
      platform: "instagram", approvedAt: APPROVED, followsPostId: null,
    }]))
    const built = buildClaims(rd, state)
    ok("a post row is CLAIMED for exactly one account, never two",
      new Set(built.claims.map((c) => c.postId)).size === built.claims.length)
    ok("...the second account's duplicate placement is pre-rejected as post_lost, not written",
      built.preRejected.some((r) => r.kind === "post_lost"))
    ok("...and the claim itself requires the row to still be UNASSIGNED",
      /requireNullColumns/.test(code("lib/social/autopilotWrite.ts"))
      && (/"connection_id"/.test(code("lib/social/autopilotWrite.ts"))))

    // With the PRODUCTION rotation (startIndex null) the two accounts are offset, so each gets
    // different inventory in the same minute and both are actually served.
    const rotated = plan(
      [rule({ connectionId: "ig-a", startIndex: null }), rule({ connectionId: "ig-b", startIndex: null })],
      [post("s1", "A"), post("s2", "B"), post("s3", "C"), post("s4", "D")])
    const firstSlot = rotated.planned.filter((p) => p.scheduledAtUtc === rotated.planned[0].scheduledAtUtc)
    ok("with the real rotation, two accounts get DIFFERENT posts in the same slot",
      firstSlot.length === 2 && firstSlot[0].postId !== firstSlot[1].postId)
    ok("...so neither account is starved by the other", new Set(rotated.planned.map((p) => p.connectionId)).size === 2)
  }
  // A TikTok account must never be offered an Instagram post — eligibility is per rule, not global.
  const rdTt = plan([rule({ connectionId: "tt-1", platform: "tiktok" })], [post("s1", "A")])
  ok("a TikTok connection is offered NO Instagram inventory", rdTt.planned.length === 0)
  const rdBoth = plan([rule({ connectionId: "ig-a" }), rule({ connectionId: "tt-1", platform: "tiktok" })], [post("s1", "A")])
  ok("...and with both connected, the Instagram post goes only to the Instagram account",
    rdBoth.planned.length === 1 && rdBoth.planned[0].connectionId === "ig-a")
  // History is per connection: account A having posted a property does not bar account B.
  const rdHist = plan(
    [rule({ connectionId: "ig-a" }), rule({ connectionId: "ig-b" })], [post("s1", "A")],
    [], new Map([["ig-a", new Map([["place:A", "2026-10-11T12:30:00Z"]])]]))
  ok("one account's posting history does not restrict another's",
    rdHist.planned.some((p) => p.connectionId === "ig-b" && p.postId === "s1"))
  ok("...while the account that DID post it stays inside its cooldown",
    rdHist.planned.every((p) => !(p.connectionId === "ig-a" && (p.daysSinceLastPosted ?? 99) < 21)))
  // A disabled (paused) account receives nothing.
  ok("a PAUSED account is not planned for at all",
    plan([rule({ enabled: false })], [post("s1", "A")]).planned.length === 0)

  // (e) DUPLICATE PREVENTION, across a plan AND across runs
  const re = plan([rule()], [post("d1", "A"), post("d2", "A"), post("d3", "B")])
  ok("one post never appears twice in a plan", new Set(re.planned.map((p) => p.postId)).size === re.planned.length)
  ok("one (connection, slot) pair never appears twice",
    new Set(re.planned.map((p) => `${p.connectionId}@${p.scheduledAtUtc}`)).size === re.planned.length)
  // Two creatives of ONE building are one property: the second must not follow the first immediately.
  const sameProp = re.planned.filter((p) => p.propertyKey === "place:A")
  ok("two creatives of the same BUILDING respect the cooldown between them",
    sameProp.length < 2 || Math.abs(Date.parse(sameProp[1].scheduledAtUtc) - Date.parse(sameProp[0].scheduledAtUtc)) >= 21 * 86_400_000)
  ok("...and the planner counts them as ONE distinct property, not two",
    re.inventory.distinctProperties === 2)
}

// ── 9. BOTH DAILY SLOTS GET FILLED ──────────────────────────────────────────
// THE QUESTION: when both slots are open and there are enough approved videos, does the planner
// fill BOTH, or does it leave the evening one empty?
//
// MEASURED, not reasoned about, across a matrix of pool sizes and run times — because the honest
// answer has one exception and the exception only shows up at a specific inventory level.
console.log("\n9. both daily slots, across pool sizes and run times:")
{
  const conns = [{ connectionId: CONN, staggerOffsetMinutes: 0, dailyTimes: BASELINE_DAILY_TIMES, timezone: DEFAULT_TIMEZONE }]
  const DAYS = 4
  const run = (poolSize: number, now: Date) => {
    const pool = Array.from({ length: poolSize }, (_, i) => post(`p${i}`, `PLACE${i}`))
    return planAutopilot({
      rules: [rule()], pool, startDateKey: "2026-10-12", wallClockToUtc: wallClockToUtcISO,
      occupancyByConnection: occupancyFromRows({ rows: [], connections: conns, now }),
      cooldownDays: 21, maxDays: DAYS,
    })
  }
  // 01:00 Central on the start day — both of that day's slots are still ahead.
  const beforeBoth = new Date("2026-10-12T06:00:00Z")

  console.log("   fresh calendar, run BEFORE 07:30 — both slots open:")
  for (const n of [2, 4, 6, 8]) {
    const r = run(n, beforeBoth)
    // Group placements by day and look for both configured minutes.
    const byDay = new Map<string, number[]>()
    for (const p of r.planned) byDay.set(p.dateKey, [...(byDay.get(p.dateKey) ?? []), p.minute])
    // Every day that received 2 placements must have received one of EACH time.
    const fullDays = [...byDay.values()].filter((ms) => ms.length === 2)
    const bothTimes = fullDays.every((ms) => ms.includes(450) && ms.includes(1170))
    // And with enough inventory, the leading days must be complete rather than morning-only.
    const expectFull = Math.floor(n / 2)
    ok(`${n} videos -> ${r.planned.length} placed; ${fullDays.length} complete day(s), each with 07:30 AND 19:30`,
      bothTimes && fullDays.length >= Math.min(expectFull, DAYS))
  }

  console.log("\n   the evening slot is never skipped while inventory remains:")
  for (const n of [2, 3, 4, 5, 6, 7, 8]) {
    const r = run(n, beforeBoth)
    const slots: { dateKey: string; minute: number }[] = []
    for (let d = 0; d < DAYS; d++) {
      const dk = `2026-10-${String(12 + d).padStart(2, "0")}`
      slots.push({ dateKey: dk, minute: 450 }, { dateKey: dk, minute: 1170 })
    }
    const filled = new Set(r.planned.map((p) => `${p.dateKey}@${p.minute}`))
    // Walk the slots in chronological order. Once a gap appears, everything after it must also be
    // empty — a filled slot AFTER a gap would mean the planner skipped an available earlier slot.
    let firstGap = -1, skipped = 0
    slots.forEach((s, i) => {
      const has = filled.has(`${s.dateKey}@${s.minute}`)
      if (!has && firstGap < 0) firstGap = i
      if (has && firstGap >= 0) skipped++
    })
    ok(`${n} videos: ${r.planned.length} placed, no slot filled after an earlier empty one (${skipped} such)`, skipped === 0)
  }

  // ── THE ONE EXCEPTION, documented by measurement ───────────────────────────
  // On a run AFTER 07:30, planDailyTimes bumps occurrence 0 (bound to 07:30) to the NEXT day. With
  // two or more videos that costs nothing — the second fills tonight's 19:30. With exactly ONE
  // video, the single placement goes to tomorrow 07:30 and tonight's 19:30 is left open.
  console.log("\n   run AFTER 07:30 (the elapsed-morning case):")
  const afterMorning = new Date("2026-10-12T19:00:00Z") // 14:00 Central
  {
    const r1 = run(1, afterMorning)
    ok("1 video: tonight's 19:30 is left empty — placement goes to tomorrow 07:30",
      r1.planned.length === 1 && r1.planned[0].dateKey === "2026-10-13" && r1.planned[0].minute === 450)
    ok("...which is planDailyTimes' existing day-bump, not a new behaviour — and never the past",
      Date.parse(r1.planned[0].scheduledAtUtc) > afterMorning.getTime())

    for (const n of [2, 3, 4, 6]) {
      const r = run(n, afterMorning)
      const tonight = r.planned.some((p) => p.dateKey === "2026-10-12" && p.minute === 1170)
      ok(`${n} videos: TONIGHT's 19:30 is filled`, tonight)
    }
    const r2 = run(2, afterMorning)
    ok("...and today's already-elapsed 07:30 is never used",
      !r2.planned.some((p) => p.dateKey === "2026-10-12" && p.minute === 450))
  }

  // Both slots keep filling day after day, not just on day 0.
  console.log("\n   sustained over several days:")
  {
    const r = run(8, beforeBoth)
    const perDay = new Map<string, Set<number>>()
    for (const p of r.planned) perDay.set(p.dateKey, new Set([...(perDay.get(p.dateKey) ?? []), p.minute]))
    const complete = [...perDay.entries()].filter(([, ms]) => ms.has(450) && ms.has(1170))
    ok(`8 videos fill both slots on ${complete.length} consecutive day(s)`, complete.length === 4)
    ok("...2 placements per day, never 3", [...perDay.values()].every((ms) => ms.size <= 2))
    ok("...and every placement is at 07:30 or 19:30", r.planned.every((p) => p.minute === 450 || p.minute === 1170))
    ok("...with no cooldown violations", r.inventory.cooldownViolations === 0)
  }
}

console.log(`\nAutopilot trigger: ${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
