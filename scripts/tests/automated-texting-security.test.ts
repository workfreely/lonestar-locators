/**
 * Automated Texting — security invariants (static source + migration assertions).
 *
 * These lock the authorization boundaries in code review so a future edit can't
 * silently weaken them. The LIVE checks (a real unauthorized 403, a real rejected
 * PostgREST write) are run against the DB during production verification; here we
 * assert the invariants that make those outcomes structural.
 *
 *   npx tsx scripts/tests/automated-texting-security.test.ts
 */
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, "../..")
const read = (p: string) => readFileSync(resolve(root, p), "utf8")

let failures = 0
function ok(cond: boolean, msg: string) {
  if (!cond) { failures++; console.error("  ✗ " + msg) } else { console.log("  ✓ " + msg) }
}

// ── Migration: non-self-writable authorization + enrollment write-lock ───────
console.log("MIGRATION — authorization table + enrollment write-lock")
const mig = read("supabase/migrations/20260922000007_automated_texting_authorization.sql")
ok(/create table if not exists public\.automated_texting_accounts/i.test(mig), "creates automated_texting_accounts")
ok(/user_id\s+uuid[\s\S]*references auth\.users\(id\)/i.test(mig), "keyed to auth.users.id (never phone/email)")
ok(/enable row level security/i.test(mig), "RLS enabled on the authorization table")
ok(/for select\s+using \(user_id = auth\.uid\(\)\)/i.test(mig), "SELECT-own policy only")
// The crux of 'agents cannot authorize themselves': NO write policy exists.
ok(!/for (insert|update|delete)/i.test(mig), "NO insert/update/delete policy → not client-writable (no self-grant)")
ok(/security definer/i.test(mig) && /is_automated_texting_authorized/i.test(mig), "is_automated_texting_authorized is SECURITY DEFINER")
// The direct-PostgREST enrollment bypass fix. NOTE: a column-level revoke ALONE is
// insufficient here — the client roles hold TABLE-level UPDATE on leads, which
// overrides it — so the authoritative lock is a BEFORE UPDATE trigger. Both are
// asserted (the revoke as defense-in-depth, the trigger as the real enforcement).
ok(/revoke update\(followup_opt_in\) on public\.leads from authenticated, anon/i.test(mig), "column revoke present (defense-in-depth)")
ok(/create trigger trg_followup_opt_in_server_only[\s\S]*before update on public\.leads/i.test(mig), "BEFORE UPDATE trigger on leads is the enforcement mechanism")
ok(/new\.followup_opt_in is distinct from old\.followup_opt_in/i.test(mig), "trigger only fires on an actual followup_opt_in change (other updates unaffected)")
ok(/current_user not in \('service_role'/i.test(mig), "trigger allows the service role, blocks client roles (authenticated/anon)")

// ── Enrollment route: server-authoritative dual boundary ─────────────────────
console.log("ENROLLMENT ROUTE — authenticated + workspace + account authorization")
const enroll = read("app/api/leads/[id]/automated-texting/route.ts")
ok(/requireWorkspaceMember\(\)/.test(enroll), "requires active workspace membership")
ok(/is_automated_texting_authorized/.test(enroll) && /status:\s*403/.test(enroll), "requires account authorization (403 otherwise)")
ok(/\.eq\("workspace_id", workspaceId\)/.test(enroll), "lead must match the caller's workspace (never owner_user_id)")
// Not the substring (the comment explains why it's avoided) — the actual USE: no
// query filters or selects on owner_user_id anywhere in the route.
ok(!/\.eq\(\s*["']owner_user_id/.test(enroll) && !/select\([^)]*owner_user_id/.test(enroll), "does NOT use owner_user_id as the authorization boundary")
ok(/supabaseAdmin[\s\S]*\.update\(\{ followup_opt_in/.test(enroll), "writes followup_opt_in via the service role only")

// ── Admin route: platform-admin gated, service-role mutations ────────────────
console.log("ADMIN ROUTE — platform-admin gated grant/revoke")
const admin = read("app/api/admin/automated-texting/route.ts")
ok(/requirePlatformAdmin\(\)/.test(admin), "grant/revoke requires platform admin")
ok(/supabaseAdmin[\s\S]*from\("automated_texting_accounts"\)/.test(admin), "mutates the authorization table via the service role")
ok(/"grant"/.test(admin) && /"revoke"/.test(admin), "supports grant and revoke")

// ── Inert dual gate: BOTH account authorization AND enrollment ───────────────
console.log("INERT GATE — dual requirement")
const gate = read("lib/followup/gate.ts")
ok(/!lead\.accountAuthorized[\s\S]*"not_authorized"/.test(gate), "gate holds not_authorized when account is unauthorized")
ok(/!lead\.followupOptIn[\s\S]*"not_enrolled"/.test(gate), "gate holds not_enrolled when the lead isn't enrolled")
ok(
  gate.indexOf("accountAuthorized") < gate.indexOf("followupOptIn"),
  "account authorization is checked before enrollment",
)

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURE(S)`)
process.exit(failures === 0 ? 0 : 1)
