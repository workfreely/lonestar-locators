// NON-PUBLISHING DRY RUN of the automatic trigger, against LIVE PRODUCTION DATA.
//
// WHAT THIS IS: the exact code path app/api/cron/social-autopilot-plan would take if it were armed,
// run with mode = dry_run. Not a simulation of that path — the same functions, the same queries,
// the same live rows, stopped one step short of the UPDATE. applyAutopilotPlan is given no
// executor on a dry run, so there is no object present that is capable of writing.
//
// WHAT IT PROVES, and the reason it is a script rather than a test: that nothing was written. It
// snapshots the five columns a schedule write would touch BEFORE and AFTER, and fails loudly if any
// of them moved. A dry run that reported "0 written" while having written is the one failure mode
// worth engineering against, so the claim is measured rather than asserted.
//
// IT CANNOT PUBLISH, APPROVE, RENDER OR SCHEDULE. No Instagram module is imported. No environment
// switch is set or read for permission — mode is hardcoded below.
//
// Run: npx tsx --env-file=.env.local scripts/social/autopilotTriggerDryRun.ts
import { supabaseAdmin } from "../../lib/supabase/admin"
import { runAutopilotPlan, COOLDOWN_DAYS, MAX_PLAN_DAYS } from "../../lib/social/autopilotPlanRun"
import { buildAutopilotOccupancy } from "../../lib/social/autopilotOccupancy"
import { BASELINE_DAILY_TIMES, effectiveDailyTimes } from "../../lib/social/autopilotDestination"
import { planAutopilot } from "../../lib/social/autopilotPlanner"
import { DEFAULT_TIMEZONE, wallClockToUtcISO } from "../../lib/social/recurrence"

const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`

/** The columns a schedule write would move. Read before and after; any change is a failure. */
async function snapshot() {
  const { count: scheduled } = await supabaseAdmin.from("social_posts")
    .select("id", { count: "exact", head: true }).not("scheduled_at", "is", null)
  const { count: assigned } = await supabaseAdmin.from("social_posts")
    .select("id", { count: "exact", head: true }).not("connection_id", "is", null)
  const { count: statusScheduled } = await supabaseAdmin.from("social_posts")
    .select("id", { count: "exact", head: true }).eq("status", "scheduled")
  const { count: published } = await supabaseAdmin.from("social_posts")
    .select("id", { count: "exact", head: true }).not("published_at", "is", null)
  const { data: touched } = await supabaseAdmin.from("social_posts")
    .select("updated_at").order("updated_at", { ascending: false }).limit(1)
  return {
    scheduled: scheduled ?? -1,
    assigned: assigned ?? -1,
    statusScheduled: statusScheduled ?? -1,
    published: published ?? -1,
    lastUpdatedAt: (touched?.[0]?.updated_at as string | undefined) ?? null,
  }
}

async function main() {
  console.log("══ AUTOPILOT TRIGGER — NON-PUBLISHING DRY RUN ══")
  console.log(`   ${new Date().toISOString()}   db=${(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/^https:\/\//, "").split(".")[0]}`)

  // ── 0. THE SWITCHES, AS THEY ACTUALLY ARE ───────────────────────────────
  // Read and REPORTED, never set. This script is also the record of what is still required.
  // LOCAL VALUES ONLY. These come from whatever env file this script was run with; Vercel's
  // production environment is separate and must be checked with `vercel env ls production`.
  // CRON_SECRET in particular IS set in production while absent from .env.local — reporting the
  // local blank as the production state once already produced a wrong claim.
  console.log("\n0. environment switches in THIS shell (read only — this script sets nothing;")
  console.log("   production values live in Vercel and are not visible here):")
  for (const k of ["CRON_SECRET", "SOCIAL_AUTOPILOT_TRIGGER_ENABLED", "SOCIAL_AUTOPILOT_WRITE_ENABLED", "SOCIAL_INSTAGRAM_AUTOPUBLISH_ENABLED"]) {
    const v = process.env[k]
    const armed = (v ?? "").trim() === "true"
    console.log(`   ${k.padEnd(40)} ${v === undefined ? "UNSET" : armed ? "ARMED" : `set, not armed`}`)
  }

  // THE REAL TABLE IS social_settings. An earlier version of this script read a table named
  // social_autopilot_settings, WHICH DOES NOT EXIST, and printed "(none)" — supabase-js returns the
  // error in `error`, not by throwing, so destructuring only `data` turned a missing table into a
  // confident-looking blank. The error is now surfaced, because "I could not read the pause state"
  // and "autoposting is off" must never print the same way.
  const { data: settings, error: settingsErr } = await supabaseAdmin
    .from("social_settings").select("owner_user_id, auto_posting, auto_posting_resumed_at")
  if (settingsErr) {
    console.log(`   social_settings.auto_posting              UNREADABLE: ${settingsErr.message}`)
    process.exitCode = 1
  } else if (!settings?.length) {
    console.log("   social_settings.auto_posting              no row (readAutoPosting falls back to PAUSED)")
  } else {
    for (const r of settings) {
      const on = r.auto_posting === "on" // normalizeAutoPosting: anything but exactly "on" is paused
      console.log(`   social_settings.auto_posting              ${String(r.auto_posting)}${on ? "  <-- ON" : " (paused)"}  owner=${String(r.owner_user_id).slice(0, 8)}`)
    }
  }

  // ── 1. LIVE STATE ───────────────────────────────────────────────────────
  console.log("\n1. live state:")
  const { data: conns } = await supabaseAdmin.from("social_connections")
    .select("id, provider, status, posting_paused, stagger_offset_minutes")
  const enabled = (conns ?? []).filter((c) => c.status === "connected" && c.posting_paused !== true)
  console.log(`   connections            ${conns?.length ?? 0} (${enabled.length} enabled)`)
  for (const c of conns ?? []) {
    console.log(`     ${String(c.id).slice(0, 8)}  ${c.provider}  status=${c.status}  paused=${c.posting_paused}`)
  }

  // THE SAME EXPRESSION computeAutopilotPlan uses. An earlier version of this script hardcoded
  // null here, which is NOT the same thing: staggerOffsetMinutes(id, null) DERIVES a hash-based
  // offset, so the script reported placements at 07:45/19:45 and invented an "elapsed 07:45" that
  // no production row had. The stored value is 0, so the real times are exactly 07:30 / 19:30. A
  // verification script that does not mirror the production mapping verifies the wrong system.
  const staggerOf = (c: Record<string, unknown>) =>
    typeof c.stagger_offset_minutes === "number" ? (c.stagger_offset_minutes as number) : null
  for (const c of enabled) {
    console.log(`     ${String(c.id).slice(0, 8)}  stagger_offset_minutes=${String(c.stagger_offset_minutes)} -> effective ${effectiveDailyTimes(String(c.id), staggerOf(c), BASELINE_DAILY_TIMES).map(hhmm).join(" / ")}`)
  }

  const before = await snapshot()
  console.log(`   posts with a schedule  ${before.scheduled}`)
  console.log(`   posts assigned         ${before.assigned}`)
  console.log(`   status='scheduled'     ${before.statusScheduled}`)
  console.log(`   published              ${before.published}`)

  const { count: approvedCount } = await supabaseAdmin.from("social_posts")
    .select("id", { count: "exact", head: true }).not("approved_at", "is", null)
  console.log(`   APPROVED posts         ${approvedCount ?? 0}   <- the eligible pool's gate`)

  // ── 2. OCCUPANCY — the newly wired argument, on real rows ───────────────
  console.log("\n2. occupancy read from the live calendar (the newly wired argument):")
  const occ = await buildAutopilotOccupancy(supabaseAdmin as never, {
    connections: enabled.map((c) => ({ connectionId: String(c.id), staggerOffsetMinutes: staggerOf(c), dailyTimes: BASELINE_DAILY_TIMES, timezone: DEFAULT_TIMEZONE })),
    now: new Date(),
  })
  if (occ.size === 0) console.log("   (no enabled connections — nothing to read)")
  for (const [cid, days] of occ) {
    const total = [...days.values()].reduce((n, d) => n + d.minutes.size, 0)
    console.log(`   ${cid.slice(0, 8)}  ${days.size} day(s) carrying ${total} occupied minute(s)`)
    for (const [dk, d] of [...days].sort()) {
      console.log(`     ${dk}  ${[...d.minutes].sort((a, b) => a - b).map(hhmm).join(" ")}`)
    }
  }

  // ── 3. THE DRY RUN ──────────────────────────────────────────────────────
  // mode is a LITERAL. There is no env lookup and no code path here that can reach "persist".
  console.log("\n3. the run (mode = dry_run, hardcoded — no executor is constructed):")
  const result = await runAutopilotPlan({ mode: "dry_run", now: new Date() })

  console.log(`   planSource             ${result.planSource}`)
  console.log(`   persisted              ${result.persisted}`)
  console.log(`   timezone               ${DEFAULT_TIMEZONE}`)
  console.log(`   daily times            ${BASELINE_DAILY_TIMES.map(hhmm).join(" / ")}  (Central)`)
  console.log(`   cooldown               ${COOLDOWN_DAYS} days`)
  console.log(`   plan horizon cap       ${MAX_PLAN_DAYS} days`)
  console.log(`   WOULD CLAIM            ${result.claims.length}`)
  console.log(`   pre-rejected           ${result.preRejected.length}`)
  console.log(`   actually claimed       ${result.claimed.length}   <- must be 0`)
  console.log(`   unfilled slots         ${result.inventory.unfilledSlots}`)
  console.log(`   cooldown violations    ${result.inventory.cooldownViolations}   <- must be 0`)

  if (result.claims.length) {
    console.log("\n   the schedule it WOULD write (nothing was written):")
    for (const c of result.claims.slice(0, 20)) {
      console.log(`     ${c.scheduledAtUtc}  ${hhmm(c.minute)}  ${String(c.connectionId).slice(0, 8)}  ${c.propertyName ?? "?"}`)
    }
    if (result.claims.length > 20) console.log(`     … ${result.claims.length - 20} more`)
  }

  console.log("\n" + result.inventory.summary.split("\n").map((l) => "   " + l).join("\n"))

  // ── 3b. OCCUPANCY AVOIDANCE, ON THE LIVE CALENDAR ───────────────────────
  // The run above has an EMPTY pool (nothing is approved yet), so it proves the path executes but
  // not that occupancy is respected — there were no placements to avoid anything. This fills that
  // gap without approving a single real post: the pool here is three objects that exist only in
  // this process and are never written anywhere, planned against the occupancy just read from
  // production. It is the only way to see the newly wired argument do its job against real rows.
  console.log("\n3b. occupancy avoidance, live calendar + a synthetic in-memory pool:")
  if (occ.size === 0) {
    console.log("   (no enabled connections — skipped)")
  } else {
    const igConn = enabled.find((c) => c.provider === "instagram")
    if (!igConn) {
      console.log("   (no enabled instagram connection — skipped)")
    } else {
      const cid = String(igConn.id)
      const synthetic = ["syn-1", "syn-2", "syn-3"].map((id, i) => ({
        id, sourceContentId: `syn-src-${i}`, placeId: `SYN${i}`, market: "Dallas", propertyName: `Synthetic Property ${i + 1}`,
        status: "ready", renderStatus: "ready", renderedStoragePath: `syn/${id}.mp4`,
        scheduledAt: null, publishedAt: null, externalPostId: null, connectionId: null,
        platform: "instagram", approvedAt: new Date().toISOString(), followsPostId: null,
      }))
      const now = new Date()
      const startDateKey = new Intl.DateTimeFormat("en-CA", { timeZone: DEFAULT_TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(now)
      const rule = {
        connectionId: cid, platform: "instagram", enabled: true, timezone: DEFAULT_TIMEZONE,
        dailyTimes: BASELINE_DAILY_TIMES, postsPerDay: 2, marketWeights: {},
        marketRotationSeed: null, staggerOffsetMinutes: staggerOf(igConn as Record<string, unknown>), startIndex: null,
      }
      const withOcc = planAutopilot({
        rules: [rule], pool: synthetic, startDateKey, wallClockToUtc: wallClockToUtcISO,
        occupancyByConnection: occ, cooldownDays: COOLDOWN_DAYS, maxDays: MAX_PLAN_DAYS,
      })
      const live = occ.get(cid) ?? new Map()
      const occupiedInstants = new Set<string>()
      for (const [dk, d] of live) for (const m of d.minutes) occupiedInstants.add(wallClockToUtcISO(dk, m, DEFAULT_TIMEZONE))

      console.log(`   live occupied instants on ${cid.slice(0, 8)}: ${occupiedInstants.size}`)
      for (const p of withOcc.planned) {
        console.log(`     would place ${p.scheduledAtUtc}  ${hhmm(p.minute)}  ${p.propertyName}`)
      }
      const collides = withOcc.planned.filter((p) => occupiedInstants.has(p.scheduledAtUtc))
      const inPast = withOcc.planned.filter((p) => Date.parse(p.scheduledAtUtc) <= now.getTime())
      console.log(`   ${collides.length === 0 ? "✓" : "✗"}  no placement lands on an occupied live minute (${collides.length} collisions)`)
      console.log(`   ${inPast.length === 0 ? "✓" : "✗"}  no placement is in the past (${inPast.length})`)
      const expectTimes = effectiveDailyTimes(cid, staggerOf(igConn as Record<string, unknown>), BASELINE_DAILY_TIMES)
      console.log(`   ${withOcc.planned.every((p) => expectTimes.includes(p.minute)) ? "✓" : "✗"}  every placement is at this account's configured times (${expectTimes.map(hhmm).join(" / ")} Central)`)
      console.log(`   ${withOcc.inventory.cooldownViolations === 0 ? "✓" : "✗"}  zero cooldown violations`)
      if (collides.length || inPast.length) process.exitCode = 1
    }
  }

  // ── 4. PROVE NOTHING WAS WRITTEN ────────────────────────────────────────
  console.log("\n4. proof that the database is unchanged:")
  const after = await snapshot()
  const rows: [string, unknown, unknown][] = [
    ["posts with a schedule", before.scheduled, after.scheduled],
    ["posts assigned", before.assigned, after.assigned],
    ["status='scheduled'", before.statusScheduled, after.statusScheduled],
    ["published", before.published, after.published],
    ["max(updated_at)", before.lastUpdatedAt, after.lastUpdatedAt],
  ]
  let moved = 0
  for (const [label, b, a] of rows) {
    const same = String(b) === String(a)
    if (!same) moved++
    console.log(`   ${same ? "✓" : "✗ CHANGED"}  ${label.padEnd(24)} ${String(b)} -> ${String(a)}`)
  }
  // updated_at is the sharpest of these: the claim executor stamps it explicitly, so a write that
  // somehow left the counts alone would still move this.
  const clean = moved === 0 && result.claimed.length === 0 && !result.persisted
  console.log(`\n   ${clean ? "CLEAN — nothing was written." : "DIRTY — the database moved during a dry run."}`)
  if (!clean) process.exit(1)
}

main().catch((e) => { console.error("dry run failed:", e); process.exit(1) })
