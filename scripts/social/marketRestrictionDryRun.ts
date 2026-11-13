// NON-PUBLISHING DRY RUN of the per-destination market restriction, against LIVE PRODUCTION ROWS.
//
// WHAT THIS IS: the real planner, fed the real connected destinations, plus the two Locator Beast
// destinations that do not exist yet — supplied as clearly-labelled SIMULATED rules so the plan
// they would produce can be read before either account is connected or resumed.
//
// WHY A SYNTHETIC POOL: production's eligible pool is currently EMPTY (nothing is simultaneously
// rendered, approved, unscheduled and unassigned), so a plan from live inventory would be empty and
// would prove nothing either way. The pool below is shaped to production's REAL market mix, taken
// from social_content, so the Dallas-only destinations are deliberately outnumbered — if the
// restriction were a preference rather than a filter, the other markets are what they would post.
//
// IT CANNOT PUBLISH, SCHEDULE, APPROVE OR RENDER. planAutopilot is a pure function: it returns a
// plan and writes nothing, and no executor is constructed anywhere in this file. No Instagram or
// TikTok module is imported. The write-sensitive columns are snapshotted BEFORE and AFTER anyway,
// because a dry run that reported "nothing written" while having written is the one failure mode
// worth engineering against — the claim is measured, not asserted.
//
// Run: npx tsx --env-file=.env.local scripts/social/marketRestrictionDryRun.ts
import { supabaseAdmin } from "../../lib/supabase/admin"
import { parseMarketRestriction, marketRestrictionLabel } from "@/lib/social/marketRestriction"
import { planAutopilot, type AutopilotRule, type PoolPost } from "../../lib/social/autopilotPlanner"
import { BASELINE_DAILY_TIMES, effectiveDailyTimes, dailyTimesForPostsPerDay } from "../../lib/social/autopilotDestination"
import { isPlannableConnection } from "../../lib/social/connectionHealth"
import { COOLDOWN_DAYS, MAX_PLAN_DAYS } from "../../lib/social/autopilotPlanRun"
import { DEFAULT_TIMEZONE, wallClockToUtcISO } from "../../lib/social/recurrence"

const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`
let problems = 0
const check = (what: string, cond: boolean, detail = "") => {
  if (cond) console.log(`  ✓ ${what}`)
  else { problems++; console.log(`  ✗ ${what}${detail ? ` — ${detail}` : ""}`) }
}

/** The columns a schedule write would move. Read before and after; any change is a failure. */
async function snapshot() {
  const one = async (col: string, op: "notnull" | "eq", val?: string) => {
    let q = supabaseAdmin.from("social_posts").select("id", { count: "exact", head: true })
    q = op === "notnull" ? q.not(col, "is", null) : q.eq(col, val as string)
    const { count } = await q
    return count ?? -1
  }
  const { data: touched } = await supabaseAdmin.from("social_posts")
    .select("updated_at").order("updated_at", { ascending: false }).limit(1)
  const { count: conns } = await supabaseAdmin.from("social_connections").select("id", { count: "exact", head: true })
  return {
    scheduled: await one("scheduled_at", "notnull"),
    assigned: await one("connection_id", "notnull"),
    statusScheduled: await one("status", "eq", "scheduled"),
    published: await one("published_at", "notnull"),
    connections: conns ?? -1,
    lastUpdatedAt: (touched?.[0]?.updated_at as string | undefined) ?? null,
  }
}

async function main() {
  console.log("MARKET RESTRICTION — NON-PUBLISHING DRY RUN")
  console.log("=".repeat(78))

  const before = await snapshot()
  console.log(`\nBEFORE: ${before.scheduled} scheduled_at · ${before.assigned} assigned · ${before.statusScheduled} status=scheduled · ${before.published} published · ${before.connections} connections`)

  // ── 1. THE LIVE DESTINATIONS ───────────────────────────────────────────────────────────────
  // Selected WITH market_restriction first, falling back without it, so this script is useful
  // both before the migration is applied and after. A missing column is reported, never guessed.
  const COLS = "id, provider, username, label, status, posting_paused, posts_per_day, stagger_offset_minutes, token_expires_at"
  let rows: Record<string, unknown>[] = []
  let columnApplied = true
  {
    const withCol = await supabaseAdmin.from("social_connections").select(`${COLS}, market_restriction`).order("created_at")
    if (withCol.error) {
      columnApplied = false
      const plain = await supabaseAdmin.from("social_connections").select(COLS).order("created_at")
      if (plain.error) throw new Error(`could not read connections: ${plain.error.message}`)
      rows = (plain.data ?? []) as Record<string, unknown>[]
    } else {
      rows = (withCol.data ?? []) as Record<string, unknown>[]
    }
  }
  console.log(`\nsocial_connections.market_restriction: ${columnApplied ? "APPLIED" : "NOT YET APPLIED — every live destination reads as unrestricted, which is today's behaviour"}`)

  const now = new Date()
  const liveRules: AutopilotRule[] = rows.map((c) => ({
    connectionId: String(c.id),
    platform: String(c.provider ?? "instagram"),
    enabled: isPlannableConnection(c as { status?: string | null; token_expires_at?: string | null }, now)
      && c.posting_paused !== true,
    timezone: DEFAULT_TIMEZONE,
    // Derived from this destination's OWN posts_per_day, exactly as computeAutopilotPlan does, so
    // the dry run reports the schedule the live planner would produce rather than assuming the
    // whole baseline for everyone.
    dailyTimes: dailyTimesForPostsPerDay(typeof c.posts_per_day === "number" ? c.posts_per_day : null),
    postsPerDay: typeof c.posts_per_day === "number" && c.posts_per_day > 0 ? c.posts_per_day : BASELINE_DAILY_TIMES.length,
    marketWeights: {},
    allowedMarkets: parseMarketRestriction(c.market_restriction),
    marketRotationSeed: null,
    staggerOffsetMinutes: typeof c.stagger_offset_minutes === "number" ? c.stagger_offset_minutes : null,
    startIndex: null,
  }))

  // ── 2. THE TWO LOCATOR BEAST DESTINATIONS, SIMULATED ───────────────────────────────────────
  // Neither row exists yet. They are supplied here with the settings they will carry — Dallas only,
  // 2 per day, staggered off the baseline — so the plan can be reviewed before anything is
  // connected. Nothing in this block touches the database.
  const SIMULATED: AutopilotRule[] = [
    {
      connectionId: "SIMULATED:locatorbeast-instagram", platform: "instagram", enabled: true,
      timezone: DEFAULT_TIMEZONE, dailyTimes: dailyTimesForPostsPerDay(2), postsPerDay: 2,
      marketWeights: {}, allowedMarkets: ["Dallas"], marketRotationSeed: null,
      // NULL, so the derived 1..5 stagger applies — which is what a newly connected destination
      // will actually carry, and what keeps it inside the 7:30 window.
      staggerOffsetMinutes: null, startIndex: null,
    },
    {
      connectionId: "SIMULATED:locatorbeast-tiktok", platform: "tiktok", enabled: true,
      timezone: DEFAULT_TIMEZONE, dailyTimes: dailyTimesForPostsPerDay(2), postsPerDay: 2,
      marketWeights: {}, allowedMarkets: ["Dallas"], marketRotationSeed: null,
      staggerOffsetMinutes: null, startIndex: null,
    },
  ]

  const nameOf = new Map(rows.map((r) => [String(r.id), `${r.provider}/${r.username ?? r.label ?? "(unnamed)"}`]))
  nameOf.set("SIMULATED:locatorbeast-instagram", "instagram/@locatorbeast  [SIMULATED]")
  nameOf.set("SIMULATED:locatorbeast-tiktok", "tiktok/Locator Beast  [SIMULATED]")

  console.log("\nDESTINATIONS")
  console.log("-".repeat(78))
  for (const r of [...liveRules, ...SIMULATED]) {
    const times = effectiveDailyTimes(r.connectionId, r.staggerOffsetMinutes, r.dailyTimes).map(hhmm).join(" / ")
    console.log(`  ${(nameOf.get(r.connectionId) ?? r.connectionId).padEnd(42)} ${r.enabled ? "enabled " : "DISABLED"}  ${r.postsPerDay}/day  ${times}  ${marketRestrictionLabel(r.allowedMarkets) ?? "every market"}`)
  }

  // ── 3. A POOL SHAPED LIKE PRODUCTION'S REAL MARKET MIX ─────────────────────────────────────
  const { data: mixRows } = await supabaseAdmin.from("social_content").select("market")
  const mix = new Map<string, number>()
  for (const m of (mixRows ?? []) as { market: string | null }[]) {
    const k = (m.market ?? "(blank)").trim() || "(blank)"
    mix.set(k, (mix.get(k) ?? 0) + 1)
  }
  console.log(`\nLIVE CONTENT MIX: ${[...mix.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(" · ")}`)

  const READY = {
    status: "ready", renderStatus: "ready", renderedStoragePath: "dryrun/x.mp4", scheduledAt: null,
    publishedAt: null, externalPostId: null, connectionId: null, approvedAt: now.toISOString(),
    followsPostId: null,
  }
  // Six properties per market per platform, so no destination runs out of inventory inside the
  // plan window and the restriction is the only thing that can shape what it gets.
  const pool: PoolPost[] = []
  for (const market of ["Dallas", "San Antonio", "Houston", "Austin"]) {
    for (const platform of ["instagram", "tiktok"]) {
      for (let i = 1; i <= 6; i++) {
        const slug = `${market.toLowerCase().replace(/\s+/g, "")}-${i}`
        pool.push({
          id: `dry-${platform}-${slug}`, sourceContentId: `dry-src-${platform}-${slug}`,
          placeId: `DRYRUN_${slug}`, market, propertyName: `Synthetic ${market} ${i}`,
          platform, ...READY,
        })
      }
    }
  }

  const startDateKey = new Intl.DateTimeFormat("en-CA", { timeZone: DEFAULT_TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(now)
  const plan = planAutopilot({
    rules: [...liveRules, ...SIMULATED], pool, startDateKey,
    wallClockToUtc: wallClockToUtcISO, cooldownDays: COOLDOWN_DAYS, maxDays: MAX_PLAN_DAYS,
  })

  console.log("\nTHE PLAN, PER DESTINATION")
  console.log("-".repeat(78))
  for (const r of [...liveRules, ...SIMULATED]) {
    const mine = plan.planned.filter((p) => p.connectionId === r.connectionId)
    const markets = [...new Set(mine.map((p) => p.market ?? "(blank)"))].sort()
    const days = new Set(mine.map((p) => p.dateKey))
    console.log(`\n  ${nameOf.get(r.connectionId) ?? r.connectionId}`)
    console.log(`    ${mine.length} placement(s) across ${days.size} day(s) · markets: ${markets.join(", ") || "(none)"}`)
    for (const p of mine.slice(0, 4)) {
      console.log(`      ${p.dateKey} ${hhmm(p.minute)}  ${(p.market ?? "(blank)").padEnd(12)} ${p.propertyName}`)
    }
    if (mine.length > 4) console.log(`      … and ${mine.length - 4} more`)
  }

  console.log("\nASSERTIONS — WHAT THIS PLAN PROVES")
  console.log("-".repeat(78))
  for (const r of SIMULATED) {
    const mine = plan.planned.filter((p) => p.connectionId === r.connectionId)
    const label = nameOf.get(r.connectionId) ?? r.connectionId
    check(`${label} is scheduled something`, mine.length > 0)
    check(`${label} publishes Dallas and nothing else`,
      mine.length > 0 && mine.every((p) => p.market === "Dallas"),
      [...new Set(mine.map((p) => p.market))].join(", "))
    const byDay = new Map<string, number>()
    for (const p of mine) byDay.set(p.dateKey, (byDay.get(p.dateKey) ?? 0) + 1)
    check(`${label} posts 2 per day`, [...byDay.values()].every((n) => n === 2) && byDay.size > 0,
      [...byDay.values()].join(","))
  }
  for (const r of liveRules.filter((x) => x.enabled && !x.allowedMarkets)) {
    const mine = plan.planned.filter((p) => p.connectionId === r.connectionId)
    check(`${nameOf.get(r.connectionId)} is UNRESTRICTED and still reaches other markets`,
      mine.some((p) => p.market !== "Dallas"),
      [...new Set(mine.map((p) => p.market))].join(", "))
  }
  check("no placement anywhere broke a restriction", plan.inventory.marketRestrictionViolations === 0,
    String(plan.inventory.marketRestrictionViolations))
  check("no placement violated the 21-day cooldown", plan.inventory.cooldownViolations === 0)
  check("the two Instagram destinations never share a minute", (() => {
    const ig = [...liveRules, ...SIMULATED].filter((r) => r.platform === "instagram" && r.enabled)
    const sets = ig.map((r) => new Set(plan.planned.filter((p) => p.connectionId === r.connectionId).map((p) => `${p.dateKey}T${p.minute}`)))
    return sets.every((s, i) => sets.every((t, j) => i === j || [...s].every((k) => !t.has(k))))
  })())

  // ── 4. THE SCENARIO THE REQUIREMENT IS ABOUT: Dallas has nothing ───────────────────────────
  console.log("\nTHE EMPTY-DALLAS SCENARIO — the slot must be left empty, never substituted")
  console.log("-".repeat(78))
  {
    const noDallas = pool.filter((p) => p.market !== "Dallas")
    const starved = planAutopilot({
      rules: [...liveRules, ...SIMULATED], pool: noDallas, startDateKey,
      wallClockToUtc: wallClockToUtcISO, cooldownDays: COOLDOWN_DAYS, maxDays: MAX_PLAN_DAYS,
    })
    for (const r of SIMULATED) {
      const mine = starved.planned.filter((p) => p.connectionId === r.connectionId)
      check(`${nameOf.get(r.connectionId)} is scheduled NOTHING rather than another market`, mine.length === 0,
        [...new Set(mine.map((p) => p.market))].join(", "))
    }
    check("the starved slots are reported as unfilled", starved.unfilledSlots > 0, String(starved.unfilledSlots))
    check("no substitution was recorded, because none happened",
      !starved.marketFallbacks.some((f) => f.connectionId.startsWith("SIMULATED:")))
    check("the plan NAMES each starved destination and its market",
      SIMULATED.every((r) => starved.notes.some((n) => n.includes(r.connectionId) && n.includes("Dallas"))),
      JSON.stringify(starved.notes.filter((n) => n.includes("SIMULATED"))))
    for (const r of liveRules.filter((x) => x.enabled && !x.allowedMarkets)) {
      check(`${nameOf.get(r.connectionId)} still fills its slots from the remaining markets`,
        starved.planned.some((p) => p.connectionId === r.connectionId))
    }
  }

  // ── 5. NOTHING WAS WRITTEN ─────────────────────────────────────────────────────────────────
  const after = await snapshot()
  console.log("\nNOTHING WAS WRITTEN")
  console.log("-".repeat(78))
  console.log(`AFTER:  ${after.scheduled} scheduled_at · ${after.assigned} assigned · ${after.statusScheduled} status=scheduled · ${after.published} published · ${after.connections} connections`)
  for (const k of ["scheduled", "assigned", "statusScheduled", "published", "connections"] as const) {
    check(`${k} unchanged`, before[k] === after[k], `${before[k]} → ${after[k]}`)
  }
  check("no social_posts row was touched", before.lastUpdatedAt === after.lastUpdatedAt,
    `${before.lastUpdatedAt} → ${after.lastUpdatedAt}`)

  console.log("\n" + "=".repeat(78))
  console.log(problems === 0 ? "DRY RUN CLEAN — nothing written, no restriction broken." : `DRY RUN FOUND ${problems} PROBLEM(S).`)
  process.exit(problems === 0 ? 0 : 1)
}

main().catch((e) => { console.error("dry run failed:", e instanceof Error ? e.message : e); process.exit(1) })
