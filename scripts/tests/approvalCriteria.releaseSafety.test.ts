/**
 * RELEASE SAFETY — the same application, against both database states.
 *
 * THE QUESTION THIS ANSWERS. The Approval Criteria columns arrive in a migration, and a deploy is
 * not atomic with one. So the release has to be correct in two worlds:
 *
 *   BEFORE the migrations — the sixteen columns do not exist. The new section must say so and
 *     refuse a structured save, and EVERY pre-existing owner edit must keep working exactly as it
 *     does today. That is the part that nearly shipped broken: the store reads every owner-only
 *     column, so a missing one failed the whole read and the writer answered property_not_found
 *     for a commission correction.
 *
 *   AFTER the migrations — the sixteen exist, all of them save and reload, and the pre-existing
 *     edits are still untouched by their arrival.
 *
 * So the identical matrix of owner edits runs TWICE, over real HTTP, against the real route, with
 * the only difference being whether the migrations have been applied. Anything that behaves
 * differently between the two phases is a release risk by definition.
 *
 * It gets to the "before" state by running the SHIPPED ROLLBACK FILES, and back by running the
 * SHIPPED MIGRATIONS — so the rollback procedure in the release notes is exercised here too.
 *
 * SETUP: as scripts/tests/approvalCriteria.http.test.ts.
 *   eval "$(bash scripts/tests/approvalCriteria.httpEnv.sh start | grep ^APPROVAL)"
 *   npx tsx scripts/tests/approvalCriteria.releaseSafety.test.ts
 *   bash scripts/tests/approvalCriteria.httpEnv.sh stop
 */
import { execFileSync } from "node:child_process"
import { existsSync } from "node:fs"
import { APPROVAL_COLUMNS } from "@/lib/propertyIntel/approvalCriteria"

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
    "  npx tsx scripts/tests/approvalCriteria.releaseSafety.test.ts\n" +
    "\n0 passed, 0 failed (skipped)\n",
  )
  process.exit(0)
}
for (const [n, u] of [["APPROVAL_HTTP_BASE", BASE], ["APPROVAL_SUPABASE_URL", SUPA]] as const) {
  const h = new URL(u).hostname
  if (h !== "127.0.0.1" && h !== "localhost") { console.error(`\nREFUSED: ${n} is ${h}, not loopback.\n`); process.exit(2) }
}

const PSQL = ["/opt/homebrew/opt/postgresql@17/bin/psql", "/opt/homebrew/opt/postgresql@16/bin/psql", "psql"]
  .find((p) => { try { execFileSync(p, ["--version"], { stdio: "ignore" }); return true } catch { return false } })!
const sql = (q: string) => execFileSync(PSQL, ["-v", "ON_ERROR_STOP=1", "-tAX", "-d", DB, "-c", q], { encoding: "utf8" })
const sqlFile = (f: string) => execFileSync(PSQL, ["-v", "ON_ERROR_STOP=1", "-tAX", "-d", DB, "-f", f], { encoding: "utf8" })
const row = (): Record<string, unknown> =>
  JSON.parse(sql(`select coalesce(json_agg(t),'[]')::text from (select * from public.property_catalog where place_id='${FIXTURE}') t`).trim())[0]

const prepared = (n: string) => existsSync(`supabase/migrations/${n}`) ? `supabase/migrations/${n}` : `supabase/prepared/${n}`
const M0 = prepared("20261110000000_property_screening_requirements.sql")
const M4 = prepared("20261110000004_approval_criteria_fields.sql")
const R0 = "supabase/prepared/ROLLBACK_20261110000000_property_screening_requirements.sql"
const R4 = "supabase/prepared/ROLLBACK_20261110000004_approval_criteria_fields.sql"

const COOKIE = (() => {
  const sub = JSON.parse(Buffer.from(ADMIN.split(".")[1], "base64url").toString("utf8")).sub as string
  const session = {
    access_token: ADMIN, token_type: "bearer", expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: "staging",
    user: { id: sub, aud: "authenticated", role: "authenticated", email: `${sub}@example.test` },
  }
  return `sb-${new URL(SUPA).hostname.split(".")[0]}-auth-token=base64-${Buffer.from(JSON.stringify(session)).toString("base64url")}`
})()

const ENDPOINT = `${BASE}/api/admin/owner/property-pricing`
const get = async () => {
  const r = await fetch(`${ENDPOINT}?placeId=${FIXTURE}`, { headers: { cookie: COOKIE } })
  return { status: r.status, body: (await r.json().catch(() => ({}))) as Record<string, unknown> }
}
const put = async (payload: Record<string, unknown>) => {
  const r = await fetch(ENDPOINT, {
    method: "PUT", headers: { "content-type": "application/json", cookie: COOKIE },
    body: JSON.stringify({ placeId: FIXTURE, ...payload }),
  })
  return { status: r.status, body: (await r.json().catch(() => ({}))) as Record<string, unknown> }
}

const FIXTURE = "ChIJ_release_safety_fixture"
const NOTES = "agent-reported 2026-11-02 (unverified): broken lease 3 years or older AND paid in full."

function reseed() {
  sql(`delete from public.property_enrichment_events where place_id='${FIXTURE}'`)
  sql(`delete from public.property_catalog where place_id='${FIXTURE}'`)
  sql(`insert into public.property_catalog
        (place_id, property_name, address, city, state, zip, updated_at,
         send_commission, escort_commission, bonus_flat, current_special,
         gift_card_status, gift_card_amount,
         credit_minimum_status, credit_minimum_score, credit_observed_approval_score,
         credit_screening_notes)
       values ('${FIXTURE}','Release Safety Fixture','1 Test Way','San Antonio','TX','78218', now(),
         '100%','50%','250','4 Weeks Free', 'yes', 500,
         'reported_minimum', 580, 450, $n$${NOTES}$n$)`)
}
const reloadRest = async () => { sql(`notify pgrst, 'reload schema'`); await new Promise((r) => setTimeout(r, 700)) }

/** The pre-existing owner edits, every one of them, end to end. Identical in both phases. */
async function ownerEditMatrix(phase: string) {
  reseed()

  console.log(`\n  [${phase}] commission`)
  {
    const r = await put({ sendCommission: "110", escortCommission: "60" })
    ok(`[${phase}] a commission correction saves`, r.status === 200, `${r.status} ${JSON.stringify(r.body)}`)
    const a = row()
    ok(`[${phase}] …and lands as text with its percent`, a.send_commission === "110%" && a.escort_commission === "60%",
      `${a.send_commission} / ${a.escort_commission}`)
    const c = await put({ sendCommission: null })
    ok(`[${phase}] Clear to unknown returns it to NULL`, c.status === 200 && row().send_commission === null)
    const back = await put({ sendCommission: "100" })
    ok(`[${phase}] …and it can be filled again`, back.status === 200 && row().send_commission === "100%")
  }

  console.log(`  [${phase}] agent bonus — blank versus explicit zero`)
  {
    ok(`[${phase}] the fixture starts at 250`, row().bonus_flat === "250")
    const blank = await put({ bonusFlat: "", escortCommission: "55" })
    ok(`[${phase}] a BLANK bonus is not written`, blank.status === 200 && row().bonus_flat === "250",
      `bonus became ${row().bonus_flat}`)
    const zero = await put({ bonusFlat: "0" })
    ok(`[${phase}] an EXPLICIT 0 is written — a confirmed no-pay property`,
      zero.status === 200 && row().bonus_flat === "0", `bonus is ${row().bonus_flat}`)
    ok(`[${phase}] …and 0 is distinguishable from unknown in the database`, row().bonus_flat === "0")
    const cleared = await put({ bonusFlat: null })
    ok(`[${phase}] Clear to unknown makes it NULL, which is NOT 0`,
      cleared.status === 200 && row().bonus_flat === null)
    await put({ bonusFlat: "250" })
    ok(`[${phase}] …and a value can be entered again`, row().bonus_flat === "250")
  }

  console.log(`  [${phase}] specials`)
  {
    const r = await put({ currentSpecial: "6 Weeks Free on Select Homes" })
    ok(`[${phase}] a special saves`, r.status === 200 && row().current_special === "6 Weeks Free on Select Homes",
      `${r.status} ${row().current_special}`)
    ok(`[${phase}] …and stamps the pricing date, not the screening one`,
      row().pricing_last_verified !== null && row().credit_screening_checked_at === null)
  }

  console.log(`  [${phase}] gift cards`)
  {
    // ── A PRE-EXISTING DEFECT, ASSERTED AS IT IS ────────────────────────────────────────────
    // No gift-card write succeeds through this route, and none ever has. gift_card_status,
    // gift_card_amount and gift_card_checked_at sit in OWNER_CORRECTABLE_FIELDS only, and the
    // writer's allowlist gate consults ENRICHMENT_WRITABLE_FIELDS and the owner-only set — not
    // OWNER_CORRECTABLE_FIELDS — so every candidate is rejected `not_writable` before the policy's
    // owner branch is reached. Verified on an empty row as well as a populated one, while a
    // special written in the same request lands.
    //
    // At f78a1e6 the gate is byte-identical and gift_card_* sits in exactly the same set, so this
    // release does not cause it and does not worsen it: the one change to that gate widened the
    // owner branch from the commission set to the owner-only set, which can only admit MORE.
    //
    // It is asserted here as the CURRENT behaviour rather than skipped, so that if this release —
    // or any later one — changes what a gift-card save does, this test says so.
    const yes = await put({ giftCardStatus: "yes", giftCardAmount: "750" })
    ok(`[${phase}] the request itself succeeds`, yes.status === 200, `${yes.status}`)
    ok(`[${phase}] …but the gift card is rejected not_writable — the pre-existing defect`,
      Array.isArray(yes.body.skipped) &&
      (yes.body.skipped as Array<{ field: string; reason: string }>)
        .some((x) => x.field === "gift_card_status" && x.reason === "not_writable"),
      JSON.stringify(yes.body))
    ok(`[${phase}] …so the stored value is unchanged, not corrupted`,
      row().gift_card_status === "yes" && Number(row().gift_card_amount) === 500)
    const bad = await put({ giftCardStatus: "yes", giftCardAmount: "0" })
    ok(`[${phase}] "yes" with no amount is still refused at the route, before the writer`,
      bad.status === 400 && bad.body.error === "bad_value")
    // And the contrast that proves the row itself is writable: a special in the same shape lands.
    const sp = await put({ currentSpecial: "8 Weeks Free" })
    ok(`[${phase}] …while a special on the same row DOES write`,
      sp.status === 200 && row().current_special === "8 Weeks Free")
  }

  console.log(`  [${phase}] existing credit-screening edits`)
  {
    const s = await put({ creditMinimumStatus: "reported_minimum", creditMinimumScore: "600" })
    ok(`[${phase}] a reported minimum saves with its score`,
      s.status === 200 && row().credit_minimum_status === "reported_minimum" && row().credit_minimum_score === 600)
    const bad = await put({ creditMinimumScore: "200" })
    ok(`[${phase}] a score outside 300–850 is refused`, bad.status === 400 && bad.body.error === "bad_value")
    const obs = await put({ creditObservedApprovalScore: "480" })
    ok(`[${phase}] the observed approval saves separately`,
      obs.status === 200 && row().credit_observed_approval_score === 480)
    const clr = await put({ creditObservedApprovalScore: "" })
    ok(`[${phase}] …and clears to NULL on its own`, clr.status === 200 && row().credit_observed_approval_score === null)
    const nc = await put({ creditMinimumStatus: "no_check_reported" })
    ok(`[${phase}] "no credit check reported" clears the score`,
      nc.status === 200 && row().credit_minimum_status === "no_check_reported" && row().credit_minimum_score === null)
    const un = await put({ creditMinimumStatus: null })
    ok(`[${phase}] …and null returns it to not-researched`, un.status === 200 && row().credit_minimum_status === null)
  }

  console.log(`  [${phase}] existing screening notes`)
  {
    ok(`[${phase}] the seeded notes are intact so far`, row().credit_screening_notes === NOTES)
    const appended = `${NOTES}\nBroken-lease balance confirmed paid, 3 Nov.`
    const r = await put({ creditScreeningNotes: appended })
    ok(`[${phase}] an append saves`, r.status === 200 && row().credit_screening_notes === appended)
    ok(`[${phase}] …and the original text is still the first line`,
      String(row().credit_screening_notes).startsWith(NOTES))
    const other = await put({ nearbyLandmark: "Near Brooks City Base" })
    ok(`[${phase}] an unrelated edit does not touch the notes`,
      other.status === 200 && row().credit_screening_notes === appended)
    ok(`[${phase}] …and still stamps no screening date`, row().credit_screening_checked_at === null)
  }

  console.log(`  [${phase}] nothing drifted while all that happened`)
  {
    const a = row()
    ok(`[${phase}] the property is still itself`, a.property_name === "Release Safety Fixture" && a.zip === "78218")
    ok(`[${phase}] the audit trail recorded the edits`, Number(JSON.parse(
      sql(`select coalesce(json_agg(t),'[]')::text from (select count(*)::int as n from public.property_enrichment_events where place_id='${FIXTURE}') t`).trim())[0].n) > 10)
  }
}

async function main() {
  console.log(`\nRELEASE SAFETY — the same build against both database states (${BASE})\n`)

  // ── PHASE 1: BEFORE THE MIGRATIONS ────────────────────────────────────────────────────────
  console.log("═══ PHASE 1 — BEFORE the Approval Criteria migrations ═══")
  console.log("\n  getting there with the SHIPPED rollback files")
  sqlFile(R4); sqlFile(R0)
  await reloadRest()
  {
    const n = JSON.parse(sql(`select coalesce(json_agg(t),'[]')::text from (
      select count(*)::int as n from information_schema.columns
       where table_schema='public' and table_name='property_catalog'
         and column_name in (${APPROVAL_COLUMNS.map((c) => `'${c}'`).join(",")})) t`).trim())[0].n
    ok("the rollbacks removed all sixteen columns", Number(n) === 0, `${n} still present`)
  }
  reseed()
  {
    const r = await get()
    ok("the editor still LOADS", r.status === 200)
    ok("…and reports the structured fields unavailable", r.body.approvalAvailable === false)
    ok("…while the credit answer still comes back", r.body.creditMinimumScore === 580)
    ok("…and the existing notes still come back", r.body.creditScreeningNotes === NOTES)
    const w = await put({ brokenLeaseStatus: "accepted" })
    ok("a structured save is refused with 409 approval_columns_missing",
      w.status === 409 && w.body.error === "approval_columns_missing", `${w.status} ${JSON.stringify(w.body)}`)
    ok("…and the refusal names the fields it could not take",
      Array.isArray(w.body.fields) && (w.body.fields as string[]).includes("brokenLeaseStatus"))
  }
  await ownerEditMatrix("before")

  // ── PHASE 2: AFTER THE MIGRATIONS ─────────────────────────────────────────────────────────
  console.log("\n═══ PHASE 2 — AFTER both migrations ═══")
  console.log("\n  applying the SHIPPED migrations, in release order")
  sqlFile(M0); sqlFile(M4)
  await reloadRest()
  {
    const n = JSON.parse(sql(`select coalesce(json_agg(t),'[]')::text from (
      select count(*)::int as n from information_schema.columns
       where table_schema='public' and table_name='property_catalog'
         and column_name in (${APPROVAL_COLUMNS.map((c) => `'${c}'`).join(",")})) t`).trim())[0].n
    ok("all sixteen columns are back", Number(n) === APPROVAL_COLUMNS.length, `${n} present`)
  }
  await ownerEditMatrix("after")

  console.log("\n  [after] and now the Approval Criteria themselves")
  {
    const r = await get()
    ok("the editor reports the structured fields available", r.body.approvalAvailable === true)
    const saved = await put({
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
    })
    ok("all sixteen save in one request", saved.status === 200 && (saved.body.written as string[]).length === 16,
      `${saved.status} ${JSON.stringify(saved.body).slice(0, 200)}`)
    const a = (await get()).body.approval as Record<string, unknown>
    ok("every one reloads as typed",
      a.broken_lease_status === "accepted_if_paid" && a.broken_lease_min_age_years === 3 &&
      a.broken_lease_balance_requirement === "must_be_paid" && Number(a.broken_lease_max_balance) === 2000.5 &&
      a.broken_lease_positive_history_required === true && a.eviction_status === "not_accepted" &&
      a.eviction_min_age_years === 5 && a.eviction_balance_requirement === "payments_or_plan" &&
      a.eviction_positive_history_required === false && a.rental_debt_status === "accepted" &&
      a.rental_debt_balance_requirement === "balance_ok" && Number(a.rental_debt_max_balance) === 0 &&
      a.screening_additional_deposit === "One month, nonrefundable" &&
      a.screening_risk_fee === "$250–$500 depending on score" &&
      a.screening_guarantor_program === "Liberty Rent accepted" &&
      String(a.screening_requirements_checked_at).startsWith("2026-11-03"),
      JSON.stringify(a))
    const after = row()
    ok("…and the pre-existing fields are still what the matrix left",
      after.credit_screening_notes !== null && after.bonus_flat === "250" && after.send_commission === "100%",
      `${after.bonus_flat} / ${after.send_commission}`)
    ok("…with still no screening date claimed", after.credit_screening_checked_at === null)
  }

  sql(`delete from public.property_enrichment_events where place_id='${FIXTURE}'`)
  sql(`delete from public.property_catalog where place_id='${FIXTURE}'`)
  console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"} — ${pass} passed, ${fail} failed\n`)
  process.exit(fail === 0 ? 0 : 1)
}

main().catch((e) => { console.error(e); process.exit(1) })
