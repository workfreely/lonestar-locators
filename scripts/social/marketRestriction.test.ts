// SOCIAL BEAST — PER-DESTINATION MARKET RESTRICTION.
//
// Four publishing destinations across two brands:
//
//   Real Estate Pro   Instagram @realestatepro_tx   unrestricted   (connected)
//   Real Estate Pro   TikTok                        unrestricted   (connected)
//   Locator Beast     Instagram @locatorbeast       Dallas only    (connecting)
//   Locator Beast     TikTok                        Dallas only    (later)
//
// The restriction is a property of the DESTINATION, not of a platform: one nullable column on
// social_connections, one pure module that says what it means, and three consumers that read that
// module. These assertions exist to prove the four claims that actually matter:
//
//   1. A restricted destination is never OFFERED another market        (planner, pool filter)
//   2. A restricted destination can never PUBLISH another market       (both workers, per row)
//   3. Dallas being unavailable leaves the slot EMPTY — never substituted
//   4. An unrestricted destination behaves exactly as it does today
//
// Run: npx tsx scripts/social/marketRestriction.test.ts
import { readFileSync } from "node:fs"
import { execSync } from "node:child_process"
import {
  parseMarketRestriction, isMarketAllowed, marketRestrictionViolation, marketRestrictionLabel,
} from "@/lib/social/marketRestriction"
import { planAutopilot, propertyKeyOf, type AutopilotRule, type PoolPost } from "@/lib/social/autopilotPlanner"
import { wallClockToUtcISO, DEFAULT_TIMEZONE } from "@/lib/social/recurrence"
import { BASELINE_DAILY_TIMES } from "@/lib/social/autopilotDestination"
import { SOCIAL_MARKETS } from "@/lib/social/markets"

let pass = 0, fail = 0
const ok = (what: string, cond: boolean, detail = "") => {
  if (cond) { pass++; console.log(`  ✓ ${what}`) } else { fail++; console.log(`  ✗ ${what}${detail ? ` — ${detail}` : ""}`) }
}
const eq = (what: string, got: unknown, want: unknown) =>
  ok(what, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`)

const read = (p: string) => readFileSync(`${process.cwd()}/${p}`, "utf8")
/** TS with comments stripped, so no assertion below can be satisfied by prose. */
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1")
/** SQL with -- comments stripped, for the same reason. */
const sql = (s: string) => s.replace(/--[^\n]*/g, "")

const PLANNER = code(read("lib/social/autopilotPlanner.ts"))
const PLAN_RUN = code(read("lib/social/autopilotPlanRun.ts"))
const IG_WORKER = code(read("app/api/cron/social-instagram-publish/route.ts"))
const TT_WORKER = code(read("app/api/cron/social-tiktok-publish/route.ts"))
const MANAGE = code(read("app/api/admin/social-autopilot/destinations/manage/route.ts"))
const MIGRATION = sql(read("supabase/prepared/20261115000002_destination_market_restriction.sql"))

// ── 1. WHAT A RESTRICTION MEANS ───────────────────────────────────────────────────────────────
console.log("The restriction itself — one definition, consulted from three layers:")
{
  eq("null is unrestricted", parseMarketRestriction(null), null)
  eq("undefined is unrestricted", parseMarketRestriction(undefined), null)
  // An EMPTY list is the shape a cleared field or a stripped body produces. Reading it as "no
  // market may be published" would silently stop a working account — the hardest failure to
  // notice — so it reads as unrestricted, which is the visible status quo.
  eq("an empty list is unrestricted, NOT 'nothing allowed'", parseMarketRestriction([]), null)
  eq("a list of blanks is unrestricted", parseMarketRestriction(["", "   "]), null)
  eq("a bare string is accepted (a body that sends one market unwrapped)", parseMarketRestriction("Dallas"), ["Dallas"])
  eq("entries are trimmed and de-duplicated", parseMarketRestriction([" Dallas ", "Dallas"]), ["Dallas"])
  eq("non-strings are dropped rather than thrown on", parseMarketRestriction(["Dallas", 7, null, {}]), ["Dallas"])
  // Called on the publish path. Throwing there would turn a malformed cell into a failed post.
  eq("a malformed value is unrestricted, not an exception", parseMarketRestriction(42), null)

  ok("unrestricted allows every market", isMarketAllowed(null, "Houston") && isMarketAllowed(null, "Austin"))
  ok("…and allows a blank market, exactly as today", isMarketAllowed(null, null) && isMarketAllowed(null, ""))

  ok("Dallas-only allows Dallas", isMarketAllowed(["Dallas"], "Dallas"))
  ok("Dallas-only refuses San Antonio", !isMarketAllowed(["Dallas"], "San Antonio"))
  ok("…refuses Houston", !isMarketAllowed(["Dallas"], "Houston"))
  ok("…refuses Austin", !isMarketAllowed(["Dallas"], "Austin"))
  // The one normalisation: case and surrounding space. Markets are hand-typed free text in two
  // different places, so "dallas" is a realistic typo and one that would silently empty a pool.
  ok("case and whitespace are ignored", isMarketAllowed(["Dallas"], " dallas "))
  ok("…in the restriction too", isMarketAllowed([" DALLAS "], "Dallas"))
  // NOTHING ELSE is normalised. The catalog lists Dallas and DFW as DISTINCT markets and never
  // merges them; a brand that should carry both lists both, which is why this is a list.
  ok("DFW is NOT Dallas — distinct labels stay distinct", !isMarketAllowed(["Dallas"], "DFW"))
  ok("…and Dallas is not DFW", !isMarketAllowed(["DFW"], "Dallas"))
  ok("a two-market restriction allows both", isMarketAllowed(["Dallas", "DFW"], "DFW") && isMarketAllowed(["Dallas", "DFW"], "Dallas"))
  ok("…and still refuses a third", !isMarketAllowed(["Dallas", "DFW"], "Houston"))
  // A blank market cannot be SHOWN to be Dallas, and "we could not tell" must never publish.
  ok("a blank market is refused under a restriction", !isMarketAllowed(["Dallas"], null) && !isMarketAllowed(["Dallas"], "") && !isMarketAllowed(["Dallas"], "   "))

  eq("an unrestricted destination has no violation", marketRestrictionViolation(null, "Houston"), null)
  eq("a permitted market has no violation", marketRestrictionViolation(["Dallas"], "Dallas"), null)
  const v = marketRestrictionViolation(["Dallas"], "San Antonio") ?? ""
  // Prose, not a code: this string is written into social_posts.error_message, where a human reads
  // it. "market_mismatch" would not tell them which market or which restriction.
  ok("a violation names the restriction AND the offending market", /Dallas only/.test(v) && /San Antonio/.test(v), v)
  ok("…and says what to do about it", /[Rr]eassign/.test(v), v)
  const blank = marketRestrictionViolation(["Dallas"], null) ?? ""
  ok("a blank market's violation says the market is unset rather than wrong", /no market set/.test(blank), blank)

  eq("the label reads as a constraint", marketRestrictionLabel(["Dallas"]), "Dallas only")
  eq("…and lists several", marketRestrictionLabel(["Dallas", "DFW"]), "Dallas, DFW only")
  eq("…and is absent when unrestricted", marketRestrictionLabel(null), null)

  ok("Dallas and DFW are both real market labels, so a restriction can name either",
    SOCIAL_MARKETS.includes("Dallas") && SOCIAL_MARKETS.includes("DFW"))
}

// ── 2. THE PLANNER — ENFORCEMENT POINT ONE: CONTENT SELECTION ─────────────────────────────────
const READY = {
  status: "ready", renderStatus: "ready", renderedStoragePath: "p/x.mp4", scheduledAt: null,
  publishedAt: null, externalPostId: null, connectionId: null, approvedAt: "2026-10-01T00:00:00Z",
}
const post = (id: string, market: string | null, platform = "instagram", place = id): PoolPost =>
  ({ id, sourceContentId: `src-${id}`, placeId: `place-${place}`, market, propertyName: id, ...READY, platform })

const RESTRICTED = "locatorbeast-ig"
const OPEN = "realestatepro-ig"
const rule = (connectionId: string, over: Partial<AutopilotRule> = {}): AutopilotRule => ({
  connectionId, platform: "instagram", enabled: true, timezone: DEFAULT_TIMEZONE,
  dailyTimes: BASELINE_DAILY_TIMES, postsPerDay: 2, marketWeights: {},
  allowedMarkets: null, marketRotationSeed: null, staggerOffsetMinutes: 0, startIndex: 0, ...over,
})
const plan = (rules: AutopilotRule[], pool: PoolPost[], over: { maxDays?: number; history?: Map<string, Map<string, string>> } = {}) =>
  planAutopilot({
    rules, pool, startDateKey: "2026-11-13", wallClockToUtc: wallClockToUtcISO,
    maxDays: over.maxDays ?? 3, history: over.history,
  })

// A pool deliberately WEIGHTED AGAINST Dallas: two Dallas properties and five from elsewhere. If
// the restriction were a preference rather than a filter, the extra five are what a Dallas-only
// account would end up publishing.
const MIXED = [
  post("d1", "Dallas"), post("d2", "Dallas"),
  post("s1", "San Antonio"), post("s2", "San Antonio"), post("h1", "Houston"),
  post("a1", "Austin"), post("f1", "DFW"),
]

console.log("\nENFORCEMENT 1 — the planner filters the pool BEFORE selection:")
{
  const p = plan([rule(RESTRICTED, { allowedMarkets: ["Dallas"] })], MIXED)
  ok("the restricted destination is scheduled something at all", p.planned.length > 0)
  eq("every placement is Dallas", [...new Set(p.planned.map((x) => x.market))], ["Dallas"])
  ok("…and only the two Dallas properties are ever used",
    new Set(p.planned.map((x) => x.propertyKey)).size === 2)
  eq("no market fell forward", p.marketFallbacks, [])
  // The observable proof, rather than inferring the guarantee from an absence.
  eq("the post-selection invariant counter is clean", p.inventory.marketRestrictionViolations, 0)
  eq("the cooldown is still respected", p.inventory.cooldownViolations, 0)
  ok("San Antonio, Houston, Austin and DFW are nowhere in the plan",
    !p.planned.some((x) => ["San Antonio", "Houston", "Austin", "DFW"].includes(x.market ?? "")))
}
{
  // THE SAME POOL, THE SAME RULE, restriction removed. This is the control: it proves the pool
  // really does contain other markets and that the restriction is the only thing excluding them.
  const p = plan([rule(RESTRICTED, { allowedMarkets: null })], MIXED)
  ok("CONTROL — unrestricted, the same destination DOES take other markets",
    p.planned.some((x) => x.market !== "Dallas"))
  ok("…and reaches more than the two Dallas properties",
    new Set(p.planned.map((x) => x.propertyKey)).size > 2)
}

console.log("\nENFORCEMENT 1 — no Dallas inventory leaves the slot EMPTY, never substituted:")
{
  // The scenario the requirement is actually about: the restricted account's market has nothing.
  const noDallas = [post("s1", "San Antonio"), post("s2", "San Antonio"), post("h1", "Houston")]
  const p = plan([rule(RESTRICTED, { allowedMarkets: ["Dallas"] })], noDallas)
  eq("nothing is scheduled", p.planned, [])
  ok("every slot is reported unfilled", p.unfilledSlots > 0)
  eq("…and the unfilled count is also on the inventory report", p.inventory.unfilledSlots, p.unfilledSlots)
  eq("no substitution was recorded, because none happened", p.marketFallbacks, [])
  ok("the plan SAYS so, naming the destination and the market",
    p.notes.some((n) => n.includes(RESTRICTED) && n.includes("Dallas") && /UNFILLED/.test(n)),
    JSON.stringify(p.notes))
  ok("…and the plan is not reported as sufficient", !p.sufficient)
}
{
  // Same empty-Dallas pool, unrestricted. The control again: without the restriction those slots
  // FILL, which is exactly the substitution a Dallas-only brand must never get.
  const noDallas = [post("s1", "San Antonio"), post("s2", "San Antonio"), post("h1", "Houston")]
  const p = plan([rule(OPEN, { allowedMarkets: null })], noDallas)
  ok("CONTROL — unrestricted, those same slots are filled from another market", p.planned.length > 0)
}

console.log("\nENFORCEMENT 1 — a blank market is not treated as Dallas:")
{
  const blanks = [post("d1", "Dallas"), post("b1", null), post("b2", "")]
  const p = plan([rule(RESTRICTED, { allowedMarkets: ["Dallas"] })], blanks)
  eq("only the Dallas property is placed", [...new Set(p.planned.map((x) => x.propertyName))], ["d1"])
  ok("the unmarked content is never scheduled", !p.planned.some((x) => ["b1", "b2"].includes(x.propertyName ?? "")))
}
{
  // Case is the one thing forgiven, because it is a typo rather than a different market.
  const lower = [post("d1", "dallas"), post("d2", " DALLAS ")]
  const p = plan([rule(RESTRICTED, { allowedMarkets: ["Dallas"] })], lower)
  ok("content typed 'dallas' still qualifies for a Dallas-only destination", p.planned.length > 0)
  ok("…and the stored spelling is preserved verbatim, not rewritten",
    p.planned.every((x) => ["dallas", " DALLAS "].includes(x.market ?? "")))
}

console.log("\nENFORCEMENT 1 — DFW is a different market, and is not substituted for Dallas:")
{
  const p = plan([rule(RESTRICTED, { allowedMarkets: ["Dallas"] })], [post("f1", "DFW"), post("f2", "DFW")])
  eq("a Dallas-only destination is offered no DFW content", p.planned, [])
  const both = plan([rule(RESTRICTED, { allowedMarkets: ["Dallas", "DFW"] })], [post("f1", "DFW"), post("d1", "Dallas")])
  eq("…and listing both markets admits both", [...new Set(both.planned.map((x) => x.market))].sort(), ["DFW", "Dallas"])
}

console.log("\nFOUR DESTINATIONS, ONE PLAN — restricted and unrestricted side by side:")
{
  // Both brands on both platforms, in the SAME call, against the same inventory. The Instagram
  // pair shares a platform group, which is where a per-group filter would have leaked.
  const pool = [
    ...MIXED,
    post("d1t", "Dallas", "tiktok", "d1"), post("d2t", "Dallas", "tiktok", "d2"),
    post("s1t", "San Antonio", "tiktok", "s1"), post("h1t", "Houston", "tiktok", "h1"),
  ]
  const p = plan([
    rule(OPEN, { allowedMarkets: null }),
    rule(RESTRICTED, { allowedMarkets: ["Dallas"], staggerOffsetMinutes: 7 }),
    rule("realestatepro-tt", { platform: "tiktok", allowedMarkets: null }),
    rule("locatorbeast-tt", { platform: "tiktok", allowedMarkets: ["Dallas"], staggerOffsetMinutes: 7 }),
  ], pool)

  const forConn = (id: string) => p.planned.filter((x) => x.connectionId === id)
  for (const id of ["locatorbeast-ig", "locatorbeast-tt"]) {
    const mine = forConn(id)
    ok(`${id} is scheduled something`, mine.length > 0)
    eq(`${id} publishes Dallas and nothing else`, [...new Set(mine.map((x) => x.market))], ["Dallas"])
  }
  // THE PLATFORM-AGNOSTIC CLAIM, stated as an assertion rather than as a comment: the TikTok
  // destination is restricted by the same field, through the same code, with no TikTok branch.
  ok("the restriction holds on TikTok exactly as on Instagram, with no platform-specific path",
    forConn("locatorbeast-tt").every((x) => x.market === "Dallas") && forConn("locatorbeast-tt").length > 0)
  for (const id of ["realestatepro-ig", "realestatepro-tt"]) {
    ok(`${id} is UNAFFECTED — it still draws from other markets`,
      forConn(id).some((x) => x.market !== "Dallas"), JSON.stringify(forConn(id).map((x) => x.market)))
  }
  eq("no placement anywhere in the plan broke a restriction", p.inventory.marketRestrictionViolations, 0)

  // REQUIREMENT: separate schedules. The restricted account carries its own stagger, so the two
  // Instagram destinations never share a minute.
  const minutes = (id: string) => new Set(forConn(id).map((x) => x.minute))
  ok("the two Instagram destinations post at different minutes",
    [...minutes(OPEN)].every((m) => !minutes(RESTRICTED).has(m)),
    `${[...minutes(OPEN)]} vs ${[...minutes(RESTRICTED)]}`)
  // REQUIREMENT: 2 videos per day per platform.
  const perDay = (id: string) => {
    const byDay = new Map<string, number>()
    for (const x of forConn(id)) byDay.set(x.dateKey, (byDay.get(x.dateKey) ?? 0) + 1)
    return [...new Set(byDay.values())]
  }
  eq("the restricted Instagram destination posts exactly 2 per day", perDay(RESTRICTED), [2])
  eq("…and so does the restricted TikTok destination", perDay("locatorbeast-tt"), [2])
}

console.log("\nREQUIREMENT — the same Dallas video MAY cross platforms and brands:")
{
  // One building, four creatives: Instagram and TikTok renders for each of two brands' pools. The
  // restriction must not prevent the same property reaching every destination.
  const pool = [
    post("ig-a", "Dallas", "instagram", "shared"), post("ig-b", "Dallas", "instagram", "shared"),
    post("tt-a", "Dallas", "tiktok", "shared"), post("tt-b", "Dallas", "tiktok", "shared"),
  ]
  const p = plan([
    rule(OPEN), rule(RESTRICTED, { allowedMarkets: ["Dallas"], staggerOffsetMinutes: 7 }),
    rule("realestatepro-tt", { platform: "tiktok" }),
    rule("locatorbeast-tt", { platform: "tiktok", allowedMarkets: ["Dallas"], staggerOffsetMinutes: 7 }),
  ], pool, { maxDays: 1 })
  const conns = [...new Set(p.planned.map((x) => x.connectionId))].sort()
  eq("all four destinations are scheduled the shared property", conns,
    ["locatorbeast-ig", "locatorbeast-tt", "realestatepro-ig", "realestatepro-tt"])
  eq("…and it is the SAME property on each", [...new Set(p.planned.map((x) => x.propertyKey))], ["place:place-shared"])
  // Per-account duplicate prevention, which is what "maintain" means here: one account never
  // repeats the building inside its cooldown, even though another account may post it the same day.
  for (const id of conns) {
    const mine = p.planned.filter((x) => x.connectionId === id)
    ok(`${id} never repeats the building inside its cooldown`, mine.every((x) => !x.isRecycled) || mine.length === 1)
  }
  eq("no cooldown was violated anywhere", p.inventory.cooldownViolations, 0)
}

console.log("\nREQUIREMENT — per-account history still governs, independently of the restriction:")
{
  const pool = [post("d1", "Dallas"), post("d2", "Dallas")]
  // The restricted account already posted d1 two days ago; the other account never has.
  const history = new Map([[RESTRICTED, new Map([[propertyKeyOf(pool[0]), "2026-11-11T12:00:00Z"]])]])
  const p = plan([
    rule(RESTRICTED, { allowedMarkets: ["Dallas"] }),
    rule(OPEN, { staggerOffsetMinutes: 7 }),
  ], pool, { maxDays: 1, history })
  const first = (id: string) => p.planned.filter((x) => x.connectionId === id)
  ok("the restricted account's first fresh pick is the property it has NOT posted",
    first(RESTRICTED)[0]?.propertyName === "d2", JSON.stringify(first(RESTRICTED).map((x) => x.propertyName)))
  ok("the other account is free to post the building the restricted one already used",
    first(OPEN).some((x) => x.propertyName === "d1"), JSON.stringify(first(OPEN).map((x) => x.propertyName)))
  ok("nothing was placed inside its cooldown", p.inventory.cooldownViolations === 0)
}

console.log("\nREQUIREMENT — a paused restricted destination plans nothing, and pausing is per account:")
{
  const p = plan([
    rule(RESTRICTED, { allowedMarkets: ["Dallas"], enabled: false }),
    rule(OPEN, { staggerOffsetMinutes: 7 }),
  ], MIXED, { maxDays: 1 })
  ok("the disabled destination gets no placements", !p.planned.some((x) => x.connectionId === RESTRICTED))
  ok("…and the other destination is unaffected", p.planned.some((x) => x.connectionId === OPEN))
}

// ── 3. THE WIRING — the live planner really reads the column ──────────────────────────────────
console.log("\nWIRING — computeAutopilotPlan carries each destination's own restriction:")
{
  ok("the connections query selects market_restriction", /market_restriction/.test(PLAN_RUN))
  ok("…and it is parsed through the shared helper, not re-interpreted",
    /allowedMarkets:\s*parseMarketRestriction\(/.test(PLAN_RUN))
  ok("…from the connection row itself", /market_restriction\?\s*:\s*unknown[\s\S]{0,40}\)\.market_restriction/.test(PLAN_RUN))
  // REQUIRED, not optional. A rule built without it fails to compile rather than silently reading
  // as unrestricted — which is the only reason this field being forgotten stays cheap to notice.
  ok("AutopilotRule.allowedMarkets is a REQUIRED field", /\n\s*allowedMarkets: readonly string\[\] \| null\n/.test(PLANNER))
  // Phase C inserted the identity filter beside this one, so the market narrowing now lands in
  // `marketPool` and `rulePool` is what survives BOTH. The subject is unchanged: the pool is
  // narrowed per rule, not per platform group, and an unrestricted rule still reuses the group's
  // own array by identity.
  ok("the planner filters the pool per RULE, not per platform group",
    /marketPool\s*=\s*allowed\s*\?\s*pool\.filter\(\(p\)\s*=>\s*isMarketAllowed\(allowed, p\.market\)\)\s*:\s*pool/.test(PLANNER)
    && /rulePool\s*=\s*identityRefused\.size === 0\s*\?\s*marketPool\s*:/.test(PLANNER))
  // The ordering IS the guarantee: everything that selects reads the restricted map.
  for (const [what, re] of [
    ["the rotation order", /rotatePool\(\[\.\.\.rulePostsByProperty\.keys\(\)\]/],
    ["the market order", /marketsPresent\s*=\s*rulePool\./],
    ["the fallback's inventory question", /fallbackReason\s*=\s*rulePool\.some/],
    ["the creative choice", /variants\s*=\s*rulePostsByProperty\.get\(key\)/],
  ] as const) {
    ok(`${what} reads the RESTRICTED set`, re.test(PLANNER))
  }
  ok("the unfilled branch is what an empty restricted pool reaches", /unfilledSlots\+\+;\s*continue/.test(PLANNER))
  ok("and the post-selection invariant is asserted inside the planner too",
    /if \(!isMarketAllowed\(allowed, pick\.market\)\)/.test(PLANNER))
}

// ── 4. ENFORCEMENT POINT TWO — BOTH PUBLISH WORKERS ───────────────────────────────────────────
console.log("\nENFORCEMENT 2 — the publish workers re-check the row immediately before publishing:")
for (const [name, src] of [["Instagram", IG_WORKER], ["TikTok", TT_WORKER]] as const) {
  ok(`${name}: imports the SHARED restriction module`,
    /from "@\/lib\/social\/marketRestriction"/.test(src))
  ok(`${name}: calls marketRestrictionViolation on the row's own market`,
    /marketRestrictionViolation\([\s\S]{0,80}market/.test(src))
  ok(`${name}: the due query carries the source market`,
    /source:source_content_id\([^)]*market/.test(src))
  ok(`${name}: a violation is recorded, so a run can report it`,
    /blockedByMarketRestriction/.test(src))
  ok(`${name}: a violation marks the post for a human rather than retrying it forever`,
    /(await fail\(postId, marketViolation\)|await markFailed\(postId, marketViolation\))/.test(src))
  // FAIL CLOSED, non-destructively: an unreadable row must not publish and must not burn a slot.
  ok(`${name}: an unreadable restriction skips without claiming or failing the post`,
    /skippedDestinationUnreadable/.test(src))
}
{
  // ORDER IS THE PROPERTY. Checked before the claim, so a refused post keeps its slot and its
  // scheduled_at instead of being moved out of 'scheduled' by a condition it can recover from.
  const igClaim = IG_WORKER.indexOf('.update({ status: "publishing"')
  const igCheck = IG_WORKER.indexOf("marketRestrictionViolation(dest.marketRestriction")
  ok("Instagram: the restriction is checked BEFORE the publish claim", igCheck > 0 && igCheck < igClaim,
    `check@${igCheck} claim@${igClaim}`)
  const ttClaim = TT_WORKER.indexOf('.update({ status: "publishing"')
  const ttCheck = TT_WORKER.indexOf("marketRestrictionViolation(restriction.restriction")
  ok("TikTok: the restriction is checked BEFORE the publish claim", ttCheck > 0 && ttCheck < ttClaim,
    `check@${ttCheck} claim@${ttClaim}`)
}
{
  // The RECOVERY path can publish too — a stranded row with no media_publish claim provably never
  // reached Meta, so finalize would complete it. It gets the same check. A CLAIMED row is
  // observe-only, and refusing to observe would leave a possibly-live Reel unreconciled forever.
  ok("Instagram: the stranded-row recovery path checks the restriction before completing a publish",
    /if \(!r\.media_publish_claimed_at\) \{[\s\S]{0,400}marketRestrictionViolation/.test(IG_WORKER))
  ok("…and the reconcile queries carry the source market to check it with",
    (IG_WORKER.match(/media_publish_claimed_at, source:source_content_id\(market\)/g) ?? []).length === 2)
}
{
  // The restriction is read from the connection ROW, not bolted onto the token RPC — the working
  // integrations publish through those functions and neither is edited.
  ok("Instagram: the token RPC is unchanged — the restriction comes from a separate row read",
    /sa_get_instagram_token_by_connection/.test(IG_WORKER)
    && /from\("social_connections"\)[\s\S]{0,120}select\("market_restriction"\)/.test(IG_WORKER))
  ok("TikTok: reads the restriction per CONNECTION, so a second TikTok account needs no new path",
    /from\("social_connections"\)[\s\S]{0,120}select\("market_restriction"\)/.test(TT_WORKER)
    && /\.eq\("id", connectionId\)/.test(TT_WORKER))
  ok("TikTok: a row with no connection id is unrestricted, which is how every TikTok post reads today",
    /if \(!connectionId\) return \{ ok: true, restriction: null \}/.test(TT_WORKER))
}

// ── 5. THE MIGRATION ──────────────────────────────────────────────────────────────────────────
console.log("\nTHE COLUMN — opt-in, nullable, and no existing destination can acquire one:")
{
  ok("one nullable text[] column is added", /add column if not exists market_restriction text\[\]/.test(MIGRATION))
  // NO DEFAULT is the compatibility guarantee: every pre-existing row reads NULL = unrestricted.
  ok("…with NO default, so every existing destination stays unrestricted",
    !/market_restriction text\[\][^\n;]*default/i.test(MIGRATION))
  ok("…and NOT NULL is never asserted on it", !/market_restriction[^\n;]*not null/i.test(MIGRATION))
  ok("the shape CHECK forbids an empty array, a null member and a blank member",
    /cardinality\(market_restriction\) between 1 and 12/.test(MIGRATION)
    && /array_position\(market_restriction, null\) is null/.test(MIGRATION)
    && /cardinality\(array_remove\(market_restriction, ''\)\)/.test(MIGRATION))
  ok("the writer is ownership-verified through the SAME guard the other destination RPCs use",
    /create or replace function public\.sa_update_destination_markets/.test(MIGRATION)
    && /_sa_require_owned_connection\(p_connection_id\)/.test(MIGRATION)
    && /where id = p_connection_id and owner_user_id = v_uid/.test(MIGRATION))
  ok("…it is SECURITY DEFINER with a pinned search_path", /security definer set search_path = public/.test(MIGRATION))
  ok("…revoked from public and anon, granted only to authenticated",
    /revoke all on function public\.sa_update_destination_markets\(uuid, text\[\]\) from public, anon/.test(MIGRATION)
    && /grant execute on function public\.sa_update_destination_markets\(uuid, text\[\]\) to authenticated/.test(MIGRATION))
  ok("an all-blank list clears the restriction rather than storing 'nothing allowed'",
    /v_clean := null;\s*$/m.test(MIGRATION) && /cardinality\(v_clean\) = 0/.test(MIGRATION))

  // NOTHING ELSE. This migration must not touch a token, a scope, a pause flag, a cadence, RLS,
  // an index, a trigger, or any existing row.
  for (const [what, re] of [
    ["no row is written", /\b(insert into|update\s+public\.social_connections\s+set\s+(?!market_restriction))/i],
    ["no table is dropped or truncated", /\b(drop table|truncate)\b/i],
    ["no RLS policy is touched", /\b(create|drop|alter)\s+policy\b/i],
    ["no token or scope column is touched", /\b(token_secret_id|token_expires_at|scopes)\b/i],
    ["no pause or cadence column is touched", /\b(posting_paused|posts_per_day|stagger_offset_minutes)\b/i],
    ["no existing destination RPC is replaced", /sa_(pause|resume|disconnect)_destination|sa_update_destination_(label|cadence)|sa_consume_destination_invitation|sa_get_(instagram|tiktok)_token/],
    ["no trigger is created", /create\s+(or replace\s+)?trigger/i],
  ] as const) {
    ok(what, !re.test(MIGRATION))
  }
  // The verification file must be runnable BEFORE the migration, or it cannot establish a
  // pre-state. Postgres resolves column names at parse time, so it reads through to_jsonb.
  const VERIFY = sql(read("supabase/prepared/20261115000002_destination_market_restriction.verify.sql"))
  ok("the verification reads the new column through to_jsonb, so it runs pre-apply too",
    /to_jsonb\(sc\) ->> 'market_restriction'/.test(VERIFY))
  ok("…and is entirely SELECTs", !/\b(insert|update|delete|alter|create|drop)\b/i.test(VERIFY))
}

// ── 6. THE ADMIN ACTION ───────────────────────────────────────────────────────────────────────
console.log("\nSETTING IT — one connection-scoped action, validated against the real market list:")
{
  ok("'markets' is an accepted action", /ACTIONS = new Set\(\[[^\]]*"markets"/.test(MANAGE))
  ok("…and it calls the ownership-verified RPC", /rpc\("sa_update_destination_markets"/.test(MANAGE))
  ok("labels are validated against SOCIAL_MARKETS, not accepted as free text",
    /SOCIAL_MARKETS\.find\(\(m\) => m\.toLowerCase\(\) === w\.toLowerCase\(\)\)/.test(MANAGE))
  ok("an unknown label is a 400 that NAMES the offending value",
    /error: "unknown_market", unknown: parsed\.unknown/.test(MANAGE))
  ok("the canonical spelling is what gets stored, so one market is never two",
    /resolved\.push\(hit\)/.test(MANAGE))
  ok("clearing the restriction is expressible", /return \{ ok: true, markets: null \}/.test(MANAGE))
  ok("the other five actions are untouched",
    ["pause", "resume", "disconnect", "label", "cadence"].every((a) => MANAGE.includes(`"${a}"`)))
}

// ── 7. THE OPERATOR CAN SEE IT ────────────────────────────────────────────────────────────────
console.log("\nSEEING IT — the restriction is on the destination row, for both platforms:")
{
  const PAGE = code(read("app/admin/social-autopilot/accounts/page.tsx"))
  const UI = code(read("components/crm/social/PublishingDestinations.tsx"))
  ok("the page selects the column for Instagram and for TikTok",
    (PAGE.match(/market_restriction/g) ?? []).length >= 4)
  // Both platforms, through the one helper. The TikTok side reads `r` rather than `ttRow` since it
  // became a list (Phase 1 of the multi-account work); the claim is the same — the chip is derived
  // from the same value the planner and both workers consult, not a second interpretation.
  ok("…and normalises it through the same shared helper the enforcement uses",
    (PAGE.match(/parseMarketRestriction\((?:row|r|ttRow)\.market_restriction\)/g) ?? []).length === 2)
  ok("ONE chip renderer serves both platforms", (UI.match(/marketChip\(/g) ?? []).length === 3)
  ok("…and it says what happens when the market has nothing: the slot is left empty",
    /is left empty/.test(read("components/crm/social/PublishingDestinations.tsx")))
  ok("an unrestricted destination renders no chip at all",
    /if \(!markets \|\| markets\.length === 0\) return null/.test(UI))
  // The cadence line used to claim scheduling was "coming soon · a saved preference only". The
  // autopilot plan cron made that false, and it rendered nothing at all when the column was null —
  // which is both live accounts, so there was nowhere to confirm a 2/day account posts twice.
  ok("the stale 'scheduling coming soon' copy is gone", !/scheduling coming soon/.test(UI))
  // Restated for the owner-grouped cards, where ONE renderer serves both platforms — the claim is
  // unchanged and now covers TikTok too, whose cadence the planner has always honoured (it builds
  // a rule from every connection regardless of provider) and which the page simply never selected.
  ok("…and the EFFECTIVE cadence is shown, marked when it comes from the default",
    /const cadence = \(postsPerDay: number \| null \| undefined\)/.test(UI)
      && /\{postsPerDay \?\? 2\}/.test(UI)
      && /\(default — 7:30 AM & 7:30 PM CT\)/.test(UI))
  ok("…by ONE renderer, so the two platforms cannot state different cadences",
    (UI.match(/cadence\(/g) ?? []).length === 2
      && /cadence\(d\.postsPerDay\)/.test(UI) && /cadence\(t\.postsPerDay\)/.test(UI))
}

// ── 8. RELEASE SCOPE ──────────────────────────────────────────────────────────────────────────
// The allow-list for THIS release, measured against the latest verified production commit. It is
// not a style check: the brief forbids touching OAuth, the working integrations, captions,
// templates, hashtags and the archived pricing-299 WIP, and this is what makes that checkable
// rather than asserted in a commit message.
console.log("\nRELEASE SCOPE — exactly the approved files, and nothing the brief ruled out:")
{
  const BASELINE = "4dcc56b"
  // The END of this release, not the working tree — the same pinning militarySpecial's guard got in
  // this release, for the same reason. This guard's claim is "between 4dcc56b and the market
  // -restriction release, exactly these files changed": a claim about a pair of commits, and
  // therefore permanently checkable. Diffed against the tree it became a claim about whatever is
  // checked out, so every later release broke it and had to widen an allow-list with files that
  // have nothing to do with the market restriction.
  const RELEASE = "beb7c81"
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
      // The shared definition — the whole point of the brief's "rather than an Instagram-specific
      // solution".
      "lib/social/marketRestriction.ts",
      // Enforcement 1: the pool each destination may be offered.
      "lib/social/autopilotPlanner.ts",
      "lib/social/autopilotPlanRun.ts",
      // Enforcement 2: both publish workers, per row, immediately before publishing.
      "app/api/cron/social-instagram-publish/route.ts",
      "app/api/cron/social-tiktok-publish/route.ts",
      // Setting it, and seeing it.
      "app/api/admin/social-autopilot/destinations/manage/route.ts",
      "app/admin/social-autopilot/accounts/page.tsx",
      "components/crm/social/PublishingDestinations.tsx",
      // The column and its verification, AT THE PATH THEY HAD IN THIS RELEASE. The list is
      // compared against the beb7c81 commit, so it names what that commit contained — the files
      // were later moved to supabase/prepared/ under a free version number, because
      // supabase/migrations/ is the APPLIED history and 20261114000000 was already taken in
      // production by the Quick Match release. The reads above follow the current path; this list
      // must not.
      "supabase/migrations/20261114000000_destination_market_restriction.sql",
      "supabase/migrations/20261114000000_destination_market_restriction.verify.sql",
      // This file, and the non-publishing dry run it is paired with: the suite proves the rules
      // in isolation, the dry run proves them against the live destination rows with the write
      // -sensitive columns snapshotted before and after.
      "scripts/social/marketRestriction.test.ts",
      "scripts/social/marketRestrictionDryRun.ts",
      // The four places that construct an AutopilotRule. allowedMarkets is REQUIRED, so each had
      // to state it — which is the compile-time check working, not collateral damage.
      "scripts/social/autopilotPlanner.test.ts",
      "scripts/social/autopilotTrigger.test.ts",
      "scripts/social/autopilotWiring.test.ts",
      "scripts/social/autopilotTriggerDryRun.ts",
      // Its diff range is pinned to its own release, so a later release no longer breaks it.
      "scripts/social/militarySpecial.test.ts",
    ].sort()
    eq(`exactly the ${APPROVED.length} approved files changed`, changed, APPROVED)

    for (const [label, re] of [
      ["OAuth and the connect / callback routes", /accounts\/(instagram|tiktok)\/(connect|callback|disconnect)|authorize\//],
      ["the destination invitation flow", /destinationInvite|destinations\/invitations/],
      ["captions, templates and hashtags", /composePost|hashtags\.ts|overlaySpec|templateFamilies|loadedCopy/],
      ["the comment keywords and auto-reply", /commentKeywords|commentRunner|commentSender|commentSafety|commentSendPolicy/],
      ["the post editor", /PostEditor/],
      ["TikTok publishing, its gates and its settings", /tiktokPublish|tiktokGate|tiktokServer|tiktokPublishSettings|tiktok\.ts/],
      ["the Instagram publish helpers", /lib\/social\/(instagram|instagramFinalize)\.ts/],
      ["the archived pricing-299 WIP", /SocialAutopilotClient|QueueClient|PropertySearchField|propertySuggestions|property-catalog-search/],
      ["Quick Match", /lib\/quickMatch\//],
      ["the CRM workspace outside Social Beast", /components\/crm\/(?!social\/)/],
      ["the client-facing pages", /app\/r\/|app\/share|app\/\(site\)/],
      ["the auto-posting master switch and the eligibility predicate", /autoPosting\.ts|autopilotEligibility|autopilotWrite|postingHistory/],
      ["rendering", /renderVideo|renderPost|renderJobs/],
    ] as const) {
      ok(`${label} is untouched`, !changed.some((f) => re.test(f)))
    }

    // Shared files must ADD. The only removals allowed are the lines this release deliberately
    // replaces, each named so the number is reviewable rather than a ratchet that only grows.
    for (const [f, allowed, why] of [
      // Nine, every one a REPLACEMENT: the seven reads re-pointed from the platform pool to the
      // per-rule set (orderedProps, marketsPresent, marketOf, the fallback's inventory question
      // twice, the creative variants, the reuse point's property count), the counter declaration
      // and the inventory line. The export-surface check below is what actually proves nothing
      // was deleted.
      ["lib/social/autopilotPlanner.ts", 9, "seven pool reads re-pointed, the counter line, the inventory line"],
      ["lib/social/autopilotPlanRun.ts", 3, "the connections select, the marketWeights line, the history import line"],
      ["app/api/cron/social-instagram-publish/route.ts", 7, "the result line, the DestinationResult union, the resolve tail, two reconcile selects, the paused branch anchor, the claim comment anchor"],
      ["app/api/cron/social-tiktok-publish/route.ts", 3, "the result tail, the destinations import, the claim comment anchor"],
      ["app/api/admin/social-autopilot/destinations/manage/route.ts", 5, "the body type, the ACTIONS set, the doc header, the import, the cadence branch anchor"],
      ["app/admin/social-autopilot/accounts/page.tsx", 5, "two selects, the ConnRow type, the tiktok mapping anchor, the destination mapping anchor"],
      ["components/crm/social/PublishingDestinations.tsx", 8, "the two types, the fmtDate anchor, the stale cadence span (4 lines), the tiktok status anchor"],
      ["scripts/social/autopilotPlanner.test.ts", 2, "the rule factory's two lines"],
      ["scripts/social/autopilotTrigger.test.ts", 1, "the rule factory line"],
      ["scripts/social/autopilotWiring.test.ts", 1, "the rule factory line"],
      ["scripts/social/autopilotTriggerDryRun.ts", 2, "the rule literal's two lines"],
      // Five: the four-line `changed` expression (which also dropped the untracked-file union —
      // those files are tracked in the release commit now) and the one-line `removed` command.
      ["scripts/social/militarySpecial.test.ts", 5, "the diff range, pinned to its own release"],
    ] as const) {
      const removed = lines(`git diff --unified=0 ${BASELINE} ${RELEASE} -- ${f}`)
        .filter((l) => l.startsWith("-") && !l.startsWith("---"))
      ok(`${f} removes at most the ${allowed} line(s) it replaces (${why})`, removed.length <= allowed,
        `removed ${removed.length}`)
    }

    // Stronger than reading a diff: take the planner's whole public surface as the BASELINE
    // declared it and assert every name is still exported. A re-pointed line cannot hide a
    // deletion from this.
    const baselineExports = [...execSync(`git show ${BASELINE}:lib/social/autopilotPlanner.ts`, { encoding: "utf8" })
      .matchAll(/^export (?:function|type|const) (\w+)/gm)].map((m) => m[1]).sort()
    const nowExports = [...read("lib/social/autopilotPlanner.ts")
      .matchAll(/^export (?:function|type|const) (\w+)/gm)].map((m) => m[1]).sort()
    ok(`the planner declared ${baselineExports.length} exports at the baseline`, baselineExports.length >= 6)
    ok("…and every one of them is still exported", baselineExports.every((e) => nowExports.includes(e)),
      baselineExports.filter((e) => !nowExports.includes(e)).join(", "))

    // The Instagram worker's safety properties are the reason it is safe to edit at all. Every
    // guard the baseline had must still be there — this release ADDS one, it replaces none.
    const igBase = execSync(`git show ${BASELINE}:app/api/cron/social-instagram-publish/route.ts`, { encoding: "utf8" })
    for (const guard of [
      "SOCIAL_INSTAGRAM_AUTOPUBLISH_ENABLED", "CRON_SECRET", "readAutoPosting", "publishHoldDecision",
      "isEligibleAfterResume", "isWithinLatenessWindow", "media_publish_claimed_at", "reconcileOnly",
      '.eq("status", "scheduled")', '.is("external_post_id", null)', '.not("approved_at", "is", null)',
    ]) {
      ok(`Instagram worker still carries its ${guard} guard`,
        igBase.includes(guard) && read("app/api/cron/social-instagram-publish/route.ts").includes(guard))
    }
    const ttBase = execSync(`git show ${BASELINE}:app/api/cron/social-tiktok-publish/route.ts`, { encoding: "utf8" })
    for (const guard of [
      "SOCIAL_TIKTOK_AUTOPUBLISH_ENABLED", "UNAUDITED", 'DESTINATIONS[destination].publish !== "supported"',
      "readSavedSettings", "validateAgainstCreatorInfo", "fetchTikTokCreatorInfo",
    ]) {
      ok(`TikTok worker still carries its ${guard} guard`,
        ttBase.includes(guard) && read("app/api/cron/social-tiktok-publish/route.ts").includes(guard))
    }
  }
}

console.log(`\nMarket restriction: ${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
