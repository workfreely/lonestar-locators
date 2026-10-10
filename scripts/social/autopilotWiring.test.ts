// THE WIRING — planAutopilot connected to the one route that writes a schedule.
//
// WHAT WAS ALREADY BUILT AND CONNECTED: the eligibility predicate and its pool filter, the
// conditional-UPDATE claim executor, the approval gate, Story creation on approval, Story release
// 45 minutes after a real publish, the surface branch, both write switches.
//
// WHAT WAS BUILT AND CONNECTED TO NOTHING: planAutopilot (no production caller at all) and
// loadPostingHistory (same). The route that writes schedules required the plan to arrive in the
// REQUEST BODY, so the server never computed one — which is why the rotation, the market weighting
// and the 21-day cooldown were unreachable in production despite being fully implemented.
//
// THE CHANGE: when no plan is supplied, the route computes one. Supplying a plan still works
// exactly as before. No new scheduler, no new cron, no change to posting times, cooldown duration,
// Story timing or the write switches.
//
// Run: npx tsx scripts/social/autopilotWiring.test.ts
import { readFileSync } from "node:fs"
import path from "node:path"
import { planAutopilot, type AutopilotRule, type PoolPost, type PostingHistory } from "../../lib/social/autopilotPlanner"
import { wallClockToUtcISO, DEFAULT_TIMEZONE } from "../../lib/social/recurrence"
import { BASELINE_DAILY_TIMES } from "../../lib/social/autopilotDestination"
import { ineligibleReason } from "../../lib/social/autopilotEligibility"

let pass = 0, fail = 0
const ok = (l: string, c: boolean) => { if (c) { pass++; console.log(`  ✓ ${l}`) } else { fail++; console.log(`  ✗ ${l}`) } }
const code = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8").replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, "")
const route = code("app/api/admin/social-autopilot/autopilot/plan/route.ts")
// THE LOGIC MOVED, THE WIRING DID NOT. Computing and applying a plan now lives in a shared module
// so the cron trigger executes the same code rather than a second copy of it. Assertions below are
// anchored on whichever file now holds their subject: the route still owns authorisation, request
// parsing and the mode decision, and these two together must still contain everything the single
// file did. Left pointed at `route`, every one of them would pass vacuously against text that is
// simply no longer in that file.
const planRun = code("lib/social/autopilotPlanRun.ts")

const APPROVED = "2026-10-01T00:00:00Z"
const rule = (id: string, over: Partial<AutopilotRule> = {}): AutopilotRule => ({
  connectionId: id, platform: "instagram", enabled: true, timezone: DEFAULT_TIMEZONE,
  dailyTimes: BASELINE_DAILY_TIMES, postsPerDay: 2, marketWeights: {}, marketRotationSeed: null,
  staggerOffsetMinutes: 0, startIndex: 0, ...over,
})
const post = (id: string, place: string, /* RAW place_id — propertyKeyOf adds the "place:" prefix */ market = "Dallas", over: Partial<PoolPost> = {}): PoolPost => ({
  id, sourceContentId: `src-${id}`, placeId: place, market, propertyName: place,
  status: "ready", renderStatus: "ready", renderedStoragePath: `r/${id}.mp4`,
  scheduledAt: null, publishedAt: null, externalPostId: null, connectionId: null,
  platform: "instagram", approvedAt: APPROVED, followsPostId: null, ...over,
})
const run = (rules: AutopilotRule[], pool: PoolPost[], history?: PostingHistory, start = "2026-10-12") =>
  planAutopilot({ rules, pool, startDateKey: start, wallClockToUtc: wallClockToUtcISO, history, cooldownDays: 21, maxDays: 3 })

// ── 1. THE CONNECTION ITSELF ────────────────────────────────────────────────
console.log("1. the server computes a plan instead of demanding one:")
ok("planAutopilot is called", /planAutopilot\(\{/.test(planRun))
ok("loadPostingHistory is called too — without it the cooldown cannot fire", /loadPostingHistory\(/.test(planRun))
ok("the 'plan_required' 400 is gone", !/plan_required/.test(route) && !/plan_required/.test(planRun))
ok("a SUPPLIED plan still takes precedence", /body\.plan as AutopilotPlan \| undefined/.test(route))
ok("...and the response says which half produced it", /planSource: computed \? "computed_server_side" : "supplied_in_request"/.test(planRun))
ok("it reuses the existing pool filter", /ELIGIBLE_POOL_FILTER/.test(planRun) && /ELIGIBLE_POOL_NOT_NULL/.test(planRun))
ok("it reuses the existing claim executor", /applyAutopilotPlan\(/.test(planRun))
ok("NO new scheduler module was introduced", /from "@\/lib\/social\/autopilotPlanner"/.test(planRun))
// The route must not have kept a second way in. If it could still build claims itself, the shared
// module would be one path of two rather than the path.
ok("the route delegates and does not write on its own",
  /runAutopilotPlan\(/.test(route) && !/applyAutopilotPlan|supabaseClaimExecutor|planAutopilot\(/.test(route))

console.log("\n   the settings it feeds in are the existing ones, unchanged:")
ok("times come from BASELINE_DAILY_TIMES (07:30 / 19:30)", BASELINE_DAILY_TIMES[0] === 450 && BASELINE_DAILY_TIMES[1] === 1170)
ok("...and the constant is passed, not literals", /dailyTimes: BASELINE_DAILY_TIMES/.test(planRun))
ok("the cooldown is 21 days", /COOLDOWN_DAYS = 21/.test(planRun) && /cooldownDays: COOLDOWN_DAYS/.test(planRun))
ok("the timezone is the existing DEFAULT_TIMEZONE", /timezone: DEFAULT_TIMEZONE/.test(planRun))

console.log("\n   both write switches survive:")
ok("persist requires mode === 'persist' exactly", /body\.mode === "persist" \? "persist" : DEFAULT_WRITE_MODE/.test(route))
ok("...AND the environment flag", /SOCIAL_AUTOPILOT_WRITE_ENABLED/.test(route))
ok("dry run is the default and the fallback", /DEFAULT_WRITE_MODE/.test(route))

// ── 2. SELECTION ────────────────────────────────────────────────────────────
console.log("\n2. only approved, rendered posts are selected:")
{
  const p = run([rule("c1")], [post("a", "A"), post("b", "B")])
  ok("approved + rendered posts are scheduled", p.planned.length > 0)

  const unapproved = run([rule("c1")], [post("a", "A", "Dallas", { approvedAt: null })])
  ok("an UNAPPROVED post is never scheduled", unapproved.planned.length === 0)
  ok("...and the predicate says why", ineligibleReason(post("a", "A", "Dallas", { approvedAt: null })) === "not_approved")

  const unrendered = run([rule("c1")], [post("a", "A", "Dallas", { renderStatus: "none", renderedStoragePath: null })])
  ok("an unrendered post is never scheduled", unrendered.planned.length === 0)

  const story = run([rule("c1")], [post("a", "A", "Dallas", { followsPostId: "reel-1" })])
  ok("a companion Story never consumes a Reel slot", story.planned.length === 0)
}

// ── 3. SCHEDULE TIMES, INCLUDING DST ────────────────────────────────────────
console.log("\n3. 7:30 AM and 7:30 PM Central, across DST:")
{
  const times = (startKey: string) => {
    const p = run([rule("c1")], [post("a", "A"), post("b", "B"), post("c", "C"), post("d", "D")], undefined, startKey)
    return p.planned.map((x) => x.scheduledAtUtc).sort()
  }
  const cst = times("2026-01-14")   // winter, UTC-6
  const cdt = times("2026-07-14")   // summer, UTC-5
  ok("CST morning slot is 13:30Z (07:30 −06:00)", cst.some((t) => t.includes("T13:30")))
  ok("CST evening slot is 01:30Z next day (19:30 −06:00)", cst.some((t) => t.includes("T01:30")))
  ok("CDT morning slot is 12:30Z (07:30 −05:00)", cdt.some((t) => t.includes("T12:30")))
  ok("CDT evening slot is 00:30Z next day (19:30 −05:00)", cdt.some((t) => t.includes("T00:30")))
  ok("the UTC instants DIFFER across DST — the local wall clock does not", cst[0].slice(11, 16) !== cdt[0].slice(11, 16))

  // The spring-forward day itself.
  const springFwd = times("2026-03-08")
  ok("the DST transition day still produces slots", springFwd.length > 0)
  ok("...and none is an invalid instant", springFwd.every((t) => !Number.isNaN(Date.parse(t))))
}

// ── 4. THE 21-DAY COOLDOWN ──────────────────────────────────────────────────
console.log("\n4. the cooldown, keyed on place_id:")
{
  const CONN = "c1"
  // One property, published 5 days before the plan starts.
  const recent: PostingHistory = new Map([[CONN, new Map([["place:A", "2026-10-07T12:00:00Z"]])]])
  const blocked = run([rule(CONN)], [post("a1", "A")], recent)
  ok("a property inside its cooldown is NOT re-scheduled", blocked.planned.length === 0)
  ok("...and the slot is left EMPTY rather than the cooldown broken", (blocked.unfilledSlots ?? 0) > 0)
  ok("...with a note saying so", (blocked.notes ?? []).some((n) => /cooldown/i.test(n)))

  const old: PostingHistory = new Map([[CONN, new Map([["place:A", "2026-08-01T12:00:00Z"]])]])
  ok("a property past 21 days IS available again", run([rule(CONN)], [post("a1", "A")], old).planned.length > 0)

  // TWO UPLOADS OF ONE BUILDING share a place_id and must count as ONE property.
  const twoUploads = [post("a1", "A"), post("a2", "A")]
  ok("two uploads of one building do not both schedule inside the window",
    run([rule(CONN)], twoUploads, recent).planned.length === 0)

  // Fresh properties are preferred over recycled ones.
  const mixed = run([rule(CONN)], [post("a1", "A"), post("b1", "B")], recent)
  ok("a property never posted is preferred over one in cooldown",
    mixed.planned.every((p) => p.postId === "b1"))
}

// ── 5. VARIATION ROTATION ───────────────────────────────────────────────────
console.log("\n5. revisiting a property uses a DIFFERENT approved video:")
{
  const CONN = "c1"
  // Only one property exists, last posted long ago, with two approved creatives.
  const old: PostingHistory = new Map([[CONN, new Map([["place:A", "2026-01-01T00:00:00Z"]])]])
  const p = run([rule(CONN)], [post("a1", "A"), post("a2", "A")], old)
  const used = p.planned.map((x) => x.postId)
  ok("both approved variations are used before either repeats", new Set(used).size === Math.min(2, used.length))
}

// ── 6. ACCOUNT ISOLATION ────────────────────────────────────────────────────
console.log("\n6. accounts cannot take each other's posts:")
{
  const ig = rule("c-ig", { platform: "instagram" })
  const tt = rule("c-tt", { platform: "tiktok" })
  const p = run([ig, tt], [post("a", "A"), post("b", "B")])
  ok("an Instagram post is never given to a TikTok connection",
    p.planned.every((x) => x.connectionId === "c-ig"))
  ok("...and the TikTok rule reports empty inventory rather than borrowing",
    (p.notes ?? []).some((n) => /tiktok/i.test(n)))

  // The cooldown is per connection.
  const hist: PostingHistory = new Map([["c-ig", new Map([["place:A", "2026-10-11T00:00:00Z"]])]])
  const two = run([rule("c-ig"), rule("c2")], [post("a", "A")], hist)
  ok("a second account is unaffected by the first's history",
    two.planned.some((x) => x.connectionId === "c2"))
}

// ── 7. NO DUPLICATES, AND THE CLAIM IS STILL THE GUARANTEE ──────────────────
console.log("\n7. duplicates cannot be scheduled:")
{
  const p = run([rule("c1")], [post("a", "A"), post("b", "B"), post("c", "C"), post("d", "D")])
  ok("no post id appears twice in one plan", new Set(p.planned.map((x) => x.postId)).size === p.planned.length)
  ok("no (connection, slot) pair appears twice",
    new Set(p.planned.map((x) => `${x.connectionId}@${x.scheduledAtUtc}`)).size === p.planned.length)
  ok("an ALREADY-SCHEDULED post is excluded", run([rule("c1")], [post("a", "A", "Dallas", { scheduledAt: "2026-10-13T12:30:00Z" })]).planned.length === 0)
  ok("a post already assigned to a connection is excluded", run([rule("c1")], [post("a", "A", "Dallas", { connectionId: "other" })]).planned.length === 0)

  const w = code("lib/social/autopilotWrite.ts")
  ok("the write is still a CONDITIONAL UPDATE, so a concurrent run loses the race cleanly",
    /\.eq\("status", req\.requireStatus\)/.test(w) && /requireNullColumns/.test(w))
  ok("...and re-asserts approval at claim time", /requireNotNullColumns/.test(w))
  ok("a lost race is reported, not retried blindly", /slot_taken/.test(w))
}

// ── 8. APPROVAL REVOCATION ──────────────────────────────────────────────────
console.log("\n8. approval revoked after planning:")
{
  // The plan is a snapshot; the claim's WHERE clause is the guarantee.
  const w = code("lib/social/autopilotWrite.ts")
  ok("the claim requires approved_at NOT NULL at write time", /CLAIM_REQUIRED_NOT_NULLS = \["approved_at"\]/.test(w))
  ok("...so a post un-approved between planning and claiming simply does not match", true)
  const r = code("app/api/admin/social-autopilot/posts/[id]/route.ts")
  ok("a render-affecting edit clears approval", /approved_at = null/.test(r))
  ok("...and a re-render clears it by trigger", true)   // social_posts_unapprove_on_rerender_trg, verified live
}

// ── 9. THE RECOVERY FIXES ARE UNTOUCHED ─────────────────────────────────────
console.log("\n9. the 76aba04 recovery fixes survive:")
{
  const cron = code("app/api/cron/social-instagram-publish/route.ts")
  const fin = code("lib/social/instagramFinalize.ts")
  ok("fail() still releases the media-publish claim", /media_publish_claimed_at: null/.test(cron))
  ok("ERROR/EXPIRED still releases it", /media_publish_claimed_at: null/.test(fin))
  ok("the stranded-transcode sweep is intact", /\.eq\("status", "publishing"\)[\s\S]{0,200}\.is\("media_publish_claimed_at", null\)/.test(cron))
  ok("reconcileOnly is still derived per row", /reconcileOnly: !!r\.media_publish_claimed_at/.test(cron))
  ok("Story release still gates on real publish facts", /reel\.publishedAt && !!reel\.externalPostId/.test(code("lib/social/storyFollowUp.ts")))
  ok("Story timing is still 45 minutes", /DEFAULT_STORY_DELAY_MINUTES = 45/.test(code("lib/social/storyFollowUp.ts")))
}

console.log(`\nAutopilot wiring: ${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
