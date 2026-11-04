/**
 * APPROVAL CRITERIA — INTEGRATION TEST AGAINST A REAL POSTGRES.
 *
 * The unit suite proves the editor and the route agree about the vocabulary. This one proves the
 * database agrees too: it applies the two prepared migrations to a throwaway cluster, then drives
 * the REAL enrichment writer — the same `enrichProperty` the route calls, with candidates built by
 * the same `planApprovalWrites` the route calls — and reads the rows back out.
 *
 * WHAT IT ANSWERS THAT A UNIT TEST CANNOT:
 *   • does every one of the sixteen columns actually accept what the editor sends?
 *   • does a CHECK constraint reject the tokens the parser rejects, and accept the ones it allows?
 *   • does a field the agent did not touch survive a save that writes its neighbours?
 *   • does a blank come back as NULL rather than as '' or 0?
 *   • does the append-only trail record the previous value?
 *   • does anything stamp a verification date behind our back?
 *
 * ── IT WILL NOT RUN AGAINST PRODUCTION ──────────────────────────────────────────────────────
 * It needs APPROVAL_TEST_DATABASE_URL, and it refuses anything that is not loopback unless
 * APPROVAL_TEST_ALLOW_REMOTE=1 is also set — and even then it refuses a host that matches the
 * project in .env.local. It then refuses any database holding more than APPROVAL_TEST_MAX_ROWS
 * (default 50) property_catalog rows, because production has 4,207 and a staging copy of it would
 * have about as many. Three independent locks, any one of which stops it.
 *
 * SETUP (no Docker, no Supabase CLI):
 *   bash scripts/tests/approvalCriteria.localdb.sh start
 *   APPROVAL_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:54329/lb_approval_test \
 *     npx tsx scripts/tests/approvalCriteria.integration.test.ts
 *   bash scripts/tests/approvalCriteria.localdb.sh stop
 */
import { execFileSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import { enrichProperty } from "@/lib/propertyEnrichment/writer"
import {
  ENRICHMENT_WRITABLE_FIELDS, IMAGE_FIELDS, OWNER_CREDIT_FIELDS, OWNER_COMMISSION_FIELDS,
} from "@/lib/propertyEnrichment/policy"
import type { EnrichmentStore } from "@/lib/propertyEnrichment/store"
import type { EnrichmentEvent, FieldCandidate, FieldProvenance, PropertySnapshot } from "@/lib/propertyEnrichment/types"
import {
  APPROVAL_FIELDS, APPROVAL_COLUMNS, planApprovalWrites, approvalValueToInput,
} from "@/lib/propertyIntel/approvalCriteria"

let pass = 0
let fail = 0
const ok = (l: string, c: boolean, d = "") => {
  if (c) { pass++; console.log(`  ✓ ${l}`) }
  else { fail++; console.log(`  ✗ ${l}${d ? `\n      ${d}` : ""}`) }
}

// ── THE THREE LOCKS ─────────────────────────────────────────────────────────────────────────
const URL_ = process.env.APPROVAL_TEST_DATABASE_URL
if (!URL_) {
  // SKIP, not fail. scripts/runAllTests.sh globs scripts/tests/*.test.ts, and this one needs a
  // database that only exists when somebody deliberately started one. A red suite on every
  // machine that has not opted in would teach people to ignore the colour.
  console.log(
    "\nSKIPPED — APPROVAL_TEST_DATABASE_URL is not set, so there is no database to run against.\n" +
    "  bash scripts/tests/approvalCriteria.localdb.sh start\n" +
    "  APPROVAL_TEST_DATABASE_URL=<the url it prints> npx tsx scripts/tests/approvalCriteria.integration.test.ts\n" +
    "  bash scripts/tests/approvalCriteria.localdb.sh stop\n" +
    "\n0 passed, 0 failed (skipped)\n",
  )
  process.exit(0)
}
const host = (() => { try { return new URL(URL_).hostname } catch { return "" } })()
const LOOPBACK = host === "127.0.0.1" || host === "localhost" || host === "::1"
if (!LOOPBACK && process.env.APPROVAL_TEST_ALLOW_REMOTE !== "1") {
  console.error(`\nREFUSED: ${host} is not loopback. Set APPROVAL_TEST_ALLOW_REMOTE=1 only for a database you are willing to have rewritten.\n`)
  process.exit(2)
}
if (existsSync(".env.local")) {
  const prod = /NEXT_PUBLIC_SUPABASE_URL=["']?([^"'\n]+)/.exec(readFileSync(".env.local", "utf8"))?.[1] ?? ""
  const prodHost = (() => { try { return new URL(prod).hostname } catch { return "" } })()
  const ref = prodHost.split(".")[0]
  if (prodHost && (host === prodHost || (ref.length > 8 && URL_.includes(ref)))) {
    console.error(`\nREFUSED: that is the project in .env.local (${prodHost}). This test writes and deletes rows.\n`)
    process.exit(2)
  }
}

// ── psql, as the only way in ────────────────────────────────────────────────────────────────
const PSQL = ["/opt/homebrew/opt/postgresql@17/bin/psql", "/opt/homebrew/opt/postgresql@16/bin/psql", "psql"]
  .find((p) => { try { execFileSync(p, ["--version"], { stdio: "ignore" }); return true } catch { return false } })
if (!PSQL) { console.error("\npsql is not on PATH. brew install postgresql@17\n"); process.exit(2) }

const run = (sql: string): string =>
  execFileSync(PSQL, ["-v", "ON_ERROR_STOP=1", "-tAX", "-d", URL_, "-c", sql], { encoding: "utf8" })
const runFile = (path: string): string =>
  execFileSync(PSQL, ["-v", "ON_ERROR_STOP=1", "-tAX", "-d", URL_, "-f", path], { encoding: "utf8" })
/** A JSON literal, dollar-quoted so no value needs escaping. The tag is checked, not assumed. */
const lit = (v: unknown): string => {
  const j = JSON.stringify(v)
  if (j.includes("$lbj$")) throw new Error("value collides with the quoting tag")
  return `$lbj$${j}$lbj$`
}
/** A TEXT literal. Deliberately NOT lit(): JSON.stringify wraps the value in quotes that would
 *  become part of the string, so a place_id written one way and read the other would not match.
 *  That exact mistake made the audit assertions read an empty table while the writes succeeded. */
const txt = (v: string): string => {
  if (v.includes("$lbt$")) throw new Error("value collides with the quoting tag")
  return `$lbt$${v}$lbt$`
}
const rows = <T,>(sql: string): T[] => {
  const out = run(`select coalesce(json_agg(t), '[]'::json)::text from (${sql}) t`).trim()
  return JSON.parse(out || "[]") as T[]
}

// ── THE THIRD LOCK: this database must not be holding real data ─────────────────────────────
// buildSchema() DROPS property_catalog. That is correct for a throwaway and catastrophic
// anywhere else, so the row count is checked before anything is dropped: production has 4,207
// properties and any copy of it has about as many.
{
  const MAX = Number(process.env.APPROVAL_TEST_MAX_ROWS ?? 50)
  const exists = run(`select to_regclass('public.property_catalog') is not null`).trim() === "t"
  if (exists) {
    const n = Number(run(`select count(*) from public.property_catalog`).trim())
    if (!Number.isFinite(n) || n > MAX) {
      console.error(`\nREFUSED: public.property_catalog holds ${n} rows (limit ${MAX}). This test DROPS that table.\n`)
      process.exit(2)
    }
  }
}

// ── A STORE OVER psql — the ONLY thing faked here ───────────────────────────────────────────
// It implements the same EnrichmentStore interface the Supabase store does, so the writer, the
// firewall and every policy decision under test are the production ones. What it replaces is
// PostgREST, which needs a running Supabase stack; the SQL it issues is the SQL PostgREST would.
const TEST_PLACE = "ChIJ_integration_test_place_id"
class PsqlStore implements EnrichmentStore {
  async loadProperty(placeId: string): Promise<PropertySnapshot | null> {
    const r = rows<Record<string, unknown>>(
      `select * from public.property_catalog where place_id = ${txt(placeId)}::text`)[0]
    if (!r) return null
    const values: Record<string, unknown> = {}
    for (const k of Object.keys(r)) {
      if (["place_id", "updated_at", "image_selection_state", "image_backup_state"].includes(k)) continue
      values[k] = r[k]
    }
    return {
      placeId,
      updatedAt: (r.updated_at as string | null) ?? null,
      imageSelectionState: (r.image_selection_state as PropertySnapshot["imageSelectionState"]) ?? "missing",
      imageBackupState: (r.image_backup_state as PropertySnapshot["imageBackupState"]) ?? "missing",
      values,
    }
  }
  async currentProvenance(placeId: string): Promise<Record<string, FieldProvenance>> {
    const out: Record<string, FieldProvenance> = {}
    for (const r of rows<{ field_name: string; value: string | null; source_type: string; verification_status: string }>(
      `select field_name, value, source_type, verification_status
         from public.property_field_provenance where place_id = ${txt(placeId)}::text`)) {
      out[r.field_name] = {
        sourceType: r.source_type as FieldProvenance["sourceType"],
        verificationStatus: r.verification_status as FieldProvenance["verificationStatus"],
        value: r.value,
      }
    }
    return out
  }
  async applyPatch(placeId: string, patch: Record<string, unknown>, expectedUpdatedAt: string | null): Promise<boolean> {
    const cols = Object.keys(patch)
    if (cols.length === 0) return true
    // json_populate_record types every value from the COLUMN, so an integer column gets an
    // integer and a date column a date — exactly what PostgREST does, and the CHECK constraints
    // see the same thing they would in production.
    const set = cols.map((c) => `${c} = n.${c}`).join(", ")
    const guard = expectedUpdatedAt === null ? "p.updated_at is null" : `p.updated_at = ${txt(expectedUpdatedAt)}::timestamptz`
    const sql = `update public.property_catalog p
                 set ${set}, updated_at = now()
                 from json_populate_record(null::public.property_catalog, ${lit(patch)}::json) n
                 where p.place_id = ${txt(placeId)}::text and ${guard}
                 returning p.place_id`
    return run(sql).trim().length > 0
  }
  async recordEvents(events: EnrichmentEvent[]): Promise<void> {
    if (events.length === 0) return
    run(`insert into public.property_enrichment_events
           (job_id, place_id, field_name, action, old_value, new_value, source_type,
            source_reference, verification_status, reason, checked_at)
         select job_id, place_id, field_name, action, old_value, new_value, source_type,
                source_reference, verification_status, reason, checked_at
           from json_populate_recordset(null::public.property_enrichment_events, ${lit(events.map((e) => ({
             job_id: e.jobId, place_id: e.placeId, field_name: e.fieldName, action: e.action,
             old_value: e.oldValue, new_value: e.newValue, source_type: e.sourceType,
             source_reference: e.sourceReference, verification_status: e.verificationStatus,
             reason: e.reason, checked_at: e.checkedAt,
           })))}::json)`)
  }
}

// ── SCHEMA ──────────────────────────────────────────────────────────────────────────────────
// Only what the writer reads and the migrations touch. The sixteen approval columns are NOT
// created here on purpose: the migrations under test add them, which is half the point.
const TYPED: Record<string, string> = {
  place_id: "text primary key", updated_at: "timestamptz",
  // The writer's own last-pass marker, stamped on ANY successful patch. Not a verification date
  // and not one of ours — but the column has to exist or every patch fails.
  intel_enriched_at: "timestamptz",
  image_selection_state: "text", image_backup_state: "text",
  property_name: "text", address: "text",
  credit_minimum_status: "text", credit_minimum_score: "integer",
  credit_observed_approval_score: "integer", credit_screening_notes: "text",
  credit_screening_checked_at: "date",
}
function buildSchema(): void {
  const cols = new Map<string, string>(Object.entries(TYPED))
  for (const f of [...ENRICHMENT_WRITABLE_FIELDS, ...IMAGE_FIELDS, ...OWNER_COMMISSION_FIELDS, ...OWNER_CREDIT_FIELDS]) {
    if (!cols.has(f) && !APPROVAL_COLUMNS.includes(f)) cols.set(f, "text")
  }
  run("drop view if exists public.property_field_provenance")
  run("drop table if exists public.property_enrichment_events")
  run("drop table if exists public.property_catalog")
  run(`create table public.property_catalog (${[...cols].map(([c, t]) => `${c} ${t}`).join(", ")})`)
  // The live CHECKs on the credit columns, so this database is as strict as production is.
  run(`alter table public.property_catalog
         add constraint property_catalog_credit_minimum_status_check
         check (credit_minimum_status is null or credit_minimum_status in ('reported_minimum','no_check_reported')),
         add constraint property_catalog_credit_minimum_score_check
         check (credit_minimum_score is null or credit_minimum_score between 300 and 850)`)
  run(`create table public.property_enrichment_events (
         id bigserial primary key, seq bigserial, job_id text, place_id text, field_name text,
         action text check (action in ('written','skipped','rejected')),
         old_value text, new_value text, source_type text, source_reference text,
         verification_status text, reason text, checked_at timestamptz,
         created_at timestamptz not null default now())`)
  run(`create view public.property_field_provenance as
         select distinct on (place_id, field_name)
           place_id, field_name, new_value as value, source_type, source_reference,
           verification_status, checked_at, created_at as written_at, job_id
         from public.property_enrichment_events
         where action = 'written'
         order by place_id, field_name, created_at desc, seq desc`)
}

// ── THE SAVE PATH, EXACTLY AS THE ROUTE BUILDS IT ───────────────────────────────────────────
let jobN = 0
async function save(body: Record<string, unknown>, sourceRef: string | null = null) {
  const plan = planApprovalWrites(body)
  const checkedAt = new Date().toISOString()
  const verificationStatus = sourceRef ? "verified" as const : "inferred" as const
  const fields: FieldCandidate[] = plan.writes.map((w) => ({
    field: w.column, value: w.clear ? null : w.value,
    sourceType: "manual_verified" as const, sourceReference: sourceRef,
    verificationStatus, checkedAt, ownerOverride: true,
    ...(w.clear ? { ownerClear: true } : {}),
  }))
  const result = await enrichProperty(new PsqlStore(), {
    placeId: TEST_PLACE, jobId: `integration:${++jobN}`, fields, ownerAuthorized: true,
  })
  return { plan, result }
}
const current = () =>
  rows<Record<string, unknown>>(`select ${APPROVAL_COLUMNS.join(", ")}, credit_screening_notes,
    credit_screening_checked_at, credit_minimum_score, send_commission
    from public.property_catalog where place_id = ${txt(TEST_PLACE)}::text`)[0]

// ════════════════════════════════════════════════════════════════════════════════════════════
// Wrapped in main() because the writer is async and tsx compiles these scripts to CJS, where a
// top-level await is a syntax error. Nothing else about the flow changes.
async function main() {
  console.log(`\nAPPROVAL CRITERIA — INTEGRATION (${host})\n`)
  console.log("the two migrations")
  buildSchema()
  const prepared = (n: string) =>
    existsSync(`supabase/migrations/${n}`) ? `supabase/migrations/${n}` : `supabase/prepared/${n}`
  const M0 = prepared("20261110000000_property_screening_requirements.sql")
  const M4 = prepared("20261110000004_approval_criteria_fields.sql")
  runFile(M0); ok("20261110000000 applies to a catalog table that has none of its columns", true)
  runFile(M4); ok("20261110000004 applies on top of it", true)
  runFile(M0); runFile(M4)
  ok("…and both are idempotent — re-running changes nothing", true)
  {
    const present = rows<{ column_name: string; data_type: string; is_nullable: string }>(
      `select column_name, data_type, is_nullable from information_schema.columns
        where table_schema='public' and table_name='property_catalog'
          and column_name in (${APPROVAL_COLUMNS.map((c) => `'${c}'`).join(",")})`)
    ok(`all ${APPROVAL_COLUMNS.length} editor columns exist afterwards`, present.length === APPROVAL_COLUMNS.length,
      `missing: ${APPROVAL_COLUMNS.filter((c) => !present.some((p) => p.column_name === c)).join(", ")}`)
    ok("every one is NULLABLE — unknown has somewhere to live", present.every((p) => p.is_nullable === "YES"))
    const typeOf = (c: string) => present.find((p) => p.column_name === c)?.data_type
    ok("ages are integers", typeOf("broken_lease_min_age_years") === "integer" && typeOf("eviction_min_age_years") === "integer")
    ok("balances are numeric", typeOf("broken_lease_max_balance") === "numeric" && typeOf("rental_debt_max_balance") === "numeric")
    ok("the history requirements are booleans",
      typeOf("broken_lease_positive_history_required") === "boolean" && typeOf("eviction_positive_history_required") === "boolean")
    ok("the confirmation date is a date, not a timestamp", typeOf("screening_requirements_checked_at") === "date")
    const defaults = rows<{ n: number }>(
      `select count(*)::int as n from information_schema.columns
        where table_schema='public' and table_name='property_catalog'
          and column_name in (${APPROVAL_COLUMNS.map((c) => `'${c}'`).join(",")}) and column_default is not null`)[0].n
    ok("no column carries a default — nothing encodes a guess", defaults === 0)
  }

  console.log("\nthe CHECK constraints agree with the editor's vocabulary")
  run(`insert into public.property_catalog (place_id, property_name, updated_at,
         credit_minimum_status, credit_minimum_score, credit_screening_notes, send_commission)
       values (${txt(TEST_PLACE)}::text, 'Integration fixture', now(),
         'reported_minimum', 580,
         'agent-reported 2026-11-02 (unverified): broken lease 3 years or older AND paid in full.', '100%')`)
  // psql prints the constraint violation to stderr, which is the POINT here — so it is swallowed
  // rather than allowed to bury the assertion output.
  const refuses = (sql: string) => {
    try {
      execFileSync(PSQL, ["-v", "ON_ERROR_STOP=1", "-tAX", "-d", URL_, "-c", sql], { encoding: "utf8", stdio: "pipe" })
      return false
    } catch { return true }
  }
  const set1 = (c: string, v: string) =>
    `update public.property_catalog set ${c} = ${v} where place_id = ${txt(TEST_PLACE)}::text`
  for (const col of ["broken_lease_status", "eviction_status", "rental_debt_status"]) {
    ok(`${col} accepts all three tokens`,
      !refuses(set1(col, `'accepted'`)) && !refuses(set1(col, `'accepted_if_paid'`)) && !refuses(set1(col, `'not_accepted'`)))
    ok(`…and refuses an invented one`, refuses(set1(col, `'conditional'`)))
    run(set1(col, "null"))
  }
  for (const col of ["broken_lease_balance_requirement", "eviction_balance_requirement", "rental_debt_balance_requirement"]) {
    ok(`${col} accepts all three tokens`,
      !refuses(set1(col, `'must_be_paid'`)) && !refuses(set1(col, `'payments_or_plan'`)) && !refuses(set1(col, `'balance_ok'`)))
    ok(`…and refuses an invented one`, refuses(set1(col, `'paid_ish'`)))
    run(set1(col, "null"))
  }
  ok("an age of 20 is allowed and 21 is not",
    !refuses(set1("broken_lease_min_age_years", "20")) && refuses(set1("broken_lease_min_age_years", "21")))
  ok("a negative age is refused", refuses(set1("eviction_min_age_years", "-1")))
  ok("a negative balance is refused",
    refuses(set1("broken_lease_max_balance", "-1")) && refuses(set1("rental_debt_max_balance", "-1")))
  run(set1("broken_lease_min_age_years", "null"))

  console.log("\nevery field saves, and reloads as what was typed")
  const FULL: Record<string, unknown> = {
    brokenLeaseStatus: "accepted_if_paid", brokenLeaseMinAgeYears: "3",
    brokenLeaseBalanceRequirement: "must_be_paid", brokenLeaseMaxBalance: "$2,000.50",
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
    const { plan, result } = await save(FULL)
    ok("the planner produced one write per field", plan.writes.length === APPROVAL_COLUMNS.length && plan.rejected.length === 0)
    const written = result.results.filter((r) => r.outcome === "written").map((r) => r.field)
    ok(`the writer wrote all ${APPROVAL_COLUMNS.length}`, written.length === APPROVAL_COLUMNS.length,
      `wrote ${written.length}: ${result.results.filter((r) => r.outcome !== "written").map((r) => `${r.field}=${r.outcome}/${r.reason}`).join(", ")}`)
    const row = current()
    ok("broken lease reloads exactly", row.broken_lease_status === "accepted_if_paid" &&
      row.broken_lease_min_age_years === 3 && row.broken_lease_balance_requirement === "must_be_paid" &&
      Number(row.broken_lease_max_balance) === 2000.5 && row.broken_lease_positive_history_required === true,
      JSON.stringify(row))
    ok("eviction reloads exactly, including an explicit NOT required",
      row.eviction_status === "not_accepted" && row.eviction_min_age_years === 5 &&
      row.eviction_balance_requirement === "payments_or_plan" && row.eviction_positive_history_required === false)
    ok("rental debt reloads exactly, including a 0 ceiling",
      row.rental_debt_status === "accepted" && row.rental_debt_balance_requirement === "balance_ok" &&
      Number(row.rental_debt_max_balance) === 0)
    ok("the charges survive verbatim, dash and all",
      row.screening_additional_deposit === "One month, nonrefundable" &&
      row.screening_risk_fee === "$250–$500 depending on score" &&
      row.screening_guarantor_program === "Liberty Rent accepted")
    ok("the confirmation date is stored as the date that was typed", String(row.screening_requirements_checked_at).startsWith("2026-11-03"))
    ok("false came back as false, not as NULL — an explicit 'not required' survives",
      row.eviction_positive_history_required === false)
    ok("0 came back as 0, not as NULL", Number(row.rental_debt_max_balance) === 0)
    // What the control SHOWS on reload. Tokens, ages and tri-states come back exactly; a money
    // value comes back normalized ("$2,000.50" typed → 2000.5 stored → "2000.5" shown), which is
    // intended and is asserted here rather than left to be discovered.
    ok("tokens, ages and tri-states redisplay exactly as typed",
      approvalValueToInput(row.broken_lease_status) === "accepted_if_paid" &&
      approvalValueToInput(row.broken_lease_min_age_years) === "3" &&
      approvalValueToInput(row.eviction_positive_history_required) === "no")
    ok("money redisplays normalized, and never as blank",
      Number(approvalValueToInput(row.broken_lease_max_balance)) === 2000.5 &&
      approvalValueToInput(row.rental_debt_max_balance) !== "" &&
      Number(approvalValueToInput(row.rental_debt_max_balance)) === 0)
  }

  console.log("\na hidden conditional field is preserved, because it is never sent")
  {
    // The agent flips Broken Lease to Not accepted. The panel then HIDES the age and balance
    // controls — and sends only the status, because nothing else changed. This is that request.
    const before = current()
    const { result } = await save({ brokenLeaseStatus: "not_accepted" })
    ok("the save touched one field", result.results.length === 1 && result.results[0].outcome === "written")
    const after = current()
    ok("the status changed", after.broken_lease_status === "not_accepted")
    ok("the hidden age survived", after.broken_lease_min_age_years === before.broken_lease_min_age_years)
    ok("the hidden balance rule survived", after.broken_lease_balance_requirement === before.broken_lease_balance_requirement)
    ok("the hidden maximum survived", String(after.broken_lease_max_balance) === String(before.broken_lease_max_balance))
    ok("the hidden history requirement survived",
      after.broken_lease_positive_history_required === before.broken_lease_positive_history_required)
    ok("and so did every other group", after.eviction_min_age_years === before.eviction_min_age_years &&
      after.rental_debt_balance_requirement === before.rental_debt_balance_requirement &&
      after.screening_risk_fee === before.screening_risk_fee)
  }

  console.log("\nclearing is deliberate, and reaches NULL")
  {
    const { plan, result } = await save({ brokenLeaseMinAgeYears: "", evictionBalanceRequirement: "", screeningRiskFee: "" })
    ok("a blank is planned as a clear", plan.writes.every((w) => w.clear) && plan.writes.length === 3)
    ok("the writer applied all three", result.results.filter((r) => r.outcome === "written").length === 3,
      JSON.stringify(result.results))
    const row = current()
    ok("they are NULL, not '' and not 0",
      row.broken_lease_min_age_years === null && row.eviction_balance_requirement === null && row.screening_risk_fee === null)
    ok("their neighbours are untouched",
      row.broken_lease_balance_requirement === "must_be_paid" && row.screening_additional_deposit === "One month, nonrefundable")
  }

  console.log("\na correction replaces a populated value; a bad one never reaches the database")
  {
    await save({ brokenLeaseStatus: "accepted" })
    ok("an owner can correct a populated requirement", current().broken_lease_status === "accepted")
    const plan = planApprovalWrites({ brokenLeaseStatus: "maybe", brokenLeaseMinAgeYears: "99", screeningRequirementsCheckedAt: "yesterday" })
    ok("three bad values are all named, not silently dropped",
      plan.rejected.length === 3 && plan.writes.length === 0,
      JSON.stringify(plan))
    ok("…so the route would refuse the request before any write", plan.rejected.includes("brokenLeaseStatus"))
  }

  console.log("\nthe audit trail, and the dates nobody stamped")
  {
    const ev = rows<{ field_name: string; old_value: string | null; new_value: string | null; verification_status: string; action: string }>(
      `select field_name, old_value, new_value, verification_status, action
         from public.property_enrichment_events
        where place_id = ${txt(TEST_PLACE)}::text and field_name = 'broken_lease_status'
        order by seq`)
    ok("every change to a requirement is recorded", ev.length >= 3, JSON.stringify(ev))
    ok("…with the PREVIOUS value, so nothing is lost",
      ev.some((e) => e.old_value === "accepted_if_paid" && e.new_value === "not_accepted"), JSON.stringify(ev))
    ok("…and a clear is recorded as a change to nothing",
      rows<{ n: number }>(`select count(*)::int as n from public.property_enrichment_events
        where place_id = ${txt(TEST_PLACE)}::text and field_name = 'broken_lease_min_age_years' and new_value is null`)[0].n >= 1)
    ok("an unsourced edit is recorded as INFERRED, never verified",
      ev.every((e) => e.verification_status === "inferred"))
    const { result } = await save({ screeningGuarantorProgram: "Liberty Rent, confirmed" }, "Called the leasing office, Nov 3")
    ok("…and a sourced one as verified", result.results[0].outcome === "written" &&
      rows<{ verification_status: string }>(`select verification_status from public.property_enrichment_events
        where place_id = ${txt(TEST_PLACE)}::text and field_name='screening_guarantor_program' order by seq desc limit 1`)[0]
        .verification_status === "verified")
    const row = current()
    ok("credit_screening_checked_at is STILL NULL after all of that", row.credit_screening_checked_at === null)
  // intel_enriched_at IS stamped, by the writer, on any successful patch. It is named here rather
  // than left as a surprise: it records that an enrichment pass touched the row, which is true,
  // and it is not a column anything reads as a leasing-office confirmation.
  ok("the one date the writer does move is its own last-pass marker, not a verification",
    rows<{ intel_enriched_at: string | null; credit_screening_checked_at: string | null }>(
      `select intel_enriched_at, credit_screening_checked_at from public.property_catalog
        where place_id = ${txt(TEST_PLACE)}::text`)[0].intel_enriched_at !== null)
    ok("the credit minimum and the commission were never touched",
      row.credit_minimum_score === 580 && row.send_commission === "100%")
    ok("the screening notes are byte-identical to what was seeded",
      row.credit_screening_notes === "agent-reported 2026-11-02 (unverified): broken lease 3 years or older AND paid in full.")
    ok("the only date that moved is the one the agent typed",
      String(row.screening_requirements_checked_at).startsWith("2026-11-03"))
  }

  console.log("\nthe rollback reverses exactly its own five columns")
  {
    runFile("supabase/prepared/ROLLBACK_20261110000004_approval_criteria_fields.sql")
    const left = rows<{ column_name: string }>(
      `select column_name from information_schema.columns
        where table_schema='public' and table_name='property_catalog'
          and column_name in (${APPROVAL_COLUMNS.map((c) => `'${c}'`).join(",")})`).map((r) => r.column_name)
    // APPROVAL_COLUMNS, not every APPROVAL_FIELDS column: the field map also carries the nine
    // criminal-background columns now, and they belong to a DIFFERENT migration. Counting them
    // here would make this assertion about three migrations instead of the two it tests.
    const five = APPROVAL_COLUMNS
      .filter((c) => !readFileSync(M0, "utf8").includes(c))
    ok("its five columns are gone", five.every((c) => !left.includes(c)), `still present: ${five.filter((c) => left.includes(c)).join(", ")}`)
    ok("the eleven from 20261110000000 are untouched", left.length === APPROVAL_COLUMNS.length - five.length)
    ok("the audit trail survives the drop",
      rows<{ n: number }>(`select count(*)::int as n from public.property_enrichment_events where place_id = ${txt(TEST_PLACE)}::text`)[0].n > 0)
  }

  // ── TEARDOWN ────────────────────────────────────────────────────────────────────────────────
  // PUT THE DATABASE BACK THE WAY THE HARNESS BUILT IT.
  //
  // This test is destructive on purpose: buildSchema() drops property_catalog and recreates a
  // minimal one, and the rollback assertions then leave it five columns short. Both are correct
  // for this test and wrong for the next: the HTTP and release-safety suites share this database
  // and expect the full staging schema. Running them after this one used to fail with a missing
  // column, which reads like a product bug and is not one — it cost a confusing ten minutes, so
  // the test now cleans up after itself rather than documenting a running order nobody will read.
  {
    const schema = execFileSync("npx", ["tsx", "scripts/tests/approvalCriteria.schema.ts"], { encoding: "utf8" })
    execFileSync(PSQL, ["-v", "ON_ERROR_STOP=1", "-q", "-d", URL_], { input: schema, encoding: "utf8" })
    runFile(M0); runFile(M4)
    run(`grant all on all tables in schema public to service_role;
         grant all on all sequences in schema public to service_role;
         grant select on all tables in schema public to authenticated;
         notify pgrst, 'reload schema'`)
    ok("the harness schema and both migrations are restored for whatever runs next",
      rows<{ n: number }>(`select count(*)::int as n from information_schema.columns
        where table_schema='public' and table_name='property_catalog'
          and column_name in (${APPROVAL_COLUMNS.map((c) => `'${c}'`).join(",")})`)[0].n === APPROVAL_COLUMNS.length)
  }

  run(`delete from public.property_enrichment_events where place_id = ${txt(TEST_PLACE)}::text`)
  run(`delete from public.property_catalog where place_id = ${txt(TEST_PLACE)}::text`)
  ok("the fixture row is removed afterwards",
    rows<{ n: number }>(`select count(*)::int as n from public.property_catalog where place_id = ${txt(TEST_PLACE)}::text`)[0].n === 0)

  console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"} — ${pass} passed, ${fail} failed\n`)
  process.exit(fail === 0 ? 0 : 1)
}

main().catch((e) => { console.error(e); process.exit(1) })
