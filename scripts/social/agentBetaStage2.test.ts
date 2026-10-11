// SOCIAL BEAST — AGENT BETA, STAGE 2: read-only library, property details, protected media.
//
// Run: npx tsx scripts/social/agentBetaStage2.test.ts
import { readFileSync, readdirSync } from "node:fs"
import path from "node:path"
import { isExternalAgentConnection, isAgentOwnedPost, EXTERNAL_AGENT_SQL } from "../../lib/social/agentIdentity"
import {
  AGENT_PROPERTY_COLUMNS, AGENT_PROPERTY_FORBIDDEN, AGENT_CONTENT_COLUMNS,
  AGENT_POST_COLUMNS, agentStatusOf, selectOf,
} from "../../lib/social/agentPropertyView"

let pass = 0, fail = 0
const ok = (l: string, c: boolean) => { if (c) { pass++; console.log(`  ✓ ${l}`) } else { fail++; console.log(`  ✗ ${l}`) } }
const raw = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8")
const code = (f: string) => raw(f).replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, "")

const JAY = "c567c077-d3f4-4532-8807-a54795f753f5"
const SARAH = "23ebb70e-2567-4c87-aacd-f58d3594dc09"

// ── 1. THE CORRECTED DISCRIMINATOR ──────────────────────────────────────────
console.log("1. an external agent is someone OTHER than the owner:")
ok("the admin's SELF-assigned connection is NOT an external agent",
  !isExternalAgentConnection({ agent_user_id: JAY, owner_user_id: JAY }))
ok("a delegated connection IS", isExternalAgentConnection({ agent_user_id: SARAH, owner_user_id: JAY }))
ok("no agent set is not an external agent", !isExternalAgentConnection({ agent_user_id: null, owner_user_id: JAY }))
ok("a null owner is never external", !isExternalAgentConnection({ agent_user_id: SARAH, owner_user_id: null }))
ok("an undefined connection is never external", !isExternalAgentConnection(null) && !isExternalAgentConnection(undefined))
console.log("\n   and the post-level classifier agrees:")
ok("an admin post on his own connection is NOT agent-owned",
  !isAgentOwnedPost({ connection_id: "c1" }, { agent_user_id: JAY, owner_user_id: JAY }))
ok("a post on a delegated connection IS agent-owned",
  isAgentOwnedPost({ connection_id: "c1" }, { agent_user_id: SARAH, owner_user_id: JAY }))
ok("an UNASSIGNED post is never agent-owned",
  !isAgentOwnedPost({ connection_id: null }, { agent_user_id: SARAH, owner_user_id: JAY }))
ok("the SQL predicate matches the TS one", /agent_user_id is not null/.test(EXTERNAL_AGENT_SQL) && /<>/.test(EXTERNAL_AGENT_SQL))

// ── 2. THE DISCRIMINATOR DOES NOT GRANT ACCESS ──────────────────────────────
// Jay's instruction: being an external agent must switch SAFEGUARDS on, never open a door.
console.log("\n2. the discriminator classifies; it never authorizes:")
{
  const g = code("lib/auth/requireSocialAgent.ts")
  ok("the guard does NOT use the external-agent test to admit anyone", !/isExternalAgentConnection|agentIdentity/.test(g))
  ok("the guard still requires a session", /auth\.getUser\(\)/.test(g))
  ok("...the beta allowlist", /isAgentBetaUser/.test(g))
  ok("...and ownership of a real connection", /\.eq\("agent_user_id", user\.id\)/.test(g))
  const id = code("lib/social/agentIdentity.ts")
  ok("agentIdentity grants nothing — no session, no allowlist, no query",
    !/auth\.|createClient|from\(|isAgentBetaUser/.test(id))
}

// ── 3. THE FIELD ALLOWLIST ──────────────────────────────────────────────────
console.log("\n3. an agent can only ever be sent allowlisted fields:")
{
  const cols = AGENT_PROPERTY_COLUMNS as readonly string[]
  for (const bad of AGENT_PROPERTY_FORBIDDEN) {
    ok(`'${bad}' is NOT in the property allowlist`, !cols.includes(bad))
  }
  ok("admin working notes are not in the CONTENT allowlist",
    !(AGENT_CONTENT_COLUMNS as readonly string[]).includes("notes"))
  ok("...nor the raw storage path", !(AGENT_CONTENT_COLUMNS as readonly string[]).includes("storage_path"))
  ok("...nor the original filename", !(AGENT_CONTENT_COLUMNS as readonly string[]).includes("original_filename"))
  ok("owner_user_id is never sent to an agent",
    !cols.includes("owner_user_id") && !(AGENT_POST_COLUMNS as readonly string[]).includes("owner_user_id"))
  // Verification dates MUST be present — a price with no date is a claim, not evidence.
  for (const need of ["pricing_last_verified", "current_special_checked_at", "current_special_source"]) {
    ok(`'${need}' IS included, so staleness is visible`, cols.includes(need))
  }
  ok("the routes select VIA the allowlist, never a literal '*'", (() => {
    const files = ["app/api/agent/social/library/route.ts", "app/api/agent/social/property/[contentId]/route.ts"]
    return files.every((f) => /selectOf\(AGENT_/.test(code(f)) && !/select\("\*"\)/.test(code(f)))
  })())
  ok("selectOf produces a comma list", selectOf(["a", "b"]) === "a, b")
}

// ── 4. EVERY AGENT ROUTE IS GUARDED AND READ-ONLY ───────────────────────────
console.log("\n4. the agent surface cannot write:")
{
  const dir = "app/api/agent"
  const routes: string[] = []
  const walk = (d: string) => {
    for (const e of readdirSync(path.join(process.cwd(), d), { withFileTypes: true })) {
      if (e.isDirectory()) walk(path.join(d, e.name))
      else if (e.name === "route.ts") routes.push(path.join(d, e.name))
    }
  }
  walk(dir)
  ok(`found ${routes.length} agent route(s)`, routes.length === 3)
  for (const r of routes) {
    const src = code(r)
    const name = r.replace("app/api/", "")
    ok(`${name}: guarded by requireSocialAgent`, /requireSocialAgent\(\)/.test(src))
    ok(`${name}: refuses before doing anything`, /if \(!guard\.ok\) return guard\.response/.test(src))
    ok(`${name}: performs NO write`, !/\.(insert|update|upsert|delete)\(/.test(src))
    ok(`${name}: uses the RLS client, never the service role`, !/supabaseAdmin/.test(src))
    ok(`${name}: scopes to session-derived ids only`,
      !/searchParams\.get\(["'](connectionId|ownerId|agentId|owner_user_id)["']\)/.test(src))
  }
}

// ── 5. MEDIA: THE SHARE SWITCH GATES THE BYTES ──────────────────────────────
console.log("\n5. protected video access:")
{
  const lib = code("app/api/agent/social/library/route.ts")
  ok("the library filters on available_to_agents IN SQL", /\.eq\("available_to_agents", true\)/.test(lib))
  ok("...and scopes to the agent's own owner", /\.in\("owner_user_id", ownerUserIds\)/.test(lib))
  ok("...and matches posts only on the agent's own connections", /\.in\("connection_id", connectionIds\)/.test(lib))
  ok("the library mints NO signed urls (no bulk bearer tokens)",
    !/createSignedUrl|signAgentMedia/.test(lib) && /mediaUrl: null/.test(lib))

  const media = code("app/api/agent/social/media/[contentId]/route.ts")
  ok("the media route signs through signAgentMedia only", /signAgentMedia\(/.test(media) && !/createSignedUrl/.test(media))
  ok("...and never accepts a path from the caller", !/storage_path|storagePath/.test(media))

  const prop = code("app/api/agent/social/property/[contentId]/route.ts")
  ok("the property route requires available_to_agents in the LOOKUP",
    /\.eq\("available_to_agents", true\)/.test(prop))
  ok("...so an unshared video is indistinguishable from a missing one", /not_found/.test(prop))
}

// ── 6. THE AGENT STATUS VOCABULARY ──────────────────────────────────────────
console.log("\n6. the five simple statuses resolve in the right order:")
ok("no row at all -> Pending Review", agentStatusOf(null) === "Pending Review")
ok("undecided -> Pending Review", agentStatusOf({}) === "Pending Review")
ok("approved -> Approved", agentStatusOf({ approved_at: "t" }) === "Approved")
ok("skipped -> Skipped", agentStatusOf({ declined_at: "t" }) === "Skipped")
ok("scheduled -> Scheduled", agentStatusOf({ approved_at: "t", scheduled_at: "t" }) === "Scheduled")
ok("published -> Published", agentStatusOf({ approved_at: "t", scheduled_at: "t", published_at: "t" }) === "Published")
ok("STALE outranks approved and scheduled -> Needs Review",
  agentStatusOf({ approved_at: "t", scheduled_at: "t", needs_review_at: "t" }) === "Needs Review")
ok("...but a PUBLISHED post stays published", agentStatusOf({ needs_review_at: "t", published_at: "t" }) === "Published")

// ── 7. THE ADMIN SURFACE IS STILL UNTOUCHED ─────────────────────────────────
console.log("\n7. the admin experience is unchanged:")
{
  ok("no agent file imports the Post Editor or admin components",
    !["lib/social/agentIdentity.ts", "lib/social/agentPropertyView.ts", "lib/social/agentMedia.ts"]
      .some((f) => /PostEditor|SocialAutopilotClient|BulkReview/.test(code(f))))
  const mig = raw("supabase/migrations/20261010000002_social_agent_rls_external_only.sql")
  ok("the RLS migration touches only AGENT policies", !/platform admin/i.test(mig.replace(/--[^\n]*/g, "")))
  ok("...and only NARROWS them", /is distinct from/.test(mig))
  ok("no admin route was modified in stage 2",
    !/agent/.test(code("app/api/admin/social-autopilot/content/route.ts").slice(0, 400)))
}

console.log(`\nAgent beta stage 2: ${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
