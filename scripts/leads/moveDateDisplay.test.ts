/**
 * MOVE DATE — a calendar date, never an instant.
 *
 * THE PRODUCTION BUG THIS LOCKS OUT. `leads.move_date` is a Postgres `date` and
 * arrives as a bare "YYYY-MM-DD". `new Date("2026-10-10")` parses that as UTC
 * MIDNIGHT, which in America/Chicago is 2026-10-09 19:00 — so every date-only
 * move date rendered a day EARLY, and a January 1st rendered in the previous
 * YEAR. The Lead Board card and the CRM's Search Criteria each kept a private
 * `formatDate` doing exactly that, while Beast Companion used the shared
 * formatter and was right — the same lead read 10/09/2026 on one screen and
 * 10/10/2026 on another.
 *
 * It was worse than cosmetic in one place: the first-contact SMS said "your move
 * in October" for a November 1 move date, in a message a CLIENT reads.
 *
 * Invisible under TZ=UTC, which is why it survived. These assertions therefore
 * run under America/Chicago — this file re-executes itself with TZ set so the
 * guarantee holds however it is invoked.
 *
 * Run: npx tsx scripts/leads/moveDateDisplay.test.ts
 */
import { readFileSync } from "node:fs"
import path from "node:path"
import { execFileSync } from "node:child_process"
import { formatDateDisplay, formatMonthDisplay } from "@bc/companion-shared"

const WANT_TZ = "America/Chicago"
if (Intl.DateTimeFormat().resolvedOptions().timeZone !== WANT_TZ) {
  // Re-run under the timezone the bug actually manifests in. Without this the
  // suite would pass vacuously on a UTC machine (CI included).
  //
  // Through `npx tsx`, not process.argv[0]: under tsx the loader is registered
  // out-of-band and does NOT appear in argv, so re-spawning node with argv alone
  // runs plain node against a .ts file and dies on the first path alias.
  execFileSync("npx", ["tsx", process.argv[1]], {
    env: { ...process.env, TZ: WANT_TZ },
    stdio: "inherit",
  })
  process.exit(0)
}

let pass = 0, fail = 0
const ok = (l: string, c: boolean, d = "") => {
  if (c) { pass++; console.log(`  ✓ ${l}`) } else { fail++; console.log(`  ✗ ${l}${d ? `\n      ${d}` : ""}`) }
}
const read = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8")
const strip = (t: string) =>
  t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "").replace(/(^|[^:])\/\/.*$/gm, "$1")

console.log(`\nMOVE DATE DISPLAY  (TZ=${Intl.DateTimeFormat().resolvedOptions().timeZone})\n`)

console.log("The reported bug, and the boundaries that make it worse:")
{
  ok('2026-10-10 → "10/10/2026"  (the reported case)', formatDateDisplay("2026-10-10") === "10/10/2026",
    `got ${formatDateDisplay("2026-10-10")}`)
  ok('2026-01-01 → "01/01/2026"  (year boundary — used to render 12/31/2025)',
    formatDateDisplay("2026-01-01") === "01/01/2026", `got ${formatDateDisplay("2026-01-01")}`)
  ok('2026-11-01 → "11/01/2026"  (month boundary)', formatDateDisplay("2026-11-01") === "11/01/2026")
  ok('2026-12-31 → "12/31/2026"', formatDateDisplay("2026-12-31") === "12/31/2026")
  ok('2026-03-08 → "03/08/2026"  (US DST spring-forward day)', formatDateDisplay("2026-03-08") === "03/08/2026")
  ok('2026-11-01 → "11/01/2026"  (US DST fall-back day)', formatDateDisplay("2026-11-01") === "11/01/2026")
}

console.log("\nThe SMS month label a CLIENT reads:")
{
  ok('2026-11-01 → "November", NOT "October"', formatMonthDisplay("2026-11-01") === "November",
    `got "${formatMonthDisplay("2026-11-01")}"`)
  ok('2026-01-01 → "January", NOT "December"', formatMonthDisplay("2026-01-01") === "January")
  ok('2026-10-10 → "October"', formatMonthDisplay("2026-10-10") === "October")
  ok('2026-12-31 → "December"', formatMonthDisplay("2026-12-31") === "December")
  // Every first-of-month is the failure case: it is the only day that can fall
  // into the previous month when shifted one day backward.
  const months = ["January","February","March","April","May","June","July","August","September","October","November","December"]
  ok("every first-of-month names its OWN month",
    months.every((name, i) => formatMonthDisplay(`2026-${String(i + 1).padStart(2, "0")}-01`) === name))
  ok("empty / nullish → \"\" so the caller omits the phrase",
    formatMonthDisplay(null) === "" && formatMonthDisplay("") === "" && formatMonthDisplay("nonsense") === "")
}

console.log("\nThese formatters cannot be timezone-dependent at all:")
{
  // The real guarantee is stronger than "correct in Chicago": no Date is built,
  // so no host timezone can change the answer. Proven by construction here.
  // Comments stripped: the docstrings deliberately QUOTE the unsafe
  // `new Date("2026-11-01")` to explain the hazard, which is documentation, not
  // behaviour. The contract is about executable code.
  const dateMod = strip(read("packages/companion-shared/src/format/date.ts"))
  ok("formatDateDisplay builds no Date", !/new Date\(/.test(dateMod))
  ok("…and neither does formatMonthDisplay (no Date anywhere in the module)",
    !/Date\b/.test(dateMod))
  ok("formatMonthDisplay is exported from the package root",
    /formatMonthDisplay/.test(read("packages/companion-shared/src/index.ts")))
}

console.log("\nGUARD — move_date can never return to unsafe `new Date` handling:")
{
  const card = strip(read("components/crm/LeadCard.tsx"))
  const panel = strip(read("components/crm/LeadPanel.tsx"))

  ok("the Lead Board card formats move_date with the shared formatter",
    /formatDateDisplay\(lead\.move_date\)/.test(card))
  ok("…and no longer keeps a private formatDate", !/function formatDate\b/.test(card))
  ok("the CRM Search Criteria row uses the shared formatter",
    /formatDateDisplay\(lead\.move_date\)/.test(panel))
  ok("the SMS month label uses the shared month formatter",
    /formatMonthDisplay\(lead\.move_date\)/.test(panel))

  // The core guard: a Date must never be constructed from move_date on a DISPLAY
  // path in either file. Sorting is deliberately exempt (see below).
  for (const [name, src] of [["LeadCard", card], ["LeadPanel", panel]] as const) {
    ok(`${name} never constructs a Date from move_date`,
      !/new Date\([^)]*move_date/.test(src),
      "a date-only value must be read by its parts, never parsed as an instant")
  }
  ok("neither file calls toLocaleString/toLocaleDateString on move_date",
    !/move_date[^\n]*toLocale/.test(card + panel))

  // LeadPanel KEEPS a local formatDate for deleted_at — a real timestamp, where
  // new Date() is correct. This asserts the distinction stays documented rather
  // than someone "fixing" it or routing move_date back through it.
  ok("LeadPanel still formats the deleted_at TIMESTAMP with its local formatter",
    /formatDate\(lead\.deleted_at\)/.test(panel))
}

console.log("\nDeliberately UNCHANGED by this fix:")
{
  const board = strip(read("components/crm/LeadBoard.tsx"))
  // Sorting compares move dates against each other. Every value shifts by the
  // same offset, so ordering is unaffected and this is not a display path.
  ok("Lead Board sorting still compares move_date as an instant (ordering is unaffected)",
    /new Date\(a\.move_date\)\.getTime\(\)/.test(board))
  // Storage and the save path are correct already — the DB holds exactly what was
  // picked. This fix is display-only and must not touch either.
  const fields = strip(read("components/LeadFields.tsx"))
  ok("the save path still writes a bare YYYY-MM-DD",
    /updateField\("move_date", date \? date\.toISOString\(\)\.split\("T"\)\[0\] : ""\)/.test(fields))
  ok("the picker still seeds through parseMoveDate", /parseMoveDate\(form\.move_date\)/.test(fields))
}

console.log(`\n${pass} passed, ${fail} failed\n`)
process.exit(fail === 0 ? 0 : 1)
