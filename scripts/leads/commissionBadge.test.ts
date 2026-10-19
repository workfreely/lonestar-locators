/**
 * Locator commission — the BADGE rules.
 *
 *   npx tsx scripts/leads/commissionBadge.test.ts
 *
 * ── THE TWO BUGS THIS SUITE EXISTS BECAUSE OF ───────────────────────────────────────────────
 * evaluateLocatorCommission entered its "paying" branch on ANY verified field, and a verified
 * ZERO counts as verified. Two reproducible consequences:
 *
 *   send 0% · escort 0% · bonus $0  →  GREEN "paying · Send 0% · Escort 0%"
 *                                      A property confirmed to pay nothing, displayed as paying.
 *   bonus $0, nothing else known    →  GREEN "paying" with an EMPTY text, because the branch was
 *                                      entered on a zero but only a NON-zero bonus is appended —
 *                                      so the badge rendered "Commission:" followed by nothing.
 *
 * Paying now requires at least one real, non-zero value. A zero can still be DISPLAYED beside a
 * genuine commission (the escort-only case) but can no longer CAUSE the paying state, and the
 * text can never come out empty.
 *
 * The three-way distinction this file protects — verified zero ≠ unknown ≠ confirmed not paying —
 * is the reason the storage is text rather than numeric, so it is asserted directly.
 */
import { evaluateLocatorCommission, formatLocatorCommission } from "@bc/companion-shared"

let pass = 0
let fail = 0
const ok = (label: string, cond: boolean, detail = "") => {
  if (cond) { pass++; console.log(`  ✓ ${label}`) } else { fail++; console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`) }
}
type C = { sendCommission?: string | null; escortCommission?: string | null; bonusFlat?: string | null }
const ev = (c: C) => evaluateLocatorCommission(c)
const state = (c: C) => ev(c).state
const text = (c: C) => { const r = ev(c); return "text" in r ? r.text : null }

console.log("\n=== THE REGRESSION: all three verified ZERO is NOT a paying property ===")
{
  const c = { sendCommission: "0%", escortCommission: "0%", bonusFlat: "$0" }
  ok("state is not_paying (was: paying)", state(c) === "not_paying", state(c))
  ok("…and certainly not paying", state(c) !== "paying")
  ok("no text is offered for a red badge", text(c) === null)
}

console.log("\n=== THE SECOND REGRESSION: a lone $0 bonus produced a GREEN badge with no text ===")
{
  const c = { bonusFlat: "$0" }
  ok("state is unverified, not paying", state(c) === "unverified", state(c))
  ok("no empty-text paying badge can be produced", text(c) !== "")
  // The general guarantee, not just this instance.
  for (const probe of [
    { bonusFlat: "0" }, { sendCommission: "0%" }, { escortCommission: "0" },
    { sendCommission: "0%", escortCommission: "0%" },
    { sendCommission: "0%", bonusFlat: "$0" },
  ] as C[]) {
    const r = ev(probe)
    ok(`no empty paying text for ${JSON.stringify(probe)}`, !("text" in r && r.text === ""))
  }
}

console.log("\n=== YOUR ESCORT-ONLY CASE still shows green, with the zero spelled out ===")
{
  const c = { sendCommission: "0%", escortCommission: "100%", bonusFlat: "500" }
  ok("state is paying", state(c) === "paying", state(c))
  ok("text is 'Send 0% · Escort 100% · Bonus $500'", text(c) === "Send 0% · Escort 100% · Bonus $500", String(text(c)))
  ok("the verified zero is DISPLAYED, not dropped", (text(c) ?? "").includes("Send 0%"))
}

console.log("\n=== SEND-ONLY / ESCORT-ONLY / BONUS-ONLY ===")
ok("send-only pays", state({ sendCommission: "100%" }) === "paying")
ok("escort-only pays", state({ escortCommission: "75%" }) === "paying")
ok("bonus-only pays", state({ bonusFlat: "500" }) === "paying")
ok("bonus-only text names the bonus", text({ bonusFlat: "500" }) === "Bonus $500", String(text({ bonusFlat: "500" })))
ok("send-only with a confirmed zero escort still pays",
  state({ sendCommission: "100%", escortCommission: "0%" }) === "paying")
ok("…and spells both out", text({ sendCommission: "100%", escortCommission: "0%" }) === "Send 100% · Escort 0%")

console.log("\n=== UNKNOWN ≠ ZERO ≠ NOT PAYING — the three-way distinction ===")
ok("all blank → unverified", state({}) === "unverified")
ok("nulls → unverified", state({ sendCommission: null, escortCommission: null, bonusFlat: null }) === "unverified")
for (const u of ["", "  ", "Unknown", "unknown", "N/A", "n/a", "TBD", "None", "—", "--", "?"]) {
  ok(`${JSON.stringify(u)} is UNKNOWN, never a zero`, state({ sendCommission: u }) === "unverified", state({ sendCommission: u }))
}
for (const n of ["No", "no", "Not Paying", "not paying", "Does Not Pay", "non-paying", "No Commission"]) {
  ok(`${JSON.stringify(n)} is CONFIRMED NOT PAYING`, state({ sendCommission: n }) === "not_paying", state({ sendCommission: n }))
}
ok("an explicit no-pay beats a real value elsewhere",
  state({ sendCommission: "No", escortCommission: "100%" }) === "not_paying")

console.log("\n=== A VERIFIED ZERO IS NOT ENOUGH TO CLAIM EITHER ANSWER ===")
{
  // Deliberate and stated: send is known to be 0, escort and bonus are not known at all. We
  // cannot call that paying (nothing pays) nor confirmed-not-paying (escort could be anything).
  ok("send 0%, escort unknown → unverified", state({ sendCommission: "0%" }) === "unverified", state({ sendCommission: "0%" }))
  ok("send 0% + escort 0%, bonus unknown → unverified",
    state({ sendCommission: "0%", escortCommission: "0%" }) === "unverified")
  ok("…but ALL THREE zero → confirmed not paying",
    state({ sendCommission: "0%", escortCommission: "0%", bonusFlat: "0" }) === "not_paying")
}

console.log("\n=== ZERO SPELLINGS all classify as a verified zero ===")
for (const z of ["0", "0%", "$0", "0.0", "0.00%"]) {
  ok(`${JSON.stringify(z)} + a real escort → paying, zero shown`,
    text({ sendCommission: z, escortCommission: "100%" }) === "Send 0% · Escort 100%",
    String(text({ sendCommission: z, escortCommission: "100%" })))
}

console.log("\n=== PRODUCTION DATA — the five catalogued properties are unaffected ===")
for (const [s, e] of [["100%", "100%"], ["115%", "115%"], ["125%", "125%"], ["50%", "75%"]]) {
  const c = { sendCommission: s, escortCommission: e }
  ok(`${s}/${e} still pays`, state(c) === "paying", state(c))
  ok(`…text unchanged`, text(c) === `Send ${s} · Escort ${e}`, String(text(c)))
}

console.log("\n=== formatLocatorCommission (the Map/Companion one-liner) is untouched ===")
ok("null for nothing", formatLocatorCommission({}) === null)
ok("renders what it is given", formatLocatorCommission({ sendCommission: "100%", bonusFlat: "500" }) === "Send 100% · Bonus $500")

console.log(fail === 0 ? `\nALL PASS ✅ (${pass} passed, ${fail} failed)\n` : `\n${pass} passed, ${fail} failed\n`)
process.exit(fail === 0 ? 0 : 1)
