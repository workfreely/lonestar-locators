// SQL — a RETURNS TABLE column may never be referenced unqualified in a WHERE clause.
//
// THE PRODUCTION FAILURE THIS GUARDS. sa_connect_instagram RETURNS TABLE (id uuid, …), which makes
// `id` an in-scope PL/pgSQL OUT variable for the whole body. The reconnect UPDATE then read:
//
//     update public.social_connections set … where id = v_existing;
//
// PostgreSQL could not tell the OUT variable from social_connections.id and raised
// `column reference "id" is ambiguous`. Default plpgsql.variable_conflict is `error`, so it
// refuses rather than guessing. The exception propagated out of the RPC and every Instagram
// reconnect since 13 Sep 2026 failed with ?error=store, having written nothing.
//
// It is the SECOND time this codebase has hit it: 20260910000000_fix_lb_create_client_share_ambiguous
// fixed the identical defect in lb_create_client_share. Twice is a pattern, so this checks the
// whole class rather than the one function.
//
// ── ONLY THE EFFECTIVE DEFINITION IS JUDGED ─────────────────────────────────────────────────
// Superseded migrations legitimately still contain the bug — that is history, and rewriting
// history is how you lose the record of what actually ran. So for each function this takes the
// NEWEST definition by migration filename and checks only that one.
// Run: npx tsx scripts/social/sqlAmbiguity.test.ts
import { readFileSync, readdirSync } from "node:fs"

let pass = 0, fail = 0
const ok = (l: string, c: boolean, d = "") => {
  if (c) { pass++; console.log(`  ✓ ${l}`) } else { fail++; console.log(`  ✗ ${l}${d ? ` — ${d}` : ""}`) }
}

const DIR = "supabase/migrations"
const FN_RE =
  /create\s+(?:or\s+replace\s+)?function\s+([\w.]+)\s*\([\s\S]*?\)\s*returns\s+table\s*\(([\s\S]*?)\)\s*(?=language|as\b|security|set\b|stable|volatile|immutable)/gi

type Def = { file: string; fn: string; outs: string[]; body: string }

/** Every RETURNS TABLE function definition in a migration file. */
function definitions(file: string, sql: string): Def[] {
  const out: Def[] = []
  for (const m of sql.matchAll(FN_RE)) {
    const outs = m[2].split(",").map((c) => c.trim().split(/\s+/)[0]?.toLowerCase()).filter(Boolean) as string[]
    const start = m.index! + m[0].length
    const end = sql.slice(start).search(/\$(?:function)?\$\s*;/)
    out.push({ file, fn: m[1].toLowerCase(), outs, body: sql.slice(start, start + (end >= 0 ? end : 6000)) })
  }
  return out
}

/** Unqualified `where <out> =` — the exact shape PostgreSQL rejects. */
function collisions(d: Def): { col: string; line: string }[] {
  const hits: { col: string; line: string }[] = []
  for (const col of d.outs) {
    const re = new RegExp(`\\bwhere\\s+(?!\\w+\\.)${col}\\s*=`, "gi")
    for (const m of d.body.matchAll(re)) {
      const lineNo = d.body.slice(0, m.index!).split("\n").length - 1
      hits.push({ col, line: d.body.split("\n")[lineNo].trim() })
    }
  }
  return hits
}

const files = readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort()
const all: Def[] = []
for (const f of files) all.push(...definitions(f, readFileSync(`${DIR}/${f}`, "utf8")))

// Newest definition wins — filenames are timestamp-ordered.
const effective = new Map<string, Def>()
for (const d of all) effective.set(d.fn, d)

console.log(`1. SCANNED ${files.length} migrations · ${all.length} RETURNS TABLE definitions · ${effective.size} distinct functions`)

console.log("\n2. THE SCANNER FINDS A KNOWN-BAD DEFINITION (self-test):")
{
  // A scanner that cannot find the defect it was written for proves nothing about anything else.
  const known = all.find((d) => d.fn === "public.sa_connect_instagram" && d.file.startsWith("20261015"))
  ok("the pre-fix sa_connect_instagram definition is present to test against", !!known, "fixture missing")
  const found = known ? collisions(known) : []
  ok("…and the scanner detects its ambiguous `where id = v_existing`",
    found.some((h) => h.col === "id" && /where id = v_existing/.test(h.line)),
    JSON.stringify(found.map((h) => h.line)))

  // A synthetic control, so the detector is proven on a definition this repo does not contain.
  const synthetic = definitions("synthetic.sql", `
    create or replace function public.probe_fn(p_x uuid) returns table (id uuid, name text)
    language plpgsql as $$
    begin
      update public.widgets set name = 'x' where id = p_x;
      return query select w.id, w.name from public.widgets w;
    end $$;`)
  ok("CONTROL: a synthetic ambiguous function is detected", collisions(synthetic[0]).length === 1)

  const fixedSynthetic = definitions("synthetic.sql", `
    create or replace function public.probe_fn(p_x uuid) returns table (id uuid, name text)
    language plpgsql as $$
    begin
      update public.widgets w set name = 'x' where w.id = p_x;
      return query select w.id, w.name from public.widgets w;
    end $$;`)
  ok("CONTROL: the aliased version is NOT flagged", collisions(fixedSynthetic[0]).length === 0)
}

console.log("\n3. NO *NEW* EFFECTIVE DEFINITION CARRIES THE AMBIGUITY:")
{
  // THE KNOWN, DELIBERATELY UNFIXED THREE. All are the same statement shape:
  //     begin delete from vault.secrets where id = v_old_…; exception when others then null; end;
  // They are ambiguous, but the handler swallows the error, so they never surface — the only
  // consequence is that the superseded secret is not deleted. They sit in Meta Ads and TikTok,
  // outside this correction's scope, and fixing them would change behaviour in systems this
  // change is not allowed to touch. Listed here so they stay visible, and so that anything NEW
  // still fails this test.
  const KNOWN_SWALLOWED = new Set([
    "public.meta_connect:id",
    "public.sa_connect_tiktok:id",
    // sa_connect_instagram's vault cleanup carries the same shape and was DELIBERATELY left
    // unfixed in 20261024000000, so that correction changes exactly one statement. Tracked
    // separately. The FATAL predicate in its UPDATE is asserted fixed in section 4.
    "public.sa_connect_instagram:id",
  ])
  const unexpected: string[] = []
  const known: string[] = []
  for (const [fn, d] of [...effective.entries()].sort()) {
    for (const h of collisions(d)) {
      const line = `${fn} (${d.file}): ${h.line}`
      // Swallowed means wrapped in `begin … exception when others then null; end;` on one line.
      const swallowed = /exception\s+when\s+others\s+then\s+null/.test(h.line)
      if (KNOWN_SWALLOWED.has(`${fn}:${h.col}`) && swallowed) known.push(line)
      else unexpected.push(line)
    }
  }
  for (const k of known) console.log(`  · known & swallowed (out of scope): ${k.slice(0, 110)}`)
  for (const u of unexpected) console.log(`  ✗ ${u}`)
  ok("no UNEXPECTED collision in any effective definition", unexpected.length === 0,
    `${unexpected.length} unexpected`)
  ok("the known swallowed ones are exactly the four tracked separately", known.length === 4,
    `${known.length}`)
  // If someone fixes those, this reminds them to shrink the allow-list rather than leave it stale.
  ok("every allow-listed function still exists", [...KNOWN_SWALLOWED].every((k) => effective.has(k.split(":")[0])))
}

console.log("\n4. THE INSTAGRAM RECONNECT SPECIFICALLY:")
{
  const d = effective.get("public.sa_connect_instagram")!
  ok("the effective definition comes from the correction migration",
    d.file.startsWith("20261024"), d.file)
  ok("its UPDATE aliases the table", /update public\.social_connections sc/.test(d.body))
  ok("…and qualifies the predicate", /where sc\.id = v_existing/.test(d.body))
  // THE FATAL ONE IS GONE. The only `where id =` left must be the swallowed vault cleanup, which
  // cannot fail the function — leaving it is what keeps this correction to a single statement.
  const unqualified = [...d.body.matchAll(/\bwhere\s+id\s*=/gi)].map((m) => {
    const line = d.body.slice(0, m.index!).split("\n").length - 1
    return d.body.split("\n")[line].trim()
  })
  ok("the only unqualified `where id =` left is the swallowed vault cleanup",
    unqualified.length === 1 && /exception\s+when\s+others\s+then\s+null/.test(unqualified[0]),
    unqualified.join(" | "))
  ok("…and it is NOT the UPDATE predicate (that one is fixed)",
    !unqualified.some((l) => /v_existing/.test(l)))
  ok("the vault cleanup is left exactly as production has it, by choice",
    /delete from vault\.secrets where id = v_old_secret/.test(d.body))

  // THE SETTINGS A RECONNECT MUST NOT RESET. Still absent from the SET list, as before.
  const setList = d.body.slice(d.body.indexOf("update public.social_connections sc"), d.body.indexOf("where sc.id = v_existing"))
  for (const col of ["posting_paused", "posts_per_day", "stagger_offset_minutes", "label", "agent_user_id"]) {
    if (new RegExp(`\\b${col}\\s*=`).test(setList)) { fail++; console.log(`  ✗ the UPDATE now writes ${col} — a reconnect would reset it`) }
  }
  ok("the UPDATE still writes NONE of posting_paused / posts_per_day / stagger / label / agent_user_id", true)
  ok("it is still an UPDATE, never delete-and-insert (the row id is referenced elsewhere)",
    !/delete from public\.social_connections/.test(d.body))
  ok("the connection is still matched on (owner, provider, external_account_id)",
    /sc\.owner_user_id = v_uid and sc\.provider = 'instagram'/.test(d.body))
}

console.log("\n5. NOTHING ELSE IS DISTURBED:")
{
  const tt = effective.get("public.sa_connect_tiktok")!
  ok("TikTok's effective definition is NOT from the Instagram correction",
    !tt.file.startsWith("20261024"), tt.file)
  // TikTok was never affected by the fatal form: it upserts rather than updating by id.
  ok("TikTok reconnects via `on conflict … do update`, so it never had the fatal pattern",
    /on conflict[\s\S]{0,80}do update/i.test(tt.body))
  // TikTok DOES carry the swallowed vault-delete collision; what matters is that it has no
  // ambiguous predicate on a statement that can actually fail the function.
  const ttFatal = (tt.body.match(/\bwhere\s+id\s*=/gi) ?? []).filter((_, i) => {
    const idx = [...tt.body.matchAll(/\bwhere\s+id\s*=/gi)][i].index!
    const line = tt.body.slice(0, idx).split("\n").length - 1
    return !/exception\s+when\s+others\s+then\s+null/.test(tt.body.split("\n")[line])
  })
  ok("TikTok has no UNGUARDED unqualified `where id =` (its one collision is swallowed)",
    ttFatal.length === 0, `${ttFatal.length} unguarded`)

  const fix = readFileSync(`${DIR}/20261024000000_fix_sa_connect_instagram_ambiguous.sql`, "utf8")
  // STRIP COMMENTS FIRST. The header explains the fix and names `create or replace function` in
  // prose; counting that as a second definition is how a test fails for the wrong reason.
  const code = fix.replace(/--[^\n]*/g, "")
  ok("the correction defines ONLY sa_connect_instagram",
    (code.match(/create\s+(?:or\s+replace\s+)?function/gi) ?? []).length === 1,
    `${(code.match(/create\s+(?:or\s+replace\s+)?function/gi) ?? []).length}`)
  // And strip the dollar-quoted BODY — whatever tag it uses. The body legitimately contains the
  // UPDATE and INSERT; what must be absent is DML/DDL at migration level, outside the function.
  const outsideBody = code.replace(/\$(\w*)\$[\s\S]*?\$\1\$/g, "")
  ok("…and runs no DDL on a table, index, policy, type or trigger",
    !/\b(create|alter|drop)\s+(table|index|policy|type|trigger)\b/i.test(outsideBody))
  ok("…and runs no INSERT / UPDATE / DELETE at migration level",
    !/\b(insert|update|delete)\s+(into\s+)?public\./i.test(outsideBody))
  ok("…and is a create-or-replace, so it is re-runnable", /create or replace function/i.test(fix))
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
