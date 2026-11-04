/**
 * MOVE-IN DATE — THE REAL ROUTE, OVER HTTP, AGAINST A THROWAWAY DATABASE.
 *
 *   bash scripts/tests/moveDate.httpEnv.sh start      # prints the env below
 *   MOVEDATE_HTTP_BASE=… MOVEDATE_DATABASE_URL=… npx tsx scripts/tests/moveDate.http.test.ts
 *   bash scripts/tests/moveDate.httpEnv.sh stop
 *
 * A unit test can prove the validator. It cannot prove that /api/leads/submit refuses the
 * request, that a refusal writes nothing, or that a valid date still reaches a `date` column
 * unchanged — and those are the claims that matter, because the route is public and the only
 * thing between a typed year and the database.
 *
 * NOTHING HERE TOUCHES PRODUCTION. The first block refuses to continue unless the app is
 * talking to 127.0.0.1 and the leads table is the empty throwaway one.
 */
import { execFileSync } from "node:child_process"

let pass = 0, fail = 0
const ok = (l: string, c: boolean, d = "") => {
  if (c) { pass++; console.log(`  ✓ ${l}`) } else { fail++; console.log(`  ✗ ${l}${d ? ` — ${d}` : ""}`) }
}

const BASE = process.env.MOVEDATE_HTTP_BASE
const DB = process.env.MOVEDATE_DATABASE_URL
const SUPA = process.env.MOVEDATE_SUPABASE_URL
if (!BASE || !DB) {
  console.log("\nSKIPPED — start the stack first: bash scripts/tests/moveDate.httpEnv.sh start\n")
  process.exit(0)
}

const PSQL = ["/opt/homebrew/opt/postgresql@17/bin/psql", "/opt/homebrew/opt/postgresql@16/bin/psql", "psql"]
  .find((p) => { try { execFileSync(p, ["--version"], { stdio: "ignore" }); return true } catch { return false } })!
const sql = (q: string) => execFileSync(PSQL, ["-v", "ON_ERROR_STOP=1", "-tAX", "-d", DB, "-c", q], { encoding: "utf8" }).trim()

/** Local calendar arithmetic, the same way the code under test does it. */
const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
const now = new Date()
const day = (deltaDays: number, deltaYears = 0) =>
  ymd(new Date(now.getFullYear() + deltaYears, now.getMonth(), now.getDate() + deltaDays))

const TODAY = day(0)
const TOMORROW = day(1)
const YESTERDAY = day(-1)
const SIX_MONTHS = ymd(new Date(now.getFullYear(), now.getMonth() + 6, now.getDate()))
const CEILING = day(0, 2)          // exactly two years out — the last acceptable day
const PAST_CEILING = day(1, 2)     // one day beyond it

let n = 0
async function submit(lead: Record<string, unknown>): Promise<{ status: number; body: Record<string, unknown> }> {
  const r = await fetch(`${BASE}/api/leads/submit`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    // `city` is required for formType "full" (and the phone must be a complete US number) —
    // both unrelated to the date, and both supplied so a 400 can only ever mean the date.
    body: JSON.stringify({
      formType: "full",
      lead: {
        first_name: "Bounds", last_name: `Case${++n}`,
        phone: `555000${String(n).padStart(4, "0")}`, city: "San Antonio",
        ...lead,
      },
    }),
  })
  return { status: r.status, body: await r.json().catch(() => ({})) }
}
const leadCount = () => Number(sql("select count(*)::int from public.leads"))
const datesStored = () => sql("select coalesce(string_agg(move_date::text, ',' order by id), '') from public.leads")

async function main() {
  console.log(`\nMOVE-IN DATE — HTTP (${BASE} → ${SUPA})\n`)

  console.log("this is NOT production")
  ok("the app is pointed at loopback", String(SUPA).includes("127.0.0.1"), String(SUPA))
  ok("the database is the throwaway one", /lb_movedate_test/.test(DB), DB)
  sql("delete from public.lead_timeline; delete from public.leads;")
  ok("…and it starts empty", leadCount() === 0)

  // A row shaped like the one that started this, so a refusal can be shown not to disturb it.
  sql(`insert into public.leads (first_name, last_name, phone, move_date) values ('Existing','Row','5559999999','2972-11-15')`)
  const existingBefore = sql("select move_date::text from public.leads where last_name='Row'")
  ok("an existing out-of-range row is seeded, as production holds one", existingBefore === "2972-11-15")

  console.log("\nthe fixture itself is accepted, so a 400 below can only mean the date")
  {
    const before = leadCount()
    const r = await submit({})
    ok("a submission with no move date at all → 200", r.status === 200, `${r.status} ${JSON.stringify(r.body)}`)
    ok("…and it created a row", leadCount() === before + 1)
    sql("delete from public.leads where last_name like 'Case%'")
  }

  console.log("\nimpossible, past and far-future dates are REFUSED")
  for (const [label, value] of [
    ["the year that started this (2972-11-15)", "2972-11-15"],
    ["one day past the two-year ceiling", PAST_CEILING],
    ["a year far beyond it (3000-01-01)", "3000-01-01"],
    ["yesterday", YESTERDAY],
    ["a day that does not exist (31 Feb)", `${now.getFullYear() + 1}-02-31`],
    ["not a date at all", "whenever"],
    ["an empty-ish scribble", "--"],
  ] as const) {
    const before = leadCount()
    const r = await submit({ move_date: value })
    ok(`${label} → 400`, r.status === 400, `${r.status} ${JSON.stringify(r.body)}`)
    ok(`…and no lead row was created`, leadCount() === before, `${before} → ${leadCount()}`)
  }

  console.log("\nvalid dates still work, end to end")
  for (const [label, value] of [
    ["today", TODAY],
    ["tomorrow", TOMORROW],
    ["six months out", SIX_MONTHS],
    ["the ceiling day itself", CEILING],
  ] as const) {
    const before = leadCount()
    const r = await submit({ move_date: value })
    ok(`${label} (${value}) → 200`, r.status === 200, `${r.status} ${JSON.stringify(r.body)}`)
    ok(`…and a row was created`, leadCount() === before + 1)
    const stored = sql(`select move_date::text from public.leads order by id desc limit 1`)
    ok(`…stored verbatim, no shift`, stored === value, `sent ${value}, stored ${stored}`)
  }

  console.log("\nblank and omitted dates are accepted")
  {
    const before = leadCount()
    const blank = await submit({ move_date: "" })
    ok("a blank move date → 200", blank.status === 200, `${blank.status} ${JSON.stringify(blank.body)}`)
    const omitted = await submit({})
    ok("…and omitting it entirely → 200", omitted.status === 200, `${omitted.status} ${JSON.stringify(omitted.body)}`)
    ok("both created rows", leadCount() === before + 2)
    ok("…with a NULL date, never a substituted one",
      sql("select count(*)::int from public.leads where move_date is null") === "2")
  }

  console.log("\nan ISO timestamp from an older client is judged on its calendar day")
  {
    const r = await submit({ move_date: `${SIX_MONTHS}T10:00:00.000Z` })
    ok("accepted", r.status === 200, `${r.status} ${JSON.stringify(r.body)}`)
    const r2 = await submit({ move_date: "2972-11-15T10:00:00.000Z" })
    ok("…and the same shape with a bad year is refused", r2.status === 400, String(r2.status))
  }

  console.log("\nnothing already stored was touched")
  {
    const after = sql("select move_date::text from public.leads where last_name='Row'")
    ok("the seeded out-of-range row is byte-identical", after === existingBefore, `${existingBefore} → ${after}`)
    ok("…and it was never corrected to something plausible", after === "2972-11-15")
    ok("no row holds a date outside the window except that one",
      sql(`select count(*)::int from public.leads where move_date is not null and (move_date < current_date or move_date > (current_date + interval '2 years'))`) === "1")
  }

  console.log(`\nleads created by this run: ${leadCount()} (throwaway database)`)
  console.log(`${fail === 0 ? "ALL PASS" : "FAILURES"} — ${pass} passed, ${fail} failed\n`)
  process.exit(fail === 0 ? 0 : 1)
}

main().catch((e) => { console.error(e); process.exit(1) })
