// SOCIAL BEAST — AGENT BETA, STAGE 1: migration, guard, media boundary.
//
// Stage 1 ships with NO interface. Everything asserted here is a server-side boundary, which is
// deliberate: the protections must be verifiable before there is a screen that depends on them,
// and a screen is never what enforces them.
//
// Run: npx tsx scripts/social/agentBetaStage1.test.ts
import { readFileSync } from "node:fs"
import path from "node:path"
import { agentBetaUserIds, isAgentBetaUser, AGENT_BETA_FLAG } from "../../lib/social/agentBeta"
import { signAgentMedia, isSharedWithAgents, AGENT_SIGNED_URL_TTL } from "../../lib/social/agentMedia"

let pass = 0, fail = 0
const ok = (l: string, c: boolean) => { if (c) { pass++; console.log(`  ✓ ${l}`) } else { fail++; console.log(`  ✗ ${l}`) } }
const code = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8").replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, "")

const SARAH = "23ebb70e-2567-4c87-aacd-f58d3594dc09"
const JAY = "c567c077-d3f4-4532-8807-a54795f753f5"

// ── 1. THE BETA ALLOWLIST ───────────────────────────────────────────────────
console.log("1. the beta is closed by default and opens only to named ids:")
ok("an UNSET allowlist admits nobody", agentBetaUserIds({}).length === 0 && !isAgentBetaUser(SARAH, {}))
ok("...including the admin", !isAgentBetaUser(JAY, {}))
ok("an EMPTY string admits nobody", !isAgentBetaUser(SARAH, { [AGENT_BETA_FLAG]: "" }))
ok("Sarah is admitted when named", isAgentBetaUser(SARAH, { [AGENT_BETA_FLAG]: SARAH }))
ok("...and nobody else is", !isAgentBetaUser(JAY, { [AGENT_BETA_FLAG]: SARAH }))
ok("comma + whitespace separated lists parse", agentBetaUserIds({ [AGENT_BETA_FLAG]: ` ${SARAH}, ${JAY} ` }).length === 2)
ok("a null/undefined user id is never admitted",
  !isAgentBetaUser(null, { [AGENT_BETA_FLAG]: SARAH }) && !isAgentBetaUser(undefined, { [AGENT_BETA_FLAG]: SARAH }))
// A wildcard must NOT be an escape hatch — exact match only.
ok("'*' does not admit anyone", !isAgentBetaUser(SARAH, { [AGENT_BETA_FLAG]: "*" }))
ok("a PREFIX of a real id does not match", !isAgentBetaUser(SARAH, { [AGENT_BETA_FLAG]: SARAH.slice(0, 12) }))
ok("...nor does the id with trailing junk", !isAgentBetaUser(SARAH + "x", { [AGENT_BETA_FLAG]: SARAH }))

// ── 2. THE GUARD ────────────────────────────────────────────────────────────
console.log("\n2. the guard derives identity from the session, never the request:")
{
  const g = code("lib/auth/requireSocialAgent.ts")
  ok("it authenticates first", /auth\.getUser\(\)/.test(g))
  ok("401 when unauthenticated", /status: 401/.test(g))
  ok("the beta check runs BEFORE any database read",
    g.indexOf("isAgentBetaUser") < g.indexOf('from("social_connections")'))
  ok("403 for a non-beta user", /isAgentBetaUser[\s\S]{0,160}status: 403/.test(g))
  ok("connections are looked up by agent_user_id = the SESSION user",
    /\.eq\("agent_user_id", user\.id\)/.test(g))
  ok("an agent with no connected account is refused", /no_connected_accounts[\s\S]{0,40}403/.test(g))
  // The failure that would be invisible: treating a DB error as "no rows".
  ok("a failed lookup is an ERROR, not an empty allowlist", /if \(error\)[\s\S]{0,120}agent_lookup_failed/.test(g))
  ok("it never reads an id from a body or query string",
    !/req\.(json|body|nextUrl|url)|searchParams/.test(g))
  ok("it returns the RLS client, not the service role", /createClient\(\)/.test(g) && !/supabaseAdmin/.test(g))
}

// ── 3. THE MEDIA BOUNDARY ───────────────────────────────────────────────────
// A signed URL is a bearer token, so the only check that counts happens before signing.
console.log("\n3. signed URLs are issued ONLY for explicitly shared videos:")
async function section3() {
  type Row = Record<string, unknown> | null
  const client = (row: Row, signOk = true) => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: row, error: null }) }) }) }),
    storage: { from: () => ({ createSignedUrl: async () => (signOk
      ? { data: { signedUrl: "https://signed.example/v.mp4" }, error: null }
      : { data: null, error: { message: "nope" } }) }) },
  }) as never

  const shared = { id: "c1", owner_user_id: JAY, available_to_agents: true, storage_path: "o/c1/source.mp4" }
  const owners = [JAY]

  const r1 = await signAgentMedia(client(shared), { contentId: "c1", ownerUserIds: owners })
  ok("a SHARED video signs", r1.ok === true)

  const r2 = await signAgentMedia(client({ ...shared, available_to_agents: false }), { contentId: "c1", ownerUserIds: owners })
  ok("an UNSHARED video is refused (the personal-video case)", r2.ok === false && r2.reason === "not_shared")

  const r3 = await signAgentMedia(client({ ...shared, available_to_agents: null }), { contentId: "c1", ownerUserIds: owners })
  ok("...and null is treated as NOT shared, never as permissive", r3.ok === false && r3.reason === "not_shared")

  const r4 = await signAgentMedia(client(shared), { contentId: "c1", ownerUserIds: ["someone-else"] })
  ok("a shared video from ANOTHER owner is refused", r4.ok === false && r4.reason === "not_your_owner")

  const r5 = await signAgentMedia(client(null), { contentId: "nope", ownerUserIds: owners })
  ok("a missing row is refused", r5.ok === false && r5.reason === "not_found")

  const r6 = await signAgentMedia(client({ ...shared, storage_path: null }), { contentId: "c1", ownerUserIds: owners })
  ok("a shared row with no media is refused", r6.ok === false && r6.reason === "no_media")

  const r7 = await signAgentMedia(client(shared, false), { contentId: "c1", ownerUserIds: owners })
  ok("a storage failure is reported, never silently 'allowed'", r7.ok === false && r7.reason === "sign_failed")

  const m = code("lib/social/agentMedia.ts")
  ok("the caller cannot pass a storage path or an 'allowed' flag",
    !/storagePath|allowed\s*:|isAllowed/.test(m))
  ok("the path comes from the SAME read that checks the flag", /select\("id, owner_user_id, available_to_agents, storage_path"\)/.test(m))
  ok("the TTL is short", AGENT_SIGNED_URL_TTL <= 900)
  ok("isSharedWithAgents is strict about true", isSharedWithAgents({ available_to_agents: true })
    && !isSharedWithAgents({ available_to_agents: false })
    && !isSharedWithAgents({ available_to_agents: null })
    && !isSharedWithAgents(null) && !isSharedWithAgents(undefined))
}


void section3().then(() => {

// ── 4. THE ADMIN SURFACE IS UNTOUCHED ───────────────────────────────────────
console.log("\n4. nothing about the admin experience changed:")
{
  ok("requirePlatformAdmin still exists and is unchanged in shape",
    /is_platform_admin/.test(code("lib/auth/requirePlatformAdmin.ts")))
  ok("the agent guard is a SEPARATE file, not a modification of the admin one",
    !/requireSocialAgent/.test(code("lib/auth/requirePlatformAdmin.ts")))
  ok("no agent module imports the Post Editor", !/PostEditor/.test(code("lib/social/agentMedia.ts")))
  // The migration must be additive only.
  const mig = readFileSync(path.join(process.cwd(), "supabase/migrations/20261010000001_social_agent_beta_foundation.sql"), "utf8")
  ok("the migration drops no admin policy",
    !/drop policy[^\n]*platform admin/i.test(mig))
  ok("...alters no existing column", !/alter column|drop column/i.test(mig))
  ok("...and only ADDs", /add column if not exists/.test(mig) && !/delete from|truncate|update public\./i.test(mig))
  ok("available_to_agents defaults to FALSE", /available_to_agents boolean not null default false/.test(mig))
}

console.log(`\nAgent beta stage 1: ${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
})
