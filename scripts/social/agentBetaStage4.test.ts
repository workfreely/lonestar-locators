// SOCIAL BEAST — AGENT BETA, STAGE 4: Approve/Skip, Start/Pause, and the agent publishing hold.
//
// Run: npx tsx scripts/social/agentBetaStage4.test.ts
import { readFileSync, readdirSync } from "node:fs"
import path from "node:path"
import { publishHoldDecision, shouldHoldForReview, PUBLISH_HOLD_FLAG } from "../../lib/social/publishHold"
import { isAgentOwnedPost } from "../../lib/social/agentIdentity"

let pass = 0, fail = 0
const ok = (l: string, c: boolean) => { if (c) { pass++; console.log(`  ✓ ${l}`) } else { fail++; console.log(`  ✗ ${l}`) } }
const raw = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8")
const code = (f: string) => raw(f).replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, "")

const JAY = "c567c077-d3f4-4532-8807-a54795f753f5"
const SARAH = "23ebb70e-2567-4c87-aacd-f58d3594dc09"
const ADMIN_CONN = { agent_user_id: JAY, owner_user_id: JAY }      // self-assigned
const AGENT_CONN = { agent_user_id: SARAH, owner_user_id: JAY }

// ── 1. THE HOLD: AGENT ROWS ARE UNCONDITIONAL ───────────────────────────────
console.log("1. an agent-owned post with a stale approval never publishes:")
{
  const ON = { [PUBLISH_HOLD_FLAG]: "true" }
  const OFF = {}
  ok("flagged agent row holds — with the global flag OFF",
    publishHoldDecision({ isAgentOwned: true, needsReviewAt: "t" }, OFF).hold === true)
  ok("...and the reason is stated", (publishHoldDecision({ isAgentOwned: true, needsReviewAt: "t" }, OFF) as { reason: string }).reason === "needs_review")
  ok("an UNflagged agent row publishes", publishHoldDecision({ isAgentOwned: true, needsReviewAt: null }, OFF).hold === false)
  ok("a WITHDRAWN video holds even with no flag",
    publishHoldDecision({ isAgentOwned: true, needsReviewAt: null, availableToAgents: false }, OFF).hold === true)
  ok("...and says WHY, so the agent knows to ask rather than re-approve",
    (publishHoldDecision({ isAgentOwned: true, availableToAgents: false }, OFF) as { reason: string }).reason === "withdrawn_from_agents")
  ok("withdrawal outranks staleness (the harder no wins)",
    (publishHoldDecision({ isAgentOwned: true, needsReviewAt: "t", availableToAgents: false }, OFF) as { reason: string }).reason === "withdrawn_from_agents")
  ok("UNKNOWN availability does not block — only an explicit false does",
    publishHoldDecision({ isAgentOwned: true, needsReviewAt: null, availableToAgents: undefined }, OFF).hold === false)
  ok("an available video publishes", publishHoldDecision({ isAgentOwned: true, availableToAgents: true }, OFF).hold === false)
}

// ── 2. THE ADMIN'S BEHAVIOUR IS UNCHANGED ───────────────────────────────────
console.log("\n2. the admin's publishing is exactly as it was:")
{
  const OFF = {}, ON = { [PUBLISH_HOLD_FLAG]: "true" }
  ok("flagged ADMIN row publishes while the global flag is off",
    publishHoldDecision({ isAgentOwned: false, needsReviewAt: "t" }, OFF).hold === false)
  ok("...and holds when the admin turns it on",
    publishHoldDecision({ isAgentOwned: false, needsReviewAt: "t" }, ON).hold === true)
  ok("the old helper still answers the old question", shouldHoldForReview("t", ON) === true && shouldHoldForReview("t", OFF) === false)
  ok("availability is IRRELEVANT to an admin row",
    publishHoldDecision({ isAgentOwned: false, needsReviewAt: null, availableToAgents: false }, OFF).hold === false)
  // The classifier is what keeps the two regimes apart, so re-assert it at this boundary.
  ok("the admin's SELF-assigned connection is not agent-owned",
    !isAgentOwnedPost({ connection_id: "c" }, ADMIN_CONN))
  ok("a delegated connection is", isAgentOwnedPost({ connection_id: "c" }, AGENT_CONN))
}

// ── 3. BOTH PUBLISH PATHS USE THE SAME DECISION ─────────────────────────────
console.log("\n3. the worker and the manual button cannot disagree:")
{
  const worker = code("app/api/cron/social-instagram-publish/route.ts")
  const manual = code("app/api/admin/social-autopilot/posts/[id]/publish/route.ts")
  for (const [name, src] of [["worker", worker], ["manual publish", manual]] as const) {
    ok(`${name}: calls publishHoldDecision`, /publishHoldDecision\(/.test(src))
    ok(`${name}: classifies with isAgentOwnedPost`, /isAgentOwnedPost\(/.test(src))
    ok(`${name}: reads the master's CURRENT availability`, /available_to_agents/.test(src))
    ok(`${name}: joins the connection to get agent/owner ids`, /destination_connection:connection_id\(agent_user_id, owner_user_id\)/.test(src))
  }
  ok("neither path calls the OLD helper for its decision any more",
    !/if \(shouldHoldForReview\(/.test(worker) && !/if \(shouldHoldForReview\(/.test(manual))
  ok("the worker reports WHY each post was held", /heldReasons/.test(worker))
  ok("the global flag is still OFF by default", shouldHoldForReview("t", {}) === false)
}

// ── 4. DECISIONS COME FROM THE SESSION, NOT THE BODY ────────────────────────
console.log("\n4. approve / skip / start / pause take no caller-supplied account:")
{
  const decide = code("app/api/agent/social/decide/[contentId]/route.ts")
  const posting = code("app/api/agent/social/posting/route.ts")
  for (const [name, src] of [["decide", decide], ["posting", posting]] as const) {
    ok(`${name}: guarded`, /requireSocialAgent\(\)/.test(src))
    ok(`${name}: reads NO connection id from the request`,
      !/body\.(connectionId|connection_id|accountId)|searchParams\.get\(["'](connectionId|account)/.test(src))
    ok(`${name}: scopes to the session's connections`, /connectionIds/.test(src))
  }
  ok("decide accepts ONLY 'approve' or 'skip'", /decision !== "approve" && body\.decision !== "skip"/.test(decide))
  ok("...and a bad value is a 400, never a default", /bad_decision[\s\S]{0,30}400/.test(decide))
  ok("posting accepts ONLY 'start' or 'pause'", /action !== "start" && body\.action !== "pause"/.test(posting))
  ok("...and a bad value is a 400", /bad_action[\s\S]{0,30}400/.test(posting))
  ok("decide RE-READS availability at decision time", /isSharedWithAgents\(/.test(decide))
  ok("...and refuses a withdrawn video", /not_available[\s\S]{0,30}404/.test(decide))
  ok("approve and skip are mutually exclusive in the write",
    /approved_at: now, declined_at: null/.test(decide) && /approved_at: null, declined_at: now/.test(decide))
  ok("the update re-asserts the connection and unpublished state",
    /\.eq\("connection_id", connection\.id\)[\s\S]{0,80}\.is\("published_at", null\)/.test(decide))
  ok("a 23505 race is treated as already-decided, not an error", /23505[\s\S]{0,120}already_decided/.test(decide))
  ok("posting reuses the EXISTING pause RPCs", /sa_pause_destination/.test(posting) && /sa_resume_destination/.test(posting))
  ok("posting never touches the owner-level kill switch", !/social_settings|auto_posting/.test(posting))
  ok("posting re-reads state instead of echoing intent", /Re-read/.test(raw("app/api/agent/social/posting/route.ts")))
}

// ── 5. EVERY AGENT ROUTE, STILL ───────────────────────────────────────────── 
console.log("\n5. the agent surface as a whole:")
{
  const routes: string[] = []
  const walk = (d: string) => {
    for (const e of readdirSync(path.join(process.cwd(), d), { withFileTypes: true })) {
      if (e.isDirectory()) walk(path.join(d, e.name)); else if (e.name === "route.ts") routes.push(path.join(d, e.name))
    }
  }
  walk("app/api/agent")
  ok(`${routes.length} agent routes, all guarded`, routes.every((r) => /requireSocialAgent\(\)/.test(code(r))))
  ok("none accepts a caller-supplied connection/owner/agent id",
    routes.every((r) => !/body\.(connectionId|connection_id|ownerId|agentId)|searchParams\.get\(["'](connectionId|ownerId|agentId)/.test(code(r))))
  const writers = routes.filter((r) => /\.(insert|update|upsert|delete)\(|\.rpc\(/.test(code(r)))
  ok(`exactly 2 routes write (decide, posting) — got ${writers.length}`, writers.length === 2)
  ok("...and both are the ones that should", writers.every((w) => /decide|posting/.test(w)))
}

console.log(`\nAgent beta stage 4: ${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
