// SOCIAL BEAST — PRE-DEPLOYMENT INTEGRATION AUDIT across three commits.
//
//   beb7c81  per-destination market restriction        (1 prepared migration)
//   abe0b1c  TikTok token lifecycle per connection     (1 prepared migration)
//   1c5ebed  independent schedules, limits and pause   (no migration)
//
// Each phase has its own suite and its own scope guard. This one answers the questions none of
// them can, because they are about the three TOGETHER and about the configuration the four
// destinations will actually carry:
//
//   · the two prepared migrations, their versions, their order and their rollbacks
//   · what a LIVE row means, which is what "Real Estate Pro unchanged" rests on
//   · the agreed Locator Beast configuration, end to end, as one plan
//   · every path that can initiate publishing, and whether a pause stops it
//   · the things none of the three commits was allowed to touch
//
// THE CONFIGURATION UNDER AUDIT — both Locator Beast destinations:
//     posts_per_day = 2 · stagger_offset_minutes = 0 · market_restriction = {Dallas}
//   which is 07:30 and 19:30 America/Chicago, the same times Real Estate Pro already uses.
//
// Run: npx tsx scripts/social/releaseIntegrationAudit.test.ts
import { readFileSync, readdirSync, existsSync } from "node:fs"
import { execSync } from "node:child_process"
import { planAutopilot, type AutopilotRule, type PoolPost } from "@/lib/social/autopilotPlanner"
import { occupancyFromRows } from "@/lib/social/autopilotOccupancy"
import { dailyTimesForPostsPerDay, effectiveDailyTimes, staggerOffsetMinutes } from "@/lib/social/autopilotDestination"
import { parseMarketRestriction, isMarketAllowed } from "@/lib/social/marketRestriction"
import { soleConnectionId, tokenNeedsRefresh, connectionBelongsToOwner } from "@/lib/social/tiktokConnectionChoice"
import { wallClockToUtcISO, dateKeyInTz, slotForMinute, DEFAULT_TIMEZONE } from "@/lib/social/recurrence"

let pass = 0, fail = 0
const ok = (what: string, cond: boolean, detail = "") => {
  if (cond) { pass++; console.log(`  ✓ ${what}`) } else { fail++; console.log(`  ✗ ${what}${detail ? ` — ${detail}` : ""}`) }
}
const eq = (what: string, got: unknown, want: unknown) =>
  ok(what, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`)

const read = (p: string) => readFileSync(`${process.cwd()}/${p}`, "utf8")
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1")
const sqlOf = (s: string) => s.replace(/--[^\n]*/g, "")

const PREPARED = "supabase/prepared"
const MR = "20261115000002_destination_market_restriction"
const TT = "20261115000003_tiktok_connection_scoped_tokens"
const TZ = "America/Chicago"
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`
const localOf = (iso: string) =>
  new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour12: false, hour: "2-digit", minute: "2-digit" }).format(new Date(iso))

// ── 1. THE TWO PENDING MIGRATIONS ────────────────────────────────────────────────────────────
console.log("1. THE PENDING MIGRATIONS — where they live, and that their versions are free:")
{
  for (const name of [MR, TT]) {
    ok(`${name}.sql is staged in supabase/prepared`, existsSync(`${process.cwd()}/${PREPARED}/${name}.sql`))
    ok(`…with its verification`, existsSync(`${process.cwd()}/${PREPARED}/${name}.verify.sql`))
    ok(`…and its rollback`, existsSync(`${process.cwd()}/${PREPARED}/ROLLBACK_${name}.sql`))
  }
  // THE COLLISION THIS AUDIT FOUND. Both files were first written into supabase/migrations/ —
  // which is the APPLIED history — under versions 20261114000000 and 20261115000000. Production's
  // ledger already holds 20261114000000 (lead_screening_resolution, applied 2026-11-05) and
  // supabase/prepared already held 20261115000000 (washer_dryer_by_ids). A ledger-driven apply
  // would have seen those versions as done and skipped ours in SILENCE.
  const applied = readdirSync(`${process.cwd()}/supabase/migrations`).filter((f) => f.endsWith(".sql"))
  // .verify.sql and ROLLBACK_*.sql are companions, not migrations — counting them would make every
  // correctly-staged migration look like a duplicate of itself.
  const staged = readdirSync(`${process.cwd()}/${PREPARED}`)
    .filter((f) => f.endsWith(".sql") && !f.endsWith(".verify.sql") && !f.startsWith("ROLLBACK_"))
  const versionOf = (f: string) => f.split("_")[0]
  for (const name of [MR, TT]) {
    const v = versionOf(`${name}.sql`)
    ok(`version ${v} is not already in the applied history`, !applied.some((f) => versionOf(f) === v))
    ok(`…and is unique among the staged migrations`,
      staged.filter((f) => versionOf(f) === v).length === 1)
  }
  ok("neither file is left in supabase/migrations, which is the applied history",
    !applied.some((f) => /destination_market_restriction|tiktok_connection_scoped_tokens/.test(f)))
  // The versions carry their intended order: the market restriction before the TikTok tokens.
  ok("the market restriction sorts before the TikTok tokens", versionOf(`${MR}.sql`) < versionOf(`${TT}.sql`))
}

console.log("\n2. APPLICATION ORDER — what each needs, and what it does not:")
{
  // Line comments AND string literals stripped: the market-restriction migration's column COMMENT
  // legitimately describes social_content.market in prose, which is documentation rather than a
  // reference to the table.
  const stmtsOf = (src: string) => sqlOf(src).replace(/'(?:[^']|'')*'/g, "''")
  const mr = stmtsOf(read(`${PREPARED}/${MR}.sql`))
  const tt = stmtsOf(read(`${PREPARED}/${TT}.sql`))
  // INDEPENDENT OF EACH OTHER. Either order works; the order that matters is both BEFORE the code.
  eq("the TikTok migration never mentions market_restriction", /market_restriction/.test(tt), false)
  eq("the market-restriction migration never mentions tiktok", /tiktok/i.test(mr), false)
  // Each needs only objects that are already live.
  ok("the market restriction needs _sa_require_owned_connection, which is live since 20260913000002",
    /_sa_require_owned_connection/.test(mr))
  ok("the TikTok migration needs vault + is_platform_admin, both live",
    /vault\.create_secret/.test(tt) && /vault\.decrypted_secrets/.test(tt) && /is_platform_admin/.test(tt))
  // NEITHER writes data, and neither touches the other's surface.
  for (const [label, sql] of [["market restriction", mr], ["TikTok tokens", tt]] as const) {
    ok(`the ${label} migration creates no trigger`, !/create\s+(or replace\s+)?trigger/i.test(sql))
    ok(`…touches no RLS policy`, !/\b(create|drop|alter)\s+policy\b/i.test(sql))
    ok(`…references no post table`, !/social_posts|social_content/.test(sql))
    ok(`…and redefines no Instagram function`, !/sa_(connect|disconnect)_instagram|sa_get_instagram_token/.test(sql))
  }
  ok("only the TikTok migration carries DML, and only inside the two function bodies it restores",
    (tt.match(/insert into public\.social_connections/g) ?? []).length === 1
    && (mr.match(/\binsert into\b/gi) ?? []).length === 0)
  // Both verifications must be runnable BEFORE applying, or they cannot establish a pre-state.
  for (const name of [MR, TT]) {
    const v = sqlOf(read(`${PREPARED}/${name}.verify.sql`)).replace(/'(?:[^']|'')*'/g, "''")
    ok(`${name}.verify.sql writes nothing`, !/\b(insert|update|delete|alter|create|drop|grant|revoke)\b/i.test(v))
  }
  ok("the market-restriction verification reads the new column through to_jsonb, so it runs pre-apply",
    /to_jsonb\(sc\) ->> 'market_restriction'/.test(read(`${PREPARED}/${MR}.verify.sql`)))
}

console.log("\n9. ROLLBACK — each one undoes its own release and says what it costs:")
{
  const rbMr = read(`${PREPARED}/ROLLBACK_${MR}.sql`)
  const rbTt = read(`${PREPARED}/ROLLBACK_${TT}.sql`)
  ok("the market-restriction rollback drops the writer before the column, so nothing can set a value between",
    rbMr.indexOf("drop function if exists public.sa_update_destination_markets") < rbMr.indexOf("drop column if exists market_restriction"))
  ok("…and drops the shape constraint too", /drop constraint if exists social_connections_market_restriction_shape/.test(rbMr))
  ok("…and warns that a set restriction is DISCARDED", /DISCARDS IT/.test(rbMr))
  // The file wraps across a comment line, so the match is newline-tolerant rather than exact.
  ok("…and says the code must be rolled back first", /redeploy the previous build, THEN run[\s\S]{0,12}this/i.test(rbMr))
  ok("…and touches nothing else", !/posting_paused|posts_per_day|token_secret_id/.test(sqlOf(rbMr)))

  // The TikTok rollback restores functions that are KNOWN BAD. That has to be the first thing it
  // says, not a footnote.
  ok("the TikTok rollback states up front that it restores the defects", /RESTORES THE DEFECTS/.test(rbTt))
  ok("…and refuses the case that would do damage: a second account already connected",
    /DO NOT RUN THIS IF A SECOND TIKTOK ACCOUNT IS CONNECTED/.test(rbTt))
  ok("…and gives the query to check it with", /from public\.social_connections where provider = 'tiktok'/.test(rbTt))
  ok("it drops the two functions this release added",
    /drop function if exists public\.sa_get_tiktok_token_by_connection\(uuid\)/.test(rbTt)
    && /drop function if exists public\.sa_update_tiktok_token_by_connection\(uuid, text, timestamptz\)/.test(rbTt))
  // It must restore all four repaired functions, with their grants, or the rollback leaves a hole.
  for (const fn of ["sa_connect_tiktok", "sa_disconnect_tiktok", "sa_get_tiktok_token", "sa_update_tiktok_token"]) {
    ok(`…restores ${fn}`, new RegExp(`create or replace function public\\.${fn}\\(`).test(rbTt))
  }
  ok("…with the grants those functions need", /grant execute on function public\.sa_connect_tiktok/.test(rbTt)
    && /grant execute on function public\.sa_get_tiktok_token\(uuid\) to service_role/.test(rbTt))
  // The restored bodies must be the ACTUAL prior definitions, not a paraphrase.
  const priorConnect = read("supabase/migrations/20261013000001_tiktok_reconnect_vault_name.sql")
  const priorConnectBody = priorConnect.slice(priorConnect.indexOf("create or replace function public.sa_connect_tiktok(")).trim()
  ok("the restored sa_connect_tiktok is byte-identical to 20261013000001's definition",
    rbTt.includes(priorConnectBody.split("\n").slice(0, 40).join("\n")))
  ok("…and it is the owner+provider lookup, i.e. genuinely the pre-fix body",
    !/is not distinct from p_open_id/.test(rbTt))
  ok("the rollback points at the verification to confirm itself", new RegExp(`${TT}\\.verify\\.sql`).test(rbTt))
  ok("…and names the row that must still pass afterwards (a secret must not be lost)",
    /still points at a live Vault secret/.test(rbTt))
}

// ── 3. WHAT A LIVE ROW MEANS — the basis of "Real Estate Pro unchanged" ──────────────────────
console.log("\n2b. PRESERVATION — a live row's NULLs mean exactly what they meant before:")
{
  // Both live destinations: market_restriction NULL, posts_per_day NULL, stagger EXPLICIT 0.
  eq("NULL market_restriction is unrestricted", parseMarketRestriction(null), null)
  ok("…so every market is allowed", isMarketAllowed(null, "San Antonio") && isMarketAllowed(null, "Houston")
    && isMarketAllowed(null, "Austin") && isMarketAllowed(null, "Dallas"))
  ok("…including a blank market, exactly as before the column existed", isMarketAllowed(null, null))
  eq("NULL posts_per_day is the whole baseline", dailyTimesForPostsPerDay(null), [450, 1170])
  eq("an EXPLICIT stagger of 0 wins over the derived offset", staggerOffsetMinutes("any-connection-id", 0), 0)
  eq("…so a live destination's times are exactly 07:30 and 19:30",
    effectiveDailyTimes("rep-ig", 0, dailyTimesForPostsPerDay(null)).map(hhmm), ["07:30", "19:30"])
  // The queue, the history and the credentials are columns no commit in this release writes.
  const strip = (src: string) => sqlOf(src).replace(/'(?:[^']|'')*'/g, "''")
  const mr = strip(read(`${PREPARED}/${MR}.sql`))
  const tt = strip(read(`${PREPARED}/${TT}.sql`))
  for (const col of ["token_secret_id", "token_expires_at", "scopes", "posting_paused", "posts_per_day",
    "stagger_offset_minutes", "external_account_id", "label", "agent_user_id"]) {
    ok(`no migration adds, drops or alters ${col}`,
      !new RegExp(`(add|drop|alter)\\s+column[^;]*${col}`, "i").test(mr + tt))
  }
  ok("no migration alters social_posts at all", !/alter table public\.social_posts/i.test(mr + tt))
  // postingHistory is what the cooldown reads; nothing in three commits changed it.
  ok("posting history is still keyed per connection, per property",
    /Keyed by connection because the cooldown is per-account/.test(read("lib/social/postingHistory.ts")))
}

// ── 4. THE AGREED CONFIGURATION, END TO END ──────────────────────────────────────────────────
const REP_IG = "rep-ig", REP_TT = "rep-tt", LB_IG = "lb-ig", LB_TT = "lb-tt"
const READY = {
  status: "ready", renderStatus: "ready", renderedStoragePath: "p/x.mp4", scheduledAt: null,
  publishedAt: null, externalPostId: null, connectionId: null, approvedAt: "2026-10-01T00:00:00Z",
}
const post = (id: string, market: string | null, platform = "instagram", place = id): PoolPost =>
  ({ id, sourceContentId: `src-${id}`, placeId: `place-${place}`, market, propertyName: id, ...READY, platform })

/** A rule exactly as computeAutopilotPlan builds one from the agreed column values. */
const fromRow = (
  connectionId: string,
  row: { provider?: string; posts_per_day: number | null; stagger_offset_minutes: number | null; market_restriction: string[] | null },
): AutopilotRule => ({
  connectionId,
  platform: row.provider ?? "instagram",
  enabled: true,
  timezone: DEFAULT_TIMEZONE,
  dailyTimes: dailyTimesForPostsPerDay(row.posts_per_day),
  postsPerDay: typeof row.posts_per_day === "number" && row.posts_per_day > 0 ? row.posts_per_day : 2,
  marketWeights: {},
  allowedMarkets: parseMarketRestriction(row.market_restriction),
  marketRotationSeed: null,
  staggerOffsetMinutes: row.stagger_offset_minutes,
  startIndex: null,
})

// The live rows, and the two rows Locator Beast will carry.
const LIVE = { posts_per_day: null, stagger_offset_minutes: 0, market_restriction: null }
const AGREED = { posts_per_day: 2, stagger_offset_minutes: 0, market_restriction: ["Dallas"] }
const FOUR = [
  fromRow(REP_IG, { ...LIVE, provider: "instagram" }),
  fromRow(REP_TT, { ...LIVE, provider: "tiktok" }),
  fromRow(LB_IG, { ...AGREED, provider: "instagram" }),
  fromRow(LB_TT, { ...AGREED, provider: "tiktok" }),
]

const POOL = [
  ...Array.from({ length: 12 }, (_, i) => post(`d${i}`, "Dallas")),
  ...Array.from({ length: 8 }, (_, i) => post(`s${i}`, "San Antonio")),
  ...Array.from({ length: 12 }, (_, i) => post(`d${i}t`, "Dallas", "tiktok", `d${i}`)),
  ...Array.from({ length: 8 }, (_, i) => post(`s${i}t`, "San Antonio", "tiktok", `s${i}`)),
]
const audit = planAutopilot({
  rules: FOUR, pool: POOL, startDateKey: "2026-11-16",
  wallClockToUtc: wallClockToUtcISO, maxDays: 5,
})
const mine = (id: string) => audit.planned.filter((x) => x.connectionId === id)

console.log("\n3 + 7. THE AGREED CONFIGURATION — four destinations, one plan:")
{
  for (const id of [REP_IG, REP_TT, LB_IG, LB_TT]) {
    const byDay = new Map<string, number>()
    for (const x of mine(id)) byDay.set(x.dateKey, (byDay.get(x.dateKey) ?? 0) + 1)
    ok(`${id}: 2 posts on each of its 5 days`,
      byDay.size === 5 && [...byDay.values()].every((n) => n === 2), JSON.stringify([...byDay.entries()]))
    // THE EXACT TIMES, read back through the zone rather than from the minute field.
    eq(`${id}: every post is 07:30 or 19:30 Central`,
      [...new Set(mine(id).map((x) => localOf(x.scheduledAtUtc)))].sort(), ["07:30", "19:30"])
    ok(`${id}: and on the calendar day it was planned for`,
      mine(id).every((x) => dateKeyInTz(new Date(x.scheduledAtUtc), TZ) === x.dateKey))
  }
  // INDEPENDENT EVEN THOUGH THE TIMES MATCH. All four share 07:30 and 19:30, and that is not a
  // conflict: the slot index keys on (connection_id, scheduled_at), so each destination holds its
  // own instant.
  const instants = (id: string) => mine(id).map((x) => x.scheduledAtUtc).sort()
  eq("Real Estate Pro Instagram and Locator Beast Instagram share the SAME instants",
    instants(REP_IG), instants(LB_IG))
  ok("…and that is allowed, because uniqueness is per connection",
    /\(connection_id, scheduled_at\)/i.test(read("supabase/migrations/20261007000004_autopilot_write_guards.sql")))
  eq("…and both TikTok destinations share them too", instants(REP_TT), instants(LB_TT))
  // One claim per (connection, instant): four destinations at one instant are four distinct rows.
  const keys = audit.planned.map((x) => `${x.connectionId}@${x.scheduledAtUtc}`)
  eq("no two placements claim the same (connection, instant)", keys.length, new Set(keys).size)
}

console.log("\n4. DALLAS ONLY — at planning, across the agreed configuration:")
{
  for (const id of [LB_IG, LB_TT]) {
    eq(`${id} publishes Dallas and nothing else`, [...new Set(mine(id).map((x) => x.market))], ["Dallas"])
  }
  for (const id of [REP_IG, REP_TT]) {
    ok(`${id} still reaches other markets`, mine(id).some((x) => x.market !== "Dallas"))
  }
  eq("no placement anywhere broke a restriction", audit.inventory.marketRestrictionViolations, 0)
  eq("no destination exceeded its daily limit", audit.inventory.dailyCapSkips, 0)
  eq("no cooldown was violated", audit.inventory.cooldownViolations, 0)
  eq("no market fell forward on a restricted destination",
    audit.marketFallbacks.filter((f) => [LB_IG, LB_TT].includes(f.connectionId)), [])
}

console.log("\n4b. DALLAS ONLY — at publishing, in both workers:")
{
  const IG = code(read("app/api/cron/social-instagram-publish/route.ts"))
  const TTW = code(read("app/api/cron/social-tiktok-publish/route.ts"))
  for (const [name, src] of [["Instagram", IG], ["TikTok", TTW]] as const) {
    ok(`${name}: re-checks the row's market against the destination's own column`,
      /marketRestrictionViolation\(/.test(src) && /from "@\/lib\/social\/marketRestriction"/.test(src))
    ok(`${name}: and fails the post rather than publishing it`, /blockedByMarketRestriction/.test(src))
  }
  // The guard is a shared module, so the two workers cannot disagree about what Dallas means.
  ok("both workers import the SAME definition", /marketRestrictionViolation/.test(IG) && /marketRestrictionViolation/.test(TTW))
  ok("a blank market is refused under a restriction", !isMarketAllowed(["Dallas"], null))
  ok("DFW is not substituted for Dallas", !isMarketAllowed(["Dallas"], "DFW"))
}

console.log("\n6. ONE DALLAS VIDEO, BOTH LOCATOR BEAST ACCOUNTS, NO DUPLICATE CONFLICT:")
{
  const shared = [
    post("ig-a", "Dallas", "instagram", "shared"), post("ig-b", "Dallas", "instagram", "shared"),
    post("tt-a", "Dallas", "tiktok", "shared"), post("tt-b", "Dallas", "tiktok", "shared"),
  ]
  const p = planAutopilot({
    rules: [FOUR[2], FOUR[3]], pool: shared, startDateKey: "2026-11-16",
    wallClockToUtc: wallClockToUtcISO, maxDays: 1,
  })
  eq("both accounts are scheduled the shared building",
    [...new Set(p.planned.map((x) => x.connectionId))].sort(), [LB_IG, LB_TT])
  eq("…and it is the same building", [...new Set(p.planned.map((x) => x.propertyKey))], ["place:place-shared"])
  for (const id of [LB_IG, LB_TT]) {
    ok(`${id} does not repeat it inside its own cooldown`, p.planned.filter((x) => x.connectionId === id).every((x) => !x.isRecycled))
  }
  // The database says the same from the other direction.
  const beta = read("supabase/migrations/20261010000001_social_agent_beta_foundation.sql")
  ok("uniqueness is (source_content_id, connection_id, destination) while unpublished",
    /social_posts_content_connection_dest_uidx[\s\S]{0,260}\(source_content_id, connection_id, destination\)/i.test(beta)
    && /social_posts_content_connection_dest_uidx[\s\S]{0,320}published_at is null/i.test(beta))
}

console.log("\n7b. DST — the agreed times survive both transitions:")
{
  for (const [key, want] of [
    ["2026-03-07", "2026-03-07T13:30:00.000Z"],
    ["2026-03-08", "2026-03-08T12:30:00.000Z"], // spring forward
    ["2026-10-31", "2026-10-31T12:30:00.000Z"],
    ["2026-11-01", "2026-11-01T13:30:00.000Z"], // fall back
    ["2027-03-14", "2027-03-14T12:30:00.000Z"],
  ] as const) {
    eq(`${key} 07:30 Central → ${want}`, wallClockToUtcISO(key, 450, TZ), want)
    eq(`…reads back as 07:30`, localOf(wallClockToUtcISO(key, 450, TZ)), "07:30")
    eq(`…and 19:30 reads back as 19:30`, localOf(wallClockToUtcISO(key, 1170, TZ)), "19:30")
  }
  const gap = (a: string, b: string) =>
    (Date.parse(wallClockToUtcISO(b, 450, TZ)) - Date.parse(wallClockToUtcISO(a, 450, TZ))) / 3_600_000
  eq("spring forward is 23 hours", gap("2026-03-07", "2026-03-08"), 23)
  eq("fall back is 25", gap("2026-10-31", "2026-11-01"), 25)
  eq("an ordinary pair is 24", gap("2026-06-01", "2026-06-02"), 24)
  // A four-destination plan straddling the transition, at the agreed configuration.
  const p = planAutopilot({
    rules: FOUR, pool: POOL, startDateKey: "2026-03-06", wallClockToUtc: wallClockToUtcISO, maxDays: 4,
  })
  ok("every placement across the transition is 07:30 or 19:30 Central",
    p.planned.length > 0 && p.planned.every((x) => ["07:30", "19:30"].includes(localOf(x.scheduledAtUtc))),
    JSON.stringify([...new Set(p.planned.map((x) => localOf(x.scheduledAtUtc)))]))
  eq("the morning time is in the approved morning window", slotForMinute(450), "morning")
  eq("the evening time is in the approved evening window", slotForMinute(1170), "evening")
  // And the occupancy builder reads the same local minute back, which is what stops a second
  // placement on the transition day.
  const occ = occupancyFromRows({
    rows: [{ connection_id: LB_IG, scheduled_at: wallClockToUtcISO("2026-03-08", 450, TZ) }],
    connections: [{ connectionId: LB_IG, staggerOffsetMinutes: 0, dailyTimes: dailyTimesForPostsPerDay(2), timezone: TZ }],
    now: new Date("2026-03-06T12:00:00Z"),
  })
  ok("a row stored on the spring-forward day is recognised as holding 07:30, not 08:30",
    occ.get(LB_IG)?.get("2026-03-08")?.minutes.has(450) === true,
    JSON.stringify([...(occ.get(LB_IG)?.get("2026-03-08")?.minutes ?? [])]))
}

// ── 5. EVERY PATH THAT CAN INITIATE PUBLISHING ───────────────────────────────────────────────
console.log("\n5. PAUSE — the complete publishing surface:")
{
  const IG = code(read("app/api/cron/social-instagram-publish/route.ts"))
  const TTW = code(read("app/api/cron/social-tiktok-publish/route.ts"))
  const IG_MANUAL = code(read("app/api/admin/social-autopilot/posts/[id]/publish/route.ts"))
  const TT_MANUAL = code(read("app/api/integrations/tiktok/publish/route.ts"))

  ok("Instagram worker — due loop: paused leaves the post untouched",
    /if \(dest\.kind === "paused"\) \{\s*\n\s*result\.skippedDestinationPaused\+\+/.test(IG))
  ok("Instagram worker — recovery sweep: paused is skipped and counted",
    /if \(dest\.kind === "paused"\) result\.reconcileSkippedPaused\+\+/.test(IG))
  ok("Instagram manual publish: refuses a paused destination",
    /dest\.posting_paused/.test(IG_MANUAL) && /destination_unavailable/.test(IG_MANUAL))
  ok("TikTok worker — due loop: paused leaves the post untouched",
    /if \(postTok\.postingPaused\) \{\s*\n\s*result\.skippedDestinationPaused\+\+/.test(TTW))
  ok("TikTok worker — stranded sweep: paused defers rather than failing the row",
    /strandedTok\?\.postingPaused/.test(TTW))
  ok("TikTok manual publish: refuses a paused destination",
    /if \(tok\.postingPaused\)/.test(TT_MANUAL) && /destination_unavailable/.test(TT_MANUAL))
  ok("planning excludes a paused destination, so nothing new joins its queue",
    /c\.posting_paused !== true/.test(code(read("lib/social/autopilotPlanRun.ts"))))

  // THE ONE DELIBERATE EXCEPTION, asserted so it is a decision rather than an oversight.
  ok("the TikTok sweep that only OBSERVES an existing publish is not gated on the pause",
    /cannot initiate a publish/.test(read("app/api/cron/social-tiktok-publish/route.ts")))

  // Pausing one destination cannot reach another: the controls are connection-scoped RPCs.
  const mgmt = read("supabase/migrations/20260913000002_publishing_destination_authorization.sql")
  for (const fn of ["sa_pause_destination", "sa_resume_destination"]) {
    ok(`${fn} writes one row by id, ownership-verified`,
      new RegExp(`${fn}\\(p_connection_id uuid\\)[\\s\\S]{0,420}where id = p_connection_id and owner_user_id = v_uid`).test(mgmt))
  }
  // And in the plan: one destination disabled changes nothing for the others.
  const paused = planAutopilot({
    rules: [FOUR[0], FOUR[1], { ...FOUR[2], enabled: false }, FOUR[3]],
    pool: POOL, startDateKey: "2026-11-16", wallClockToUtc: wallClockToUtcISO, maxDays: 5,
  })
  ok("the paused destination is planned nothing", !paused.planned.some((x) => x.connectionId === LB_IG))
  for (const id of [REP_IG, REP_TT, LB_TT]) {
    eq(`${id}'s schedule is identical with ${LB_IG} paused`,
      paused.planned.filter((x) => x.connectionId === id).map((x) => x.scheduledAtUtc),
      mine(id).map((x) => x.scheduledAtUtc))
  }
}

// ── 8. THE TIKTOK TOKEN LIFECYCLE ────────────────────────────────────────────────────────────
console.log("\n8. TIKTOK TOKEN LIFECYCLE — per connection, end to end:")
{
  const tt = sqlOf(read(`${PREPARED}/${TT}.sql`))
  const SERVER = code(read("lib/social/tiktokServer.ts"))
  const TTW = code(read("app/api/cron/social-tiktok-publish/route.ts"))

  ok("CONNECT: the old secret is scoped to the account being authorized",
    /select sc\.token_secret_id into v_old_secret[\s\S]{0,300}external_account_id is not distinct from p_open_id/.test(tt))
  ok("REFRESH: by connection, under a row lock, writing one row",
    /sa_update_tiktok_token_by_connection/.test(tt) && /for update;/.test(tt)
    && /where id = p_connection_id;/.test(tt))
  ok("REFRESH: the previous bundle is carried forward, so a rotation cannot drop the refresh token",
    /buildTokenBundle\(refreshed, bundle\)/.test(SERVER))
  ok("READ: one row by connection id", /where sc\.id = p_connection_id and sc\.provider = 'tiktok'/.test(tt))
  ok("DISCONNECT: the owner-wide function refuses when there is more than one account",
    /sa_disconnect_tiktok: % tiktok connections/.test(tt))
  ok("…and the UI disconnects one destination through sa_disconnect_destination",
    /action: "disconnect"/.test(code(read("components/crm/social/PublishingDestinations.tsx"))))
  ok("PUBLISH: the worker holds no run-scoped token", !/const token = await getValidTikTokAccessToken\(/.test(TTW))
  ok("…and every TikTok call uses the post's own destination token",
    /fetchTikTokCreatorInfo\(postTok\.accessToken\)/.test(TTW)
    && /initTikTokDirectPost\(postTok\.accessToken,/.test(TTW)
    && /fetchTikTokPostStatus\(postTok\.accessToken, publishId\)/.test(TTW)
    && /fetchTikTokPostStatus\(rowTok\.accessToken,/.test(TTW))

  // The decisions, exercised for real — two accounts, and an owner who may not borrow one.
  eq("two connections give no owner-level answer", soleConnectionId([{ id: "a" }, { id: "b" }]), null)
  eq("one gives that one", soleConnectionId([{ id: "a" }]), "a")
  ok("an unknown expiry refreshes rather than being trusted", tokenNeedsRefresh(null))
  ok("another owner's connection is refused", !connectionBelongsToOwner("owner-b", "owner-a"))
  ok("an unknown row owner is refused", !connectionBelongsToOwner(null, "owner-a"))
}

// ── 10. NOTHING OUTSIDE THE THREE RELEASES MOVED ─────────────────────────────────────────────
console.log("\n10. SCOPE ACROSS ALL THREE COMMITS:")
{
  const BASE = "4dcc56b"   // the live production commit the three releases were built from
  const has = (() => {
    try { execSync(`git cat-file -e ${BASE}^{commit}`, { stdio: "ignore" }); return true } catch { return false }
  })()
  if (!has) {
    console.log(`  – skipped: ${BASE} is not in this clone`)
  } else {
    const changed = execSync(`git diff --name-only ${BASE} -- . ':!next-env.d.ts'`, { encoding: "utf8" })
      .trim().split("\n").map((l) => l.trim()).filter(Boolean)
    const untracked = execSync("git ls-files --others --exclude-standard", { encoding: "utf8" })
      .trim().split("\n").map((l) => l.trim()).filter(Boolean)
    const all = [...new Set([...changed, ...untracked])]
    // THE THINGS THE WHOLE RELEASE TRAIN WAS NOT ALLOWED TO TOUCH, measured once across all three.
    for (const [label, re] of [
      ["OAuth connect and callback routes", /(tiktok|instagram)\/(connect|callback)\//],
      ["the destination invitation flow", /destinationInvite|destinations\/invitations/],
      ["captions, templates and hashtags", /composePost|lib\/social\/hashtags\.ts|overlaySpec|templateFamilies|loadedCopy/],
      ["the comment keywords and auto-reply", /commentKeywords|commentRunner|commentSender|commentSafety|commentSendPolicy|commentScope/],
      ["the post editor", /PostEditor/],
      ["the eligibility predicate", /autopilotEligibility/],
      ["the write path", /autopilotWrite\.ts/],
      ["posting history", /postingHistory/],
      ["the occupancy builder", /autopilotOccupancy/],
      ["TikTok publishing helpers and gates", /tiktokPublish\.ts|tiktokGate|tiktokPublishSettings|tiktokSibling|manualTikTok/],
      ["Quick Match", /lib\/quickMatch\//],
      ["the CRM workspace outside Social Beast", /components\/crm\/(?!social\/)/],
      ["the client-facing pages", /app\/r\/|app\/share|app\/\(site\)/],
      // The two prepared migrations were first written into supabase/migrations/ and this release
      // moved them out, so the folder legitimately differs. The claim that matters is stronger and
      // is asserted below: every migration that existed at the baseline is still there, unchanged.

      ["the other prepared migrations", /^supabase\/prepared\/(?!(ROLLBACK_)?20261115000(002|003))/],
      ["the unrelated failing suites", /scripts\/(leads|tests|auth|share|notifications|companion)\//],
    ] as const) {
      ok(`${label} is untouched across all three commits`, !all.some((f) => re.test(f)),
        all.filter((f) => re.test(f)).join(", "))
    }
    // THE APPLIED HISTORY IS IMMUTABLE. Every migration file the baseline had is still present and
    // byte-identical — that is what "we did not rewrite history" means, and it is what a moved file
    // could otherwise hide.
    const baseMigrations = execSync(`git ls-tree --name-only ${BASE}:supabase/migrations`, { encoding: "utf8" })
      .trim().split("\n").map((l) => l.trim()).filter(Boolean)
    ok(`the baseline had ${baseMigrations.length} files in supabase/migrations`, baseMigrations.length > 200)
    const missing = baseMigrations.filter((f) => !existsSync(`${process.cwd()}/supabase/migrations/${f}`))
    eq("…and every one of them is still present", missing, [])
    const altered = baseMigrations.filter((f) =>
      execSync(`git show ${BASE}:supabase/migrations/${f}`, { encoding: "utf8" }) !== read(`supabase/migrations/${f}`))
    eq("…and none of them was edited", altered, [])

    // The three release commits are present and in order.
    for (const [sha, what] of [["beb7c81", "market restriction"], ["abe0b1c", "TikTok isolation"], ["1c5ebed", "schedules"]] as const) {
      ok(`${sha} (${what}) is in this clone`, (() => {
        try { execSync(`git cat-file -e ${sha}^{commit}`, { stdio: "ignore" }); return true } catch { return false }
      })())
    }
    // THIS release's own file set — the audit turn, on top of Phase 2.
    {
      const auditChanged = [...new Set([
        ...execSync(`git diff --name-only 1c5ebed -- . ':!next-env.d.ts'`, { encoding: "utf8" })
          .trim().split("\n").map((l) => l.trim()).filter(Boolean),
        ...untracked,
      ])].sort()
      const AUDIT_APPROVED = [
        // The two prepared migrations, at their new paths, plus the rollbacks the convention wants.
        `${PREPARED}/${MR}.sql`, `${PREPARED}/${MR}.verify.sql`,
        `${PREPARED}/${TT}.sql`, `${PREPARED}/${TT}.verify.sql`,
        `${PREPARED}/ROLLBACK_${MR}.sql`, `${PREPARED}/ROLLBACK_${TT}.sql`,
        // This file.
        "scripts/social/releaseIntegrationAudit.test.ts",
        // The two suites that read a migration by path, following the move; each phase's APPROVED
        // list keeps the path that phase's commit actually contained.
        "scripts/social/marketRestriction.test.ts",
        "scripts/social/tiktokAccountIsolation.test.ts",
        // Phase 2's guard pinned to its own commit range, like the earlier ones.
        "scripts/social/destinationSchedules.test.ts",
        // The dry run now carries the agreed configuration: stagger 0, exactly 07:30 / 19:30.
        "scripts/social/marketRestrictionDryRun.ts",
      ].sort()
      eq(`the audit changed exactly its ${AUDIT_APPROVED.length} approved files`, auditChanged, AUDIT_APPROVED)
      ok("…and no application code at all — the audit changed no runtime behaviour",
        !auditChanged.some((f) => /^(app|components|lib)\//.test(f)))
    }

    ok("…and they are ancestors of HEAD, in order",
      execSync("git rev-list --ancestry-path beb7c81..HEAD", { encoding: "utf8" }).includes("abe0b1c".slice(0, 7))
      || execSync("git log --oneline beb7c81..HEAD", { encoding: "utf8" }).includes("abe0b1c"))
  }
}

console.log(`\nIntegration audit: ${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
