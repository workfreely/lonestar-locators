// ONE CREATIVE, TWO PLATFORMS, THE SAME MINUTE.
//
// The claims here are about what the pair GUARANTEES and what it refuses:
//
//   • the follower carries the lead's creative, or NOTHING — never a different video;
//   • the two rows publish independently, so one platform's failure cannot duplicate the other;
//   • a re-run adds nothing, which is the same property stated from the scheduling side;
//   • balancing the markets is a preference that changes only the REQUEST, never the hard
//     restriction, and is opt-in so every existing destination keeps the plan it has today.
//
// Exercises the pure modules and reads source for the structural claims. Contacts nothing.
// Run: npx tsx scripts/social/mirroredSchedule.test.ts
import { readFileSync } from "node:fs"
import path from "node:path"
import { mirrorSchedule, marketTally, slotKeyOf } from "../../lib/social/mirroredSchedule"
import { balancedMarketRequest, marketImbalance } from "../../lib/social/marketBalance"
import { planAutopilot, type AutopilotRule, type PoolPost } from "../../lib/social/autopilotPlanner"
import { sharesAssetWith } from "../../lib/social/destinations"
import { BASELINE_DAILY_TIMES } from "../../lib/social/autopilotDestination"

let pass = 0, fail = 0
const ok = (l: string, c: boolean, d = "") => { if (c) { pass++; console.log(`  ✓ ${l}`) } else { fail++; console.log(`  ✗ ${l}${d ? `  — ${d}` : ""}`) } }
const read = (p: string) => { try { return readFileSync(path.join(process.cwd(), p), "utf8") } catch { return "" } }
/** Comments stripped, so prose can never satisfy an assertion. */
const code = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1").replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
/** SQL with its line comments stripped, for the same reason. */
const sql = (s: string) => s.replace(/^\s*--.*$/gm, "")

const MIRROR = code(read("lib/social/mirroredSchedule.ts"))
const BALANCE = code(read("lib/social/marketBalance.ts"))
const PLANNER = code(read("lib/social/autopilotPlanner.ts"))
const PLANRUN = code(read("lib/social/autopilotPlanRun.ts"))
const WORKER = code(read("app/api/cron/social-buffer-publish/route.ts"))
const MIRROR_SQL = read("supabase/prepared/20261122000003_mirrored_destinations.sql")
const LISETTE_SQL = read("supabase/prepared/20261122000001_lisette_buffer_destinations.sql")

const lead = (o: Partial<Parameters<typeof mirrorSchedule>[0]["leadPlacements"][number]> & { postId: string; sourceContentId: string }) => ({
  connectionId: "ig-lisette", dateKey: "2026-11-24", minute: 450,
  scheduledAtUtc: "2026-11-24T13:30:00.000Z", market: "San Antonio",
  propertyName: "The Rim", propertyKey: `place-${o.sourceContentId}`, ...o,
})
const cand = (id: string, sourceContentId: string, market = "San Antonio") =>
  ({ id, sourceContentId, market, propertyName: `prop-${sourceContentId}` })

// ── 1. THE CREATIVE TRAVELS, THE FILE CANNOT ─────────────────────────────────────────────────
// "Reuse the same rendered video" is not achievable for this pair and the reason is geometry, not
// a missing feature. Asserted against the registry rather than trusted to a comment, because the
// day instagram_reel and tiktok_video share a safe area is the day the sibling render becomes
// waste — and this assertion is what would notice.
console.log("the same video means the same CREATIVE, re-rendered per geometry:")

ok("instagram_reel and tiktok_video do NOT share a rendered asset",
  !sharesAssetWith("instagram_reel", "tiktok_video"))
ok("instagram_reel and instagram_story DO — so asset sharing is a real mechanism, not absent",
  sharesAssetWith("instagram_reel", "instagram_story"))
ok("the module records why the MP4 cannot be shared",
  /safeAreaId/.test(read("lib/social/mirroredSchedule.ts"))
  && /wrong_destination/.test(read("lib/social/mirroredSchedule.ts")))
ok("matching is on source_content_id, never on the property key",
  /byCreative/.test(MIRROR) && !/propertyKeyOf/.test(MIRROR))
ok("…and the property key is only ever COPIED from the lead, not used to match",
  /propertyKey: lead\.propertyKey/.test(MIRROR))

// ── 2. TWO VIDEOS A DAY, FOUR POSTS ──────────────────────────────────────────────────────────
console.log("\ntwo unique videos a day become four published posts:")

const twoSlots = [
  lead({ postId: "ig-am", sourceContentId: "c1", minute: 450, scheduledAtUtc: "2026-11-24T13:30:00.000Z", market: "San Antonio" }),
  lead({ postId: "ig-pm", sourceContentId: "c2", minute: 1170, scheduledAtUtc: "2026-11-25T01:30:00.000Z", market: "Austin" }),
]
const paired = mirrorSchedule({
  leadPlacements: twoSlots,
  followerConnectionId: "tt-lisette",
  followerPool: [cand("tt-1", "c1"), cand("tt-2", "c2", "Austin")],
  followerAllowedMarkets: ["San Antonio", "Austin"],
  followerPostsPerDay: 2,
})
ok("both slots mirrored", paired.mirrored === 2 && paired.unmirrored === 0, JSON.stringify(paired.gaps))
ok("two lead posts + two mirrored posts = four", twoSlots.length + paired.placements.length === 4)
ok("the AM pair shares one creative",
  paired.placements[0].sourceContentId === "c1" && paired.placements[0].postId === "tt-1")
ok("the PM pair shares the other",
  paired.placements[1].sourceContentId === "c2" && paired.placements[1].postId === "tt-2")
ok("the mirrored post publishes at the LEAD's exact instant",
  paired.placements[0].scheduledAtUtc === twoSlots[0].scheduledAtUtc
  && paired.placements[1].scheduledAtUtc === twoSlots[1].scheduledAtUtc)
ok("the mirrored row belongs to the FOLLOWER's connection",
  paired.placements.every((p) => p.connectionId === "tt-lisette"))
ok("each mirrored row names the lead it followed",
  paired.placements[0].mirrorsPostId === "ig-am" && paired.placements[1].mirrorsPostId === "ig-pm")
ok("no follower row is used twice",
  new Set(paired.placements.map((p) => p.postId)).size === paired.placements.length)
ok("the two slots are 7:30 and 19:30 — the baseline, unchanged",
  BASELINE_DAILY_TIMES[0] === 450 && BASELINE_DAILY_TIMES[1] === 1170)

// ── 3. A GAP IS LEFT EMPTY, NEVER FILLED WITH ANOTHER VIDEO ──────────────────────────────────
// The failure this guards against is the quiet one: TikTok posts something, the run reports
// success, and the two feeds show different videos. An empty slot is visible; a substitution is not.
console.log("\nan unmirrorable slot is reported, never substituted:")

const noRender = mirrorSchedule({
  leadPlacements: [lead({ postId: "ig-am", sourceContentId: "c1" })],
  followerConnectionId: "tt-lisette",
  followerPool: [cand("tt-other", "c9")], // a perfectly good TikTok row for a DIFFERENT creative
  followerAllowedMarkets: ["San Antonio", "Austin"],
})
ok("no follower row for the creative ⇒ nothing placed", noRender.placements.length === 0)
ok("…and the reason names the missing render",
  noRender.gaps[0]?.reason === "no_eligible_row_for_creative")
ok("…and the unrelated TikTok row is NOT used",
  !noRender.placements.some((p) => p.postId === "tt-other"))

const twiceOneRow = mirrorSchedule({
  leadPlacements: [
    lead({ postId: "ig-am", sourceContentId: "c1", minute: 450, scheduledAtUtc: "2026-11-24T13:30:00.000Z" }),
    lead({ postId: "ig-pm", sourceContentId: "c1", minute: 1170, scheduledAtUtc: "2026-11-25T01:30:00.000Z" }),
  ],
  followerConnectionId: "tt-lisette",
  followerPool: [cand("tt-1", "c1")],
})
ok("one follower row cannot serve two slots", twiceOneRow.mirrored === 1)
ok("…and the second slot says so", twiceOneRow.gaps[0]?.reason === "creative_already_mirrored")

const wrongMarket = mirrorSchedule({
  leadPlacements: [lead({ postId: "ig-am", sourceContentId: "c1", market: "Dallas" })],
  followerConnectionId: "tt-lisette",
  followerPool: [cand("tt-1", "c1", "Dallas")],
  followerAllowedMarkets: ["San Antonio", "Austin"],
})
ok("the FOLLOWER's own restriction is checked, not inherited",
  wrongMarket.placements.length === 0 && wrongMarket.gaps[0]?.reason === "market_not_permitted_on_follower")

const overCap = mirrorSchedule({
  leadPlacements: [
    lead({ postId: "a", sourceContentId: "c1", minute: 450, scheduledAtUtc: "2026-11-24T13:30:00.000Z" }),
    lead({ postId: "b", sourceContentId: "c2", minute: 1170, scheduledAtUtc: "2026-11-25T01:30:00.000Z" }),
    lead({ postId: "c", sourceContentId: "c3", minute: 1180, scheduledAtUtc: "2026-11-25T01:40:00.000Z" }),
  ],
  followerConnectionId: "tt-lisette",
  followerPool: [cand("t1", "c1"), cand("t2", "c2"), cand("t3", "c3")],
  followerPostsPerDay: 2,
})
ok("the follower's posts_per_day is a ceiling on the mirror too", overCap.mirrored === 2)
ok("…and the dropped slot is reported as the cap, not as missing inventory",
  overCap.gaps.some((g) => g.reason === "daily_cap_reached"))

// ── 4. ONE PLATFORM FAILING CANNOT DUPLICATE THE OTHER ───────────────────────────────────────
// Two mechanisms, and they are separate on purpose. SCHEDULING idempotence lives here: a slot the
// follower already holds is never given a second row, whatever happened on the lead's platform.
// PUBLISHING independence lives in the worker, asserted in section 7.
console.log("\na failure on one platform cannot duplicate on the other:")

const rerun = mirrorSchedule({
  leadPlacements: twoSlots,
  followerConnectionId: "tt-lisette",
  followerPool: [cand("tt-3", "c1"), cand("tt-4", "c2", "Austin")],
  followerAllowedMarkets: ["San Antonio", "Austin"],
  // Both minutes already filled by the previous run — exactly the state a re-plan sees after the
  // lead's Instagram post failed and the operator re-ran the planner.
  // Both of the day's minutes, keyed on the LOCAL date — which is what dateKey is: 19:30 Central
  // on the 24th is 01:30 UTC on the 25th, and the slot still belongs to the 24th.
  occupiedSlots: new Set([slotKeyOf("2026-11-24", 450), slotKeyOf("2026-11-24", 1170)]),
})
ok("a re-run over filled slots places NOTHING", rerun.placements.length === 0)
ok("…and says the slots were already taken",
  rerun.gaps.length === 2 && rerun.gaps.every((g) => g.reason === "slot_occupied"))
ok("the mirror never reads a publish outcome — status, published_at, error_message appear nowhere",
  !/\bstatus\b/.test(MIRROR) && !/published_at|publishedAt/.test(MIRROR) && !/error_message|errorMessage/.test(MIRROR))
ok("the mirror is pure: no supabase, no fetch, no process",
  !/supabase|fetch\(|process\.env/.test(MIRROR))
ok("slot keys are built in ONE place, so the caller and the mirror cannot disagree",
  /export const slotKeyOf/.test(MIRROR) && /slotKeyOf\(/.test(PLANRUN))

// ── 5. BALANCED MARKETS: A PREFERENCE, MEASURED ON WHAT WAS PLACED ───────────────────────────
console.log("\nbalance is read from what was placed, not from the slot index:")

const order = ["San Antonio", "Austin"]
ok("an empty tally asks for the destination's first market",
  balancedMarketRequest(order, new Map()) === "San Antonio")
ok("after one San Antonio it asks for Austin",
  balancedMarketRequest(order, new Map([["San Antonio", 1]])) === "Austin")
ok("level counts return to the head of the order — the parity rule's own answer",
  balancedMarketRequest(order, new Map([["San Antonio", 3], ["Austin", 3]])) === "San Antonio")
ok("it keeps asking for the market that fell behind",
  balancedMarketRequest(order, new Map([["San Antonio", 4], ["Austin", 0]])) === "Austin")
ok("no markets ⇒ no preference", balancedMarketRequest([], new Map()) === null)
ok("imbalance is 0 when level", marketImbalance(order, new Map([["San Antonio", 2], ["Austin", 2]])) === 0)
ok("imbalance exposes a market that ran dry",
  marketImbalance(order, new Map([["San Antonio", 8], ["Austin", 0]])) === 8)
ok("balancing changes the REQUEST only — it never widens the candidate set",
  !/isMarketAllowed|parseMarketRestriction|market_restriction/.test(BALANCE))

// ── 6. BALANCING IS OPT-IN, SO NOTHING THAT EXISTS TODAY MOVES ───────────────────────────────
// Jay's four destinations must take the identical branch. Proved by running the real planner twice
// over identical inventory and comparing the plans byte for byte, rather than by reading the code.
console.log("\nbalancing is opt-in, and an un-opted destination plans exactly as before:")

const poolPost = (id: string, src: string, market: string, destination: string): PoolPost => ({
  id, sourceContentId: src, placeId: `place-${src}`, market, propertyName: `Prop ${src}`,
  status: "ready", renderStatus: "ready", renderedStoragePath: `renders/${id}.mp4`,
  scheduledAt: null, publishedAt: null, externalPostId: null, connectionId: null,
  platform: destination.startsWith("instagram") ? "instagram" : "tiktok", destination,
  approvedAt: "2026-11-01T00:00:00.000Z", followsPostId: null,
  identityState: "clean", identityOwnerUserId: null, availableToAgents: true,
})
const rule = (o: Partial<AutopilotRule> & { connectionId: string; platform: string }): AutopilotRule => ({
  agentUserId: "agent-lisette", ownerUserId: "owner-jay", enabled: true,
  timezone: "America/Chicago", dailyTimes: [...BASELINE_DAILY_TIMES], postsPerDay: 2,
  marketWeights: {}, allowedMarkets: ["San Antonio", "Austin"], marketRotationSeed: 0,
  staggerOffsetMinutes: 0, startIndex: 0, ...o,
})
// A fake timezone conversion: deterministic and monotonic, which is all the planner needs.
const wallClockToUtc = (dateKey: string, minute: number) =>
  new Date(Date.parse(`${dateKey}T00:00:00.000Z`) + minute * 60_000 + 6 * 3_600_000).toISOString()

const balancedPool: PoolPost[] = [
  poolPost("ig-a", "c1", "San Antonio", "instagram_reel"),
  poolPost("ig-b", "c2", "Austin", "instagram_reel"),
  poolPost("ig-c", "c3", "San Antonio", "instagram_reel"),
  poolPost("ig-d", "c4", "Austin", "instagram_reel"),
]
const planWith = (balanceMarkets: boolean | undefined, pool: PoolPost[]) => planAutopilot({
  rules: [rule({ connectionId: "ig-lisette", platform: "instagram", balanceMarkets })],
  pool, startDateKey: "2026-11-24", wallClockToUtc, maxDays: 2,
})
const unflagged = planWith(undefined, balancedPool)
const flaggedFalse = planWith(false, balancedPool)
const flaggedTrue = planWith(true, balancedPool)
const shape = (p: ReturnType<typeof planAutopilot>) =>
  JSON.stringify(p.planned.map((x) => [x.postId, x.scheduledAtUtc, x.market]))

ok("absent and false produce the identical plan", shape(unflagged) === shape(flaggedFalse))
ok("with inventory in both markets, balancing produces the identical plan too",
  shape(flaggedTrue) === shape(unflagged), `${shape(flaggedTrue)} vs ${shape(unflagged)}`)
// WHICH market comes first is the destination's own rotation (marketOrderFor over the weighted
// order, which with no weights is alphabetical) — not something balancing decides. What balancing
// guarantees is the SPLIT.
ok("that plan alternates the two markets and splits them evenly",
  flaggedTrue.planned.length === 4
  && flaggedTrue.planned.filter((p) => p.market === "San Antonio").length === 2
  && flaggedTrue.planned.filter((p) => p.market === "Austin").length === 2
  && flaggedTrue.planned[0].market !== flaggedTrue.planned[1].market,
  flaggedTrue.planned.map((p) => `${p.market}`).join("|"))
ok("the planner still carries the parity rule for un-opted destinations",
  /order\[placements\.indexOf\(pl\) % order\.length\]/.test(PLANNER))
ok("…reached only when the flag is not strictly true",
  /rule\.balanceMarkets === true/.test(PLANNER))
ok("the achieved tally counts the market that WENT OUT, not the one requested",
  /achievedMarkets\.set\(placedMarket/.test(PLANNER) && /const placedMarket = \(pick\.market/.test(PLANNER))
ok("a drifted balance is reported in the plan's notes rather than hidden",
  /marketImbalance\(order, achievedMarkets\)/.test(PLANNER) && /spread of/.test(read("lib/social/autopilotPlanner.ts")))

// Austin dry: the parity rule drifts, and balancing keeps asking for Austin instead.
const sanAntonioOnly: PoolPost[] = [
  poolPost("ig-a", "c1", "San Antonio", "instagram_reel"),
  poolPost("ig-b", "c2", "San Antonio", "instagram_reel"),
  poolPost("ig-c", "c3", "San Antonio", "instagram_reel"),
  poolPost("ig-d", "c4", "San Antonio", "instagram_reel"),
]
const dry = planWith(true, sanAntonioOnly)
ok("with one market dry, every slot still fills — balance is a preference, not a gate",
  dry.planned.length === 4, String(dry.planned.length))
// WORTH STATING PRECISELY, because it is the difference between "prefer balanced" and "alternate":
// the market order is built from the markets PRESENT in the pool, so a market with no approved
// inventory is never requested and produces no fallback. "Balanced when approved content is
// available" is therefore what the mechanism actually implements, not an approximation of it.
ok("…an absent market is never even requested, so there is nothing to fall back from",
  dry.marketFallbacks.length === 0, JSON.stringify(dry.marketFallbacks.map((f) => f.requestedMarket)))
ok("…and the hard restriction still held: no Dallas, no violations",
  dry.inventory.marketRestrictionViolations === 0 && dry.planned.every((p) => p.market === "San Antonio"))

// THE DRIFT CASE the balanced rule exists for: both markets present, one of them thin.
const thinAustin: PoolPost[] = [
  poolPost("ig-a", "c1", "Austin", "instagram_reel"),
  poolPost("ig-b", "c2", "San Antonio", "instagram_reel"),
  poolPost("ig-c", "c3", "San Antonio", "instagram_reel"),
  poolPost("ig-d", "c4", "San Antonio", "instagram_reel"),
]
const thin = planWith(true, thinAustin)
ok("a thin market is used first and then kept asking for",
  thin.planned.length === 4
  && thin.planned.filter((p) => p.market === "Austin").length === 1,
  thin.planned.map((p) => p.market).join("|"))
ok("…each slot it could not fill is recorded as a fallback naming Austin",
  thin.marketFallbacks.length === 2 && thin.marketFallbacks.every((f) => f.requestedMarket === "Austin"),
  JSON.stringify(thin.marketFallbacks.map((f) => `${f.requestedMarket}->${f.selectedMarket}`)))
ok("…and the plan says the split drifted rather than reporting a clean run",
  thin.notes.some((n) => /spread of 2/.test(n)), thin.notes.join(" | "))

// ── 7. THE WORKER TREATS THE TWO ROWS AS STRANGERS ───────────────────────────────────────────
console.log("\nthe Buffer worker does not know a pair exists:")

ok("no query filters, groups or dedupes on source_content_id",
  !/\.eq\("source_content_id"|\.in\("source_content_id"|group.*source_content_id/.test(WORKER))
ok("source_content_id is only ever SELECTED and read for the caption",
  (WORKER.match(/source_content_id/g) ?? []).length > 0
  && !/source_content_id[^,)\n]*(=|==)/.test(WORKER))
ok("mirrors_connection_id is never read by the worker",
  !/mirrors_connection_id/.test(WORKER))
ok("every state change is keyed on the post id",
  (WORKER.match(/\.eq\("id", postId\)/g) ?? []).length >= 3)
ok("outcomes are counted per provider as well as per run",
  /byProvider/.test(WORKER) && /tallyFor\(result\.byProvider/.test(WORKER))
ok("the provider tally is created once and shared, not copied per call",
  /const existing = byProvider\[key\]/.test(WORKER) && /if \(existing\) return existing/.test(WORKER))
ok("the per-provider count is incremented ALONGSIDE the flat count, never instead of it",
  /result\.published\+\+\s*\n\s*if \(tally\) tally\.published\+\+/.test(WORKER))
ok("the failure path reads the provider off the ROW, so a throw before resolution still counts",
  /isSocialDestination\(row\.destination\) \? DESTINATIONS\[row\.destination\]\.provider : null/.test(WORKER))
ok("the pair invariant is stated in the worker's own header",
  /MIRRORED PAIRS PUBLISH INDEPENDENTLY/.test(read("app/api/cron/social-buffer-publish/route.ts")))

// ── 8. THE FOLLOWER DOES NOT ALSO PLAN FOR ITSELF ────────────────────────────────────────────
console.log("\nthe plan run mirrors instead of double-planning:")

ok("followers are filtered out of the planner's rules",
  /rules: rules\.filter\(\(r\) => !mirrorOf\.has\(r\.connectionId\)\)/.test(PLANRUN))
ok("mirroring runs after the plan, over the plan",
  PLANRUN.indexOf("planAutopilot({") < PLANRUN.indexOf("mirrorSchedule({"))
ok("rows another destination already claimed are kept out of the follower's pool",
  /claimed\.has\(p\.id\)/.test(PLANRUN) && /new Set\(plan\.planned\.map\(\(p\) => p\.postId\)\)/.test(PLANRUN))
ok("the follower's own occupancy is consulted, which is what makes a re-run inert",
  /occupancyByConnection\.get\(followerId\)/.test(PLANRUN) && /occupiedSlots/.test(PLANRUN))
ok("the follower's own eligibility is applied — a TikTok row for a TikTok destination",
  /ineligibleReason\(p, follower\.platform\)/.test(PLANRUN))
ok("the follower's own market restriction is passed, not the lead's",
  /followerAllowedMarkets: follower\.allowedMarkets/.test(PLANRUN))
ok("a follower whose lead is missing is named in the notes, not silently skipped",
  /not a connected destination/.test(read("lib/social/autopilotPlanRun.ts")))
ok("a paused follower mirrors nothing",
  /if \(!follower\.enabled\)/.test(PLANRUN))
ok("the merged plan is re-sorted on the planner's own comparator",
  /plan\.planned\.sort\(/.test(PLANRUN))
ok("the balance flag comes from the column, defaulting to false",
  /balance_markets\?\: boolean \| null \}\)\.balance_markets === true/.test(PLANRUN))

// ── 9. THE SQL IS STAGED, NOT APPLIED, AND TOUCHES ONLY HER ──────────────────────────────────
console.log("\nthe schema change is staged and scoped:")

ok("the file exists and is marked APPLIED, with a date",
  /^-- APPLIED \d{1,2} \w+ 20\d\d/m.test(MIRROR_SQL))
ok("…and records that balanced rotation was switched on for nobody but her",
  /balance_markets is set on NO destination that is not hers/.test(MIRROR_SQL))
ok("it lives in supabase/prepared, not in migrations",
  read("supabase/migrations/20261122000003_mirrored_destinations.sql") === "")
ok("both columns default to the existing behaviour",
  /mirrors_connection_id uuid/.test(MIRROR_SQL) && /balance_markets boolean not null default false/.test(MIRROR_SQL))
ok("removing a lead does not remove its follower",
  /on delete set null/.test(MIRROR_SQL))
ok("a destination cannot mirror itself",
  /mirrors_connection_id <> id/.test(MIRROR_SQL))
ok("Instagram leads and TikTok follows",
  /set mirrors_connection_id = ig\.id/.test(sql(MIRROR_SQL))
  && /tt\.provider = 'tiktok'/.test(sql(MIRROR_SQL))
  && /ig\.provider = 'instagram'/.test(sql(MIRROR_SQL)))
ok("every statement is scoped to her agent id",
  (sql(MIRROR_SQL).match(/update public\.social_connections/g) ?? []).length ===
  (sql(MIRROR_SQL).match(/27d7bde4-00f0-433c-b32b-b243623ad20a/g) ?? []).length)
ok("it does not touch posting_paused, market_restriction or any credential",
  !/posting_paused\s*=|market_restriction\s*=|token_secret_id\s*=|buffer_account_id\s*=|buffer_channel_id\s*=/.test(sql(MIRROR_SQL)))
ok("it carries a read-only check that nothing of Jay's moved",
  /is distinct from '27d7bde4/.test(MIRROR_SQL))
ok("her two rows both sit on the baseline minute, so the mirrored time is her own time",
  /array\['San Antonio','Austin'\], true, 2, 0,/.test(LISETTE_SQL))
ok("and both of her rows are still inserted paused",
  /posting_paused/.test(LISETTE_SQL) && /, true, 2, 0,/.test(LISETTE_SQL))

// ── 10. REPORTING ────────────────────────────────────────────────────────────────────────────
console.log("\nwhat a run reports about the pair:")

const tally = marketTally(paired.placements)
ok("the mirror reports its own market split", tally.get("San Antonio") === 1 && tally.get("Austin") === 1)
ok("a blank market is not counted as a market",
  marketTally([{ market: "  " }, { market: null }]).size === 0)
ok("gaps carry the slot, the creative and the reason — enough to act on",
  noRender.gaps[0] !== undefined
  && typeof noRender.gaps[0].dateKey === "string"
  && typeof noRender.gaps[0].minute === "number"
  && noRender.gaps[0].sourceContentId === "c1"
  && noRender.gaps[0].followerConnectionId === "tt-lisette")
ok("the plan notes say how many slots carry the same creative",
  /carry the same creative at the same minute/.test(read("lib/social/autopilotPlanRun.ts")))
ok("…and name the unfilled ones rather than rounding them away",
  /left UNFILLED rather than carrying a different video/.test(read("lib/social/autopilotPlanRun.ts")))

console.log(`\nMirrored scheduling: ${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
