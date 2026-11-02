/**
 * BEAST COMPANION — the commission chip, and its parity with the web app.
 *
 *   npx tsx scripts/leads/companionCommissionBadge.test.ts
 *
 * The goal is that the badge looks identical whether a property is viewed on the map or in the
 * Companion. Two codebases, two stylesheets — so rather than asserting hex values twice, this
 * reads the web app's CommissionBadge.tsx and requires the extension's CSS to carry the SAME
 * values. If someone retunes one, this fails instead of the two quietly drifting apart.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { evaluateLocatorCommission } from "@bc/companion-shared"

let pass = 0
let fail = 0
const ok = (l: string, c: boolean, d = "") => { if (c) { pass++; console.log(`  ✓ ${l}`) } else { fail++; console.log(`  ✗ ${l}${d ? ` — ${d}` : ""}`) } }
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

const WEB = read("components/crm/CommissionBadge.tsx")
const CSS = read("apps/beast-companion/src/sidepanel/lead/panel.css")
const VIEW = read("apps/beast-companion/src/sidepanel/properties/PropertiesView.tsx")
/** The .bc-cp-commission base rule only — not the --nopay / --unverified variants. */
const BASE = CSS.slice(CSS.indexOf(".bc-cp-commission {"), CSS.indexOf(".bc-cp-commission-label"))

console.log("the paying chip uses the WEB APP's values, read from its source:")
for (const [role, re] of [
  ["background", /bg-\[(#[0-9a-f]{6})\]/i],
  ["text", /text-\[(#[0-9a-f]{6})\]/i],
  ["border", /border-\[(#[0-9a-f]{6})\]/i],
] as [string, RegExp][]) {
  // Pull the value out of the web component's PAYING branch, so the test cannot pass by
  // hard-coding a colour that the web app no longer uses.
  const payingBranch = WEB.slice(WEB.indexOf('status.state === "paying"'), WEB.indexOf('status.state === "not_paying"'))
  const hex = payingBranch.match(re)?.[1]?.toLowerCase()
  ok(`${role} matches the web app (${hex})`, !!hex && BASE.toLowerCase().includes(hex), `web=${hex}`)
}
ok("the label text is the bright green too", /\.bc-cp-commission-label \{[^}]*#4ade80/.test(CSS))
ok("the old mint palette is gone from the base rule", !/8ecaa6|dff5e6|136c3a/i.test(BASE))

console.log("\nno icon on any chip — the value stands alone:")
// Structural, not distance-based: isolate the PAYING branch and look inside it.
const PAYING_BRANCH = VIEW.slice(
  VIEW.indexOf('commissionStatus.state === "paying"'),
  VIEW.indexOf('commissionStatus.state === "not_paying"'),
)
// The decorative dollar mark was removed on 2026-11-02 from BOTH surfaces at once. It was
// aria-hidden, so nothing accessible was lost; these are inverted rather than deleted so the
// two surfaces cannot drift apart again.
ok("no svg inside the paying span", !/<svg/.test(PAYING_BRANCH))
ok("…and none anywhere in the commission block",
  (VIEW.slice(VIEW.indexOf('commissionStatus.state === "paying"'), VIEW.indexOf("bc-cp-reasons")).match(/<svg/g) ?? []).length === 0)
ok("…matching the web app, which has none either", !/<svg|DollarMark/.test(WEB))
ok("the paying chip still carries the VALUE", /bc-cp-commission-label">\{commissionStatus\.text\}/.test(PAYING_BRANCH))
ok("…and still names the category for every reader",
  /aria-label=\{`Commission: \$\{commissionStatus\.text\}`\}/.test(PAYING_BRANCH) &&
  /title=\{`Commission: \$\{commissionStatus\.text\}`\}/.test(PAYING_BRANCH))
ok("the no-pay chip is text-only", /bc-cp-commission bc-cp-commission--nopay">Not Paying Locators</.test(VIEW))
ok("the unverified chip is text-only", /bc-cp-commission bc-cp-commission--unverified">Commission Not Verified</.test(VIEW))
ok("the icon's old sizing rule is retained but matches nothing", /\.bc-cp-commission svg \{[^}]*0\.95em[^}]*flex: none/s.test(CSS))
ok("the chip is still inline-flex — left as it was, one child, nothing shifts", /display: inline-flex/.test(BASE))

console.log("\nthe other two states keep their exact appearance:")
ok("no-pay is still the same red", /\.bc-cp-commission--nopay \{[^}]*#fdeaea[^}]*#eaa9a5[^}]*#b42318/s.test(CSS))
ok("unverified is still the same grey", /\.bc-cp-commission--unverified \{[^}]*#eef1f5[^}]*#cbd4e0[^}]*#5a6b86/s.test(CSS))
ok("…and both still match the web app's values",
  ["#fdeaea", "#eaa9a5", "#b42318", "#eef1f5", "#cbd4e0", "#5a6b86"].every((h) => WEB.toLowerCase().includes(h) && CSS.toLowerCase().includes(h)))

console.log("\ncompact sizing, padding and radius are unchanged:")
ok("font-size still 11.5px", /font-size: 11\.5px/.test(BASE))
ok("padding still 3px 9px", /padding: 3px 9px/.test(BASE))
ok("radius still 8px", /border-radius: 8px/.test(BASE))
ok("line-height still 1.3", /line-height: 1\.3/.test(BASE))

console.log("\nwording: the label is gone from the chip, the meaning is not:")
ok("no visible 'Commission:' on the paying chip", !/bc-cp-commission-label">Commission:/.test(VIEW))
ok("…the evaluator's verbatim text is what shows", /bc-cp-commission-label">\{commissionStatus\.text\}<\/span>/.test(VIEW))
ok("…and the chip keeps an accessible name", /aria-label=\{`Commission: \$\{commissionStatus\.text\}`\}/.test(VIEW))
ok("…matching the web app's, so both announce the same thing",
  /aria-label=\{`Commission: \$\{status\.text\}`\}/.test(WEB) && /aria-label=\{`Commission: \$\{commissionStatus\.text\}`\}/.test(VIEW))
ok("the unverified chip KEEPS its wording", /Commission Not Verified/.test(VIEW))
ok("the no-pay chip keeps its wording", /Not Paying Locators/.test(VIEW))
ok("the Companion still uses the SHARED evaluator", /evaluateLocatorCommission/.test(VIEW))
for (const [label, input, expected] of [
  ["blank", { sendCommission: null, escortCommission: null, bonusFlat: null }, "unverified"],
  ["a rate", { sendCommission: "125%", escortCommission: "125%", bonusFlat: null }, "paying"],
  ["explicit no", { sendCommission: "No", escortCommission: "No", bonusFlat: null }, "not_paying"],
  ["zeros only", { sendCommission: "0%", escortCommission: "0%", bonusFlat: null }, "unverified"],
] as [string, Record<string, string | null>, string][]) {
  ok(`${label} → ${expected}`, evaluateLocatorCommission(input as never).state === expected)
}

console.log("\nnothing else in the Companion moved:")
ok("the move-in special chip is untouched", /\.bc-cp-special \{/.test(CSS) && !/bc-cp-special[^}]*#0f2a1d/s.test(CSS))
ok("the status row still holds both chips", /<div className="bc-cp-status">/.test(VIEW))
ok("the reasons block still follows it", /bc-cp-reasons/.test(VIEW))

console.log(`\nCompanion commission badge: ${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
