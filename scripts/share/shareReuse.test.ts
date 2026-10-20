/**
 * SEND LIST MUST HAND BACK A LIST THE CLIENT CAN STILL CHOOSE FROM.
 *
 *   npx tsx scripts/share/shareReuse.test.ts
 *
 * The bug this pins: pressing Send List for Reagan kept returning list #16 — a share she had
 * already completed at 15:41 — instead of producing a selectable one. The page then rendered
 * exactly as designed for a finished list: `done_selecting_at` drives initialDoneSelecting,
 * which hides the sticky "Done Selecting Favorites" bar. So the link opened with no way to
 * choose anything, and re-sending could never fix it, because re-sending returned the same
 * finished share every time.
 *
 * Reuse itself is correct and stays: one stable link per unchanged list beats a new URL per
 * press. What was wrong was the definition of a reusable share. "Not sent, not disabled, not
 * revoked" let a COMPLETED share qualify — and sent_at did not save us, because it is only
 * stamped on some send paths (4 of 30 shares carry it), so an unstamped finished share stayed
 * the newest candidate forever once its contents settled.
 *
 * The live catalog is the source of truth here, not the migration file — a migration that was
 * never applied would otherwise pass. See [[migration-ledger-is-stale]].
 */
import { readFileSync, existsSync } from "node:fs"
import { join } from "node:path"
import { execFileSync } from "node:child_process"

let pass = 0
let fail = 0
const ok = (label: string, cond: boolean, detail = "") => {
  if (cond) { pass++; console.log(`  ✓ ${label}`) } else { fail++; console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`) }
}

const urls = ["supabase/.temp/pooler-url",
  "/Users/jaymorris/Desktop/Lone Star Locators Master/lonestar-locators-app/supabase/.temp/pooler-url"]
const urlPath = urls.find((p) => existsSync(p))

if (!urlPath) {
  console.log("  … skipped: no pooler-url\n")
  process.exit(0)
}

const url = readFileSync(urlPath, "utf8").trim()
const q = (sql: string) => execFileSync("psql", [url, "-At", "-c", sql], { encoding: "utf8", timeout: 60_000 }).trim()

let src = ""
try {
  src = q("select pg_get_functiondef(oid) from pg_proc where proname = 'lb_prepare_client_share';")
} catch (e) {
  console.log(`  … skipped: psql unavailable (${(e as Error).message.split("\n")[0]})\n`)
  process.exit(0)
}

console.log("\n=== 1. A COMPLETED SHARE IS NOT A REUSE CANDIDATE ===")
{
  ok("the function exists", src.length > 0)
  ok("completed shares are excluded", /and s\.done_selecting_at is null/.test(src))
  // The guard must sit in the CANDIDATE query, beside the other exclusions — not somewhere
  // later where a candidate has already been chosen.
  const candidate = src.slice(src.indexOf("into v_existing"), src.indexOf("if v_existing is not null"))
  ok("…in the candidate query itself", /done_selecting_at is null/.test(candidate))
  for (const keep of ["sent_at is null", "disabled_at is null", "revoked_at is null"]) {
    ok(`the existing exclusion "${keep}" is kept`, candidate.includes(keep))
  }
  ok("still the newest-first pick", /order by s\.list_number desc/.test(candidate))
}

console.log("\n=== 2. ONLY ONE SIGNATURE, SO NO OVERLOAD CAN SHADOW IT ===")
{
  // A defaulted parameter would create an overload rather than a replacement, and calls would
  // become ambiguous. This has bitten this codebase before.
  const sigs = q("select count(*) from pg_proc where proname = 'lb_prepare_client_share';")
  ok(`exactly one lb_prepare_client_share (${sigs})`, sigs === "1", sigs)
  const args = q("select pg_get_function_identity_arguments(oid) from pg_proc where proname = 'lb_prepare_client_share';")
  ok("the signature is unchanged",
    args === "p_lead_id bigint, p_token_hash text, p_token_prefix text, p_raw_token text", args)
}

console.log("\n=== 3. EVERYTHING ELSE ABOUT REUSE IS UNTOUCHED ===")
{
  ok("the fingerprint still compares current against snapshot",
    /if v_cur_fp is not distinct from v_snap_fp then/.test(src))
  ok("a match still reuses, and still reports reused=true", /return query select v_existing, v_list_no, coalesce\(v_count, 0\), true;/.test(src))
  ok("a mismatch still falls through to create", /from public\.lb_create_client_share\(p_lead_id, p_token_hash, p_token_prefix, p_raw_token\)/.test(src))
  ok("the snapshot side still hashes the average-rent inputs",
    /avg_rent_quoted_rent::text/.test(src) && /avg_rent_lease_months::text/.test(src))
  ok("…and the washer/dryer status", /washer_dryer_status/.test(src))
  ok("workspace membership is still enforced", /is_active_workspace_member/.test(src))
}

console.log("\n=== 4. THE LIVE DATA AGREES ===")
{
  // Reproduce the candidate query both ways against real rows.
  const withoutFix = q(
    "select coalesce((select s.list_number::text from public.client_recommendation_shares s " +
    "where s.lead_id=94 and s.sent_at is null and s.disabled_at is null and s.revoked_at is null " +
    "order by s.list_number desc limit 1),'none');")
  const withFix = q(
    "select coalesce((select s.list_number::text from public.client_recommendation_shares s " +
    "where s.lead_id=94 and s.sent_at is null and s.disabled_at is null and s.revoked_at is null " +
    "and s.done_selecting_at is null order by s.list_number desc limit 1),'none');")
  ok(`the old rule picked the completed list (#${withoutFix})`, withoutFix === "16", withoutFix)
  ok(`the new rule picks a selectable one (#${withFix})`, withFix !== withoutFix && withFix !== "none", withFix)

  const done = q("select coalesce(done_selecting_at::text,'null') from public.client_recommendation_shares " +
    `where lead_id=94 and list_number=${withFix};`)
  ok("…and that one has no completion stamp, so the bar renders", done === "null", done)

  // No share anywhere should be BOTH a live reuse candidate and already completed.
  const bad = q("select count(*) from public.client_recommendation_shares " +
    "where sent_at is null and disabled_at is null and revoked_at is null and done_selecting_at is not null " +
    "and id = (select s2.id from public.client_recommendation_shares s2 where s2.lead_id = " +
    "client_recommendation_shares.lead_id and s2.sent_at is null and s2.disabled_at is null " +
    "and s2.revoked_at is null and s2.done_selecting_at is null order by s2.list_number desc limit 1);")
  ok("no lead's chosen candidate is a completed share", bad === "0", bad)
}

console.log(fail === 0 ? `\nALL PASS ✅ (${pass} passed, ${fail} failed)\n` : `\n${pass} passed, ${fail} failed\n`)
process.exit(fail === 0 ? 0 : 1)
