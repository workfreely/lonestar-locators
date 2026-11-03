/**
 * APPROVAL CRITERIA — THE FULL HTTP PATH, over real requests to a running build.
 *
 * The unit suite proves the editor and the route agree. The integration test proves the database
 * agrees. This one puts an actual Next production server in front of actual PostgREST and sends
 * actual HTTP, so the parts nothing else covers are covered:
 *
 *   • AUTHENTICATION. No session → 401. A signed-in user who is not a platform admin → 403. Only
 *     an admin gets through. The refusals come from a signature check and a table lookup, not
 *     from a stub that happens to say no.
 *   • THE ERROR CONTRACT. bad_json, bad_place_id, property_not_found, bad_value with the field
 *     names, nothing_to_save, approval_columns_missing — each as a real status code and body.
 *   • THE ROUND TRIP. PUT then GET, through PostgREST, with the optimistic-concurrency PATCH and
 *     the maybeSingle() the store actually issues.
 *   • PRESERVATION. A save that sends one field leaves the other fifteen, the credit answer, the
 *     notes and the commission exactly as they were.
 *
 * ── IT CHECKS THAT IT IS NOT TALKING TO PRODUCTION, FIRST ───────────────────────────────────
 * Before anything else it asserts the app resolves the staging fixture AND does not resolve a
 * place_id that exists only in production. If the server were pointed at the real database those
 * two assertions could not both pass.
 *
 * SETUP:
 *   npx next build                                        # the server under test
 *   bash scripts/tests/approvalCriteria.httpEnv.sh start   # postgres + postgrest + shim + app
 *   eval "$(bash scripts/tests/approvalCriteria.httpEnv.sh start | grep ^APPROVAL)"
 *   npx tsx scripts/tests/approvalCriteria.http.test.ts
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
const PLAIN = process.env.APPROVAL_PLAIN_TOKEN
if (!BASE || !DB || !SUPA || !ADMIN || !PLAIN) {
  console.log(
    "\nSKIPPED — the staging stack is not running.\n" +
    "  npx next build && eval \"$(bash scripts/tests/approvalCriteria.httpEnv.sh start | grep ^APPROVAL)\"\n" +
    "  npx tsx scripts/tests/approvalCriteria.http.test.ts\n" +
    "  bash scripts/tests/approvalCriteria.httpEnv.sh stop\n" +
    "\n0 passed, 0 failed (skipped)\n",
  )
  process.exit(0)
}
// The app must be local. A staging stack is loopback by construction; anything else is a mistake
// worth stopping for, because this test WRITES.
for (const [name, u] of [["APPROVAL_HTTP_BASE", BASE], ["APPROVAL_SUPABASE_URL", SUPA]] as const) {
  const h = new URL(u).hostname
  if (h !== "127.0.0.1" && h !== "localhost") {
    console.error(`\nREFUSED: ${name} points at ${h}, which is not loopback.\n`)
    process.exit(2)
  }
}

const PSQL = ["/opt/homebrew/opt/postgresql@17/bin/psql", "/opt/homebrew/opt/postgresql@16/bin/psql", "psql"]
  .find((p) => { try { execFileSync(p, ["--version"], { stdio: "ignore" }); return true } catch { return false } })!
const sql = (q: string) => execFileSync(PSQL, ["-v", "ON_ERROR_STOP=1", "-tAX", "-d", DB, "-c", q], { encoding: "utf8" })
const one = <T,>(q: string): T => JSON.parse(sql(`select coalesce(json_agg(t),'[]')::text from (${q}) t`).trim())[0] as T

/** The cookie @supabase/ssr reads: sb-<first label of the host>-auth-token, base64url JSON. */
const COOKIE_NAME = `sb-${new URL(SUPA).hostname.split(".")[0]}-auth-token`
const sessionCookie = (accessToken: string, sub: string) => {
  const session = {
    access_token: accessToken, token_type: "bearer", expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: "staging-refresh",
    user: { id: sub, aud: "authenticated", role: "authenticated", email: `${sub}@example.test` },
  }
  return `${COOKIE_NAME}=base64-${Buffer.from(JSON.stringify(session)).toString("base64url")}`
}
const subOf = (jwt: string) => JSON.parse(Buffer.from(jwt.split(".")[1], "base64url").toString("utf8")).sub as string
const ADMIN_COOKIE = sessionCookie(ADMIN, subOf(ADMIN))
const PLAIN_COOKIE = sessionCookie(PLAIN, subOf(PLAIN))

const ENDPOINT = `${BASE}/api/admin/owner/property-pricing`
type Res = { status: number; body: Record<string, unknown> }
async function get(placeId: string, cookie?: string): Promise<Res> {
  const r = await fetch(`${ENDPOINT}?placeId=${encodeURIComponent(placeId)}`, {
    headers: cookie ? { cookie } : {},
  })
  return { status: r.status, body: await r.json().catch(() => ({})) }
}
async function put(payload: unknown, cookie?: string, raw?: string): Promise<Res> {
  const r = await fetch(ENDPOINT, {
    method: "PUT",
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    body: raw ?? JSON.stringify(payload),
  })
  return { status: r.status, body: await r.json().catch(() => ({})) }
}

const FIXTURE = "ChIJ_staging_fixture_place_id"
const PRODUCTION_ONLY = "ChIJze0w-Nr0XIYRu0_8EJMzufg" // Villas at Oakwell Farms, in production only
const SEED_NOTES = "agent-reported 2026-11-02 (unverified): broken lease 3 years or older AND paid in full."

async function main() {
  console.log(`\nAPPROVAL CRITERIA — HTTP (${BASE} → ${SUPA})\n`)

  sql(`delete from public.property_enrichment_events where place_id like 'ChIJ_staging%'`)
  sql(`delete from public.property_catalog where place_id like 'ChIJ_staging%'`)
  sql(`insert into public.property_catalog
         (place_id, property_name, address, city, state, zip, updated_at,
          credit_minimum_status, credit_minimum_score, credit_observed_approval_score,
          credit_screening_notes, send_commission, escort_commission, bonus_flat)
       values ('${FIXTURE}', 'Staging Fixture Apartments', '1 Test Way', 'San Antonio', 'TX', '78218', now(),
          'reported_minimum', 580, 450, $n$${SEED_NOTES}$n$, '100%', '50%', '250')`)

  console.log("the server under test is NOT production")
  {
    const mine = await get(FIXTURE, ADMIN_COOKIE)
    ok("the staging fixture resolves", mine.status === 200 && mine.body.propertyName === "Staging Fixture Apartments",
      `${mine.status} ${JSON.stringify(mine.body).slice(0, 160)}`)
    const prod = await get(PRODUCTION_ONLY, ADMIN_COOKIE)
    ok("a place_id that exists ONLY in production does not resolve",
      prod.status === 404 && prod.body.error === "property_not_found", `${prod.status} ${JSON.stringify(prod.body)}`)
    ok("…so the app is on the staging database, not the live one", true)
  }

  console.log("\nauthentication — the one authorization boundary")
  {
    const anon = await get(FIXTURE)
    ok("no session → 401 unauthorized", anon.status === 401 && anon.body.error === "unauthorized",
      `${anon.status} ${JSON.stringify(anon.body)}`)
    const plain = await get(FIXTURE, PLAIN_COOKIE)
    ok("a signed-in NON-admin → 403 forbidden", plain.status === 403 && plain.body.error === "forbidden",
      `${plain.status} ${JSON.stringify(plain.body)}`)
    const tampered = await get(FIXTURE, sessionCookie(`${ADMIN.slice(0, -4)}AAAA`, subOf(ADMIN)))
    ok("a token with a broken signature → 401, not a pass", tampered.status === 401,
      `${tampered.status} ${JSON.stringify(tampered.body)}`)
    const admin = await get(FIXTURE, ADMIN_COOKIE)
    ok("the platform admin → 200", admin.status === 200)
    const anonWrite = await put({ placeId: FIXTURE, brokenLeaseStatus: "accepted" })
    ok("an unauthenticated WRITE is refused too", anonWrite.status === 401)
    ok("…and nothing was written", one<{ s: string | null }>(
      `select broken_lease_status as s from public.property_catalog where place_id='${FIXTURE}'`).s === null)
    const plainWrite = await put({ placeId: FIXTURE, brokenLeaseStatus: "accepted" }, PLAIN_COOKIE)
    ok("a non-admin WRITE is refused", plainWrite.status === 403)
    ok("…and still nothing was written", one<{ s: string | null }>(
      `select broken_lease_status as s from public.property_catalog where place_id='${FIXTURE}'`).s === null)
  }

  console.log("\nwhat GET returns")
  {
    const r = await get(FIXTURE, ADMIN_COOKIE)
    ok("the approval columns are reported as available", r.body.approvalAvailable === true)
    ok("the approval block is present and empty", typeof r.body.approval === "object" &&
      Object.values(r.body.approval as Record<string, unknown>).every((v) => v === null))
    ok("the credit answer round-trips", r.body.creditMinimumStatus === "reported_minimum" &&
      r.body.creditMinimumScore === 580 && r.body.creditObservedApprovalScore === 450)
    ok("the existing notes come back verbatim", r.body.creditScreeningNotes === SEED_NOTES)
    ok("no screening date is claimed", r.body.creditScreeningCheckedAt === null)
    ok("fieldCheckedAt is present for the age lines", typeof r.body.fieldCheckedAt === "object")
  }

  console.log("\nthe error contract")
  {
    const badJson = await put(null, ADMIN_COOKIE, "{not json")
    ok("malformed body → 400 bad_json", badJson.status === 400 && badJson.body.error === "bad_json")
    const badId = await put({ placeId: "short", brokenLeaseStatus: "accepted" }, ADMIN_COOKIE)
    ok("a malformed place id → 400 bad_place_id", badId.status === 400 && badId.body.error === "bad_place_id")
    const missing = await get("ChIJ_no_such_property_at_all", ADMIN_COOKIE)
    ok("an unknown property → 404 property_not_found", missing.status === 404 && missing.body.error === "property_not_found")
    const empty = await put({ placeId: FIXTURE }, ADMIN_COOKIE)
    ok("a body with nothing to change → 400 nothing_to_save", empty.status === 400 && empty.body.error === "nothing_to_save")
    const bad = await put({ placeId: FIXTURE, brokenLeaseStatus: "maybe", brokenLeaseMinAgeYears: "99" }, ADMIN_COOKIE)
    ok("invalid values → 400 bad_value", bad.status === 400 && bad.body.error === "bad_value")
    ok("…naming every bad field, not just the first",
      Array.isArray(bad.body.fields) && (bad.body.fields as string[]).includes("brokenLeaseStatus") &&
      (bad.body.fields as string[]).includes("brokenLeaseMinAgeYears"), JSON.stringify(bad.body))
    ok("…and writing none of them", one<{ s: string | null; y: number | null }>(
      `select broken_lease_status as s, broken_lease_min_age_years as y
         from public.property_catalog where place_id='${FIXTURE}'`).s === null)
  }

  console.log("\nsave, then reload")
  const FULL = {
    placeId: FIXTURE,
    brokenLeaseStatus: "accepted_if_paid", brokenLeaseMinAgeYears: "3",
    brokenLeaseBalanceRequirement: "must_be_paid", brokenLeaseMaxBalance: "2000.50",
    brokenLeasePositiveHistoryRequired: "yes",
    evictionStatus: "not_accepted", evictionMinAgeYears: "5",
    evictionBalanceRequirement: "payments_or_plan", evictionPositiveHistoryRequired: "no",
    rentalDebtStatus: "accepted", rentalDebtBalanceRequirement: "balance_ok", rentalDebtMaxBalance: "0",
    screeningAdditionalDeposit: "One month, nonrefundable",
    screeningRiskFee: "$250–$500 depending on score",
    screeningGuarantorProgram: "Liberty Rent accepted",
    screeningRequirementsCheckedAt: "2026-11-03",
  }
  {
    const saved = await put(FULL, ADMIN_COOKIE)
    ok("all sixteen save in one request → 200", saved.status === 200 && saved.body.ok === true,
      `${saved.status} ${JSON.stringify(saved.body).slice(0, 200)}`)
    ok("the response lists them as written", Array.isArray(saved.body.written) &&
      (saved.body.written as string[]).length === 16, JSON.stringify(saved.body.written))
    const r = await get(FIXTURE, ADMIN_COOKIE)
    const a = r.body.approval as Record<string, unknown>
    ok("broken lease reloads over HTTP exactly", a.broken_lease_status === "accepted_if_paid" &&
      a.broken_lease_min_age_years === 3 && a.broken_lease_balance_requirement === "must_be_paid" &&
      Number(a.broken_lease_max_balance) === 2000.5 && a.broken_lease_positive_history_required === true,
      JSON.stringify(a))
    ok("eviction reloads, with its explicit NOT required",
      a.eviction_status === "not_accepted" && a.eviction_min_age_years === 5 &&
      a.eviction_balance_requirement === "payments_or_plan" && a.eviction_positive_history_required === false)
    ok("rental debt reloads, with its 0 ceiling",
      a.rental_debt_status === "accepted" && Number(a.rental_debt_max_balance) === 0)
    ok("the charges survive the round trip verbatim",
      a.screening_additional_deposit === "One month, nonrefundable" &&
      a.screening_risk_fee === "$250–$500 depending on score" &&
      a.screening_guarantor_program === "Liberty Rent accepted")
    ok("the confirmation date is the one that was typed",
      String(a.screening_requirements_checked_at).startsWith("2026-11-03"))
    ok("the age lines now have provenance for a saved field",
      typeof (r.body.fieldCheckedAt as Record<string, unknown>).broken_lease_status === "string")
  }

  console.log("\npreservation — a one-field save leaves everything else")
  {
    const before = one<Record<string, unknown>>(
      `select * from public.property_catalog where place_id='${FIXTURE}'`)
    const r = await put({ placeId: FIXTURE, brokenLeaseStatus: "not_accepted" }, ADMIN_COOKIE)
    ok("the save succeeds and reports one field", r.status === 200 &&
      (r.body.written as string[]).length === 1, JSON.stringify(r.body))
    const after = one<Record<string, unknown>>(
      `select * from public.property_catalog where place_id='${FIXTURE}'`)
    ok("the status changed", after.broken_lease_status === "not_accepted")
    const untouched = Object.keys(before).filter((k) =>
      !["broken_lease_status", "updated_at", "intel_enriched_at"].includes(k) &&
      String(before[k]) !== String(after[k]))
    ok("every other column is byte-identical", untouched.length === 0, `changed: ${untouched.join(", ")}`)
    ok("…including the credit answer, the notes and the commission",
      after.credit_minimum_score === 580 && after.credit_screening_notes === SEED_NOTES &&
      after.send_commission === "100%" && after.bonus_flat === "250")
    ok("…and credit_screening_checked_at is still NULL", after.credit_screening_checked_at === null)
  }

  console.log("\nclearing over HTTP")
  {
    const r = await put({ placeId: FIXTURE, brokenLeaseMinAgeYears: "", screeningRiskFee: "" }, ADMIN_COOKIE)
    ok("blanks are accepted as a deliberate clear", r.status === 200 && (r.body.written as string[]).length === 2)
    const a = (await get(FIXTURE, ADMIN_COOKIE)).body.approval as Record<string, unknown>
    ok("they come back NULL", a.broken_lease_min_age_years === null && a.screening_risk_fee === null)
    ok("their neighbours are untouched", a.broken_lease_balance_requirement === "must_be_paid" &&
      a.screening_additional_deposit === "One month, nonrefundable")
  }

  console.log("\nwhen the migration has not been applied")
  {
    // Exactly the state production is in today. One column is enough: the route probes all
    // sixteen in one select, so a single missing column is the honest signal.
    sql(`alter table public.property_catalog drop column rental_debt_max_balance`)
    sql(`notify pgrst, 'reload schema'`)
    await new Promise((r) => setTimeout(r, 600))
    const r = await get(FIXTURE, ADMIN_COOKIE)
    ok("GET still works — the editor is not broken by the missing columns", r.status === 200)
    ok("…and says the approval columns are unavailable", r.body.approvalAvailable === false)
    ok("…while the credit answer and the notes still come back",
      r.body.creditMinimumScore === 580 && r.body.creditScreeningNotes === SEED_NOTES)
    const w = await put({ placeId: FIXTURE, brokenLeaseStatus: "accepted" }, ADMIN_COOKIE)
    ok("a structured save is REFUSED with 409 approval_columns_missing",
      w.status === 409 && w.body.error === "approval_columns_missing", `${w.status} ${JSON.stringify(w.body)}`)
    // THE REGRESSION THIS BLOCK EXISTS FOR. The store reads every owner-only column, so a release
    // that reaches production ahead of its migration used to fail EVERY owner edit, not just an
    // approval one: the select named a missing column, the read failed, and the writer answered
    // property_not_found for a commission correction. Found here, fixed in the store's fallback.
    const c = await put({ placeId: FIXTURE, creditScreeningNotes: `${SEED_NOTES} Updated.` }, ADMIN_COOKIE)
    ok("…but a notes-only save still succeeds", c.status === 200, `${c.status} ${JSON.stringify(c.body)}`)
    const comm = await put({ placeId: FIXTURE, sendCommission: "110" }, ADMIN_COOKIE)
    ok("…and so does a COMMISSION edit, which has nothing to do with screening",
      comm.status === 200, `${comm.status} ${JSON.stringify(comm.body)}`)
    ok("…and it actually landed", one<{ c: string }>(
      `select send_commission as c from public.property_catalog where place_id='${FIXTURE}'`).c === "110%")
    const gift = await put({ placeId: FIXTURE, giftCardStatus: "no" }, ADMIN_COOKIE)
    ok("…and a gift-card edit", gift.status === 200, `${gift.status} ${JSON.stringify(gift.body)}`)
    sql(`alter table public.property_catalog add column rental_debt_max_balance numeric(10,2)`)
    sql(`notify pgrst, 'reload schema'`)
    await new Promise((r) => setTimeout(r, 600))
    ok("the column is restored for the next run",
      (await get(FIXTURE, ADMIN_COOKIE)).body.approvalAvailable === true)
  }

  console.log("\nclearing a commission by hand, now that the button is gone")
  {
    // THE EXACT SEQUENCE THE AGENT PERFORMS: select the value, delete it, save. The panel turns
    // that into an explicit null (there is no button any more), and this proves the null reaches
    // the column — the thing that would have silently stopped working had the panel kept sending
    // a blank string.
    await put({ placeId: FIXTURE, sendCommission: "100", escortCommission: "50" }, ADMIN_COOKIE)
    ok("a commission saves to begin with", one<{ s: string; e: string }>(
      `select send_commission as s, escort_commission as e from public.property_catalog where place_id='${FIXTURE}'`).s === "100%")

    const cleared = await put({ placeId: FIXTURE, sendCommission: null, escortCommission: null }, ADMIN_COOKIE)
    ok("emptying both and saving succeeds", cleared.status === 200, `${cleared.status} ${JSON.stringify(cleared.body)}`)
    const after = one<{ s: string | null; e: string | null }>(
      `select send_commission as s, escort_commission as e from public.property_catalog where place_id='${FIXTURE}'`)
    ok("…and BOTH reach NULL in the column", after.s === null && after.e === null, JSON.stringify(after))

    const back = await put({ placeId: FIXTURE, sendCommission: "110" }, ADMIN_COOKIE)
    ok("…and a value can be entered again afterwards", back.status === 200 && one<{ s: string }>(
      `select send_commission as s from public.property_catalog where place_id='${FIXTURE}'`).s === "110%")

    // 0 IS NOT BLANK, all the way to the column.
    await put({ placeId: FIXTURE, bonusFlat: "0" }, ADMIN_COOKIE)
    ok("an explicit 0 is stored as a confirmed zero, not a clear", one<{ b: string | null }>(
      `select bonus_flat as b from public.property_catalog where place_id='${FIXTURE}'`).b === "0")
    await put({ placeId: FIXTURE, bonusFlat: null }, ADMIN_COOKIE)
    ok("…and emptying it afterwards reaches NULL, which is a different state", one<{ b: string | null }>(
      `select bonus_flat as b from public.property_catalog where place_id='${FIXTURE}'`).b === null)
  }

  console.log("\nthe audit trail behind the HTTP calls")
  {
    const n = one<{ n: number }>(`select count(*)::int as n from public.property_enrichment_events
      where place_id='${FIXTURE}' and field_name like 'broken_lease%'`).n
    ok("the requirement changes are recorded", n >= 3, String(n))
    ok("…with the previous value", one<{ n: number }>(
      `select count(*)::int as n from public.property_enrichment_events
        where place_id='${FIXTURE}' and field_name='broken_lease_status'
          and old_value='accepted_if_paid' and new_value='not_accepted'`).n === 1)
    ok("an unsourced owner edit stays INFERRED", one<{ n: number }>(
      `select count(*)::int as n from public.property_enrichment_events
        where place_id='${FIXTURE}' and verification_status='verified'`).n === 0)
    const sourced = await put({ placeId: FIXTURE, screeningGuarantorProgram: "Liberty Rent, confirmed", pricingSource: "Called the office, Nov 3" }, ADMIN_COOKIE)
    ok("…and a sourced one is recorded as verified", sourced.status === 200 && one<{ v: string }>(
      `select verification_status as v from public.property_enrichment_events
        where place_id='${FIXTURE}' and field_name='screening_guarantor_program' order by seq desc limit 1`).v === "verified")
  }

  sql(`delete from public.property_enrichment_events where place_id like 'ChIJ_staging%'`)
  sql(`delete from public.property_catalog where place_id like 'ChIJ_staging%'`)
  ok("the fixture is removed afterwards", one<{ n: number }>(
    `select count(*)::int as n from public.property_catalog where place_id='${FIXTURE}'`).n === 0)

  console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"} — ${pass} passed, ${fail} failed\n`)
  process.exit(fail === 0 ? 0 : 1)
}

main().catch((e) => { console.error(e); process.exit(1) })
