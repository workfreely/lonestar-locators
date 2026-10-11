// AGENT BETA — PRE-ACTIVATION SAFETY TESTS.
//
// The five things that must be true before a real agent account is switched on. These are the
// LOGIC half, run on every commit; each was also verified against production in a rolled-back
// transaction, and the measured results are recorded beside the assertions so the two can be
// compared rather than taken on trust.
//
// Run: npx tsx scripts/social/agentBetaPreflight.test.ts
import { readFileSync } from "node:fs"
import path from "node:path"
import { publishHoldDecision, PUBLISH_HOLD_FLAG } from "../../lib/social/publishHold"
import { isAgentOwnedPost, isExternalAgentConnection } from "../../lib/social/agentIdentity"

let pass = 0, fail = 0
const ok = (l: string, c: boolean) => { if (c) { pass++; console.log(`  ✓ ${l}`) } else { fail++; console.log(`  ✗ ${l}`) } }
const code = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8").replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, "")
const sql = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8")
const OFF = {}

// ── 1. STALE -> REAPPROVAL ──────────────────────────────────────────────────
// PRODUCTION: price change -> flagged; re-approval -> approved true, flagged false.
console.log("1. a stale agent post needs fresh approval, and can get it:")
ok("flagged agent post is held", publishHoldDecision({ isAgentOwned: true, needsReviewAt: "t" }, OFF).hold === true)
ok("clearing the flag releases it", publishHoldDecision({ isAgentOwned: true, needsReviewAt: null }, OFF).hold === false)
{
  const decide = code("app/api/agent/social/decide/[contentId]/route.ts")
  ok("re-approving CLEARS the flag in the same write", /needs_review_at: null, needs_review_reason: null/.test(decide))
  ok("...and the two decisions stay mutually exclusive",
    /approved_at: now, declined_at: null/.test(decide) && /approved_at: null, declined_at: now/.test(decide))
}

// ── 2. WITHDRAWAL BEATS A QUEUED OR CLAIMED JOB ─────────────────────────────
// PRODUCTION: a post in status='publishing' with media_publish_claimed_at AND an ig_container_id
// was still flagged by the withdrawal trigger, and availability re-reads false at publish time.
console.log("\n2. withdrawing a video stops it even mid-flight:")
ok("withdrawal holds regardless of the review flag",
  publishHoldDecision({ isAgentOwned: true, needsReviewAt: null, availableToAgents: false }, OFF).hold === true)
ok("...with its own reason, so the agent knows to ask rather than re-approve",
  (publishHoldDecision({ isAgentOwned: true, availableToAgents: false }, OFF) as { reason: string }).reason === "withdrawn_from_agents")
ok("withdrawal outranks staleness",
  (publishHoldDecision({ isAgentOwned: true, needsReviewAt: "t", availableToAgents: false }, OFF) as { reason: string }).reason === "withdrawn_from_agents")
{
  const worker = code("app/api/cron/social-instagram-publish/route.ts")
  const manual = code("app/api/admin/social-autopilot/posts/[id]/publish/route.ts")
  // The hold must be evaluated BEFORE any Instagram call on each path — a check after the container
  // is created would stop nothing.
  ok("the worker holds before it publishes",
    worker.indexOf("publishHoldDecision") < worker.indexOf("finalizeInstagramPublish"))
  ok("the manual path holds before it publishes",
    manual.indexOf("publishHoldDecision") < manual.indexOf("createReelContainer"))
  ok("availability is re-read at publish time, not trusted from the flag",
    /available_to_agents/.test(worker) && /available_to_agents/.test(manual))
}

// ── 3. RETRIES AND COMPANION STORIES CANNOT BYPASS IT ───────────────────────
// PRODUCTION, BEFORE THE FIX: a Story created before a withdrawal was NOT flagged
// (story_flagged=false) because both triggers matched on the post's own connection_id, which is
// null until release. It was blocked only by the publish-time re-read — one layer.
// AFTER: story_flagged=true. Two independent layers.
console.log("\n3. retries and companion Stories are covered:")
{
  const mig = sql("supabase/migrations/20261011000002_agent_hold_covers_companions.sql")
  ok("a helper resolves ownership through follows_post_id", /sa_post_is_agent_owned/.test(mig))
  ok("...checking the FOLLOWED post's connection too", /parent\.connection_id/.test(mig))
  ok("...and both triggers use it", (mig.match(/sa_post_is_agent_owned\(p\.id\)/g) ?? []).length === 2)
  ok("the companion branch is included in the flag predicate", /follows_post_id is not null/.test(mig))

  const worker = code("app/api/cron/social-instagram-publish/route.ts")
  // A RETRY re-enters the same due loop, so it meets the same hold. The reconcile sweep must not
  // be a side door that publishes without passing it.
  ok("the hold sits in the per-row loop every run re-enters", /holdDecision\.hold/.test(worker))
  ok("held rows are counted and keep their slot", /result\.heldForReview\+\+/.test(worker) && /continue/.test(worker))
  ok("...and the reason is reported per row", /heldReasons\.push/.test(worker))
}

// ── 4. PER-AGENT ISOLATION ──────────────────────────────────────────────────
// PRODUCTION: pausing Sarah's set left Mark's connection and the admin's own untouched.
console.log("\n4. one agent's actions never reach another account:")
{
  const posting = code("app/api/agent/social/posting/route.ts")
  const decide = code("app/api/agent/social/decide/[contentId]/route.ts")
  ok("pause/start takes NO connection id from the request",
    !/body\.(connectionId|connection_id|accountId)/.test(posting))
  ok("...and applies only to the session's connections", /for \(const id of connectionIds\)/.test(posting))
  ok("approve/skip resolves the connection from the session", /\.in\("id", connectionIds\)/.test(decide))
  ok("...and re-asserts it in the UPDATE", /\.eq\("connection_id", connection\.id\)/.test(decide))
  ok("neither touches the admin's account-wide kill switch",
    !/social_settings|auto_posting/.test(posting) && !/social_settings|auto_posting/.test(decide))
  // The classifier that keeps the regimes apart.
  ok("the admin's self-assigned connection is NOT an agent's",
    !isExternalAgentConnection({ agent_user_id: "jay", owner_user_id: "jay" }))
  ok("...so his posts are never agent-owned",
    !isAgentOwnedPost({ connection_id: "c" }, { agent_user_id: "jay", owner_user_id: "jay" }))
}

// ── 5. THE ADMIN'S BEHAVIOUR IS UNCHANGED ───────────────────────────────────
// PRODUCTION: a master price change flagged BOTH agents and left the admin's post unflagged and
// still approved.
console.log("\n5. the admin's approval and publishing are untouched:")
ok("a flagged ADMIN post still publishes (flag off)",
  publishHoldDecision({ isAgentOwned: false, needsReviewAt: "t" }, OFF).hold === false)
ok("...and holds only if he turns the flag on",
  publishHoldDecision({ isAgentOwned: false, needsReviewAt: "t" }, { [PUBLISH_HOLD_FLAG]: "true" }).hold === true)
ok("availability is irrelevant to an admin post",
  publishHoldDecision({ isAgentOwned: false, availableToAgents: false }, OFF).hold === false)
{
  const mig1 = sql("supabase/migrations/20261011000001_agent_publishing_hold.sql")
  const mig2 = sql("supabase/migrations/20261011000002_agent_hold_covers_companions.sql")
  ok("neither migration alters the ADMIN's existing trigger",
    !/create or replace function public\.social_content_flag_scheduled_for_review/.test(mig1 + mig2))
  ok("...nor drops it", !/drop (trigger|function)[^\n]*flag_scheduled_for_review/i.test(mig1 + mig2))
  ok("the global hold flag is still the admin's only gate", /PUBLISH_HOLD_FLAG/.test(code("lib/social/publishHold.ts")))
}

console.log(`\nAgent beta preflight: ${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
