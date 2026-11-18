// TWO INSTAGRAM ACCOUNTS, AND A REFRESH THAT TOUCHES EXACTLY ONE.
//
// ── THE BUG BEING FIXED, REPRODUCED BEFORE IT WAS FIXED ─────────────────────────────────────
// Instagram got a connection-scoped token READER when multi-account publishing landed, and never
// the matching WRITER. The owner-scoped one that predates multi-account ran:
//
//     update public.social_connections
//        set token_secret_id = <new>, token_expires_at = …
//      where owner_user_id = p_owner and provider = 'instagram';
//
// with no account filter. Run against two Instagram rows on a throwaway Postgres, that gave the
// SECOND account the FIRST account's refreshed token and overwrote its expiry — confirmed, not
// theorised. The reader was `limit 1` with no ORDER BY, so which account it returned was down to
// the plan.
//
// Nothing called either one: every live caller already used the _by_connection reader, and the
// refresh helper had no caller at all. So it was latent — until a second Instagram account.
//
// ── WHAT THIS SUITE CAN AND CANNOT DO ───────────────────────────────────────────────────────
// The SQL itself is proved BEHAVIOURALLY, against two real rows, by
// scripts/social/instagramTokenIsolation.pg.sql — 27 assertions including "the other account is
// byte-identical in every column". That needs a local Postgres, so it is opt-in and not part of
// this run. What runs here: the pure refresh policy, exhaustively, and the structural guarantees
// that keep the unsafe path unreachable from application code.
//
// Run: npx tsx scripts/social/instagramTokenIsolation.test.ts
// Behavioural SQL: see the header of scripts/social/instagramTokenIsolation.pg.sql
import { readFileSync } from "node:fs"
import path from "node:path"
import {
  refreshDecision,
  daysUntilExpiry,
  needsHumanAttention,
  REFRESH_WINDOW_DAYS,
  MIN_TOKEN_AGE_HOURS,
} from "../../lib/social/instagramTokenRefresh"

let pass = 0, fail = 0
const ok = (l: string, c: boolean, d = "") => { if (c) { pass++; console.log(`  ✓ ${l}`) } else { fail++; console.log(`  ✗ ${l}${d ? `  — ${d}` : ""}`) } }
const read = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8")
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1")
const sqlOf = (s: string) => s.replace(/--[^\n]*/g, "")

const MIG = sqlOf(read("supabase/migrations/20261119000000_instagram_connection_scoped_tokens.sql"))
const RUN = code(read("lib/social/instagramTokenRefreshRun.ts"))
const ROUTE = code(read("app/api/cron/social-instagram-token-refresh/route.ts"))
const POLICY = code(read("lib/social/instagramTokenRefresh.ts"))

const NOW = new Date("2026-11-19T12:00:00Z")
const at = (days: number) => new Date(NOW.getTime() + days * 86_400_000).toISOString()
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString()
const conn = (over: Partial<Parameters<typeof refreshDecision>[0]> = {}) => ({
  status: "connected",
  tokenExpiresAt: at(10),
  updatedAt: hoursAgo(48),
  ...over,
})

// ── 1. WHEN A TOKEN IS RENEWED, AND WHEN IT IS LEFT ALONE ─────────────────────────────────────
console.log("the renewal decision:")

ok("a token inside the window is renewed", refreshDecision(conn(), NOW).refresh)
ok("one comfortably outside it is left alone", (() => {
  const d = refreshDecision(conn({ tokenExpiresAt: at(40) }), NOW)
  return !d.refresh && d.reason === "not_due_yet"
})())
ok(`the boundary is ${REFRESH_WINDOW_DAYS} days, exclusive on the far side`,
  refreshDecision(conn({ tokenExpiresAt: at(REFRESH_WINDOW_DAYS) }), NOW).refresh
  && !refreshDecision(conn({ tokenExpiresAt: at(REFRESH_WINDOW_DAYS + 1) }), NOW).refresh)

// META'S OWN LIMITS, encoded rather than discovered as a 400 at runtime.
ok(`a token younger than ${MIN_TOKEN_AGE_HOURS}h is not renewed`, (() => {
  const d = refreshDecision(conn({ updatedAt: hoursAgo(2) }), NOW)
  return !d.refresh && d.reason === "too_new"
})())
ok("…and one just over the floor is", refreshDecision(conn({ updatedAt: hoursAgo(25) }), NOW).refresh)
ok("an ALREADY expired token is not renewed — nobody can refresh one", (() => {
  const d = refreshDecision(conn({ tokenExpiresAt: at(-1) }), NOW)
  return !d.refresh && d.reason === "already_expired"
})())
ok("…nor is one expiring this very instant", !refreshDecision(conn({ tokenExpiresAt: NOW.toISOString() }), NOW).refresh)

// NEVER GUESSED.
ok("a missing expiry is never guessed at", (() => {
  const d = refreshDecision(conn({ tokenExpiresAt: null }), NOW)
  return !d.refresh && d.reason === "no_expiry_recorded"
})())
ok("…nor is an unparseable one", !refreshDecision(conn({ tokenExpiresAt: "not a date" }), NOW).refresh)
ok("a disconnected account is not renewed, it is reported", (() => {
  const d = refreshDecision(conn({ status: "error" }), NOW)
  return !d.refresh && d.reason === "not_connected"
})())

// THE DELIBERATE NON-RULE. Pausing an account must not let its credentials die: that would turn
// a reversible pause into a reconnection the operator never asked for.
ok("a PAUSED account is still renewed — pause is not abandonment",
  !/postingPaused|posting_paused/.test(POLICY))

ok("an expired account is flagged for a human", needsHumanAttention(conn({ tokenExpiresAt: at(-1) }), NOW))
ok("…as is one with no expiry recorded", needsHumanAttention(conn({ tokenExpiresAt: null }), NOW))
ok("…while a healthy one is not", !needsHumanAttention(conn({ tokenExpiresAt: at(40) }), NOW))
ok("the days-left figure is reported for the run log", daysUntilExpiry(at(33), NOW) === 33)
ok("…and is null when there is no expiry", daysUntilExpiry(null, NOW) === null)

// ── 2. EVERY WRITE IS BY CONNECTION ID ────────────────────────────────────────────────────────
console.log("\nthe write can only ever address one account:")

ok("the runner writes through the connection-scoped function",
  /sa_update_instagram_token_by_connection/.test(RUN) && /p_connection_id: row\.id/.test(RUN))
ok("…and NEVER through the owner-scoped one", !/sa_update_instagram_token\b(?!_by_connection)/.test(RUN))
ok("…and reads through the connection-scoped reader too",
  /sa_get_instagram_token_by_connection/.test(RUN) && !/"sa_get_instagram_token"/.test(RUN))
ok("the runner performs no direct table write at all",
  !/\.from\("social_connections"\)[\s\S]{0,120}\.(update|insert|delete|upsert)\(/.test(RUN))
ok("…and selects no secret material",
  !/token_secret_id/.test(RUN) && !/decrypted_secret/.test(RUN))

// ── 3. THE SQL ITSELF ─────────────────────────────────────────────────────────────────────────
console.log("\nthe migration's guarantees:")

ok("the new writer locks the row before touching it",
  /where sc\.id = p_connection_id and sc\.provider = 'instagram'\s*\n\s*for update;/.test(MIG))
ok("…updates exactly one row, by id", /update public\.social_connections[\s\S]{0,400}where id = p_connection_id;/.test(MIG))
ok("…and never by owner", !/set token_secret_id[\s\S]{0,300}where owner_user_id/.test(MIG))
// A refresh renews a credential. Anything else in the SET list would be a setting silently
// reset every time a token aged out.
for (const preserved of ["scopes", "posting_paused", "posts_per_day", "stagger_offset_minutes", "market_restriction", "label", "agent_user_id", "username", "external_account_id"]) {
  const body = MIG.slice(MIG.indexOf("sa_update_instagram_token_by_connection"), MIG.indexOf("revoke all on function"))
  ok(`…leaves ${preserved} untouched`, !new RegExp(`\\b${preserved}\\s*=`).test(body))
}
ok("…and leaves `status` untouched, so a refresh cannot hide an error", (() => {
  const body = MIG.slice(MIG.indexOf("sa_update_instagram_token_by_connection"), MIG.indexOf("revoke all on function"))
  return !/\bstatus\s*=/.test(body)
})())
ok("…and supersedes only the secret that connection was using",
  /if v_old_secret is not null and v_old_secret <> v_secret then/.test(MIG))
ok("the new writer is service_role only",
  /revoke all on function public\.sa_update_instagram_token_by_connection\(uuid, text, timestamptz\) from authenticated;/.test(MIG)
  && /grant execute on function public\.sa_update_instagram_token_by_connection\(uuid, text, timestamptz\) to service_role;/.test(MIG))

ok("the owner-scoped WRITER now raises rather than updating every account",
  /if v_n > 1 then\s*\n\s*raise exception 'sa_update_instagram_token: % instagram connections/.test(MIG))
ok("…and names the per-connection function to use instead", /use sa_update_instagram_token_by_connection/.test(MIG))
ok("…and writes by id even in the single-account case", /where id = v_conn;/.test(MIG))
ok("the owner-scoped READER returns nothing when it cannot know which account",
  /if v_n > 1 then\s*\n\s*return;\s*\n\s*end if;/.test(MIG))
ok("…and is deterministic with one", /order by sc\.created_at/.test(MIG))
ok("the migration touches no data", !/\b(insert into public\.|delete from public\.|update public\.social_connections\s+set\s+\w+\s*=\s*\w+\s*;)/.test(
  MIG.replace(/update public\.social_connections[\s\S]*?where id = (p_connection_id|v_conn);/g, "")))

// ── 4. FAILURE CHANGES NOTHING ────────────────────────────────────────────────────────────────
console.log("\na failed refresh is not damage:")

ok("a provider failure is caught per connection, not per run", /catch \(e\) \{[\s\S]{0,400}action: "failed"/.test(RUN))
ok("…and the loop continues to the next account", /for \(const row of rows\)/.test(RUN))
ok("…writing nothing on that path",
  !/catch \(e\) \{[\s\S]{0,400}\.rpc\(/.test(RUN) && !/catch \(e\) \{[\s\S]{0,400}status:/.test(RUN))
ok("…and never marking the connection broken", !/'error'|"error"/.test(RUN.replace(/console\.error/g, "")))
ok("there is no in-run retry; the next scheduled pass is the retry", !/retry|attempt\s*\+\+|for \(let i = 0/.test(RUN))
ok("a missing token is reported rather than assumed", /no_token_returned/.test(RUN))

// ── 5. INERT UNTIL ARMED ──────────────────────────────────────────────────────────────────────
console.log("\nnothing rotates until it is deliberately switched on:")

ok("the route requires CRON_SECRET", /auth !== `Bearer \$\{cronSecret\}`/.test(ROUTE))
ok("…defaults to a dry run", /requested === "persist" \? "persist" : "preview"/.test(ROUTE))
ok("…and refuses to persist without the env flag",
  /mode === "persist" && !refreshEnabled\(\)/.test(ROUTE)
  && /SOCIAL_INSTAGRAM_REFRESH_ENABLED \?\? ""\)\.trim\(\) === "true"/.test(ROUTE))
ok("a dry run makes no provider call", /if \(mode === "preview"\)[\s\S]{0,200}action: "would_refresh"/.test(RUN))
ok("the route publishes nothing", !/media_publish|createReelContainer|social_posts/.test(ROUTE))

console.log(`\nInstagram token isolation: ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
