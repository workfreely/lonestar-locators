/**
 * THE ORDER OF RECOMMENDED PROPERTIES — the comparator, and the three places that must agree.
 *
 *   npx tsx scripts/leads/recommendationOrder.test.ts
 *
 * Section 1 is pure and runs anywhere. Section 2 asks POSTGRES to order the same rows with the
 * literal ORDER BY the migration installs, and requires the identical sequence — the drift guard.
 * It uses a VALUES list rather than the real table, so it tests the RULE and needs neither the
 * migration applied nor any row in the database. Sections 3–5 read the source files: the rule is
 * only worth anything if every reader actually applies it, and if arranging a list writes nothing
 * but the position.
 */
import { execFileSync } from "node:child_process"
import { readFileSync, existsSync } from "node:fs"
import { join } from "node:path"
import {
  compareRecommendations, sortRecommendations, positionsFor, moveItem,
  type OrderableRecommendation,
} from "@/lib/leads/recommendationOrder"

let pass = 0
let fail = 0
const ok = (label: string, cond: boolean, detail = "") => {
  if (cond) { pass++; console.log(`  ✓ ${label}`) } else { fail++; console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`) }
}
const eq = (label: string, a: unknown, b: unknown) =>
  ok(label, JSON.stringify(a) === JSON.stringify(b), `got ${JSON.stringify(a)} want ${JSON.stringify(b)}`)
const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1").replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
const read = (p: string) => strip(readFileSync(join(process.cwd(), p), "utf8"))
const raw = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

type Row = OrderableRecommendation & { name: string }
const T = (s: string) => `2026-10-0${s}T00:00:00Z`

// One fixture, used by BOTH the TypeScript and the SQL below.
const ROWS: Row[] = [
  { name: "arranged-2", id: 10, sort_order: 2, created_at: T("1") },
  { name: "never-arranged-early", id: 11, sort_order: null, created_at: T("2") },
  { name: "arranged-1", id: 12, sort_order: 1, created_at: T("9") },
  { name: "never-arranged-late", id: 13, sort_order: null, created_at: T("5") },
  { name: "tie-created-lower-id", id: 2, sort_order: null, created_at: T("7") },
  { name: "tie-created-higher-id", id: 3, sort_order: null, created_at: T("7") },
]

console.log("\n=== 1. THE COMPARATOR ===")
{
  const got = sortRecommendations(ROWS).map((r) => r.name)
  eq("arranged first, by position; then never-arranged by created_at; id breaks a tie", got, [
    "arranged-1", "arranged-2",
    "never-arranged-early", "never-arranged-late",
    "tie-created-lower-id", "tie-created-higher-id",
  ])

  ok("a list with no positions keeps created_at order",
    JSON.stringify(sortRecommendations(ROWS.filter((r) => r.sort_order == null)).map((r) => r.name))
      === JSON.stringify(["never-arranged-early", "never-arranged-late", "tie-created-lower-id", "tie-created-higher-id"]))

  ok("the input array is never mutated", (() => {
    const before = ROWS.map((r) => r.name).join()
    sortRecommendations(ROWS)
    return ROWS.map((r) => r.name).join() === before
  })())

  ok("undefined sort_order is treated as never-arranged",
    compareRecommendations({ id: 1, created_at: T("9") }, { id: 2, sort_order: 5, created_at: T("1") }) > 0)
  ok("a junk sort_order does not jump the queue",
    compareRecommendations({ id: 1, sort_order: NaN as unknown as number, created_at: T("1") }, { id: 2, sort_order: 9, created_at: T("9") }) > 0)
  ok("an unparseable created_at never throws",
    Number.isFinite(compareRecommendations({ id: 1, created_at: "not a date" }, { id: 2, created_at: T("1") })))
  eq("empty input", sortRecommendations([]), [])
}

console.log("\n=== 2. POSTGRES ORDERS THE SAME ROWS THE SAME WAY (drift guard) ===")
{
  const urls = [
    "supabase/.temp/pooler-url",
    "/Users/jaymorris/Desktop/Lone Star Locators Master/lonestar-locators-app/supabase/.temp/pooler-url",
  ]
  const urlPath = urls.find((p) => existsSync(p))
  if (!urlPath) {
    console.log("  … skipped: no pooler-url (pure sections still ran)")
  } else {
    const url = readFileSync(urlPath, "utf8").trim()
    const values = ROWS.map((r) =>
      `(${r.id}, ${r.sort_order === null || r.sort_order === undefined ? "null" : r.sort_order}::int, '${r.created_at}'::timestamptz, '${r.name}')`,
    ).join(",")
    // The LITERAL rule the migration installs in both lb_create_client_share and
    // lb_prepare_client_share. A VALUES list, so this needs no table and no migration.
    const sql =
      `select string_agg(name, ',' order by sort_order asc nulls last, created_at asc, id asc) ` +
      `from (values ${values}) as t(id, sort_order, created_at, name);`
    let sqlOrder = ""
    try {
      sqlOrder = execFileSync("psql", [url, "-At", "-c", sql], { encoding: "utf8", timeout: 60_000 }).trim()
    } catch (e) {
      console.log(`  … skipped: psql unavailable (${(e as Error).message.split("\n")[0]})`)
    }
    if (sqlOrder) {
      const tsOrder = sortRecommendations(ROWS).map((r) => r.name).join(",")
      ok("SQL and TypeScript produce the identical sequence", sqlOrder === tsOrder, `SQL=${sqlOrder}  TS=${tsOrder}`)
    }
  }
}

console.log("\n=== 3. EVERY READER APPLIES THE RULE ===")
{
  const loader = read("app/admin/leads/page.tsx")
  ok("the workspace loader orders by sort_order NULLS LAST, then created_at, then id",
    /\.order\("sort_order",\s*\{\s*ascending:\s*true,\s*nullsFirst:\s*false\s*\}\)\s*\.order\("created_at",\s*\{\s*ascending:\s*true\s*\}\)\s*\.order\("id",\s*\{\s*ascending:\s*true\s*\}\)/.test(loader))
  ok("it no longer orders recommendations by created_at alone",
    !/from\("lead_recommendations"\)[\s\S]{0,200}?\.select\("\*"\)\s*\.order\("created_at"[^)]*\)\s*\n/.test(loader))

  const mig = raw("supabase/migrations/20261030000000_recommendation_sort_order.sql")
  const RULE = "order by r.sort_order asc nulls last, r.created_at asc, r.id asc"
  ok("the snapshot's row_number() uses the rule", mig.includes(`(row_number() over (${RULE}))::int`))
  ok("the reuse fingerprint uses the rule", new RegExp(`E'\\\\x1e'\\s+${RULE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(mig))
  ok("the snapshot half of the fingerprint still reads the FROZEN order",
    mig.includes("order by ci.sort_order asc"))
  ok("the column is nullable — no backfill, so an untouched list cannot move",
    /add column if not exists sort_order integer;/.test(mig) && !/update\s+public\.lead_recommendations\s+set\s+sort_order/i.test(mig))
}

console.log("\n=== 4. THE SECTION RENDERS THE ORDER IT IS GIVEN ===")
{
  const bm = read("components/crm/BestMatches.tsx")
  ok("BestMatches never re-sorts the list", !/leadRecommendations[\s\S]{0,40}\.sort\(/.test(bm))
  ok("it reports a drag as an ordered id list", /onReorder\?\.\(moveItem\(leadRecommendations, from, to\)\.map\(\(r\) => r\.id\)\)/.test(bm))
  ok("the grip, not the card, carries the drag listeners",
    /aria-label="Reorder this property"[\s\S]{0,400}\{\.\.\.listeners\}/.test(bm) || /\{\.\.\.attributes\}\s*\{\.\.\.listeners\}[\s\S]{0,300}<Grip/.test(bm))
  ok("a press that never travels is still a click (activation distance)",
    /PointerSensor,\s*\{\s*activationConstraint:\s*\{\s*distance:\s*5\s*\}\s*\}/.test(bm))
  ok("reordering is off for a single row", /leadRecommendations\.length > 1/.test(bm))
  ok("no new drag dependency — only packages already in package.json", (() => {
    const pkg = JSON.parse(raw("package.json"))
    const deps = { ...pkg.dependencies, ...pkg.devDependencies }
    return ["@dnd-kit/core", "@dnd-kit/sortable", "@dnd-kit/utilities"].every((d) => d in deps)
      && !("@dnd-kit/modifiers" in deps) && !/@dnd-kit\/modifiers/.test(bm)
  })())
}

console.log("\n=== 5. ARRANGING WRITES THE POSITION AND NOTHING ELSE ===")
{
  const dc = read("components/crm/DashboardClient.tsx")
  const fn = dc.slice(dc.indexOf("const handleReorderRecommendations"), dc.indexOf("const localRecommendationsRef"))
  ok("the handler exists", fn.length > 0)
  ok("it updates lead_recommendations", /from\("lead_recommendations"\)\s*\.update\(/.test(fn))
  ok("the ONLY column written is sort_order", /\.update\(\{ sort_order \}\)/.test(fn))
  for (const forbidden of ["reasons", "current_special", "send_commission", "escort_commission", "bonus_flat",
    "property_image_url", "canonical_property_key", "lead_favorites", "lead_next_actions", "crm_status",
    "lead_property_reasons", "client_recommendation_share"]) {
    ok(`it never touches ${forbidden}`, !fn.includes(forbidden))
  }
  ok("no share is created by arranging", !/lb_prepare_client_share|lb_create_client_share|handleSendRecommendations/.test(fn))
  ok("demo clients never reach the database", /isDemoLeadId\(leadId\)\)\s*return/.test(fn))
  ok("positions are 1..N over the arranged rows", /orderedIds\.map\(\(id, i\) => \[String\(id\), i \+ 1\]\)/.test(fn))
  ok("the optimistic list is re-sorted by the shared rule", /sortRecommendations\(/.test(fn))
}

console.log("\n=== 6. THE 1..N HELPERS ===")
{
  eq("positionsFor numbers from 1", positionsFor(["a", "b", "c"]), [
    { id: "a", sort_order: 1 }, { id: "b", sort_order: 2 }, { id: "c", sort_order: 3 },
  ])
  eq("positionsFor of nothing", positionsFor([]), [])
  eq("moveItem down", moveItem([1, 2, 3, 4], 0, 2), [2, 3, 1, 4])
  eq("moveItem up", moveItem([1, 2, 3, 4], 3, 1), [1, 4, 2, 3])
  eq("moveItem to the same slot", moveItem([1, 2, 3], 1, 1), [1, 2, 3])
  eq("moveItem out of range is a no-op", moveItem([1, 2, 3], 0, 9), [1, 2, 3])
  ok("moveItem does not mutate", (() => { const a = [1, 2, 3]; moveItem(a, 0, 2); return JSON.stringify(a) === "[1,2,3]" })())
}

console.log(fail === 0 ? `\nALL PASS ✅ (${pass} passed, ${fail} failed)\n` : `\n${pass} passed, ${fail} failed\n`)
process.exit(fail === 0 ? 0 : 1)
