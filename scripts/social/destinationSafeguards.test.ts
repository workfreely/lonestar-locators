// The two safeguards that let a SECOND Instagram destination exist without disturbing the first.
//
//   1. The Comments screen picks its account deterministically, and by permission rather than by
//      position (pickCommentsConnection).
//   2. A newly authorized destination arrives with posting_paused = true, so it cannot enter the
//      Autopilot rotation before someone resumes it.
//
// The second one lives in the DATABASE, as a column default. A test cannot assert a default it
// cannot query, so what is asserted here is the thing that makes the default GOVERN: neither
// connect RPC names posting_paused in its INSERT, and neither names it in its reconnect UPDATE.
// If someone adds it to an INSERT, the default stops deciding and these tests say so.
import { readFileSync, readdirSync } from "node:fs"
import { pickCommentsConnection, hasCommentsScope } from "@/lib/social/commentsAccount"
import { INSTAGRAM_COMMENTS_SCOPE } from "@/lib/social/commentScope"
import { INSTAGRAM_SCOPES, INSTAGRAM_ADMIN_SCOPES } from "@/lib/social/instagram"

let pass = 0
let fail = 0
function ok(name: string, cond: boolean, detail = "") {
  if (cond) { pass++; console.log(`  ✓ ${name}`) }
  else { fail++; console.log(`  ✗ ${name}${detail ? `  — ${detail}` : ""}`) }
}

const read = (p: string) => readFileSync(p, "utf8")
/** SQL with -- line comments stripped, so an assertion can never be satisfied by prose. */
const sql = (s: string) => s.replace(/--[^\n]*/g, "")
/** TS/JS with // and block comments stripped, for the same reason. */
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "")

// ── 1. THE COMMENTS ACCOUNT PICKER ────────────────────────────────────────────────────────────
console.log("the Comments screen picks ONE account, deterministically:")

const PROD = {
  id: "5ea0e810-f608-404d-8277-98169af785c9",
  provider: "instagram",
  scopes: [...INSTAGRAM_ADMIN_SCOPES],
  created_at: "2026-09-12T06:12:37.614195+00:00",
}
// What SATX looks like once connected through the invitation flow: publishing scopes only.
const SATX = {
  id: "0a0a0a0a-0000-4000-8000-000000000001",
  provider: "instagram",
  scopes: [...INSTAGRAM_SCOPES],
  created_at: "2026-10-23T12:00:00.000000+00:00",
}
const TIKTOK = {
  id: "ebf475cf-cb0c-4c6b-8af2-99e89c84bc65",
  provider: "tiktok",
  scopes: ["video.publish", "user.info.basic"],
  created_at: "2026-09-20T01:06:33.720879+00:00",
}

ok("today's single-account workspace still resolves to the production account",
  pickCommentsConnection([TIKTOK, PROD])?.id === PROD.id)

// THE REGRESSION THIS EXISTS FOR. Both orders must give the same answer; `.find()` did not.
ok("with SATX connected, the production account still wins (prod first)",
  pickCommentsConnection([PROD, SATX, TIKTOK])?.id === PROD.id)
ok("…and wins just the same when SATX is returned first",
  pickCommentsConnection([SATX, PROD, TIKTOK])?.id === PROD.id)
ok("…and when TikTok sorts ahead of both",
  pickCommentsConnection([TIKTOK, SATX, PROD])?.id === PROD.id)

// Every permutation, so "deterministic" is demonstrated rather than claimed.
const perms = <T,>(xs: T[]): T[][] =>
  xs.length <= 1 ? [xs] : xs.flatMap((x, i) => perms([...xs.slice(0, i), ...xs.slice(i + 1)]).map((r) => [x, ...r]))
const answers = new Set(perms([PROD, SATX, TIKTOK]).map((p) => pickCommentsConnection(p)?.id))
ok(`all 6 row orders give ONE answer (${answers.size} distinct)`, answers.size === 1 && answers.has(PROD.id))

// It is the PERMISSION that decides, not the age — proven by making SATX the older row.
const OLD_SATX = { ...SATX, created_at: "2020-01-01T00:00:00.000000+00:00" }
ok("an OLDER publishing-only account still does not take the screen",
  pickCommentsConnection([OLD_SATX, PROD])?.id === PROD.id,
  "age must not outrank the comments permission")

// Age only decides among accounts that can all do comments.
const SECOND_ADMIN = { ...SATX, scopes: [...INSTAGRAM_ADMIN_SCOPES] }
ok("between two comment-capable accounts, the established one wins",
  pickCommentsConnection([SECOND_ADMIN, PROD])?.id === PROD.id)
ok("…and that is stable in the other order too",
  pickCommentsConnection([PROD, SECOND_ADMIN])?.id === PROD.id)

// Totality / edges.
ok("no Instagram connection → null", pickCommentsConnection([TIKTOK]) === null)
ok("empty list → null", pickCommentsConnection([]) === null)
ok("null/undefined input → null", pickCommentsConnection(null) === null && pickCommentsConnection(undefined) === null)
ok("a row with no scopes field does not throw",
  pickCommentsConnection([{ id: "x", provider: "instagram" }])?.id === "x")
// An unparseable date must not sort as "oldest" and steal the account.
ok("an unparseable created_at loses to a real one rather than winning",
  pickCommentsConnection([
    { ...PROD, id: "bad", created_at: "not-a-date" },
    { ...PROD, id: "good" },
  ])?.id === "good")
ok("identical created_at falls back to the lower id, both orders",
  pickCommentsConnection([{ ...PROD, id: "b" }, { ...PROD, id: "a" }])?.id === "a" &&
  pickCommentsConnection([{ ...PROD, id: "a" }, { ...PROD, id: "b" }])?.id === "a")
ok("the input array is not mutated",
  (() => { const xs = [SATX, PROD]; pickCommentsConnection(xs); return xs[0].id === SATX.id })())

ok("hasCommentsScope agrees with the constant the poller gates on",
  hasCommentsScope(PROD) && !hasCommentsScope(SATX) &&
  INSTAGRAM_COMMENTS_SCOPE === "instagram_business_manage_comments")

// The structural reason SATX cannot take the screen: the invite flow never asks for the scope.
ok("the invitation flow does NOT request the comments scope",
  !(INSTAGRAM_SCOPES as readonly string[]).includes(INSTAGRAM_COMMENTS_SCOPE))
ok("…and the admin flow does", (INSTAGRAM_ADMIN_SCOPES as readonly string[]).includes(INSTAGRAM_COMMENTS_SCOPE))

// ── 2. THE PAGE ACTUALLY USES IT ──────────────────────────────────────────────────────────────
console.log("\nthe Comments page is wired to the picker, not to .find():")
const page = read("app/admin/social-autopilot/comments/page.tsx")
const pageCode = code(page)
ok("the stripper works (this file's own prose is gone)", !pageCode.includes("DETERMINISTIC, and chosen by permission"))
ok("pickCommentsConnection is called", /pickCommentsConnection\(connections\)/.test(pageCode))
ok("the old first-match lookup is gone",
  !/connections\.find\s*\(\s*\([a-z]\)\s*=>\s*\1?\.?[a-z]*\.provider\s*===\s*["']instagram["']/.test(pageCode),
  "a .find() on provider is back")
ok("created_at is selected, so the tiebreaker has data", /select\([^)]*created_at/.test(pageCode))

// ── 3. THE PAUSE DEFAULT ──────────────────────────────────────────────────────────────────────
console.log("\nnew destinations arrive paused:")

const MIG = "supabase/migrations/20261105000000_new_destinations_start_paused.sql"
const migRaw = read(MIG)
const migSql = sql(migRaw)
ok("the SQL stripper works (the file's own prose is gone)", !migSql.includes("THE PROBLEM"))
ok("the migration sets the default to true",
  /alter\s+table\s+public\.social_connections\s+alter\s+column\s+posting_paused\s+set\s+default\s+true/is.test(migSql))
ok("it does NOT rewrite existing rows",
  !/\bupdate\s+public\.social_connections\b/i.test(migSql) && !/\bset\s+posting_paused\s*=/i.test(migSql),
  "an UPDATE would change established accounts' pause state")
ok("it does not drop or re-add the column", !/\bdrop\s+column\b/i.test(migSql) && !/\badd\s+column\b/i.test(migSql))

// The default only decides if the INSERTs stay silent about the column.
const migrations = readdirSync("supabase/migrations").filter((f) => f.endsWith(".sql"))
const rpcFile = (fn: string) =>
  migrations.filter((f) => read(`supabase/migrations/${f}`).includes(`function public.${fn}`)).sort().at(-1)

for (const fn of ["sa_connect_instagram", "sa_consume_destination_invitation"]) {
  const f = rpcFile(fn)
  ok(`${fn}: a definition was found`, !!f, "cannot assert against a function that is not there")
  if (!f) continue
  const body = sql(read(`supabase/migrations/${f}`))
  const inserts = [...body.matchAll(/insert\s+into\s+public\.social_connections\s*\(([^)]*)\)/gis)].map((m) => m[1])
  ok(`${fn}: has an INSERT into social_connections`, inserts.length > 0)
  ok(`${fn}: its INSERT does NOT name posting_paused (so the default governs)`,
    inserts.every((cols) => !/\bposting_paused\b/i.test(cols)),
    inserts.find((c) => /posting_paused/i.test(c))?.trim())
  // A reconnect must not reset an established account in EITHER direction.
  const updates = [...body.matchAll(/update\s+public\.social_connections[\s\S]*?where/gi)].map((m) => m[0])
  ok(`${fn}: its reconnect UPDATE does not touch posting_paused`,
    updates.every((u) => !/\bposting_paused\b/i.test(u)))
}

// The planner's rule is what the default is defending against; pin the shape it depends on.
const planner = code(read("lib/social/autopilotPlanRun.ts"))
ok("the planner still gates enablement on posting_paused !== true",
  /posting_paused\s*!==\s*true/.test(planner),
  "if this changed, the pause default no longer keeps an account out of the rotation")

console.log(`\nDestination safeguards: ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
