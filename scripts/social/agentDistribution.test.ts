// PHASE D — AGENT DISTRIBUTION.
//
// The job creates posts on someone else's account automatically, with nobody approving them.
// So the tests are mostly about what it REFUSES to do: publish to the wrong account, double-book
// a slot, repeat content to fill a queue, or offer anything the operator has not approved.
import { readFileSync } from "node:fs"
import {
  planAgentDistribution, rowFor, AGENT_QUEUE_DAYS, AGENT_COOLDOWN_DAYS,
  type AgentConnection, type ApprovedSource,
} from "@/lib/social/agentDistribution"

import { wallClockToUtcISO, DEFAULT_TIMEZONE } from "@/lib/social/recurrence"

let pass = 0
let fail = 0
function ok(name: string, cond: boolean, detail = "") {
  if (cond) { pass++; console.log(`  ✓ ${name}`) }
  else { fail++; console.log(`  ✗ ${name}${detail ? `  — ${detail}` : ""}`) }
}
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "")

const ADMIN = "c567c077-d3f4-4532-8807-a54795f753f5"
const LISETTE = "27d7bde4-00f0-433c-b32b-b243623ad20a"
const OTHER_AGENT = "11111111-1111-4111-8111-111111111111"

const herConn: AgentConnection = {
  id: "conn-lisette", provider: "instagram", status: "connected", posting_paused: false,
  posts_per_day: null, stagger_offset_minutes: null, market_restriction: null,
  agent_user_id: LISETTE, owner_user_id: ADMIN, token_expires_at: null,
}
/** The operator's own Instagram: agent_user_id EQUALS owner_user_id. The live shape. */
const hisConn: AgentConnection = { ...herConn, id: "conn-his", agent_user_id: ADMIN }
/** The operator's TikTok: agent_user_id is NULL. Also his. */
const hisTikTok: AgentConnection = { ...herConn, id: "conn-tt", provider: "tiktok", agent_user_id: null }

const src = (over: Partial<ApprovedSource> = {}): ApprovedSource => ({
  postId: "p1", sourceContentId: "c1", propertyKey: "place-1", market: "Dallas",
  destination: "instagram_reel", platform: "instagram", caption: "A caption", hashtags: ["#dallas"],
  overlayTemplate: "market_type", renderId: "r1", renderedStoragePath: "o/c/renders/p1-1.mp4",
  renderVersion: 1, identityState: "unknown", identityOwnerUserId: null, availableToAgents: true,
  ...over,
})

const NOW = new Date("2026-11-16T12:00:00Z")
const DAYS = ["2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20", "2026-11-21", "2026-11-22", "2026-11-23"]
const plan = (o: Partial<Parameters<typeof planAgentDistribution>[0]> = {}) => planAgentDistribution({
  connections: [herConn], approved: [src()], takenByConnection: new Map(), historyByConnection: new Map(),
  now: NOW, timezone: DEFAULT_TIMEZONE, dateKeys: DAYS, resolveSlot: wallClockToUtcISO, ...o,
})

// ── 1. NEVER THE OPERATOR'S OWN ACCOUNTS ──────────────────────────────────────────────────────
console.log("the job will not place a post on the operator's own destinations:")

ok("his Instagram (agent = owner) is skipped",
  plan({ connections: [hisConn] }).planned.length === 0)
ok("…and reported as not an agent connection",
  plan({ connections: [hisConn] }).skipped.some((s) => s.reason === "not_an_agent_connection"))
ok("his TikTok (agent = NULL) is skipped — a null agent is the OWNER, not 'no agent'",
  plan({ connections: [hisTikTok] }).planned.length === 0)
ok("an agent connection IS served", plan().planned.length > 0)
ok("…and every planned row carries the AGENT's connection",
  plan().planned.every((p) => p.connectionId === "conn-lisette"))

// ── 2. IDENTITY AND PERSONAL ──────────────────────────────────────────────────────────────────
console.log("\nnothing of the operator's identity reaches an agent:")

ok("a Personal source is never offered",
  plan({ approved: [src({ availableToAgents: false })] }).planned.length === 0)
ok("a render carrying HIS identity is never offered",
  plan({ approved: [src({ identityState: "owned", identityOwnerUserId: ADMIN })] }).planned.length === 0)
ok("a render carrying ANOTHER agent's identity is never offered",
  plan({ approved: [src({ identityState: "owned", identityOwnerUserId: OTHER_AGENT })] }).planned.length === 0)
ok("a render with NO identity record is never offered — absent is not 'nothing'",
  plan({ approved: [src({ identityState: null })] }).planned.length === 0)
ok("HER own identity on HER account IS offered",
  plan({ approved: [src({ identityState: "owned", identityOwnerUserId: LISETTE })] }).planned.length > 0)
ok("a plain render on her account is offered", plan().planned.length > 0)

// ── 3. THE SLOT IS NEVER DOUBLE-BOOKED ────────────────────────────────────────────────────────
console.log("\nno duplicate posts:")

const POOL = [src(), src({ postId: "p2", propertyKey: "place-2" })]
const first = plan({ approved: POOL })
// What the database looks like AFTER the first run persists: those slots are taken, AND those
// properties are now in this connection's history, which is what the cooldown reads. Feeding back
// only the slots would test a state that never exists.
const takenAfterFirst = new Map([["conn-lisette", new Set(first.planned.map((p) => p.scheduledAtUtc))]])
const historyAfterFirst = new Map([["conn-lisette", new Map(first.planned.map((p) => [p.propertyKey, p.scheduledAtUtc] as const))]])
const second = plan({ approved: POOL, takenByConnection: takenAfterFirst, historyByConnection: historyAfterFirst })
ok("a second run plans nothing — the job is idempotent against its own output",
  second.planned.length === 0, `planned ${second.planned.length} again`)
ok("…and a third run is still a no-op",
  plan({ approved: POOL, takenByConnection: takenAfterFirst, historyByConnection: historyAfterFirst }).planned.length === 0)
ok("…and the first run never plans one slot twice",
  new Set(first.planned.map((p) => p.scheduledAtUtc)).size === first.planned.length)
ok("a slot already taken by ANY post is respected",
  plan({ takenByConnection: new Map([["conn-lisette", new Set([wallClockToUtcISO(DAYS[0], 453, DEFAULT_TIMEZONE)])]]) })
    .planned.every((p) => p.scheduledAtUtc !== wallClockToUtcISO(DAYS[0], 453, DEFAULT_TIMEZONE)))
ok("past slots are never filled",
  plan({ dateKeys: ["2026-11-01", ...DAYS] }).planned.every((p) => Date.parse(p.scheduledAtUtc) > NOW.getTime()))

// ── 4. CONTENT IS NEVER REPEATED TO FILL A QUEUE ──────────────────────────────────────────────
console.log("\nan exhausted pool leaves slots empty and says so:")

const oneVideo = plan()
ok("one property fills exactly one slot, not fourteen", oneVideo.planned.length === 1, `got ${oneVideo.planned.length}`)
ok("…the rest are reported unfilled", oneVideo.unfilled.length === 1 && oneVideo.unfilled[0].slots > 0)
ok("…with the connection named", oneVideo.unfilled[0].connectionId === "conn-lisette")
ok("the cooldown is the operator's existing 21 days", AGENT_COOLDOWN_DAYS === 21)
ok("the queue window is seven days", AGENT_QUEUE_DAYS === 7)

// Two properties, both inside the cooldown of each other -> two slots, never a third.
const twoVideos = plan({ approved: [src(), src({ postId: "p2", propertyKey: "place-2" })] })
ok("two properties fill exactly two slots", twoVideos.planned.length === 2)
ok("…and they are different properties",
  new Set(twoVideos.planned.map((p) => p.propertyKey)).size === 2)

// A property used recently by THIS connection is not offered again.
const recent = new Map([["conn-lisette", new Map([["place-1", "2026-11-15T12:00:00Z"]])]])
ok("a property posted 1 day ago is inside the 21-day cooldown and is not offered",
  plan({ historyByConnection: recent }).planned.length === 0)
ok("a property posted 30 days ago is outside it and is offered",
  plan({ historyByConnection: new Map([["conn-lisette", new Map([["place-1", "2026-10-15T12:00:00Z"]])]]) }).planned.length === 1)

// ── 5. MARKET RESTRICTION AND PLATFORM ────────────────────────────────────────────────────────
console.log("\nthe destination's own limits are respected:")

ok("a Dallas-only account is not offered San Antonio",
  plan({ connections: [{ ...herConn, market_restriction: ["Dallas"] }], approved: [src({ market: "San Antonio" })] }).planned.length === 0)
ok("…and IS offered Dallas",
  plan({ connections: [{ ...herConn, market_restriction: ["Dallas"] }] }).planned.length === 1)
ok("an Instagram account is never offered a TikTok post",
  plan({ approved: [src({ platform: "tiktok" })] }).planned.length === 0)
ok("a paused destination is skipped",
  plan({ connections: [{ ...herConn, posting_paused: true }] }).planned.length === 0)
ok("a disconnected destination is skipped",
  plan({ connections: [{ ...herConn, status: "revoked" }] }).planned.length === 0)

// ── 6. THE ROW THAT GETS CREATED ──────────────────────────────────────────────────────────────
console.log("\nthe created post reuses his artifact and carries his approval:")

const row = rowFor(plan().planned[0])
ok("it is scheduled, not a draft", row.status === "scheduled")
ok("it is approved at creation — nobody approves it again", typeof row.approved_at === "string")
ok("it reuses HIS artifact path, byte for byte", row.rendered_storage_path === "o/c/renders/p1-1.mp4")
ok("…and points at the same render row", row.render_id === "r1")
ok("it copies his caption verbatim", row.caption === "A caption")
ok("…and his hashtags", Array.isArray(row.hashtags) && (row.hashtags as string[])[0] === "#dallas")
ok("it belongs to the AGENT's connection", row.connection_id === "conn-lisette")
ok("…while the owner stays the operator, so it is his to manage", row.owner_user_id === ADMIN)
ok("its provenance is recorded", row.created_via === "agent_distribution")
ok("render_status is ready — nothing is queued for rendering", row.render_status === "ready")
ok("it writes NO published_at or external_post_id", !("published_at" in row) && !("external_post_id" in row))

// ── 7. THE JOB CANNOT PUBLISH, RENDER OR EDIT ─────────────────────────────────────────────────
console.log("\nthe job's reach is bounded:")

const planSrc = code(readFileSync("lib/social/agentDistribution.ts", "utf8"))
const runSrc = code(readFileSync("lib/social/agentDistributionRun.ts", "utf8"))
const routeSrc = code(readFileSync("app/api/cron/social-agent-distribution/route.ts", "utf8"))

ok("the planner touches no database at all", !planSrc.includes("supabase") && !planSrc.includes(".from("))
ok("the runner only ever INSERTs", runSrc.includes(".insert(") && !runSrc.includes(".update(") && !runSrc.includes(".delete("))
ok("…and never renders", !runSrc.includes("renderPostToStorage") && !runSrc.includes("render_jobs"))
ok("…and never publishes", !/publish\(/.test(runSrc) && !runSrc.includes("external_post_id"))
ok("it asks the shared identity module, not its own copy of the rule",
  planSrc.includes("renderRefusalFor") && !planSrc.includes("identity_state ==="))
ok("it uses the shared external-agent classifier", planSrc.includes("isExternalAgentConnection"))
ok("it uses the operator's own slot times", planSrc.includes("effectiveDailyTimes"))

ok("the route defaults to a dry run", /mode: RunMode = requested === "persist" \? "persist" : "preview"/.test(routeSrc))
ok("…refuses to persist without its own flag", routeSrc.includes("SOCIAL_AGENT_DISTRIBUTION_ENABLED"))
ok("…and fails closed on a missing CRON_SECRET", routeSrc.includes("!cronSecret"))

const vercel = readFileSync("vercel.json", "utf8")
ok("it is NOT on a schedule — nothing invokes it on a timer",
  !vercel.includes("social-agent-distribution"),
  "adding it to vercel.json would start it running on the next deploy")

console.log(`\nAgent distribution: ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
