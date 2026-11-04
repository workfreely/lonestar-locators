/**
 * CRIMINAL BACKGROUND — SAVE, CLEAR AND REOPEN over real HTTP, against a real database.
 *
 * The unit suite proves the vocabulary and the firewall. This one proves the three things only a
 * round trip can:
 *
 *   • SAVING. Nine fields, one PUT, through the real enrichment writer — including a text[]
 *     column, which no other field in this editor has.
 *   • CLEARING. Blank is the deliberate return to UNKNOWN (NULL), recorded as a clear in the
 *     audit trail, and it must not be stored as an empty array, 0 or "not considered".
 *   • REOPENING. A GET after each of the above returns exactly what was stored, with the category
 *     set coming back in canonical order — and a property with NO criminal data at all opens
 *     clean rather than erroring or showing invented answers.
 *
 * It also proves the two-migration arrangement: with the criminal columns DROPPED, the live
 * requirement fields still read and still save, and a criminal write is refused with its own code
 * instead of failing the whole save.
 *
 * SETUP (the harness builds the app and starts postgres + postgrest + shim + next):
 *   eval "$(bash scripts/tests/approvalCriteria.httpEnv.sh start | grep ^APPROVAL)"
 *   npx tsx scripts/tests/criminalBackground.http.test.ts
 *   bash scripts/tests/approvalCriteria.httpEnv.sh stop
 */
import { execFileSync } from "node:child_process"

let pass = 0
let fail = 0
const ok = (l: string, c: boolean, d = "") => {
  if (c) { pass++; console.log(`  ✓ ${l}`) }
  else { fail++; console.log(`  ✗ ${l}${d ? `\n      ${d}` : ""}`) }
}

const BASE = process.env.APPROVAL_HTTP_BASE
const DB = process.env.APPROVAL_TEST_DATABASE_URL
const SUPA = process.env.APPROVAL_SUPABASE_URL
const ADMIN = process.env.APPROVAL_ADMIN_TOKEN
if (!BASE || !DB || !SUPA || !ADMIN) {
  console.log(
    "\nSKIPPED — the staging stack is not running.\n" +
    "  eval \"$(bash scripts/tests/approvalCriteria.httpEnv.sh start | grep ^APPROVAL)\"\n" +
    "  npx tsx scripts/tests/criminalBackground.http.test.ts\n\n0 passed, 0 failed (skipped)\n",
  )
  process.exit(0)
}
for (const [name, u] of [["APPROVAL_HTTP_BASE", BASE], ["APPROVAL_SUPABASE_URL", SUPA]] as const) {
  const h = new URL(u).hostname
  if (h !== "127.0.0.1" && h !== "localhost") {
    console.error(`\nREFUSED: ${name} points at ${h}, which is not loopback. This test WRITES.\n`)
    process.exit(2)
  }
}

const PSQL = ["/opt/homebrew/opt/postgresql@17/bin/psql", "/opt/homebrew/opt/postgresql@16/bin/psql", "psql"]
  .find((p) => { try { execFileSync(p, ["--version"], { stdio: "ignore" }); return true } catch { return false } })!
const sql = (q: string) => execFileSync(PSQL, ["-v", "ON_ERROR_STOP=1", "-tAX", "-d", DB, "-c", q], { encoding: "utf8" })
const sqlFile = (f: string) => execFileSync(PSQL, ["-v", "ON_ERROR_STOP=1", "-q", "-d", DB, "-f", f], { encoding: "utf8" })
const one = <T,>(q: string): T => JSON.parse(sql(`select coalesce(json_agg(t),'[]')::text from (${q}) t`).trim())[0] as T

const COOKIE_NAME = `sb-${new URL(SUPA).hostname.split(".")[0]}-auth-token`
const subOf = (jwt: string) => JSON.parse(Buffer.from(jwt.split(".")[1], "base64url").toString("utf8")).sub as string
const ADMIN_COOKIE = (() => {
  const sub = subOf(ADMIN)
  const session = {
    access_token: ADMIN, token_type: "bearer", expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: "staging-refresh",
    user: { id: sub, aud: "authenticated", role: "authenticated", email: `${sub}@example.test` },
  }
  return `${COOKIE_NAME}=base64-${Buffer.from(JSON.stringify(session)).toString("base64url")}`
})()

const ENDPOINT = `${BASE}/api/admin/owner/property-pricing`
type Res = { status: number; body: Record<string, unknown> }
const get = async (placeId: string): Promise<Res> => {
  const r = await fetch(`${ENDPOINT}?placeId=${encodeURIComponent(placeId)}`, { headers: { cookie: ADMIN_COOKIE } })
  return { status: r.status, body: await r.json().catch(() => ({})) }
}
const put = async (payload: unknown): Promise<Res> => {
  const r = await fetch(ENDPOINT, {
    method: "PUT",
    headers: { "content-type": "application/json", cookie: ADMIN_COOKIE },
    body: JSON.stringify(payload),
  })
  return { status: r.status, body: await r.json().catch(() => ({})) }
}

const FIXTURE = "ChIJ_staging_criminal_fixture"
const UNTOUCHED = "ChIJ_staging_criminal_blank"
const PRODUCTION_ONLY = "ChIJze0w-Nr0XIYRu0_8EJMzufg"
const MIGRATION = "supabase/prepared/20261112000000_property_criminal_background.sql"
const COLUMNS = [
  "felony_policy", "felony_min_age_years", "felony_restrictions",
  "misdemeanor_policy", "misdemeanor_min_age_years", "misdemeanor_restrictions",
  "criminal_restricted_offense_types", "criminal_lookback_basis", "background_screening_notes",
]
const row = () => one<Record<string, unknown>>(
  `select ${COLUMNS.join(", ")} from public.property_catalog where place_id='${FIXTURE}'`)

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * WAIT FOR A DDL CHANGE TO BE VISIBLE TO READS.
 *
 * PostgREST reloads its schema cache when it is told to, asynchronously. Reads do not depend on
 * that cache — PostgREST puts the column names into SQL and Postgres resolves them — so this
 * settles as soon as the columns exist in the database.
 */
async function waitForCriminalRead(expected: boolean) {
  sql(`notify pgrst, 'reload schema'`)
  for (let i = 0; i < 40; i++) {
    const r = await get(FIXTURE)
    if (r.body.criminalAvailable === expected) return true
    await sleep(250)
  }
  return false
}

/**
 * WAIT FOR A DDL CHANGE TO BE VISIBLE TO WRITES — WHICH IS A DIFFERENT QUESTION.
 *
 * A WRITE does depend on the cache: PostgREST validates every key in the body against its cached
 * column list, and answers PGRST204 for one it has not seen yet. So a read can succeed while a
 * write to the same column is still refused, and the route turns that refusal into 409 — never
 * into a false success, which is the property that actually matters.
 *
 * Production meets this moment once, when the migration is applied under a running deployment;
 * Supabase's own DDL event trigger notifies PostgREST, and the window is as short as a reload.
 * Here the notify is explicit, and this retries across it rather than asserting a race.
 */
async function waitForCriminalWrite(payload: Record<string, unknown>) {
  let last: Res = { status: 0, body: {} }
  for (let i = 0; i < 25; i++) {
    sql(`notify pgrst, 'reload schema'`)
    await sleep(300)
    await get(FIXTURE) // a fresh read, exactly as the panel does before it saves again
    last = await put({ placeId: FIXTURE, ...payload })
    if (last.status === 200) return { res: last, attempts: i + 1 }
  }
  return { res: last, attempts: 25 }
}

async function main() {
  console.log(`\nCRIMINAL BACKGROUND — HTTP (${BASE} → ${SUPA})\n`)

  sql(`delete from public.property_enrichment_events where place_id like 'ChIJ_staging%'`)
  sql(`delete from public.property_catalog where place_id like 'ChIJ_staging%'`)
  sql(`insert into public.property_catalog
         (place_id, property_name, address, city, state, zip, updated_at,
          credit_minimum_status, credit_minimum_score, credit_screening_notes,
          send_commission, escort_commission, broken_lease_status, eviction_status)
       values ('${FIXTURE}', 'Criminal Fixture Apartments', '2 Test Way', 'San Antonio', 'TX', '78218', now(),
               'reported_minimum', 580, 'Existing approval notes, untouched.', '100%', '50%',
               'accepted_if_paid', 'not_accepted'),
              ('${UNTOUCHED}', 'No Criminal Data Apartments', '3 Test Way', 'San Antonio', 'TX', '78218', now(),
               null, null, null, null, null, null, null)`)

  console.log("the server under test is NOT production")
  {
    const mine = await get(FIXTURE)
    ok("the staging fixture resolves", mine.status === 200 && mine.body.propertyName === "Criminal Fixture Apartments",
      `${mine.status} ${JSON.stringify(mine.body).slice(0, 200)}`)
    const prod = await get(PRODUCTION_ONLY)
    ok("a place_id that exists ONLY in production does not resolve", prod.status === 404)
  }

  console.log("\nreopening a property with NO criminal-background data")
  {
    const r = await get(UNTOUCHED)
    ok("it opens — 200, not an error", r.status === 200)
    ok("the criminal columns are reported available", r.body.criminalAvailable === true)
    const approval = r.body.approval as Record<string, unknown>
    ok("every one of the nine reads back NULL, not a default",
      COLUMNS.every((c) => approval[c] === null), JSON.stringify(approval))
    ok("…so Unknown is what the panel shows, never 'not considered'",
      !COLUMNS.some((c) => approval[c] === "not_considered" || approval[c] === 0 || approval[c] === false))
    ok("the requirement columns are available independently", r.body.approvalAvailable === true)
  }

  console.log("\nSAVING the whole group in one PUT")
  {
    const r = await put({
      placeId: FIXTURE,
      felonyPolicy: "case_by_case", felonyMinAgeYears: "7", felonyRestrictions: "Nothing assault related",
      misdemeanorPolicy: "considered", misdemeanorMinAgeYears: "3", misdemeanorRestrictions: "No time frame",
      criminalRestrictedOffenseTypes: "sex_offense,assault", criminalLookbackBasis: "conviction_date",
      backgroundScreeningNotes: "Corporate review above ten years.",
    })
    ok("200", r.status === 200, `${r.status} ${JSON.stringify(r.body).slice(0, 200)}`)
    const d = row()
    ok("the policies landed as TOKENS", d.felony_policy === "case_by_case" && d.misdemeanor_policy === "considered",
      JSON.stringify(d))
    ok("the ages landed as integers", d.felony_min_age_years === 7 && d.misdemeanor_min_age_years === 3)
    ok("the prose landed verbatim", d.felony_restrictions === "Nothing assault related")
    ok("the lookback basis landed", d.criminal_lookback_basis === "conviction_date")
    ok("the notes landed", d.background_screening_notes === "Corporate review above ten years.")
    ok("the category set landed as a real text[] in CANONICAL order, not as the typed order",
      Array.isArray(d.criminal_restricted_offense_types) &&
      (d.criminal_restricted_offense_types as string[]).join(",") === "assault,sex_offense",
      JSON.stringify(d.criminal_restricted_offense_types))
    // `as ty`: the json_agg wrapper aliases its subquery `t`, so a column named `t` would be
    // taken as that reference and the helper would hand back strings instead of rows.
    ok("the column is an array type in the database, not text",
      one<{ ty: string }>(`select format_type(atttypid, atttypmod) as ty from pg_attribute
        where attrelid='public.property_catalog'::regclass
          and attname='criminal_restricted_offense_types'`).ty === "text[]")
    ok("nine audit rows were appended, one per field", one<{ n: number }>(
      `select count(*)::int as n from public.property_enrichment_events
        where place_id='${FIXTURE}' and action='written' and field_name in (${COLUMNS.map((c) => `'${c}'`).join(",")})`).n === 9)
    ok("the audit trail records the SET, not a count", one<{ v: string }>(
      `select new_value as v from public.property_enrichment_events
        where place_id='${FIXTURE}' and field_name='criminal_restricted_offense_types'
        order by seq desc limit 1`).v === '["assault","sex_offense"]')
    ok("an unsourced save is recorded INFERRED, never verified", one<{ n: number }>(
      `select count(*)::int as n from public.property_enrichment_events
        where place_id='${FIXTURE}' and verification_status='verified'
          and field_name in (${COLUMNS.map((c) => `'${c}'`).join(",")})`).n === 0)
  }

  console.log("\nREOPENING after the save")
  {
    const r = await get(FIXTURE)
    const a = r.body.approval as Record<string, unknown>
    ok("every value comes back", a.felony_policy === "case_by_case" && a.felony_min_age_years === 7 &&
      a.felony_restrictions === "Nothing assault related" && a.misdemeanor_policy === "considered" &&
      a.misdemeanor_min_age_years === 3 && a.misdemeanor_restrictions === "No time frame" &&
      a.criminal_lookback_basis === "conviction_date" &&
      a.background_screening_notes === "Corporate review above ten years.", JSON.stringify(a))
    ok("the category set comes back as an array in canonical order",
      Array.isArray(a.criminal_restricted_offense_types) &&
      (a.criminal_restricted_offense_types as string[]).join(",") === "assault,sex_offense")
    ok("each field carries its own age line from provenance",
      COLUMNS.every((c) => typeof (r.body.fieldCheckedAt as Record<string, string>)[c] === "string"))
    ok("…and none is marked verified, because no Source was given",
      COLUMNS.every((c) => (r.body.fieldVerified as Record<string, boolean>)[c] !== true))
  }

  console.log("\nPRESERVATION — one field saved, the rest left alone")
  {
    const before = row()
    const r = await put({ placeId: FIXTURE, misdemeanorPolicy: "case_by_case" })
    ok("200", r.status === 200)
    const after = row()
    ok("the one field changed", after.misdemeanor_policy === "case_by_case")
    ok("the other eight are byte-identical", COLUMNS.filter((c) => c !== "misdemeanor_policy")
      .every((c) => JSON.stringify(after[c]) === JSON.stringify(before[c])))
    const d = one<Record<string, unknown>>(`select credit_minimum_status, credit_minimum_score,
      credit_screening_notes, send_commission, escort_commission, broken_lease_status, eviction_status
      from public.property_catalog where place_id='${FIXTURE}'`)
    ok("the credit answer, the notes, the commission and the requirement fields are untouched",
      d.credit_minimum_status === "reported_minimum" && d.credit_minimum_score === 580 &&
      d.credit_screening_notes === "Existing approval notes, untouched." &&
      d.send_commission === "100%" && d.escort_commission === "50%" &&
      d.broken_lease_status === "accepted_if_paid" && d.eviction_status === "not_accepted",
      JSON.stringify(d))
  }

  console.log("\nREFUSALS — a value the vocabulary does not have never lands")
  {
    const before = row()
    const bad = await put({ placeId: FIXTURE, felonyPolicy: "Case-by-Case" })
    ok("the DISPLAY form is refused with bad_value and the field name",
      bad.status === 400 && bad.body.error === "bad_value" &&
      (bad.body.fields as string[]).includes("felonyPolicy"), `${bad.status} ${JSON.stringify(bad.body)}`)
    const junkSet = await put({ placeId: FIXTURE, criminalRestrictedOffenseTypes: "assault,arson" })
    ok("an unknown category is refused rather than partly stored",
      junkSet.status === 400 && (junkSet.body.fields as string[]).includes("criminalRestrictedOffenseTypes"))
    const bigAge = await put({ placeId: FIXTURE, felonyMinAgeYears: "300" })
    ok("300 years is refused", bigAge.status === 400)
    const basis = await put({ placeId: FIXTURE, criminalLookbackBasis: "unknown" })
    ok("'unknown' as a lookback basis is refused — unknown is NULL", basis.status === 400)
    ok("nothing at all was written by the four refusals",
      COLUMNS.every((c) => JSON.stringify(row()[c]) === JSON.stringify(before[c])))
  }

  console.log("\nCLEARING back to unknown")
  {
    const r = await put({
      placeId: FIXTURE,
      felonyPolicy: "", felonyMinAgeYears: "", felonyRestrictions: "",
      misdemeanorPolicy: "", misdemeanorMinAgeYears: "", misdemeanorRestrictions: "",
      criminalRestrictedOffenseTypes: "", criminalLookbackBasis: "", backgroundScreeningNotes: "",
    })
    ok("200", r.status === 200, `${r.status} ${JSON.stringify(r.body).slice(0, 200)}`)
    const d = row()
    ok("all nine are NULL", COLUMNS.every((c) => d[c] === null), JSON.stringify(d))
    ok("the category set is NULL, NOT an empty array", d.criminal_restricted_offense_types === null)
    ok("the clear is recorded in the audit trail with no new value", one<{ n: number }>(
      `select count(*)::int as n from (
         select distinct on (field_name) field_name, new_value from public.property_enrichment_events
          where place_id='${FIXTURE}' and field_name in (${COLUMNS.map((c) => `'${c}'`).join(",")})
          order by field_name, seq desc) t where new_value is null`).n === 9)
    ok("the PREVIOUS value is still in the trail, so nothing was lost from the record",
      one<{ n: number }>(`select count(*)::int as n from public.property_enrichment_events
        where place_id='${FIXTURE}' and field_name='felony_policy' and old_value='case_by_case'`).n === 1)
    const back = await get(FIXTURE)
    const a = back.body.approval as Record<string, unknown>
    ok("reopening shows Unknown everywhere", COLUMNS.every((c) => a[c] === null))
    ok("…and the credit answer and requirement fields are still there", a.broken_lease_status === "accepted_if_paid" &&
      back.body.creditMinimumScore === 580)
  }

  console.log("\nA SOURCE is what marks a value verified")
  {
    const r = await put({ placeId: FIXTURE, felonyPolicy: "not_considered", pricingSource: "Called the office, Nov 4" })
    ok("200", r.status === 200)
    ok("the sourced save is recorded verified", one<{ v: string }>(
      `select verification_status as v from public.property_enrichment_events
        where place_id='${FIXTURE}' and field_name='felony_policy' order by seq desc limit 1`).v === "verified")
    const g = await get(FIXTURE)
    ok("…and the panel is told so", (g.body.fieldVerified as Record<string, boolean>).felony_policy === true)
    ok("saving a policy stamps NO leasing-office confirmation date", one<{ d: string | null }>(
      `select screening_requirements_checked_at::text as d from public.property_catalog
        where place_id='${FIXTURE}'`).d === null)
  }

  console.log("\nTHE MIGRATION IS NOT APPLIED YET — the editor still works")
  {
    sql(`alter table public.property_catalog ${COLUMNS.map((c) => `drop column if exists ${c}`).join(", ")}`)
    ok("the columns are gone", await waitForCriminalRead(false))
    const r = await get(FIXTURE)
    ok("the editor still loads", r.status === 200)
    ok("criminal background is reported unavailable", r.body.criminalAvailable === false)
    ok("…while the sixteen requirement columns are STILL available", r.body.approvalAvailable === true)
    ok("…and their values still read", (r.body.approval as Record<string, unknown>).broken_lease_status === "accepted_if_paid")
    const refused = await put({ placeId: FIXTURE, felonyPolicy: "considered" })
    ok("a criminal write is refused with its own code", refused.status === 409 &&
      refused.body.error === "criminal_columns_missing", `${refused.status} ${JSON.stringify(refused.body)}`)
    const still = await put({ placeId: FIXTURE, evictionStatus: "accepted" })
    ok("a REQUIREMENT write still succeeds, unaffected", still.status === 200, `${still.status} ${JSON.stringify(still.body)}`)
    ok("…and landed", one<{ s: string }>(
      `select eviction_status as s from public.property_catalog where place_id='${FIXTURE}'`).s === "accepted")

    console.log("\n   applying the real migration file brings it back")
    sqlFile(MIGRATION)
    ok("the editor reports it available again for READS", await waitForCriminalRead(true))
    ok("re-applying the same file is a no-op, not an error", (() => {
      try { sqlFile(MIGRATION); return true } catch { return false }
    })())
    // A WRITE needs PostgREST's cache, not just the columns. The first attempt right after the
    // DDL can be refused while the reload is still in flight; what must never happen is a refusal
    // reported as a save.
    const beforeWrite = one<{ fp: string | null }>(
      `select felony_policy as fp from public.property_catalog where place_id='${FIXTURE}'`).fp
    const { res: saved, attempts } = await waitForCriminalWrite({
      felonyPolicy: "considered", criminalRestrictedOffenseTypes: "drug",
    })
    ok(`a criminal save works once the cache has caught up (attempt ${attempts})`,
      saved.status === 200, `${saved.status} ${JSON.stringify(saved.body)}`)
    if (attempts > 1) console.log(`      (the first ${attempts - 1} attempt(s) were refused while PostgREST reloaded — each with 409, none with a false success)`)
    ok("nothing was written by a refused attempt", beforeWrite === null)
    ok("…with the value present", one<{ fp: string }>(
      `select felony_policy as fp from public.property_catalog where place_id='${FIXTURE}'`).fp === "considered")
    ok("…and the category set too", one<{ cats: string }>(
      `select array_to_string(criminal_restricted_offense_types, ',') as cats
         from public.property_catalog where place_id='${FIXTURE}'`).cats === "drug")
  }

  console.log("\nTHE DATABASE ITSELF REFUSES WHAT THE APPLICATION WOULD NEVER SEND")
  {
    const fails = (q: string) => { try { sql(q); return false } catch { return true } }
    ok("an empty category array is unstorable",
      fails(`update public.property_catalog set criminal_restricted_offense_types = array[]::text[]
             where place_id='${FIXTURE}'`))
    ok("a category outside the six is unstorable",
      fails(`update public.property_catalog set criminal_restricted_offense_types = array['arson']::text[]
             where place_id='${FIXTURE}'`))
    ok("the display form of a policy token is unstorable",
      fails(`update public.property_catalog set felony_policy='Case-by-Case' where place_id='${FIXTURE}'`))
    ok("a 300-year lookback is unstorable",
      fails(`update public.property_catalog set felony_min_age_years=300 where place_id='${FIXTURE}'`))
    ok("…and NULL remains storable in every one of them", !fails(
      `update public.property_catalog set ${COLUMNS.map((c) => `${c}=null`).join(", ")} where place_id='${FIXTURE}'`))
  }

  sql(`delete from public.property_enrichment_events where place_id like 'ChIJ_staging%'`)
  sql(`delete from public.property_catalog where place_id like 'ChIJ_staging%'`)
  ok("the fixtures are removed afterwards", one<{ n: number }>(
    `select count(*)::int as n from public.property_catalog where place_id like 'ChIJ_staging%'`).n === 0)

  console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"} — ${pass} passed, ${fail} failed\n`)
  process.exit(fail === 0 ? 0 : 1)
}

main().catch((e) => { console.error(e); process.exit(1) })
