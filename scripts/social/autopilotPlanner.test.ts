// Planner: orchestration only. The safety properties under test are (a) nothing ineligible is ever
// scheduled, and (b) a shortage is reported rather than papered over.
import { propertyKeyOf, planAutopilot, weightedMarketOrder, type AutopilotRule, type PoolPost } from "@/lib/social/autopilotPlanner"
import { ineligibleReason, isEligible } from "@/lib/social/autopilotEligibility"
import { wallClockToUtcISO } from "@/lib/social/recurrence"

let pass = 0, fail = 0
const ok = (l: string, c: boolean, d = "") => { if (c) { pass++; console.log("  ✓", l) } else { fail++; console.log("  ✗", l + (d ? ` — ${d}` : "")) } }

const READY = { status: "ready", renderStatus: "ready", renderedStoragePath: "p/x.mp4", scheduledAt: null, publishedAt: null, externalPostId: null, connectionId: null, platform: "instagram" }
const post = (id: string, market: string, over: Partial<PoolPost> = {}): PoolPost =>
  ({ id, sourceContentId: `src-${id}`, placeId: `place-${id}`, market, propertyName: id, ...READY, ...over })
/** Two creatives of the SAME property. They are now distinguished by place_id, not by a shared
 *  sourceContentId — production proved two uploads of one building get DIFFERENT content ids. */
const variant = (id: string, srcId: string, market: string): PoolPost =>
  ({ id, sourceContentId: `src-${id}`, placeId: `place-${srcId}`, market, propertyName: srcId, ...READY })
const A = "aaaa-1111", B = "bbbb-2222"
const rule = (connectionId: string, over: Partial<AutopilotRule> = {}): AutopilotRule => ({
  connectionId, platform: "instagram", enabled: true, timezone: "America/Chicago", dailyTimes: [450, 1170],
  postsPerDay: 2, horizonDays: 3, marketWeights: { Dallas: 3, "San Antonio": 3, Houston: 1 },
  marketRotationSeed: null, staggerOffsetMinutes: 0, startIndex: null, ...over,
})

console.log("ELIGIBILITY — every exclusion prevents a specific wrong outcome:")
{
  ok("a rendered, unscheduled, unassigned 'ready' post IS eligible", isEligible(READY))
  const cases: [string, Partial<PoolPost>, string][] = [
    ["a draft (planner never renders)", { status: "draft" }, "not_ready"],
    ["mid-render", { status: "rendering", renderStatus: "rendering" }, "no_rendered_artifact"],
    ["render failed", { renderStatus: "error" }, "render_failed"],
    ["render says ready but there is NO artifact", { renderedStoragePath: null }, "no_rendered_artifact"],
    ["already scheduled", { scheduledAt: "2026-10-09T12:00:00Z" }, "already_scheduled"],
    ["already published", { status: "published" }, "already_published"],
    ["published_at set even if status lags", { publishedAt: "2026-10-01T00:00:00Z" }, "already_published"],
    ["mid-flight: external_post_id set before status round-trips", { externalPostId: "ig_123" }, "already_published"],
    ["already assigned to another connection", { connectionId: "other-conn" }, "assigned_to_connection"],
    ["needs human review", { status: "needs_attention" }, "needs_attention"],
    ["publishing right now", { status: "publishing" }, "not_ready"],
    ["a different platform", { platform: "tiktok" }, "wrong_platform"],
  ]
  for (const [label, over, expected] of cases) {
    ok(`excluded: ${label}`, ineligibleReason({ ...READY, ...over } as PoolPost) === expected,
      String(ineligibleReason({ ...READY, ...over } as PoolPost)))
  }
}

console.log("\nthe planner never schedules an ineligible post:")
{
  const pool = [
    post("ok1", "Dallas"), post("ok2", "San Antonio"), post("ok3", "Dallas"), post("ok4", "San Antonio"),
    post("bad-draft", "Dallas", { status: "draft" }),
    post("bad-sched", "Dallas", { scheduledAt: "2026-10-09T12:00:00Z" }),
    post("bad-pub", "Dallas", { status: "published" }),
    post("bad-conn", "Dallas", { connectionId: "someone-else" }),
    post("bad-attn", "Dallas", { status: "needs_attention" }),
    post("bad-art", "Dallas", { renderedStoragePath: null }),
  ]
  const plan = planAutopilot({ rules: [rule(A, { startIndex: 0 })], pool, startDateKey: "2026-10-08", wallClockToUtc: wallClockToUtcISO })
  const ids = new Set(plan.planned.map((p) => p.postId))
  ok("only eligible posts appear in the plan", [...ids].every((id) => id.startsWith("ok")), [...ids].join(","))
  ok("every rejected post is reported with a reason", plan.excluded.length === 6)
  ok("…and the reasons are specific, not a generic 'skipped'",
    new Set(plan.excluded.map((e) => e.reason)).size === 6, plan.excluded.map((e) => e.reason).join(","))
  ok("pool size counts only the eligible", plan.poolSize === 4)
}

console.log("\ntiming comes from the existing planner, with the account's stagger:")
{
  const pool = [post("p1", "Dallas"), post("p2", "San Antonio"), post("p3", "Dallas"), post("p4", "San Antonio"), post("p5", "Dallas"), post("p6", "San Antonio")]
  const plan = planAutopilot({ rules: [rule(A, { startIndex: 0, staggerOffsetMinutes: 0 })], pool, startDateKey: "2026-10-08", wallClockToUtc: wallClockToUtcISO })
  const minutes = [...new Set(plan.planned.map((p) => p.minute))].sort((x, y) => x - y)
  ok("a baseline-pinned account posts at exactly 07:30 and 19:30", minutes.join() === "450,1170", minutes.join())
  ok("two posts per day across a 3-day horizon", plan.planned.length === 6)
  ok("the plan is ordered chronologically", plan.planned.every((p, i, a) => i === 0 || a[i - 1].scheduledAtUtc <= p.scheduledAtUtc))
  // A staggered account gets different minutes, still only two distinct ones.
  const staggered = planAutopilot({ rules: [rule(B, { startIndex: 0, staggerOffsetMinutes: null })], pool, startDateKey: "2026-10-08", wallClockToUtc: wallClockToUtcISO })
  const sm = [...new Set(staggered.planned.map((p) => p.minute))].sort((x, y) => x - y)
  ok("a derived-stagger account has its own two stable minutes", sm.length === 2 && sm[0] !== 450, sm.join())
}

console.log("\ntwo accounts never share a post on the same date:")
{
  const pool = Array.from({ length: 12 }, (_, i) => post(`p${i}`, i % 2 ? "San Antonio" : "Dallas"))
  const plan = planAutopilot({
    // A is pinned to the baseline; B takes a DERIVED stagger, which is the real-world shape.
    rules: [rule(A, { startIndex: 0 }), rule(B, { staggerOffsetMinutes: null })], pool, startDateKey: "2026-10-08", wallClockToUtc: wallClockToUtcISO,
  })
  const byDate = new Map<string, Map<string, string[]>>()
  for (const p of plan.planned) {
    const m = byDate.get(p.dateKey) ?? new Map<string, string[]>()
    m.set(p.postId, [...(m.get(p.postId) ?? []), p.connectionId]); byDate.set(p.dateKey, m)
  }
  let shared = 0
  for (const [, m] of byDate) for (const [, conns] of m) if (new Set(conns).size > 1) shared++
  ok("no post is assigned to both accounts on one date", shared === 0)
  ok("both accounts were scheduled", new Set(plan.planned.map((p) => p.connectionId)).size === 2)
  // Two accounts pinned to the SAME offset would legitimately share minutes — that is allowed.
  // What must never happen is sharing a CREATIVE on a date, asserted above.
  ok("a baseline account and a staggered account post at different minutes", new Set(plan.planned.map((p) => p.minute)).size === 4,
    [...new Set(plan.planned.map((p) => p.minute))].sort((x,y)=>x-y).join(","))
  ok("sufficient inventory reports no collisions", plan.collisions.length === 0 && plan.sufficient)
}

console.log("\nSHORTAGE IS REPORTED, NEVER HIDDEN:")
{
  const tiny = [post("only1", "Dallas"), post("only2", "San Antonio"), post("only3", "Dallas")]
  const plan = planAutopilot({ rules: [rule(A, { startIndex: 0 }), rule(B, { startIndex: 1 })], pool: tiny, startDateKey: "2026-10-08", wallClockToUtc: wallClockToUtcISO })
  ok("a 3-post pool for 2 accounts is NOT reported sufficient", plan.sufficient === false)
  ok("collisions are listed with dates", plan.collisions.length > 0 && !!plan.collisions[0].dateKey)
  ok("the note states eligible vs required in plain language",
    plan.notes.some((n) => n.includes("3 eligible") && n.includes("at least 4")), plan.notes.join(" | "))
  ok("it still returns the plan rather than throwing", plan.planned.length > 0)

  const empty = planAutopilot({ rules: [rule(A)], pool: [], startDateKey: "2026-10-08", wallClockToUtc: wallClockToUtcISO })
  ok("an empty pool says so explicitly", empty.notes.some((n) => /no eligible .* inventory/i.test(n)))
  ok("…and plans nothing", empty.planned.length === 0 && empty.sufficient === false)

  const noRules = planAutopilot({ rules: [rule(A, { enabled: false })], pool: [post("p", "Dallas")], startDateKey: "2026-10-08", wallClockToUtc: wallClockToUtcISO })
  ok("a disabled rule plans nothing and says why", noRules.planned.length === 0 && noRules.notes.some((n) => n.includes("No enabled")))
}

console.log("\nmarket order:")
{
  ok("weights order markets, ties alphabetical",
    weightedMarketOrder({ Dallas: 3, "San Antonio": 3, Houston: 1 }, ["Houston", "San Antonio", "Dallas"]).join() === "Dallas,San Antonio,Houston")
  ok("a market with no inventory does not appear",
    weightedMarketOrder({ Dallas: 3, Austin: 5 }, ["Dallas"]).join() === "Dallas")
}

console.log("\nPOLICY 1 — exhaust distinct PROPERTIES before repeating:")
{
  // Four posts, but only TWO properties: p1/p1b are one building, p2/p2b another.
  const pool = [variant("p1", "srcA", "Dallas"), variant("p1b", "srcA", "Dallas"), variant("p2", "srcB", "Dallas"), variant("p2b", "srcB", "Dallas")]
  const plan = planAutopilot({ rules: [rule(A, { startIndex: 0, horizonDays: 2, marketWeights: { Dallas: 1 } })], pool, startDateKey: "2026-10-08", wallClockToUtc: wallClockToUtcISO })
  // Identity is the BUILDING, so compare property keys, not content ids — the four posts here are
  // four distinct content rows and only two buildings.
  const keyOf = (postId: string) => propertyKeyOf(pool.find((x) => x.id === postId)!)
  const keys = plan.planned.map((p) => keyOf(p.postId))
  ok("the first two slots use two DIFFERENT properties", keys[0] !== keys[1], keys.join(","))
  ok("a different creative of the same property is not treated as unique",
    new Set(keys.slice(0, 2)).size === 2 && keys.slice(0, 2).every((k) => ["place:place-srcA", "place:place-srcB"].includes(k)))
  ok("…even though those creatives have different source_content_ids",
    new Set(plan.planned.slice(0, 2).map((p) => p.sourceContentId)).size === 2)
  ok("reuse is reported, with the slot where it begins", plan.reusePoints.length === 1 && !!plan.reusePoints[0].dateKey)
  ok("…and how many unique properties were available", plan.reusePoints[0].uniqueSourcesExhausted === 2)
  ok("the note names where reuse starts", plan.notes.some((n) => n.includes("reuse begins")))
}
{
  // Plenty of unique properties: no reuse at all, and none reported.
  const pool = Array.from({ length: 10 }, (_, i) => post(`u${i}`, "Dallas"))
  const plan = planAutopilot({ rules: [rule(A, { startIndex: 0, horizonDays: 3, marketWeights: { Dallas: 1 } })], pool, startDateKey: "2026-10-08", wallClockToUtc: wallClockToUtcISO })
  ok("ample unique inventory → every scheduled property is distinct",
    new Set(plan.planned.map((p) => p.sourceContentId)).size === plan.planned.length)
  ok("…and no reuse point is reported", plan.reusePoints.length === 0)
}

console.log("\nPOLICY 2 — market fallback is explicit, never silent:")
{
  // Preferred order is Dallas then San Antonio, but there is NO San Antonio inventory.
  const pool = [post("d1", "Dallas"), post("d2", "Dallas"), post("d3", "Dallas"), post("d4", "Dallas")]
  const plan = planAutopilot({
    rules: [rule(A, { startIndex: 0, horizonDays: 2, marketRotationSeed: 0, marketWeights: { Dallas: 3, "San Antonio": 3 } })],
    pool, startDateKey: "2026-10-08", wallClockToUtc: wallClockToUtcISO,
  })
  ok("the slot is FILLED rather than left empty", plan.planned.length === 4)
  // A market with no inventory never enters the rotation at all, so there is nothing to fall back
  // FROM — the absence is handled upstream by weightedMarketOrder.
  ok("a market with zero inventory never becomes a requested market",
    plan.marketFallbacks.every((f) => f.requestedMarket !== "San Antonio"))
  ok("every planned slot is Dallas", plan.planned.every((p) => p.market === "Dallas"))
}
{
  // San Antonio HAS inventory, but only one post — so its second turn must fall forward.
  const pool = [post("d1", "Dallas"), post("s1", "San Antonio"), post("d2", "Dallas"), post("d3", "Dallas")]
  const plan = planAutopilot({
    rules: [rule(A, { startIndex: 0, horizonDays: 2, marketRotationSeed: 0, marketWeights: { Dallas: 3, "San Antonio": 3 } })],
    pool, startDateKey: "2026-10-08", wallClockToUtc: wallClockToUtcISO,
  })
  ok("all four slots are filled despite one market running dry", plan.planned.length === 4)
  ok("the fallback is RECORDED, not silent", plan.marketFallbacks.length > 0)
  const f = plan.marketFallbacks[0]
  ok("…with the requested market", f.requestedMarket === "San Antonio", f.requestedMarket)
  ok("…the market actually selected", f.selectedMarket === "Dallas", String(f.selectedMarket))
  ok("…a reason distinguishing 'used up' from 'never had any'", f.reason === "market_inventory_already_used", f.reason)
  ok("…and the exact slot it happened in", !!f.dateKey && typeof f.minute === "number")
  ok("the note surfaces the fallback count", plan.notes.some((n) => n.includes("fell forward")))
}


// ── PLATFORM ISOLATION ──────────────────────────────────────────────────────────────────────────
// The first real dry run handed a TikTok connection 14 Instagram-eligible posts, because
// planAutopilot took ONE platform and applied it to every rule. Eligibility is now evaluated per
// rule against the connection's OWN platform, so cross-network assignment is not representable.
console.log("\nPLATFORM ISOLATION — a connection only ever receives its own network's posts:")
{
  const IG = "conn-ig", TT = "conn-tt"
  const igPost = (id: string) => ({ ...post(id, "Dallas"), platform: "instagram" })
  const ttPost = (id: string) => ({ ...post(id, "Dallas"), platform: "tiktok" })
  const pool = [igPost("i1"), igPost("i2"), igPost("i3"), ttPost("t1"), ttPost("t2"), ttPost("t3")]
  const plan = planAutopilot({
    rules: [rule(IG, { platform: "instagram", horizonDays: 2 }), rule(TT, { platform: "tiktok", horizonDays: 2 })],
    pool, startDateKey: "2026-10-08", wallClockToUtc: wallClockToUtcISO,
  })
  const platOf = (postId: string) => pool.find((p) => p.id === postId)!.platform
  const igGot = plan.planned.filter((p) => p.connectionId === IG)
  const ttGot = plan.planned.filter((p) => p.connectionId === TT)

  ok("both connections were scheduled", igGot.length > 0 && ttGot.length > 0)
  ok("an INSTAGRAM post can never reach the TikTok connection", ttGot.every((p) => platOf(p.postId) === "tiktok"))
  ok("a TIKTOK post can never reach the Instagram connection", igGot.every((p) => platOf(p.postId) === "instagram"))
  ok("no post is assigned to both networks",
    igGot.every((a) => !ttGot.some((b) => b.postId === a.postId)))

  // A post eligible for ONE network must not be reported as globally excluded.
  ok("a tiktok post is not reported as excluded just because Instagram could not use it",
    !plan.excluded.some((e) => e.postId.startsWith("t")))

  // Per-platform inventory is reported separately, so a shortfall on one network is visible.
  const ig = plan.inventory.byPlatform.find((b) => b.platform === "instagram")!
  const tt = plan.inventory.byPlatform.find((b) => b.platform === "tiktok")!
  ok("inventory is broken out per platform", !!ig && !!tt)
  ok("each platform counts only its OWN eligible posts", ig.eligiblePosts === 3 && tt.eligiblePosts === 3)

  // The decisive case: NO inventory at all for one network.
  const starved = planAutopilot({
    rules: [rule(IG, { platform: "instagram", horizonDays: 1 }), rule(TT, { platform: "tiktok", horizonDays: 1 })],
    pool: [igPost("i1"), igPost("i2")], startDateKey: "2026-10-08", wallClockToUtc: wallClockToUtcISO,
  })
  ok("a network with zero inventory schedules NOTHING rather than borrowing",
    starved.planned.every((p) => p.connectionId === IG))
  ok("and it says so by name", starved.notes.some((n) => /no eligible tiktok inventory/i.test(n)))
}

// ── INVENTORY REPORTING ─────────────────────────────────────────────────────────────────────────
// "sufficient" used to mean "no same-day collision", which reported a 7-post pool filling 28
// placements as healthy. It now means every placement uses a property that account has not posted.
console.log("\nINVENTORY REPORTING — sufficiency means a healthy rotation, not a collision-free day:")
{
  const C = "conn-x"
  // 2 properties, 2/day for 7 days = 14 placements. Technically fillable, obviously not healthy.
  const thin = planAutopilot({
    rules: [rule(C, { horizonDays: 7, marketWeights: { Dallas: 1 } })],
    pool: [post("a", "Dallas"), post("b", "Dallas")],
    startDateKey: "2026-10-08", wallClockToUtc: wallClockToUtcISO,
  })
  ok("every slot still gets filled", thin.unfilledSlots === 0 && thin.planned.length === 14)
  ok("but it is NOT reported as sufficient", thin.sufficient === false)
  ok("horizon demand is reported, not just the one-day minimum", thin.inventory.horizonPlacements === 14)
  ok("unique properties are counted as BUILDINGS", thin.inventory.uniqueProperties === 2)
  ok("reuse is quantified", thin.inventory.reusedPlacements === 12 && thin.inventory.reusePercent === 86)
  ok("and the first reuse point is reported", !!thin.inventory.firstReuseAt)
  ok("the note states the shortfall in words", thin.notes.some((n) => /INSUFFICIENT for a healthy rotation/.test(n)))

  // Genuinely healthy: one property per placement.
  const fat = planAutopilot({
    rules: [rule(C, { horizonDays: 2, marketWeights: { Dallas: 1 } })],
    pool: Array.from({ length: 12 }, (_, i) => post(`f${i}`, "Dallas")),
    startDateKey: "2026-10-08", wallClockToUtc: wallClockToUtcISO,
  })
  ok("a pool with room to spare IS sufficient", fat.sufficient === true)
  ok("with zero reuse", fat.inventory.reusedPlacements === 0 && fat.inventory.reusePercent === 0)
  ok("and no first-reuse point", fat.inventory.firstReuseAt === null)
}

console.log(`\nAutopilot planner: ${pass} passed, ${fail} failed`)
if (fail) process.exit(1)
