/**
 * THE PROPOSED BACKFILL, RUN FOR REAL — against a throwaway database, never production.
 *
 * 20261112000001 copies the criminal answer that already exists in property_approval_policy into
 * the columns the editor reads. It is the one file in this change that touches DATA, so it is the
 * one that has to be watched hardest. What this proves, by running the actual .sql:
 *
 *   • THE MAPPING. 'Case-by-Case' — the only value the live table holds — becomes the token
 *     'case_by_case', which the CHECK constraint accepts. A word outside the mapping is left NULL
 *     and reported, never bent to the nearest token.
 *   • THE PROSE IS NOT TOUCHED. "Heron at Hausman - 10 years old - nothing assault related"
 *     arrives character for character.
 *   • NOTHING IS INFERRED. The ten years inside that sentence does NOT become a lookback, and
 *     "nothing assault related" does NOT become a restricted category. Both stay NULL.
 *   • IT CANNOT OVERWRITE. A column an agent has already filled keeps its value, and running the
 *     file twice changes nothing the second time.
 *   • THE ROLLBACK IS SURGICAL. It clears what the backfill copied and leaves an agent's own
 *     edit alone.
 *
 * SETUP (no app build, no Supabase, no Docker):
 *   DB=$(bash scripts/tests/approvalCriteria.localdb.sh start)
 *   APPROVAL_TEST_DATABASE_URL=$DB npx tsx scripts/tests/criminalBackfill.db.test.ts
 *   bash scripts/tests/approvalCriteria.localdb.sh stop
 */
import { execFileSync } from "node:child_process"
import { existsSync } from "node:fs"

let pass = 0
let fail = 0
const ok = (l: string, c: boolean, d = "") => {
  if (c) { pass++; console.log(`  ✓ ${l}`) }
  else { fail++; console.log(`  ✗ ${l}${d ? `\n      ${d}` : ""}`) }
}

const DB = process.env.APPROVAL_TEST_DATABASE_URL
if (!DB) {
  console.log(
    "\nSKIPPED — no throwaway database.\n" +
    "  DB=$(bash scripts/tests/approvalCriteria.localdb.sh start)\n" +
    "  APPROVAL_TEST_DATABASE_URL=$DB npx tsx scripts/tests/criminalBackfill.db.test.ts\n\n" +
    "0 passed, 0 failed (skipped)\n")
  process.exit(0)
}
{
  const h = new URL(DB.replace(/^postgresql:/, "http:")).hostname
  if (h !== "127.0.0.1" && h !== "localhost") {
    console.error(`\nREFUSED: ${h} is not loopback. This test WRITES.\n`)
    process.exit(2)
  }
}

const PSQL = ["/opt/homebrew/opt/postgresql@17/bin/psql", "/opt/homebrew/opt/postgresql@16/bin/psql", "psql"]
  .find((p) => { try { execFileSync(p, ["--version"], { stdio: "ignore" }); return true } catch { return false } })!
const sql = (q: string) => execFileSync(PSQL, ["-v", "ON_ERROR_STOP=1", "-tAX", "-d", DB, "-c", q], { encoding: "utf8" })
const file = (f: string) => execFileSync(PSQL, ["-v", "ON_ERROR_STOP=1", "-q", "-d", DB, "-f", f], { encoding: "utf8" })
const rows = <T,>(q: string): T[] => JSON.parse(sql(`select coalesce(json_agg(t),'[]')::text from (${q}) t`).trim())
const one = <T,>(q: string): T => rows<T>(q)[0]
const resolve = (n: string) => existsSync(`supabase/migrations/${n}`) ? `supabase/migrations/${n}` : `supabase/prepared/${n}`
const DDL = resolve("20261112000000_property_criminal_background.sql")
const BACKFILL = resolve("20261112000001_criminal_background_backfill.sql")
const ROLLBACK = "supabase/prepared/ROLLBACK_20261112000001_criminal_background_backfill.sql"

/** The six rows the live table actually holds, shaped exactly as production holds them — the
 *  property's own name inside the sentence and all. Names are the real ones; nothing here is a
 *  person, and nothing here is a renter's record. */
const LEGACY: [place: string, name: string, fp: string | null, mp: string | null, fr: string | null, mr: string | null][] = [
  ["p_alto",       "Alto",               null,            "Case-by-Case", null,                                                  "Alto - no time frame, case by case"],
  ["p_icon",       "Icon",               null,            "Case-by-Case", null,                                                  "Icon - no time frame - case by case"],
  ["p_heron",      "Heron at Hausman",   "Case-by-Case",  "Case-by-Case", "Heron at Hausman - 10 years old - nothing assault related", "Heron on Hausman - 7 years old - nothing assault related."],
  ["p_ellington",  "Ellington",          "Case-by-Case",  "Case-by-Case", "Ellington - 10 years old, non-violent charges",        "Ellington - no time frame, case by case"],
  ["p_canyonoaks", "Canyon Oaks",        "Case-by-Case",  null,           "Canyon Oaks - 7 years old",                            null],
  ["p_fairways",   "Fairways V",         "Case-by-Case",  "Case-by-Case", "Fairways V - 5-7 years old",                           "Fairways V - no time frame"],
]
const q = (v: string | null) => (v === null ? "null" : `$lb$${v}$lb$`)

console.log("\nCRIMINAL BACKGROUND BACKFILL — the real .sql, on a throwaway database\n")

// ── A MINIMAL STAGE: the two tables the file names, and nothing else ────────────────────────
sql(`drop table if exists public.property_approval_policy cascade`)
sql(`drop table if exists public.property_catalog cascade`)
sql(`create table public.property_catalog (place_id text primary key, property_name text)`)
sql(`create table public.property_approval_policy (
       place_id text primary key references public.property_catalog(place_id) on delete cascade,
       felony_policy text, felony_min_age_years integer, felony_restrictions text,
       misdemeanor_policy text, misdemeanor_min_age_years integer, misdemeanor_restrictions text,
       background_screening_notes text)`)
file(DDL)
ok("the schema migration applies to a table that has never seen it", true)
// `as ty`, not `as t`: the json_agg wrapper aliases its subquery `t`, and a column also named
// `t` wins the reference — which silently aggregates strings instead of row objects.
ok("…and the category column really is text[]", one<{ ty: string }>(
  `select format_type(atttypid, atttypmod) as ty from pg_attribute
    where attrelid='public.property_catalog'::regclass and attname='criminal_restricted_offense_types'`).ty === "text[]")

// Four properties with no criminal answer at all, to prove the file touches only what it should.
for (let i = 1; i <= 4; i++) sql(`insert into public.property_catalog values ('p_plain_${i}', 'Plain ${i}')`)
for (const [place, name, fp, mp, fr, mr] of LEGACY) {
  sql(`insert into public.property_catalog values ('${place}', ${q(name)})`)
  sql(`insert into public.property_approval_policy
         (place_id, felony_policy, misdemeanor_policy, felony_restrictions, misdemeanor_restrictions)
       values ('${place}', ${q(fp)}, ${q(mp)}, ${q(fr)}, ${q(mr)})`)
}
// One property an agent has already answered BY HAND, and whose answer disagrees with the import.
sql(`insert into public.property_catalog (place_id, property_name, felony_policy, felony_restrictions)
     values ('p_agent', 'Agent Entered', 'not_considered', $lb$Agent called: no felonies at all.$lb$)`)
sql(`insert into public.property_approval_policy (place_id, felony_policy, felony_restrictions)
     values ('p_agent', 'Case-by-Case', $lb$Agent Entered - 5 years old$lb$)`)
// One property whose policy word is OUTSIDE the mapping.
sql(`insert into public.property_catalog (place_id, property_name) values ('p_odd', 'Odd Wording')`)
sql(`insert into public.property_approval_policy (place_id, felony_policy)
     values ('p_odd', 'Depends on corporate')`)

console.log("running the backfill")
file(BACKFILL)
ok("it applies without error", true)

console.log("\nTHE MAPPING")
{
  const mapped = rows<{ place_id: string; felony_policy: string | null; misdemeanor_policy: string | null }>(
    `select place_id, felony_policy, misdemeanor_policy from public.property_catalog
      where place_id like 'p\\_%' order by place_id`)
  const by = Object.fromEntries(mapped.map((r) => [r.place_id, r]))
  ok("'Case-by-Case' became the token 'case_by_case'", by.p_heron.felony_policy === "case_by_case" &&
    by.p_heron.misdemeanor_policy === "case_by_case", JSON.stringify(by.p_heron))
  ok("a property with only a misdemeanor answer gets only that one",
    by.p_alto.felony_policy === null && by.p_alto.misdemeanor_policy === "case_by_case")
  ok("a property with only a felony answer gets only that one",
    by.p_canyonoaks.felony_policy === "case_by_case" && by.p_canyonoaks.misdemeanor_policy === null)
  ok("a word outside the mapping stays NULL — it is not bent to the nearest token",
    by.p_odd.felony_policy === null)
  ok("the four properties with no answer are untouched",
    [1, 2, 3, 4].every((i) => by[`p_plain_${i}`].felony_policy === null && by[`p_plain_${i}`].misdemeanor_policy === null))
  ok("the stored token passes the CHECK constraint, which is the whole point of mapping it", (() => {
    try { sql(`update public.property_catalog set felony_policy = felony_policy where felony_policy is not null`); return true }
    catch { return false }
  })())
}

console.log("\nTHE PROSE IS NOT TOUCHED")
{
  const same = rows<{ place_id: string; f: boolean; m: boolean }>(
    `select p.place_id,
            (c.felony_restrictions      is not distinct from nullif(btrim(p.felony_restrictions), ''))      as f,
            (c.misdemeanor_restrictions is not distinct from nullif(btrim(p.misdemeanor_restrictions), '')) as m
       from public.property_approval_policy p join public.property_catalog c on c.place_id = p.place_id
      where p.place_id <> 'p_agent'
      order by p.place_id`)
  ok("every sentence arrives character for character", same.every((r) => r.f && r.m),
    JSON.stringify(same.filter((r) => !r.f || !r.m)))
  ok("including the one that names the property and the years",
    one<{ r: string }>(`select felony_restrictions as r from public.property_catalog where place_id='p_heron'`).r ===
    "Heron at Hausman - 10 years old - nothing assault related")
}

console.log("\nNOTHING IS INFERRED")
{
  const inferred = one<{ ages: number; basis: number; cats: number }>(
    `select count(felony_min_age_years) + count(misdemeanor_min_age_years) as ages,
            count(criminal_lookback_basis) as basis,
            count(criminal_restricted_offense_types) as cats
       from public.property_catalog`)
  ok("no lookback was read out of '10 years old'", inferred.ages === 0, JSON.stringify(inferred))
  ok("no basis was invented — the sentences never say offense or conviction", inferred.basis === 0)
  ok("'nothing assault related' did NOT become a restricted category", inferred.cats === 0)
  ok("…so a future Quick Match filter cannot act on a guess, only on what an agent enters", inferred.cats === 0)
}

console.log("\nIT CANNOT OVERWRITE AN AGENT")
{
  const agent = one<{ p: string; r: string }>(
    `select felony_policy as p, felony_restrictions as r from public.property_catalog where place_id='p_agent'`)
  ok("the agent's token survives the import's disagreement", agent.p === "not_considered", JSON.stringify(agent))
  ok("…and so does the agent's sentence", agent.r === "Agent called: no felonies at all.")
  const before = sql(`select md5(string_agg(place_id || coalesce(felony_policy,'') || coalesce(misdemeanor_policy,'') ||
                        coalesce(felony_restrictions,'') || coalesce(misdemeanor_restrictions,''), '|' order by place_id))
                      from public.property_catalog`).trim()
  file(BACKFILL)
  const after = sql(`select md5(string_agg(place_id || coalesce(felony_policy,'') || coalesce(misdemeanor_policy,'') ||
                        coalesce(felony_restrictions,'') || coalesce(misdemeanor_restrictions,''), '|' order by place_id))
                     from public.property_catalog`).trim()
  ok("running the file a second time changes nothing at all", before === after, `${before} vs ${after}`)
}

console.log("\nTHE SOURCE TABLE IS ONLY READ")
{
  const src = one<{ n: number; fp: number; mp: number; fr: number; mr: number }>(
    `select count(*)::int as n, count(felony_policy)::int as fp, count(misdemeanor_policy)::int as mp,
            count(felony_restrictions)::int as fr, count(misdemeanor_restrictions)::int as mr
       from public.property_approval_policy`)
  // 6 felony policies (4 of the six live rows + the agent-entered one + the odd wording),
  // 5 felony sentences, 5 misdemeanor policies, 5 misdemeanor sentences — the fixture's own
  // shape, counted rather than assumed.
  ok("every source row still holds exactly what it held", src.n === 8 && src.fp === 6 && src.mp === 5 &&
    src.fr === 5 && src.mr === 5, JSON.stringify(src))
}

console.log("\nTHE ROLLBACK IS SURGICAL")
{
  // An agent corrects an imported value AFTER the backfill. The rollback must not touch it.
  sql(`update public.property_catalog set felony_policy='considered' where place_id='p_heron'`)
  file(ROLLBACK)
  const heron = one<{ p: string | null; r: string | null }>(
    `select felony_policy as p, felony_restrictions as r from public.property_catalog where place_id='p_heron'`)
  ok("a value the agent changed after the import is LEFT ALONE", heron.p === "considered", JSON.stringify(heron))
  ok("…while the prose it copied is cleared", heron.r === null)
  const rest = one<{ n: number }>(
    `select count(*)::int as n from public.property_catalog
      where place_id in ('p_alto','p_icon','p_ellington','p_canyonoaks','p_fairways')
        and (felony_policy is not null or misdemeanor_policy is not null
             or felony_restrictions is not null or misdemeanor_restrictions is not null)`)
  ok("everything the backfill wrote is back to NULL", rest.n === 0)
  const agent = one<{ p: string; r: string }>(
    `select felony_policy as p, felony_restrictions as r from public.property_catalog where place_id='p_agent'`)
  ok("the agent's own answer is untouched by the rollback too",
    agent.p === "not_considered" && agent.r === "Agent called: no felonies at all.")
}

sql(`drop table if exists public.property_approval_policy cascade`)
sql(`drop table if exists public.property_catalog cascade`)
console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"} — ${pass} passed, ${fail} failed\n`)
process.exit(fail === 0 ? 0 : 1)
