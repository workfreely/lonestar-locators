/**
 * BEAST COMPANION — the screening BALANCE reaches the extension panel.
 *
 * THE CRM fixed this on 2026-10-15 (bcdd69a): its Credit Screening card had built the
 * broken-lease row out of the AGE alone, so the balance owed — the figure that decides whether a
 * property will consider a renter at all — never appeared. That commit touched
 * components/crm/LeadPanel.tsx and lib/notifications/leadSummary.ts.
 *
 * It did not touch Beast Companion, and nothing else ever did. The identical age-only expression
 * survived in TWO places on the extension path:
 *
 *   lib/companion/leadToDto.ts            creditScreening sent brokenLeaseAge / evictionAge only
 *   apps/.../lead/LeadPanelView.tsx       value: hasValue(cs.brokenLeaseAge) ? `… ago` : null
 *
 * so the panel could not have shown the balance however it rendered: the server never sent it.
 * `git log --all -S broken_lease_amount -- lib/companion/leadToDto.ts` returns NOTHING — this was
 * never a regression and nothing was lost in a deployment. It was one fix applied to two of the
 * three surfaces that had the same bug.
 *
 * Verified against live data at the time of the fix: 10 leads hold a balance, including
 * "$500-$1,000", "$1,000-$2,000", "$2,000-$5,000" and "$5,000+". None of it was ever lost.
 *
 * Run: npx tsx scripts/tests/companionScreeningBalance.test.ts   (pure — reads source)
 */
import { readFileSync } from "node:fs"

let pass = 0
let fail = 0
const ok = (l: string, c: boolean, d = "") => {
  if (c) {
    pass++
    console.log(`  ✓ ${l}`)
  } else {
    fail++
    console.log(`  ✗ ${l}${d ? `\n      ${d}` : ""}`)
  }
}

/** Comments quote the old buggy expression, so assertions must run against code. */
const strip = (s: string) =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((l) => l.replace(/\/\/.*$/, ""))
    .join("\n")

const P = {
  contract: "packages/companion-shared/src/leads/contract.ts",
  dto: "lib/companion/leadToDto.ts",
  view: "apps/beast-companion/src/sidepanel/lead/LeadPanelView.tsx",
  crm: "components/crm/LeadPanel.tsx",
}
const raw = Object.fromEntries(Object.entries(P).map(([k, p]) => [k, readFileSync(p, "utf8")])) as Record<
  keyof typeof P,
  string
>
const src = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, strip(v)])) as Record<keyof typeof P, string>

console.log("\nBEAST COMPANION — SCREENING BALANCE\n")

// ── 1. The rendering rule, as behaviour ───────────────────────────────────────────────────────
console.log("the row text (ported from both surfaces — they must agree)")

const hasValue = (v: unknown) => v !== null && v !== undefined && (typeof v !== "string" || v.trim().length > 0)
const historyDetail = (age: unknown, balance: unknown): string =>
  [hasValue(age) ? `${age} ago` : null, hasValue(balance) ? `balance ${balance}` : null]
    .filter(Boolean)
    .join(" · ") || "Yes"

/** The OLD expression, kept so every case below is proved to discriminate. */
const oldRow = (age: unknown) => (hasValue(age) ? `${age} ago` : null)

ok(
  "age AND balance",
  historyDetail("3 years", "$500-$1,000") === "3 years ago · balance $500-$1,000",
  historyDetail("3 years", "$500-$1,000"),
)
ok("age only reads as it always did", historyDetail("3 years", null) === "3 years ago")
ok("balance only, no age", historyDetail(null, "$500-$1,000") === "balance $500-$1,000")
ok("neither, but the history is recorded → Yes", historyDetail(null, null) === "Yes")
ok('"$0" survives — owing nothing is not the same as never being asked', historyDetail("2 years", "$0") === "2 years ago · balance $0")
ok('"None" survives as a balance answer', historyDetail("1 year", "None").includes("None"))
ok(
  "the OLD expression drops the balance in every case that has one",
  oldRow("3 years") === "3 years ago" && !String(oldRow("3 years")).includes("500"),
  "proves these cases would fail before the fix",
)
ok("the old expression showed nothing at all when only a balance was known", oldRow(null) === null)

// ── 2. Gating: no row may show another row's figure ───────────────────────────────────────────
console.log("\ngating — nothing unrelated is displayed")

type CS = { creditHistory: string | null; brokenLeaseAge?: string | null; brokenLeaseAmount?: string | null; evictionAge?: string | null; evictionBalance?: string | null }
/** Port of BOTH gates: the DTO's (server) and the panel's (client). */
const dtoGate = (cs: CS) => ({
  brokenLeaseAge: String(cs.creditHistory ?? "").toLowerCase().includes("broken") ? cs.brokenLeaseAge ?? null : null,
  brokenLeaseAmount: String(cs.creditHistory ?? "").toLowerCase().includes("broken") ? cs.brokenLeaseAmount ?? null : null,
  evictionAge: cs.creditHistory === "Eviction" ? cs.evictionAge ?? null : null,
  evictionBalance: cs.creditHistory === "Eviction" ? cs.evictionBalance ?? null : null,
})
const rows = (cs: CS) => {
  const d = dtoGate(cs)
  return {
    brokenLease: String(cs.creditHistory ?? "").toLowerCase().includes("broken")
      ? historyDetail(d.brokenLeaseAge, d.brokenLeaseAmount)
      : null,
    eviction: cs.creditHistory === "Eviction" ? historyDetail(d.evictionAge, d.evictionBalance) : null,
  }
}

const clean = rows({ creditHistory: "Clean", brokenLeaseAmount: "$9,999", evictionBalance: "$8,888" })
ok("a Clean history shows NEITHER row", clean.brokenLease === null && clean.eviction === null)
ok(
  "…and the server would not have sent either figure anyway (defence in depth)",
  dtoGate({ creditHistory: "Clean", brokenLeaseAmount: "$9,999", evictionBalance: "$8,888" }).brokenLeaseAmount === null,
)

const bl = rows({ creditHistory: "Broken Lease", brokenLeaseAge: "2 years", brokenLeaseAmount: "$1,000-$2,000", evictionBalance: "$8,888" })
ok("a Broken Lease lead shows its own balance", bl.brokenLease === "2 years ago · balance $1,000-$2,000", String(bl.brokenLease))
ok("…and shows NO eviction row, even with an eviction balance on the row", bl.eviction === null)

const ev = rows({ creditHistory: "Eviction", evictionAge: "Less than 1 year", evictionBalance: "$2,000-$5,000", brokenLeaseAmount: "$9,999" })
ok("an Eviction lead shows its own balance", ev.eviction === "Less than 1 year ago · balance $2,000-$5,000", String(ev.eviction))
ok("…and shows NO broken-lease row", ev.brokenLease === null)

// Faithful to the CRM's own asymmetry, which this must not silently "improve".
const both = rows({ creditHistory: "Broken Lease and Eviction", brokenLeaseAge: "1 year", evictionAge: "2 years" })
ok(
  'a combined history matches the CRM exactly: broken-lease row shows, eviction row does not (=== "Eviction")',
  both.brokenLease === "1 year ago" && both.eviction === null,
)

// ── 3. The contract carries the fields ────────────────────────────────────────────────────────
console.log("\nthe shared contract (packages/companion-shared)")
ok("brokenLeaseAmount is on creditScreeningSchema", /brokenLeaseAmount: z\.string\(\)\.nullish\(\)/.test(src.contract))
ok("evictionBalance is on creditScreeningSchema", /evictionBalance: z\.string\(\)\.nullish\(\)/.test(src.contract))
ok(
  "both are nullish, so an older extension build and a lead with no balance both still validate",
  /brokenLeaseAmount: z\.string\(\)\.nullish\(\)/.test(src.contract) && /evictionBalance: z\.string\(\)\.nullish\(\)/.test(src.contract),
)

// ── 4. The API response actually sends them ───────────────────────────────────────────────────
console.log("\nthe API response (lib/companion/leadToDto.ts)")
ok("sends brokenLeaseAmount from the existing column", /brokenLeaseAmount: historyLower\.includes\("broken"\) \? str\(lead\.broken_lease_amount\) : null/.test(src.dto))
ok("sends evictionBalance from the existing column", /evictionBalance: lead\.credit_history === "Eviction" \? str\(lead\.eviction_balance\) : null/.test(src.dto))
ok("gates each balance exactly like its age", /brokenLeaseAge: historyLower\.includes\("broken"\)/.test(src.dto) && /evictionAge: lead\.credit_history === "Eviction"/.test(src.dto))
ok("no new storage field — it reads broken_lease_amount / eviction_balance straight off the lead row", /str\(lead\.broken_lease_amount\)/.test(src.dto) && /str\(lead\.eviction_balance\)/.test(src.dto))

// ── 5. The extension renders them ─────────────────────────────────────────────────────────────
console.log("\nthe extension panel (LeadPanelView.tsx)")
ok("has its own historyDetail", /function historyDetail\(age: unknown, balance: unknown\): string/.test(src.view))
ok("the broken-lease row uses it with the amount", /historyDetail\(cs\.brokenLeaseAge, cs\.brokenLeaseAmount\)/.test(src.view))
ok("the eviction row uses it with the balance", /historyDetail\(cs\.evictionAge, cs\.evictionBalance\)/.test(src.view))
ok("the age-only expressions are GONE", !/hasValue\(cs\.brokenLeaseAge\) \? `\$\{cs\.brokenLeaseAge\} ago`/.test(src.view) && !/hasValue\(cs\.evictionAge\) \? `\$\{cs\.evictionAge\} ago`/.test(src.view))
ok("the broken-lease row is gated on the history", /String\(cs\.creditHistory \?\? ""\)\.toLowerCase\(\)\.includes\("broken"\)/.test(src.view))
ok("the eviction row is gated on the history", /cs\.creditHistory === "Eviction" \? historyDetail/.test(src.view))
ok(
  "the Credit Screening section is otherwise unchanged — same five rows, same labels",
  ["Credit Score", "Credit History", "Broken Lease", "Eviction", "Criminal Background"].every((l) =>
    src.view.includes(`label: "${l}"`),
  ),
)

// ── 6. The two surfaces agree ─────────────────────────────────────────────────────────────────
console.log("\nparity with the CRM card")
ok("the CRM still joins age and balance with ' · '", /\.filter\(Boolean\)\.join\(" · "\) \|\| "Yes"/.test(src.crm))
ok("the extension joins them the same way", /\.join\(" · "\) \|\| "Yes"/.test(src.view))
ok("both label the balance the same", /balance \$\{balance\}/.test(src.crm) && /balance \$\{balance\}/.test(src.view))

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"} — ${pass} passed, ${fail} failed\n`)
process.exit(fail === 0 ? 0 : 1)
