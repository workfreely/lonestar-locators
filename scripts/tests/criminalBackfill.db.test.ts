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
import { readFileSync } from "node:fs"
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

// ── ITS OWN DATABASE, ON THE SAME CLUSTER ───────────────────────────────────────────────────
// This file creates and DROPS public.property_catalog and public.property_approval_policy — it
// has to, because the .sql it runs names those tables and nothing else would be a real test of
// them. The database the HTTP suites use holds the same table names with the real schema in
// them, so running here would pull that stage down mid-run (it did). Hence a sibling database,
// created fresh, dropped at the end, and never the one the caller passed.
const ADMIN_DB = (() => { const u = new URL(DB.replace(/^postgresql:/, "http:")); u.pathname = "/postgres"; return u.toString().replace(/^http:/, "postgresql:") })()
const WORK_NAME = "lb_criminal_backfill_test"
const WORK_DB = (() => { const u = new URL(DB.replace(/^postgresql:/, "http:")); u.pathname = `/${WORK_NAME}`; return u.toString().replace(/^http:/, "postgresql:") })()
const admin = (q: string) => execFileSync(PSQL, ["-v", "ON_ERROR_STOP=1", "-tAX", "-d", ADMIN_DB, "-c", q], { encoding: "utf8" })
admin(`drop database if exists ${WORK_NAME} with (force)`)
admin(`create database ${WORK_NAME}`)
process.on("exit", () => { try { admin(`drop database if exists ${WORK_NAME} with (force)`) } catch { /* best effort */ } })

const sql = (q: string) => execFileSync(PSQL, ["-v", "ON_ERROR_STOP=1", "-tAX", "-d", WORK_DB, "-c", q], { encoding: "utf8" })
const file = (f: string) => execFileSync(PSQL, ["-v", "ON_ERROR_STOP=1", "-q", "-d", WORK_DB, "-f", f], { encoding: "utf8" })
const rows = <T,>(q: string): T[] => JSON.parse(sql(`select coalesce(json_agg(t),'[]')::text from (${q}) t`).trim())
const one = <T,>(q: string): T => rows<T>(q)[0]
const resolve = (n: string) => existsSync(`supabase/migrations/${n}`) ? `supabase/migrations/${n}` : `supabase/prepared/${n}`
const DDL = resolve("20261112000000_property_criminal_background.sql")
const BACKFILL = resolve("20261112000001_criminal_background_backfill.sql")
const ROLLBACK = "supabase/prepared/ROLLBACK_20261112000001_criminal_background_backfill.sql"

/** The EIGHT rows the live table actually holds, shaped exactly as production holds them — the
 *  property's own name inside the sentence and all. Read back from production on 2026-11-04;
 *  the per-column counts below are 6 / 6 / 5 / 6, which is why eight rows and not six. The
 *  raggedness is the point: Connemara and Canyon Oaks have a felony answer and no misdemeanor
 *  one, Alto and Icon the reverse, and Chase Hill carries both policies with no felony sentence.
 *  Names are the real ones; nothing here is a person, and nothing here is a renter's record. */
const LEGACY: [place: string, name: string, fp: string | null, mp: string | null, fr: string | null, mr: string | null][] = [
  ["p_alto",       "Alto",               null,            "Case-by-Case", null,                                                  "Alto - no time frame, case by case"],
  ["p_icon",       "Icon",               null,            "Case-by-Case", null,                                                  "Icon - no time frame - case by case"],
  ["p_heron",      "Heron at Hausman",   "Case-by-Case",  "Case-by-Case", "Heron at Hausman - 10 years old - nothing assault related", "Heron on Hausman - 7 years old - nothing assault related."],
  ["p_ellington",  "Ellington",          "Case-by-Case",  "Case-by-Case", "Ellington - 10 years old, non-violent charges",        "Ellington - no time frame, case by case"],
  ["p_canyonoaks", "Canyon Oaks",        "Case-by-Case",  null,           "Canyon Oaks - 7 years old",                            null],
  ["p_fairways",   "Fairways V",         "Case-by-Case",  "Case-by-Case", "Fairways V - 5-7 years old",                           "Fairways V - no time frame"],
  ["p_connemara",  "Connemara Estates",  "Case-by-Case",  null,           "Connemara Estates - 7 years old",                      null],
  ["p_chasehill",  "Chase Hill",         "Case-by-Case",  "Case-by-Case", null,                                                   "Chase Hill - no time frame - case by case"],
]
const q = (v: string | null) => (v === null ? "null" : `$lb$${v}$lb$`)

console.log("\nCRIMINAL BACKGROUND BACKFILL — the real .sql, on a throwaway database\n")

// ── A MINIMAL STAGE: the two tables the file names, and nothing else ────────────────────────
sql(`drop table if exists public.property_approval_policy cascade`)
sql(`drop table if exists public.property_catalog cascade`)
sql(`create table public.property_catalog (place_id text primary key, property_name text)`)
// The backfill's ordering guard reads the audit trail, so the stage needs it. Only the columns
// the guard names; this is not a copy of the production table.
sql(`drop table if exists public.property_enrichment_events cascade`)
sql(`create table public.property_enrichment_events (
       id bigserial primary key, place_id text, field_name text, action text,
       old_value text, new_value text, created_at timestamptz default now())`)
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

// THE NEIGHBOURS. Approval columns this file must not touch, carrying values before it runs.
sql(`alter table public.property_catalog
       add column credit_screening_notes text,
       add column credit_minimum_score integer,
       add column eviction_status text,
       add column broken_lease_status text`)

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
// One property an agent OPENED AND CLEARED back to Unknown — the case coalesce() cannot see,
// because a cleared column and an untouched column are both NULL. Only the audit row tells them
// apart, which is what the backfill's guard reads.
sql(`insert into public.property_catalog (place_id, property_name) values ('p_cleared', 'Deliberately Unknown')`)
sql(`insert into public.property_approval_policy (place_id, felony_policy, felony_restrictions)
     values ('p_cleared', 'Case-by-Case', $lb$Cleared - 7 years old$lb$)`)
sql(`insert into public.property_enrichment_events (place_id, field_name, action, old_value, new_value)
     values ('p_cleared', 'felony_policy', 'written', 'case_by_case', null)`)
// One property whose policy word is OUTSIDE the mapping.
sql(`insert into public.property_catalog (place_id, property_name) values ('p_odd', 'Odd Wording')`)
sql(`insert into public.property_approval_policy (place_id, felony_policy)
     values ('p_odd', 'Depends on corporate')`)

// Give every property an approval answer and a note that have nothing to do with this file.
sql(`update public.property_catalog
        set credit_screening_notes = 'Corporate reviews anything under 580.',
            credit_minimum_score   = 600,
            eviction_status        = 'not_accepted',
            broken_lease_status    = 'accepted_if_paid'`)
const NEIGHBOURS = `select md5(string_agg(place_id || coalesce(credit_screening_notes,'') ||
                      coalesce(credit_minimum_score::text,'') || coalesce(eviction_status,'') ||
                      coalesce(broken_lease_status,''), '|' order by place_id)) from public.property_catalog`
const neighboursBefore = sql(NEIGHBOURS).trim()

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
      where p.place_id not in ('p_agent', 'p_cleared')
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

console.log("\nTHE APPROVAL INFORMATION BESIDE IT IS PRESERVED")
{
  ok("every credit, eviction and broken-lease value is byte-identical after the backfill",
    sql(NEIGHBOURS).trim() === neighboursBefore)
  ok("…including the existing approval NOTES, which the file never names",
    one<{ n: number }>(`select count(*)::int as n from public.property_catalog
                         where credit_screening_notes = 'Corporate reviews anything under 580.'`).n ===
    one<{ n: number }>(`select count(*)::int as n from public.property_catalog`).n)
  // The SET list, read from the file itself rather than trusted.
  const setList = readFileSync(BACKFILL, "utf8").split(/\bfrom\s+public\.property_approval_policy/)[0]
  const named = [...setList.matchAll(/^\s*(?:set\s+)?([a-z_]+)\s*=/gm)].map((m) => m[1])
  ok("the file assigns exactly the seven criminal columns and nothing else",
    named.length === 7 && named.every((c) => c.startsWith("felony_") || c.startsWith("misdemeanor_") ||
      c === "background_screening_notes"), JSON.stringify(named))
}

console.log("\nA DELIBERATE CLEAR IS NOT REFILLED")
{
  const cleared = one<{ p: string | null; r: string | null }>(
    `select felony_policy as p, felony_restrictions as r from public.property_catalog where place_id='p_cleared'`)
  ok("a field an agent emptied on purpose stays empty", cleared.p === null, JSON.stringify(cleared))
  ok("…and the whole property is skipped, not just the one column", cleared.r === null)
  ok("the audit row that proves it was a clear is still there", one<{ n: number }>(
    `select count(*)::int as n from public.property_enrichment_events where place_id='p_cleared'`).n === 1)
  // And the guard is not over-broad: a property with history on an UNRELATED field is still
  // backfilled, because the guard names only the seven columns this file writes.
  sql(`insert into public.property_enrichment_events (place_id, field_name, action, new_value)
       values ('p_plain_1', 'send_commission', 'written', '100%')`)
  sql(`insert into public.property_approval_policy (place_id, felony_policy) values ('p_plain_1', 'Case-by-Case')`)
  file(BACKFILL)
  ok("a property whose history is on a DIFFERENT field is still backfilled", one<{ p: string | null }>(
    `select felony_policy as p from public.property_catalog where place_id='p_plain_1'`).p === "case_by_case")
}

console.log("\nTHE SOURCE TABLE IS ONLY READ")
{
  const src = one<{ n: number; fp: number; mp: number; fr: number; mr: number }>(
    `select count(*)::int as n, count(felony_policy)::int as fp, count(misdemeanor_policy)::int as mp,
            count(felony_restrictions)::int as fr, count(misdemeanor_restrictions)::int as mr
       from public.property_approval_policy`)
  // The eight live rows carry 6 felony policies, 6 misdemeanor policies, 5 felony sentences and
  // 6 misdemeanor sentences — the production counts exactly. The fixture adds four more source
  // rows of its own (agent-entered, odd wording, deliberately cleared, unrelated history), so:
  //   n  = 8 live + 4 fixture                                   = 12
  //   fp = 6 live + agent + odd + cleared + plain_1             = 10
  //   mp = 6 live                                               =  6
  //   fr = 5 live + agent + cleared                             =  7
  //   mr = 6 live                                               =  6
  ok("every source row still holds exactly what it held", src.n === 12 && src.fp === 10 && src.mp === 6 &&
    src.fr === 7 && src.mr === 6, JSON.stringify(src))
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
      where place_id in ('p_alto','p_icon','p_ellington','p_canyonoaks','p_fairways','p_connemara','p_chasehill')
        and (felony_policy is not null or misdemeanor_policy is not null
             or felony_restrictions is not null or misdemeanor_restrictions is not null)`)
  ok("everything the backfill wrote is back to NULL", rest.n === 0)
  const agent = one<{ p: string; r: string }>(
    `select felony_policy as p, felony_restrictions as r from public.property_catalog where place_id='p_agent'`)
  ok("the agent's own answer is untouched by the rollback too",
    agent.p === "not_considered" && agent.r === "Agent called: no felonies at all.")
}

sql(`drop table if exists public.property_enrichment_events cascade`)
sql(`drop table if exists public.property_approval_policy cascade`)
sql(`drop table if exists public.property_catalog cascade`)
console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"} — ${pass} passed, ${fail} failed\n`)
process.exit(fail === 0 ? 0 : 1)
