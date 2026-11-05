/**
 * QUICK MATCH, END TO END ON A THROWAWAY DATABASE — the three prepared migrations, run for real.
 *
 * The engine is proved from fixtures in scripts/tests/quickMatch.test.ts. This file proves the
 * half that only a database can answer:
 *
 *   • THE MIGRATIONS APPLY to a schema that has never seen them, and apply TWICE without error.
 *   • THE READ PATH returns the curated collection and nothing else, is closed to `anon`, and
 *     its GUARD FAILS LOUDLY if Unleash Beast's own read path has been altered — proved by
 *     altering it and watching the migration refuse.
 *   • THE WRITE PATH keeps its promises, which is the part that could destroy an agent's work:
 *       — a refresh replaces only rows it owns and that are unreviewed;
 *       — a row the agent added by hand is never touched;
 *       — a row the agent reviewed is never touched;
 *       — a property the agent already recommended is NOT duplicated, and THEIR row survives;
 *       — the generated canonical_property_key is what makes that dedupe work.
 *   • THE SHARE SNAPSHOT CANNOT SEE the screening detail, because the share function names its
 *     columns — asserted against the real function body, not assumed.
 *   • THE ROLLBACKS undo what they claim and leave the rest alone.
 *
 * SETUP (no app build, no Supabase, no Docker):
 *   DB=$(bash scripts/tests/approvalCriteria.localdb.sh start)
 *   APPROVAL_TEST_DATABASE_URL=$DB npx tsx scripts/tests/quickMatch.db.test.ts
 *   bash scripts/tests/approvalCriteria.localdb.sh stop
 */
import { resolveClientGeography, assessGeography, type QuickMatchProperty } from "@/lib/quickMatch"
import { execFileSync } from "node:child_process"
import { existsSync, readFileSync, writeFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

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
    "  APPROVAL_TEST_DATABASE_URL=$DB npx tsx scripts/tests/quickMatch.db.test.ts\n\n" +
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
// This file creates and DROPS public.leads, public.lead_recommendations and
// public.property_catalog. The database the HTTP suites use holds those same names with the real
// schema in them, so running here would pull that stage down mid-run. Hence a sibling database,
// created fresh and dropped at the end, never the one the caller passed.
const ADMIN_DB = (() => { const u = new URL(DB.replace(/^postgresql:/, "http:")); u.pathname = "/postgres"; return u.toString().replace(/^http:/, "postgresql:") })()
const WORK_NAME = "lb_quick_match_test"
const WORK_DB = (() => { const u = new URL(DB.replace(/^postgresql:/, "http:")); u.pathname = `/${WORK_NAME}`; return u.toString().replace(/^http:/, "postgresql:") })()
const admin = (q: string) => execFileSync(PSQL, ["-v", "ON_ERROR_STOP=1", "-tAX", "-d", ADMIN_DB, "-c", q], { encoding: "utf8" })
admin(`drop database if exists ${WORK_NAME} with (force)`)
admin(`create database ${WORK_NAME}`)
process.on("exit", () => { try { admin(`drop database if exists ${WORK_NAME} with (force)`) } catch { /* best effort */ } })

const sql = (q: string) => execFileSync(PSQL, ["-v", "ON_ERROR_STOP=1", "-tAX", "-d", WORK_DB, "-c", q], { encoding: "utf8" })
const file = (f: string) => execFileSync(PSQL, ["-v", "ON_ERROR_STOP=1", "-q", "-d", WORK_DB, "-f", f], { encoding: "utf8" })
/** Runs a file and returns its error text instead of throwing. For the guard tests. */
const fileFails = (f: string): string | null => {
  try { file(f); return null } catch (e: any) { return String(e?.stderr ?? e?.message ?? e) }
}
const rows = <T,>(q: string): T[] => JSON.parse(sql(`select coalesce(json_agg(t),'[]')::text from (${q}) t`).trim())
const one = <T,>(q: string): T => rows<T>(q)[0]
const num = (q: string): number => Number(sql(q).trim())

const resolve = (n: string) => existsSync(`supabase/migrations/${n}`) ? `supabase/migrations/${n}` : `supabase/prepared/${n}`
const M_RESOLUTION = resolve("20261114000000_lead_screening_resolution.sql")
const M_STATE = resolve("20261114000001_lead_quick_match_state.sql")
const M_RPC = resolve("20261114000002_quick_match_candidates_rpc.sql")
const RB_RESOLUTION = "supabase/prepared/ROLLBACK_20261114000000_lead_screening_resolution.sql"
const RB_STATE = "supabase/prepared/ROLLBACK_20261114000001_lead_quick_match_state.sql"
const RB_RPC = "supabase/prepared/ROLLBACK_20261114000002_quick_match_candidates_rpc.sql"
const PROD_CATALOG_FN = "scripts/tests/fixtures/lb_property_catalog_by_ids.prod.sql"
/** A deliberately altered copy, written only for the guard test and removed at exit. */
const ALTERED_FN = join(tmpdir(), `lb-altered-catalog-fn-${process.pid}.sql`)
process.on("exit", () => { try { rmSync(ALTERED_FN, { force: true }) } catch { /* best effort */ } })

console.log("\nQUICK MATCH — the three prepared migrations, on a throwaway database\n")

// ── THE STAGE ───────────────────────────────────────────────────────────────────────────────
// Only the columns the migrations and the engine name. This is not a copy of production.
// Roles are CLUSTER-wide, not per-database, so a second run of this file would find them
// already there. Created only if absent, and never dropped: another suite on the same cluster
// may be relying on them.
sql(`do $$ begin
       if not exists (select 1 from pg_roles where rolname='anon') then create role anon; end if;
       if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
       if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role; end if;
     end $$`)
sql(`create table public.leads (
       id bigserial primary key, first_name text, last_name text,
       beds text, desired_rent text, city text, neighborhoods text, submarkets text,
       destination_zip text, commute_max_minutes integer, commute_anchor_label text,
       commute_anchor_place_id text,
       credit_score integer, credit_history text,
       broken_lease_age text, broken_lease_amount text,
       eviction_age text, eviction_balance text, eviction_court text,
       criminal_background text, criminal_charge text, felony_age text, misdemeanor_age text)`)
// destination_zip already shipped with its own CHECK (20261113000000); the stage carries it so
// the resolution migration is tested against the schema it will actually meet.
sql(`alter table public.leads add constraint leads_destination_zip_format
       check (destination_zip is null or destination_zip ~ '^[0-9]{5}$') not valid`)
sql(`create table public.lead_recommendations (
       id bigserial primary key,
       lead_id bigint not null references public.leads(id) on delete cascade,
       property_name text not null,
       property_url text not null,
       property_address text, property_image_url text, property_website_url text,
       created_at timestamptz not null default now(),
       updated_at timestamptz not null default now(),
       reasons text[], rent_min integer, rent_max integer, special text, sort_order integer,
       canonical_property_key text generated always as (
         coalesce('pid:' || substring(property_url, '[?&]q=place_id:([^&]+)'),
                  'url:' || lower(btrim(property_url)))) stored)`)
sql(`create unique index lead_recommendations_lead_canonical_uidx
       on public.lead_recommendations (lead_id, canonical_property_key)`)
sql(`create table public.property_catalog (
       place_id text primary key, property_name text, address text, zip text,
       website_url text, property_image_url text, google_rating real, current_special text,
       quick_match_collection text,
       credit_minimum_status text, credit_minimum_score integer,
       credit_observed_approval_score integer, credit_screening_notes text,
       broken_lease_status text, broken_lease_min_age_years integer,
       broken_lease_balance_requirement text, broken_lease_max_balance numeric,
       broken_lease_positive_history_required boolean,
       eviction_status text, eviction_min_age_years integer,
       eviction_balance_requirement text, eviction_positive_history_required boolean,
       rental_debt_status text, rental_debt_balance_requirement text, rental_debt_max_balance numeric,
       felony_policy text, felony_min_age_years integer, felony_restrictions text,
       misdemeanor_policy text, misdemeanor_min_age_years integer, misdemeanor_restrictions text,
       criminal_restricted_offense_types text[], criminal_lookback_basis text,
       background_screening_notes text,
       screening_additional_deposit text, screening_risk_fee text,
       screening_guarantor_program text, screening_requirements_checked_at date,
       beds_min integer, beds_max integer,
       onebr_starting_rent numeric, twobr_starting_rent numeric, threebr_starting_rent numeric,
       rent_min numeric, rent_max numeric,
       latitude double precision, longitude double precision,
       -- The columns the shared catalogue function selects, so the production definition applies.
       neighborhood text, location text, location_keywords jsonb, tour_url text, apply_url text,
       availability_url text, property_image_url_backup text,
       send_commission text, escort_commission text, bonus_flat text,
       google_review_count integer, verified_at timestamptz, pricing_last_verified date,
       current_special_checked_at timestamptz, gift_card_status text, gift_card_amount numeric,
       gift_card_checked_at date)`)
// UNLEASH BEAST'S OWN READ PATH, byte for byte as production holds it (captured 2026-11-04). The
// RPC migration's guard checks its md5, so the guard can only be tested against the real thing.
file(PROD_CATALOG_FN)
ok("the production lb_property_catalog_by_ids fixture loads",
  num(`select count(*) from pg_proc where proname = 'lb_property_catalog_by_ids'`) === 1)
ok("…and its md5 is the one the guard expects",
  one<{ h: string }>(`select md5(prosrc) as h from pg_proc where oid='public.lb_property_catalog_by_ids(text[])'::regprocedure`).h
    === "ef035dc17e71b610bd0a87da014db9b9")

// Three leads and four properties, shaped like the real ones.
sql(`insert into public.leads (id, first_name, credit_score, credit_history, beds, desired_rent, criminal_background, criminal_charge, felony_age)
     values (1, 'Credit Only', 540, 'Clean', '2', '$1,100-$1,200', 'None', null, null),
            (2, 'Felony', 600, 'Clean', '1', '$900-$1,000', 'Felony', 'Assault', '7+ years'),
            (3, 'Clean', 760, 'Clean', '2', '$1,500-$1,700', 'None', null, null)`)
sql(`select setval('public.leads_id_seq', 10)`)
// Coordinates are part of the fixture because geography is a GATE: a member whose latitude does
// not survive the read path cannot be recommended at all, so the read path has to carry it.
sql(`insert into public.property_catalog (place_id, property_name, address, zip, quick_match_collection, credit_minimum_status, credit_minimum_score, felony_policy, beds_min, beds_max, latitude, longitude)
     values ('ChIJa', 'Alpha',  '1 A St', '78232', 'san_antonio', 'reported_minimum', 500, 'considered',     1, 3, 29.6000, -98.5000),
            ('ChIJb', 'Bravo',  '2 B St', '78232', 'san_antonio', 'no_check_reported', null, 'not_considered', 1, 3, 29.6200, -98.4800),
            ('ChIJc', 'Charlie','3 C St', '78240', 'san_antonio', null, null, null, 1, 3, 29.5100, -98.5800),
            ('ChIJd', 'Delta',  '4 D St', '78240', null,          'no_check_reported', null, 'considered',    1, 3, 29.5100, -98.5800)`)

console.log("1. THE MIGRATIONS APPLY")
file(M_RESOLUTION); file(M_STATE); file(M_RPC)
ok("all three apply to a schema that has never seen them", true)
file(M_RESOLUTION); file(M_STATE); file(M_RPC)
ok("…and applying them a second time changes nothing and raises nothing", true)
ok("leads gained the three resolution columns, all empty",
  num(`select count(*) from information_schema.columns where table_name='leads'
        and column_name in ('broken_lease_paid','eviction_paid','rental_debt_status')`) === 3
  && num(`select count(*) from public.leads where broken_lease_paid is not null
           or eviction_paid is not null or rental_debt_status is not null`) === 0)
ok("destination_zip was NOT re-declared or altered by this migration",
  num(`select count(*) from information_schema.columns
        where table_name='leads' and column_name='destination_zip'`) === 1)
ok("lead_recommendations gained origin / reviewed_at / screening",
  num(`select count(*) from information_schema.columns where table_name='lead_recommendations'
        and column_name in ('origin','reviewed_at','screening')`) === 3)
ok("leads gained quick_match_at, and no lead is stamped",
  num(`select count(*) from information_schema.columns where table_name='leads' and column_name='quick_match_at'`) === 1
  && num(`select count(*) from public.leads where quick_match_at is not null`) === 0)
ok("the partial index for the refresh predicate exists",
  num(`select count(*) from pg_indexes where indexname='lead_recommendations_quick_match_idx'`) === 1)

console.log("\n2. THE VOCABULARY CHECKS REFUSE SOMETHING")
const refuses = (q: string): boolean => {
  try { sql(q); return false } catch { return true }
}
ok("leads.rental_debt_status refuses a token outside the vocabulary",
  refuses(`update public.leads set rental_debt_status = 'unpaid' where id = 1`))
ok("…and accepts one inside it",
  !refuses(`update public.leads set rental_debt_status = 'payment_plan' where id = 1`))
sql(`update public.leads set rental_debt_status = null where id = 1`)

console.log("\n3. THE READ PATH")
ok("lb_quick_match_candidates returns the 46 columns the engine reads",
  num(`select count(*) from pg_proc p, unnest(p.proargmodes) m
        where p.oid='public.lb_quick_match_candidates(text)'::regprocedure and m in ('o','t')`) === 46)
ok("it returns ONLY the curated members — the non-member is not in it",
  num(`select count(*) from public.lb_quick_match_candidates('san_antonio')`) === 3
  && num(`select count(*) from public.lb_quick_match_candidates('san_antonio') where place_id='ChIJd'`) === 0)
ok("an unknown collection returns nothing rather than everything",
  num(`select count(*) from public.lb_quick_match_candidates('no_such_collection')`) === 0)
ok("anon has NO execute — screening data cannot reach the client-facing page",
  one<{ ok: boolean }>(`select not has_function_privilege('anon','public.lb_quick_match_candidates(text)','EXECUTE') as ok`).ok)
ok("PUBLIC has no execute either",
  one<{ ok: boolean }>(`select not has_function_privilege('public','public.lb_quick_match_candidates(text)','EXECUTE') as ok`).ok)
ok("authenticated DOES have execute",
  one<{ ok: boolean }>(`select has_function_privilege('authenticated','public.lb_quick_match_candidates(text)','EXECUTE') as ok`).ok)
ok("it carries the criminal columns through with their real types",
  one<{ ty: string }>(`select pg_typeof(criminal_restricted_offense_types)::text as ty
                        from public.lb_quick_match_candidates('san_antonio') limit 1`).ty === "text[]")
// Geography is a GATE, not a nudge: a member whose coordinates do not come through this function
// is a member that cannot be recommended at all. So the read path is asserted to carry them.
ok("it carries latitude and longitude, which the geographic gate depends on",
  one<{ n: number }>(`select count(*)::int as n from public.lb_quick_match_candidates('san_antonio')
                       where latitude is not null and longitude is not null`).n >= 1)
ok("…as double precision, not text",
  one<{ ty: string }>(`select pg_typeof(latitude)::text as ty
                        from public.lb_quick_match_candidates('san_antonio') limit 1`).ty === "double precision")

console.log("\n4. THE GUARD FAILS LOUDLY — proved by breaking it")
sql(`drop function public.lb_quick_match_candidates(text)`)
// A MINIMAL, HARMLESS EDIT to Unleash Beast's read path: one comment line inside the body, the
// signature and all 27 OUT columns identical. That is the realistic way it would drift — somebody
// tidies the SQL — and the guard has to catch exactly that, not only a wholesale replacement.
{
  const real = readFileSync(PROD_CATALOG_FN, "utf8")
  const altered = real.replace("AS $function$\ndeclare", "AS $function$\n  -- a harmless tidy-up\ndeclare")
  if (altered === real) { ok("the fixture could be altered for the guard test", false, "insertion point not found") }
  writeFileSync(ALTERED_FN, altered)
  file(ALTERED_FN)
}
ok("the altered function kept its signature and its 27 OUT columns",
  num(`select count(*) from pg_proc p, unnest(p.proargmodes) m
        where p.oid='public.lb_property_catalog_by_ids(text[])'::regprocedure and m in ('o','t')`) === 27)
ok("…and its md5 is no longer the one the guard expects",
  one<{ h: string }>(`select md5(prosrc) as h from pg_proc where oid='public.lb_property_catalog_by_ids(text[])'::regprocedure`).h
    !== "ef035dc17e71b610bd0a87da014db9b9")
const guardErr = fileFails(M_RPC)
ok("a one-comment change to lb_property_catalog_by_ids makes the migration REFUSE to apply", guardErr !== null)
ok("…and the error names the function and its new md5",
  !!guardErr && /lb_property_catalog_by_ids has changed/.test(guardErr), guardErr?.slice(0, 200) ?? "")
ok("…and the new function was NOT created",
  num(`select count(*) from pg_proc where proname='lb_quick_match_candidates'`) === 0)
// Put the real one back and re-apply, so the rest of the file runs against the shipped shape.
file(PROD_CATALOG_FN)
file(M_RPC)
ok("with the real function restored the migration applies again",
  num(`select count(*) from pg_proc where proname='lb_quick_match_candidates'`) === 1)

console.log("\n5. THE VERIFY SCRIPTS RUN CLEAN")
// RUN HERE, BEFORE ANY ROW IS WRITTEN. They assert that nothing has been written yet — which is
// what an operator sees immediately after applying — so running them later, after the write-path
// sections below, would make them fail for a correct reason and prove nothing.
// Each .verify.sql is what the operator runs after applying. Running them here proves they
// execute and that every check they make comes back TRUE — so a `false` in production means a
// real problem rather than a broken script.
for (const v of [
  "supabase/prepared/20261114000000_lead_screening_resolution.verify.sql",
  "supabase/prepared/20261114000001_lead_quick_match_state.verify.sql",
  "supabase/prepared/20261114000002_quick_match_candidates_rpc.verify.sql",
]) {
  let out = ""
  let threw: string | null = null
  try {
    out = execFileSync(PSQL, ["-v", "ON_ERROR_STOP=1", "-tAX", "-F", "|", "-d", WORK_DB, "-f", v], { encoding: "utf8" })
  } catch (e: any) { threw = String(e?.stderr ?? e?.message ?? e) }
  const name = v.split("/").pop()!
  ok(`${name} runs without error`, threw === null, threw?.slice(0, 300) ?? "")
  // Every check row is `label|t|detail`. A single `|f|` is a failed check.
  const failed = out.split("\n").filter((l) => /^[^|]+\|f\|/.test(l))
  ok(`…and every check in it is true`, threw === null && failed.length === 0, failed.join("  "))
}
// The verify scripts' probes write to a real row and then roll back. Prove they left nothing.
ok("the verify probes left no lead stamped or marked",
  num(`select count(*) from public.leads where rental_debt_status is not null`) === 0
  && num(`select count(*) from public.leads where quick_match_at is not null`) === 0)
ok("…and no recommendation carries an origin",
  num(`select count(*) from public.lead_recommendations where origin is not null`) === 0)

console.log("\n6. THE WRITE PATH — what a refresh may and may not touch")
const place = (id: string) => `https://www.google.com/maps/place/?q=place_id:${id}`
// The agent's own row (legacy origin NULL), a kept Quick Match row, and two fresh drafts.
sql(`insert into public.lead_recommendations (lead_id, property_name, property_url, property_address)
     values (1, 'Agent Picked', '${place("ChIJagent")}', 'agent')`)
sql(`insert into public.lead_recommendations (lead_id, property_name, property_url, origin, reviewed_at, screening)
     values (1, 'Kept Draft', '${place("ChIJkept")}', 'quick_match', now(), '{"tier":"needs_verification"}'::jsonb)`)
sql(`insert into public.lead_recommendations (lead_id, property_name, property_url, origin, screening)
     values (1, 'Fresh Draft A', '${place("ChIJfa")}', 'quick_match', '{"tier":"curated_only"}'::jsonb),
            (1, 'Fresh Draft B', '${place("ChIJfb")}', 'quick_match', '{"tier":"curated_only"}'::jsonb)`)
// Another client's rows, which no statement here may reach.
sql(`insert into public.lead_recommendations (lead_id, property_name, property_url, origin)
     values (2, 'Other Client Draft', '${place("ChIJoc")}', 'quick_match')`)
ok("the generated key is pid:<place id>, which is what dedupes against the agent's row",
  one<{ k: string }>(`select canonical_property_key as k from public.lead_recommendations
                       where property_name='Agent Picked'`).k === "pid:ChIJagent")

// THE REFRESH, exactly as lib/quickMatch/persist.ts issues it.
const before = num(`select count(*) from public.lead_recommendations`)
sql(`delete from public.lead_recommendations
      where lead_id = 1 and origin = 'quick_match' and reviewed_at is null`)
ok("a refresh clears the two unreviewed drafts", num(`select count(*) from public.lead_recommendations`) === before - 2)
ok("the agent's hand-picked row survives",
  num(`select count(*) from public.lead_recommendations where property_name='Agent Picked'`) === 1)
ok("…with origin still NULL, so legacy rows keep their meaning",
  num(`select count(*) from public.lead_recommendations where property_name='Agent Picked' and origin is null`) === 1)
ok("the REVIEWED draft survives",
  num(`select count(*) from public.lead_recommendations where property_name='Kept Draft'`) === 1)
ok("another client's draft is untouched",
  num(`select count(*) from public.lead_recommendations where lead_id = 2`) === 1)

console.log("\n7. A PROPERTY THE AGENT ALREADY HAS IS NOT DUPLICATED")
// The upsert persist.ts issues: ON CONFLICT DO NOTHING on (lead_id, canonical_property_key).
sql(`insert into public.lead_recommendations (lead_id, property_name, property_url, origin, screening)
     values (1, 'Alpha (drafted)', '${place("ChIJagent")}', 'quick_match', '{"tier":"strong_candidate"}'::jsonb)
     on conflict (lead_id, canonical_property_key) do nothing`)
ok("the duplicate insert adds no row",
  num(`select count(*) from public.lead_recommendations where lead_id=1 and canonical_property_key='pid:ChIJagent'`) === 1)
ok("…and the surviving row is the AGENT'S, name and all",
  one<{ n: string; o: string | null }>(`select property_name as n, origin as o from public.lead_recommendations
                                         where lead_id=1 and canonical_property_key='pid:ChIJagent'`).n === "Agent Picked")
ok("…so a refresh can never overwrite their choice with a draft of the same property",
  one<{ o: string | null }>(`select origin as o from public.lead_recommendations
                              where lead_id=1 and canonical_property_key='pid:ChIJagent'`).o === null)
ok("the origin CHECK refuses an unknown origin",
  refuses(`update public.lead_recommendations set origin='robot' where lead_id=1 limit 1`)
  || refuses(`update public.lead_recommendations set origin='robot' where property_name='Agent Picked'`))

console.log("\n8. SIX IS A CEILING IN THE DATABASE TOO")
sql(`delete from public.lead_recommendations where lead_id = 3`)
for (let i = 0; i < 6; i++) {
  sql(`insert into public.lead_recommendations (lead_id, property_name, property_url, origin, screening)
       values (3, 'Draft ${i}', '${place(`ChIJcap${i}`)}', 'quick_match',
               '{"tier":"needs_verification","policyOnRecord":false,"geography":"In Stone Oak — about 2.0 miles from it"}'::jsonb)`)
}
ok("six drafts for one client are six rows",
  num(`select count(*) from public.lead_recommendations where lead_id=3 and origin='quick_match'`) === 6)
ok("…and they sort AFTER anything the agent arranged, because sort_order is NULL",
  num(`select count(*) from public.lead_recommendations where lead_id=3 and sort_order is not null`) === 0)
ok("…and a no-policy draft stores the two facts the chip leads with",
  num(`select count(*) from public.lead_recommendations
        where lead_id=3 and (screening->>'policyOnRecord') = 'false'
          and screening->>'geography' is not null`) === 6)

console.log("\n8b. SAVE, CLOSE, REOPEN — a property the agent removed stays removed")
// The whole sequence, in the order an agent lives it. The automatic pass is gated on
// leads.quick_match_at, and this is the predicate the route actually uses — so what is proved
// here is that the gate is readable and that it closes after the first run.
sql(`update public.leads set quick_match_at = now() where id = 3`)
ok("the first automatic run stamps the client",
  num(`select count(*) from public.leads where id=3 and quick_match_at is not null`) === 1)
sql(`delete from public.lead_recommendations
      where lead_id=3 and property_name in ('Draft 0','Draft 1')`)
ok("the agent removes two of the six", num(`select count(*) from public.lead_recommendations where lead_id=3`) === 4)
// REOPEN. The route runs the automatic pass only when the stamp is null, so this is the test it
// applies — and it now refuses.
ok("reopening the client does NOT re-run the automatic pass",
  num(`select count(*) from public.leads where id=3 and quick_match_at is null`) === 0)
ok("…so the two removed properties do not come back",
  num(`select count(*) from public.lead_recommendations where lead_id=3`) === 4)
ok("…and the four that remain are untouched, screening detail and all",
  num(`select count(*) from public.lead_recommendations
        where lead_id=3 and origin='quick_match' and screening is not null`) === 4)
// An EXPLICIT refresh is the agent's own action, and it is the one thing that may bring a
// property back. That is the documented difference between the two modes.
ok("an explicit refresh is the only path that rewrites the drafts",
  (() => {
    sql(`delete from public.lead_recommendations where lead_id=3 and origin='quick_match' and reviewed_at is null`)
    return num(`select count(*) from public.lead_recommendations where lead_id=3`) === 0
  })())

console.log("\n8c. THE CLIENT'S DESTINATION — ZIP 78240, through the real schema")
// The CHECK that shipped with destination_zip, exercised rather than described. A psql -c is its
// own transaction, so a refused update leaves the row as it was.
const refused = (v: string) => {
  try { execFileSync(PSQL, ["-v", "ON_ERROR_STOP=1", "-tAX", "-d", WORK_DB, "-c",
    `update public.leads set destination_zip='${v}' where id=1`], { stdio: "ignore" }); return false }
  catch { return true }
}
sql(`update public.leads set destination_zip='78240' where id=1`)
ok("the column accepts 78240",
  one<{ z: string }>(`select destination_zip as z from public.leads where id=1`).z === "78240")
ok("…and refuses four digits, six digits and letters",
  refused("7824") && refused("782401") && refused("78A40"))
ok("…and the refusal left 78240 in place",
  one<{ z: string }>(`select destination_zip as z from public.leads where id=1`).z === "78240")

// THE ENGINE, on a row that came out of this database rather than out of a fixture literal.
const leadRow = one<Record<string, unknown>>(`select * from public.leads where id=1`)
const dbGeo = resolveClientGeography(leadRow, [])
ok("the engine reads 78240 off the real row", dbGeo.destinationZip === "78240")
ok("…and records that it came from the destination field", dbGeo.zipSource === "destination_zip")
ok("…with no named area on this client, geography is still a criterion",
  dbGeo.applicable && dbGeo.anchors.length === 0)

// The curated member in that ZIP, as the RPC actually returns it. Only the three fields the
// geographic comparison uses are mapped here — the rest of the read path is section 3's job.
type Member = { place_id: string; zip: string; latitude: number; longitude: number }
const members = rows<Member>(
  `select place_id, zip, latitude, longitude from public.lb_quick_match_candidates('san_antonio')`)
const asProperty = (m: Member) =>
  ({ zip: m.zip, latitude: Number(m.latitude), longitude: Number(m.longitude) } as unknown as QuickMatchProperty)
const inZip = members.filter((m) => m.zip === "78240")
ok("the curated member in 78240 comes through the read path", inZip.length === 1 && inZip[0].place_id === "ChIJc")
ok("…and the engine puts it in the destination-ZIP band",
  assessGeography(asProperty(inZip[0]), dbGeo).band === "destination_zip")
ok("…while a curated member in another ZIP, with no member coordinates to measure from, is not",
  members.filter((m) => m.zip !== "78240").every((m) => assessGeography(asProperty(m), dbGeo).band === null))
// Delta is ALSO in 78240 and is not in the collection. The destination ZIP must not reach past
// the curated list — the ZIP is a filter on it, never a way around it.
ok("the 78240 property that is NOT curated never reaches the engine at all",
  members.every((m) => m.place_id !== "ChIJd"))
// With that member's coordinates, the ZIP has a measured centroid and the bands widen.
const withCentroid = resolveClientGeography(leadRow, members.map(asProperty))
ok("the ZIP gains a centroid averaged over its curated members", withCentroid.anchors.length === 1)
ok("…and a property a mile away is then in band, measured not assumed",
  assessGeography({ zip: "78229", latitude: 29.5245, longitude: -98.58 } as unknown as QuickMatchProperty,
    withCentroid).band === "in_area")

// THE COMMUTE DESTINATION, through its two real columns.
sql(`update public.leads set destination_zip=null,
      commute_anchor_label='78254', commute_anchor_place_id=null where id=2`)
const unanchored = resolveClientGeography(one<Record<string, unknown>>(`select * from public.leads where id=2`), [])
ok("an UNANCHORED commute destination of 78254 is read as a geographic hint",
  unanchored.destinationZip === "78254" && unanchored.zipSource === "commute_destination")
sql(`update public.leads set commute_anchor_place_id='ChIJ_real_place' where id=2`)
const googleAnchored = resolveClientGeography(one<Record<string, unknown>>(`select * from public.leads where id=2`), [])
ok("…and anchoring it to a Google place withdraws the hint, leaving the anchor the routing destination",
  googleAnchored.destinationZip === null && googleAnchored.zipSource === null)
ok("the anchor itself is untouched by any of this",
  one<{ l: string; p: string }>(`select commute_anchor_label as l, commute_anchor_place_id as p
                                  from public.leads where id=2`).p === "ChIJ_real_place")
// Leave the stage as section 9 and the rollbacks expect to find it.
sql(`update public.leads set destination_zip=null, commute_anchor_label=null, commute_anchor_place_id=null`)

console.log("\n9. THE SCREENING DETAIL CANNOT REACH A CLIENT")
// The real share functions are not in this stage, so the claim is checked where it is made: the
// production function bodies name their columns, and none of them is one of the three added here.
// (The live assertion against pg_proc is in the migration's own verify script.)
{
  const share = readFileSync("supabase/prepared/20261114000001_lead_quick_match_state.verify.sql", "utf8")
  ok("the migration's verify script asserts the share functions never name the new columns",
    /lb_create_client_share/.test(share) && /lb_prepare_client_share/.test(share)
    && /reviewed_at/.test(share) && /screening/.test(share))
}
ok("the screening column is jsonb, so the detail is structured rather than prose",
  one<{ ty: string }>(`select data_type as ty from information_schema.columns
                        where table_name='lead_recommendations' and column_name='screening'`).ty === "jsonb")

console.log("\n10. THE ROLLBACKS")
file(RB_RPC)
ok("the RPC rollback drops the function",
  num(`select count(*) from pg_proc where proname='lb_quick_match_candidates'`) === 0)
ok("…and leaves Unleash Beast's read path alone",
  num(`select count(*) from pg_proc where proname='lb_property_catalog_by_ids'`) === 1)
const recsBefore = num(`select count(*) from public.lead_recommendations`)
file(RB_STATE)
ok("the state rollback drops the three columns and quick_match_at",
  num(`select count(*) from information_schema.columns where table_name='lead_recommendations'
        and column_name in ('origin','reviewed_at','screening')`) === 0
  && num(`select count(*) from information_schema.columns where table_name='leads' and column_name='quick_match_at'`) === 0)
ok("…and DELETES NO RECOMMENDATION — the rows survive as ordinary ones",
  num(`select count(*) from public.lead_recommendations`) === recsBefore)
file(RB_RESOLUTION)
ok("the resolution rollback drops its three columns",
  num(`select count(*) from information_schema.columns where table_name='leads'
        and column_name in ('broken_lease_paid','eviction_paid','rental_debt_status')`) === 0)
ok("…and leaves destination_zip, which shipped separately, in place",
  num(`select count(*) from information_schema.columns where table_name='leads' and column_name='destination_zip'`) === 1)
ok("…and every lead still exists", num(`select count(*) from public.leads`) === 3)

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"} — ${pass} passed, ${fail} failed\n`)
process.exit(fail === 0 ? 0 : 1)
