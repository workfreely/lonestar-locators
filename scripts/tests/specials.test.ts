/**
 * Specials V1 — concession + rent DISPLAY normalization. Pure, no DB/DOM:
 *   npx tsx scripts/tests/specials.test.ts
 *
 * Row contract: Specials: [special] · Base Rent: [$] · Avg Rent: [$]
 * Rules under test: "weeks" → "WKS" with qualifiers PRESERVED; "$1,725" with commas and
 * no "/mo"; no special → "None"; and Avg Rent is NEVER manufactured — it appears only
 * when a guaranteed concession can be tied to a known rent AND lease term.
 */
import { evaluateSpecials, selectRentConcession, formatSpecialText, formatRent, computeAvgRent, isQualifiedSpecial } from "@bc/companion-shared"

let pass = 0,
  fail = 0
const eq = (a: unknown, b: unknown, name: string) => {
  if (a === b) pass++
  else {
    fail++
    console.error("✗", `${name} — got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`)
  }
}

// ── Concession text: units shortened, wording otherwise preserved ─────────────
eq(formatSpecialText("8 weeks free"), "8 weeks free", "natural wording kept as-is")
eq(formatSpecialText("Up to 8 weeks free"), "Up to 8 weeks free", "qualifier 'Up to' PRESERVED")
eq(formatSpecialText("6 Weeks Free"), "6 Weeks Free", "casing untouched")
eq(formatSpecialText("1 week free"), "1 week free", "singular week untouched")
eq(formatSpecialText("$1000 off"), "$1K off", "$1000 off → $1K off")
eq(formatSpecialText("$1,000 off first month"), "$1K off first month", "comma form → $1K, rest preserved")
eq(formatSpecialText("  4   weeks   free  "), "4 weeks free", "whitespace collapsed")
eq(formatSpecialText("Look and lease: 8 weeks free on select units"), "Look and lease: 8 weeks free on select units", "conditions preserved verbatim")

// ── Absent concession → "None" (both SAD placeholder forms) ───────────────────
eq(formatSpecialText(null), "None", "null → None")
eq(formatSpecialText(""), "None", "empty → None")
eq(formatSpecialText("---"), "None", "SAD list placeholder '---' → None")
eq(formatSpecialText("No ongoing concessions at this time"), "None", "SAD detail placeholder → None")
eq(formatSpecialText("N/A"), "None", "N/A → None")

// ── Rent formatting ───────────────────────────────────────────────────────────
eq(formatRent(1725), "$1,725", "commas, no decimals")
eq(formatRent(1495.4), "$1,495", "rounded")
eq(formatRent(995), "$995", "no comma under 1000")
eq(formatRent(null), null, "null rent → null")
eq(formatRent(undefined), null, "undefined rent → null")
eq(formatRent(Number.NaN), null, "NaN → null")

// ── Qualified language detection ──────────────────────────────────────────────
eq(isQualifiedSpecial("Up to 8 weeks free"), true, "'Up to' is qualified")
eq(isQualifiedSpecial("8 weeks free on select units"), true, "'select units' is qualified")
eq(isQualifiedSpecial("Call for details"), true, "'call for' is qualified")
eq(isQualifiedSpecial("8 weeks free"), false, "a flat offer is not qualified")

// ── Avg Rent is computed ONLY from a guaranteed concession + rent + term ──────
eq(computeAvgRent({ text: "8 weeks free", baseRent: 1725, leaseTermMonths: 12 }), (1725 * (12 - 8 / (52 / 12))) / 12, "guaranteed 8 WKS on a 12-mo lease")
eq(formatRent(computeAvgRent({ text: "2 months free", baseRent: 1800, leaseTermMonths: 12 })), "$1,500", "2 months free on 12-mo → $1,500")
eq(computeAvgRent({ text: "Up to 8 weeks free", baseRent: 1725, leaseTermMonths: 12 }), null, "QUALIFIED 'Up to' is never treated as a guarantee")
eq(computeAvgRent({ text: "8 weeks free", baseRent: 1725, leaseTermMonths: null }), null, "unknown lease term → null")
eq(computeAvgRent({ text: "8 weeks free", baseRent: null, leaseTermMonths: 12 }), null, "unknown base rent → null")
eq(computeAvgRent({ text: "None", baseRent: 1725, leaseTermMonths: 12 }), null, "no concession → no Avg Rent")
eq(computeAvgRent({ text: "$1K off", baseRent: 1725, leaseTermMonths: 12 }), null, "a dollar-off concession states no free PERIOD → null")
eq(computeAvgRent({ text: "8 weeks free on select units", baseRent: 1725, leaseTermMonths: 12 }), null, "conditional offer → null")
eq(computeAvgRent({ text: "24 months free", baseRent: 1725, leaseTermMonths: 12 }), null, "free period ≥ term → null (never negative/zero rent)")
eq(computeAvgRent({}), null, "nothing known → null")

// ── Assembled row pieces ──────────────────────────────────────────────────────
{
  const r = evaluateSpecials({ text: "8 weeks free", baseRent: 1725, leaseTermMonths: 12 })
  eq(r.special, "8 weeks free", "row special")
  eq(r.baseRent, "$1,725", "row base rent")
  eq(r.avgRent, "$1,460", "row avg rent — 8 WKS ÷ (52/12) = 1.85 mo free on a 12-mo lease")
}
{
  const r = evaluateSpecials({ text: "Up to 8 weeks free", baseRent: 1725, leaseTermMonths: 12 })
  eq(r.special, "Up to 8 weeks free", "qualified special preserved")
  eq(r.baseRent, "$1,725", "base rent still shown")
  eq(r.avgRent, null, "Avg Rent omitted for a qualified concession")
}
{
  const r = evaluateSpecials({ text: null, baseRent: 1725 })
  eq(r.special, "None", "Specials: None · Base Rent: $1,725")
  eq(r.baseRent, "$1,725", "base rent shown alongside None")
  eq(r.avgRent, null, "no concession → no Avg Rent")
}
{
  const r = evaluateSpecials(null)
  eq(r.special, "None", "no input at all → None")
  eq(r.baseRent, null, "no base rent")
  eq(r.avgRent, null, "no avg rent")
}


// ── LIVE SAD specials block (#ctl00_ContentPlaceHolder_SpecialsBit1_specials) ──
// The confirmed markup mixes a gift card, a fee waiver, TWO rent concessions, a bonus
// and a footnote. Only a RENT concession may reach the row.
const LIVE_SPECIALS = [
  "Gift Card: $500 Gift Card ends 11/13/2026",
  "App Fee Waived",
  "100% off rent for 2 month(s) on a 12 mo lease",
  "Other Concessions: Up to 8 Weeks Free Base Rent",
  "BONUS: Credited App Back & a $500 Gift Card",
  "*Minimum Term Required. Terms Apply.",
]

{
  const c = selectRentConcession(LIVE_SPECIALS)!
  eq(c.display, "2 months free", "live block → the UNQUALIFIED rent concession wins")
  eq(c.qualified, false, "winner is not a qualified offer")
  eq(c.termMonths, 12, "'on a 12 mo lease' preserved internally for later rent math")
  eq(c.free?.amount, 2, "free amount parsed")
  eq(c.free?.unit, "months", "SAD's own unit kept (never converted to weeks)")
}
{
  const r = evaluateSpecials({ lines: LIVE_SPECIALS })
  eq(r.special, "2 months free", "row special from the live block")
  eq(r.hasRentConcession, true, "block states a rent concession")
  eq(r.baseRent, null, "Base Rent NOT manufactured")
  eq(r.avgRent, null, "Avg Rent NOT manufactured — no exact rent bound to the 12 mo term")
  eq(r.qualifyingTermMonths, 12, "qualifying term preserved for later")
}

// ── Non-rent offers are NEVER shown as a rent concession ──────────────────────
eq(selectRentConcession(["Gift Card: $500 Gift Card ends 11/13/2026"]), null, "gift card is not a rent concession")
eq(selectRentConcession(["App Fee Waived"]), null, "waived app fee is not a rent concession")
eq(selectRentConcession(["Admin Fee Waived", "$300 deposit special"]), null, "fee/deposit offers are not rent concessions")
eq(selectRentConcession(["BONUS: Credited App Back & a $500 Gift Card"]), null, "bonus/gift card excluded")
eq(selectRentConcession(["*Minimum Term Required. Terms Apply."]), null, "footnote excluded")
eq(selectRentConcession([]), null, "empty block → null")
eq(selectRentConcession(null), null, "no block → null")
{
  // A block with ONLY non-rent offers must not claim "None" — the row hides instead.
  const r = evaluateSpecials({ lines: ["App Fee Waived", "Gift Card: $250"] })
  eq(r.hasRentConcession, false, "non-rent-only block → row hides, never reports 'None'")
}

// ── Qualifiers are preserved when the qualified offer is the only one ─────────
{
  const c = selectRentConcession(["Other Concessions: Up to 8 Weeks Free Base Rent"])!
  eq(c.display, "Up to 8 weeks free", "'Up to' preserved; SAD's label prefix dropped")
  eq(c.qualified, true, "marked qualified")
  eq(c.termMonths, null, "no lease term stated")
}
{
  const r = evaluateSpecials({ lines: ["Up to 8 Weeks Free Base Rent"] })
  eq(r.special, "Up to 8 weeks free", "row renders 'Specials: Up to 8 weeks free'")
  eq(r.avgRent, null, "qualified offer never yields Avg Rent")
}

// ── Reliability ranking: unqualified beats a larger qualified ceiling ─────────
{
  const c = selectRentConcession(["Up to 10 Weeks Free", "6 weeks free"])!
  eq(c.display, "6 weeks free", "unqualified 6 weeks beats a qualified 'Up to 10'")
}
{
  const c = selectRentConcession(["4 weeks free", "2 months free"])!
  eq(c.display, "2 months free", "between two unqualified offers the larger wins")
}
{
  const c = selectRentConcession(["Up to 4 weeks free", "Up to 8 weeks free"])!
  eq(c.display, "Up to 8 weeks free", "between two qualified offers the larger wins")
}

// ── Dollar-off rent concessions still surface ─────────────────────────────────
{
  const c = selectRentConcession(["$1000 off first month rent"])!
  eq(c.display, "$1K off first month rent", "dollar-off concession normalized, wording kept")
  eq(c.free, null, "no free PERIOD parsed → no Avg Rent path")
}

// ── Units are never converted between weeks and months for DISPLAY ────────────
{
  const c = selectRentConcession(["8 weeks free"])!
  eq(c.display, "8 weeks free", "weeks stay weeks")
}


// ── Natural wording: correct singular vs plural, never abbreviated ────────────
eq(selectRentConcession(["1 month free"])!.display, "1 month free", "1 month free (singular)")
eq(selectRentConcession(["2 months free"])!.display, "2 months free", "2 months free (plural)")
eq(selectRentConcession(["1 week free"])!.display, "1 week free", "1 week free (singular)")
eq(selectRentConcession(["8 weeks free"])!.display, "8 weeks free", "8 weeks free (plural)")
eq(selectRentConcession(["Up to 8 weeks free"])!.display, "Up to 8 weeks free", "qualifier + plural")
eq(selectRentConcession(["100% off rent for 1 month(s) on a 12 mo lease"])!.display, "1 month free", "100% off 1 month → singular")

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
