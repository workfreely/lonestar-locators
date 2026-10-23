// The Check Application STATE LINE is gone from the Favorites card; everything it derived from
// is not.
//
// The line was a bordered row carrying only the green favState label ("Toured · Application
// Pending" and its siblings). The Check Application BUTTON had already moved up to the property
// action row beside Guest Card Sent, so the row restated what the card already showed.
//
// The risk in a change like this is never the deletion — it is deleting a label that something
// else was reading. favoriteTourStateLabel is a pure DERIVATION, so this file asserts both halves:
// the row is gone from the card, and every canonical state it was derived from still resolves.
import { readFileSync } from "node:fs"
import { favoriteTourStateLabel } from "@/lib/leads/tourFollowUp"

let pass = 0
let fail = 0
function ok(name: string, cond: boolean, detail = "") {
  if (cond) { pass++; console.log(`  ✓ ${name}`) }
  else { fail++; console.log(`  ✗ ${name}${detail ? `  — ${detail}` : ""}`) }
}
const raw = readFileSync("components/crm/LeadFavorites.tsx", "utf8")
/** Source with comments stripped — a historical note about the removed row is fine; a live one is not. */
const code = raw.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "")

console.log("the stripper works:")
ok("the file's own explanation is not being scanned", !code.includes("THE CHECK APPLICATION STATE LINE IS GONE"))

// ── 1. THE ROW IS GONE ────────────────────────────────────────────────────────────────────────
console.log("\nthe Check Application state line no longer renders:")
ok("no `checkAppOpen && onCheckApplication && favState` block remains",
  !/checkAppOpen\s*&&\s*onCheckApplication\s*&&\s*favState/.test(code))
// The ONLY thing that block rendered was a bordered div wrapping a lone favState paragraph.
const loneLabelRows = [...code.matchAll(/<div className="mt-2 pt-2 border-t[^"]*">\s*<p className="text-\[10\.5px\] font-semibold text-emerald-600">\{favState\}<\/p>\s*<\/div>/g)]
ok(`no bordered row contains only the favState label (${loneLabelRows.length})`, loneLabelRows.length === 0)

// ── 2. WHAT MUST SURVIVE ──────────────────────────────────────────────────────────────────────
console.log("\nGuest Card Sent and Check Application are untouched:")
ok("the Check Application handler is still wired", /onCheckApplication/.test(code))
// Invoked as `onCheckApplication!(…)` — the non-null assertion is part of the call, so the regex
// has to allow it or it reports a live button as missing.
ok("…and still invoked from the action row", /onCheckApplication!?\(/.test(code))
ok("…from the row that also carries Guest Card Sent", /showCheckApp && \(/.test(code) && /Check Application/.test(raw))
ok("Guest Card Sent is still rendered", /Guest Card Sent/.test(raw))
ok("checkAppOpen is still computed and used", /checkAppOpen/.test(code))

console.log("\nevery OTHER favState branch still renders — each pairs the label with its own action:")
for (const [name, re] of [
  ["Apply (Mark as Applied)", /applyAction && onStartApplication[\s\S]{0,400}?\{favState\}/],
  ["Confirm Lease", /confirmLeaseOpen && onConfirmLease[\s\S]{0,400}?\{favState\}/],
  ["Invoice", /sendInvoiceOpen|getInvoiceOpen/],
  ["Commission Paid", /commissionPaidOpen/],
  ["Send Rebate", /sendRebateOpen/],
] as [string, RegExp][]) ok(name, re.test(code))
ok("the no-action fallback line is still there",
  /!tour && !tfAction && !applyAction && !checkAppOpen[\s\S]{0,300}?favState/.test(code),
  "a card with no open action should still show its tour outcome")

// ── 3. THE DERIVATION IS UNTOUCHED ────────────────────────────────────────────────────────────
// This is the half that proves no DATA was removed: every canonical state the line used to
// surface still resolves to the same string, so AI Client Insights and reporting read what they
// always did. Removing a renderer must not change what the renderer was rendering.
console.log("\nfavoriteTourStateLabel still derives every canonical state:")
const base = { applyActionOpen: false, isTopPick: true, appliedStage: true, outcome: "ready_to_apply" as const, isApplicationProperty: true, closedStage: false }
for (const [status, expected] of [
  ["pending", "Toured · Application Pending"],
  ["approved", "Toured · Approved"],
  ["denied", "Toured · Application Denied"],
  ["canceled", "Toured · Application Canceled"],
] as [string, string][]) {
  const got = favoriteTourStateLabel({ ...base, applicationStatus: status } as never)
  ok(`${status} → "${expected}"`, got === expected, String(got))
}
ok('an open Apply action still reads "Toured · Ready to Apply"',
  favoriteTourStateLabel({ ...base, applyActionOpen: true, applicationStatus: null } as never) === "Toured · Ready to Apply")
ok('a closed lease still reads "Toured · Leased"',
  favoriteTourStateLabel({ ...base, applicationStatus: "approved", closedStage: true } as never) === "Toured · Leased")
// `if (!opts.outcome) return null` is evaluated BEFORE the no_show branch, so a no_show case
// needs a recorded outcome — passing null returns null and says nothing about no_show at all.
ok('a no_show tour still reads "No-Show"',
  favoriteTourStateLabel({ applyActionOpen: false, isTopPick: false, appliedStage: false, tourStatus: "no_show", outcome: "didnt_like", applicationStatus: null, isApplicationProperty: false, closedStage: false } as never) === "No-Show")
ok("nothing recorded still returns null",
  favoriteTourStateLabel({ applyActionOpen: false, isTopPick: false, appliedStage: false, outcome: null, applicationStatus: null, isApplicationProperty: false, closedStage: false } as never) === null)

// ── 4. NOTHING FUNCTIONAL WAS TOUCHED ─────────────────────────────────────────────────────────
console.log("\nno workflow, tracking or automation was changed:")
ok("the component still issues no write of its own for this label",
  !/favState[\s\S]{0,120}?(supabase|fetch\(|\.update\(|\.insert\()/.test(code))
ok("tour history is still read", /outcomeTour|tourStatus/.test(code))
ok("application status is still read", /applicationStatus/.test(code))
ok("Top Pick is still read", /isTopPick/.test(code))
ok("CRM stage is still read", /crm_status/.test(code))
ok("favoriteTourStateLabel is still imported and called once", (code.match(/favoriteTourStateLabel\(/g) ?? []).length === 1)

console.log(`\nFavorites card status line: ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
