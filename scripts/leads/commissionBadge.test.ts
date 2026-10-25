/**
 * COMMISSION BADGE — the dark-green paying pill, and what must NOT have changed with it.
 *
 *   npx tsx scripts/leads/commissionBadge.test.ts
 *
 * A visual change is the easiest place to break a semantic one by accident. The rule that
 * matters here is older than the colour: unknown is not no-pay. A property nobody has checked
 * shows neutral grey and the words "Commission Not Verified"; only a confirmed finding is
 * allowed to say "Not Paying Locators".
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { evaluateLocatorCommission } from "@bc/companion-shared"

let pass = 0
let fail = 0
const ok = (l: string, c: boolean, d = "") => { if (c) { pass++; console.log(`  ✓ ${l}`) } else { fail++; console.log(`  ✗ ${l}${d ? ` — ${d}` : ""}`) } }
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1").replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
const read = (p: string) => strip(readFileSync(join(process.cwd(), p), "utf8"))

const BADGE = read("components/crm/CommissionBadge.tsx")
const SURFACES = {
  "Recommended (BestMatches)": read("components/crm/BestMatches.tsx"),
  "Favorites": read("components/crm/LeadFavorites.tsx"),
  "Map card": read("components/crm/explorer/BeastPropertyExplorer.tsx"),
}

console.log("the paying pill is dark forest green with a dollar mark:")
ok("dark background", /bg-\[#0f2a1d\]/.test(BADGE))
ok("brighter green text", /text-\[#4ade80\]/.test(BADGE))
ok("subtle green border", /border-\[#1e5235\]/.test(BADGE))
ok("a dollar sign, not a tag", /DollarMark/.test(BADGE) && !/tag/i.test(BADGE.slice(BADGE.indexOf("function DollarMark"), BADGE.indexOf("export default"))))
ok("…sized in em so it tracks the badge's own type", /width: "0\.95em", height: "0\.95em"/.test(BADGE))
ok("…and it never shrinks", /flex-none/.test(BADGE))
ok("the old mint green is gone from the component", !/dff5e6|8ecaa6|136c3a/.test(BADGE))

console.log("\nthe word 'Commission:' is gone from the paying chip, but not its meaning:")
{
  const paying = BADGE.slice(BADGE.indexOf('status.state === "paying"'), BADGE.indexOf('status.state === "not_paying"'))
  ok("no visible 'Commission:' label remains", !/>Commission:</.test(paying))
  ok("…the value is still rendered", /\{status\.text\}/.test(paying))
  ok("…and the dollar mark still carries the category visually", /<DollarMark \/>/.test(paying))
  // A decorative icon is skipped by assistive tech, so without this the chip announces a bare
  // "Send 125% · Escort 125%" — a number with no subject.
  ok("the chip has an accessible name that still says Commission",
    /aria-label=\{`Commission: \$\{status\.text\}`\}/.test(paying))
  ok("…and a hover title too", /title=\{`Commission: \$\{status\.text\}`\}/.test(paying))
  ok("the icon is still marked decorative", /aria-hidden="true"/.test(BADGE))
}

console.log("\nthe other two states are untouched:")
ok("confirmed no-pay keeps its red", /border-\[#eaa9a5\] bg-\[#fdeaea\] text-\[#b42318\]/.test(BADGE))
ok("…and still reads 'Not Paying Locators'", /Not Paying Locators/.test(BADGE))
ok("unverified keeps its neutral grey", /border-\[#cbd4e0\] bg-\[#eef1f5\] text-\[#5a6b86\]/.test(BADGE))
ok("…and still reads 'Commission Not Verified' — the word stays where it is useful",
  /Commission Not Verified/.test(BADGE))
ok("neither carries the dollar mark — it marks PAY, not the absence of it",
  (BADGE.match(/<DollarMark \/>/g) ?? []).length === 1)

console.log("\nsize, typography and radius are the values each surface already used:")
ok("row size unchanged (11px, rounded-lg)", /row: "rounded-lg px-2\.5 py-\[3px\] text-\[11px\]"/.test(BADGE))
ok("card size unchanged (11.5px, rounded-md)", /card: "rounded-md px-2\.5 py-\[3px\] text-\[11\.5px\]"/.test(BADGE))

console.log("\nall three surfaces render through the one component:")
for (const [name, src] of Object.entries(SURFACES)) {
  ok(`${name}: uses CommissionBadge`, /<CommissionBadge /.test(src))
  ok(`${name}: no inline commission pill remains`, !/dff5e6|8ecaa6|136c3a/.test(src))
  ok(`${name}: does not re-implement the other states`, !/Not Paying Locators|Commission Not Verified/.test(src))
}
// The badge moved onto its OWN right-aligned row beneath the reasons, so it no longer needs
// flex-none to defend its width — the reasons are not competing with it any more.
ok("Recommended renders it on its own right-aligned row",
  /<div className="mt-1\.5 flex w-full justify-end">[\s\S]{0,160}?<CommissionBadge status=\{commission\} size="row" \/>/.test(SURFACES["Recommended (BestMatches)"]))
ok("the map keeps the larger card size", /<CommissionBadge status=\{commissionStatus\} size="card" \/>/.test(SURFACES["Map card"]))

console.log("\nthe status is passed WHOLE, so the union cannot be split apart:")
ok("the prop is the CommissionStatus itself", /status: CommissionStatus/.test(BADGE))
ok("…and no surface passes a loose text field", !Object.values(SURFACES).some((s) => /<CommissionBadge[^>]*text=/.test(s)))

console.log("\nUNKNOWN IS NOT NO-PAY — the rule the colour change must not disturb:")
for (const [label, input, expected] of [
  ["blank commission", { sendCommission: null, escortCommission: null, bonusFlat: null }, "unverified"],
  ["a real rate", { sendCommission: "125%", escortCommission: "125%", bonusFlat: null }, "paying"],
  ["a bonus only", { sendCommission: null, escortCommission: null, bonusFlat: "1500" }, "paying"],
  ["an explicit no", { sendCommission: "No", escortCommission: "No", bonusFlat: null }, "not_paying"],
  // A verified ZERO is not evidence of payment. evaluateLocatorCommission requires at least one
  // real non-zero value, which is a deliberate fix: "Send 0% · Escort 0%" used to render GREEN
  // as "paying". The colour change must not resurrect that.
  ["zeros only", { sendCommission: "0%", escortCommission: "0%", bonusFlat: null }, "unverified"],
  ["a zero bonus alone", { sendCommission: null, escortCommission: null, bonusFlat: "0" }, "unverified"],
] as [string, Record<string, string | null>, string][]) {
  const r = evaluateLocatorCommission(input as never)
  ok(`${label} → ${expected}`, r.state === expected, r.state)
}
{
  // …but a zero IS still displayed beside a genuine commission (the escort-only case).
  const r = evaluateLocatorCommission({ sendCommission: "0%", escortCommission: "100%", bonusFlat: null } as never)
  ok("a zero still shows alongside a real rate", r.state === "paying" && r.text === "Send 0% · Escort 100%", JSON.stringify(r))
  // And the paying text is never empty — the dark pill would otherwise read "Commission:" alone.
  const all = [
    { sendCommission: "125%", escortCommission: "125%", bonusFlat: null },
    { sendCommission: null, escortCommission: null, bonusFlat: "1500" },
    { sendCommission: "0%", escortCommission: "100%", bonusFlat: "500" },
  ].map((c) => evaluateLocatorCommission(c as never))
  ok("every paying badge has text after the label",
    all.every((x) => x.state === "paying" && typeof x.text === "string" && x.text.trim().length > 0),
    JSON.stringify(all))
}

console.log("\nmove-in specials and gift cards are NOT touched by this:")
{
  const PROMO = read("components/crm/PromoBadges.tsx")
  ok("the special pill keeps its soft green", /special: "border-\[#8fcaa6\] bg-\[#e4f4ea\] text-\[#16633a\]"/.test(PROMO))
  ok("the gift card keeps its blue", /gift_card: "border-\[#8fb6ea\] bg-\[#e8f0fe\] text-\[#1c3f75\]"/.test(PROMO))
  ok("…and neither borrowed the commission colours", !/0f2a1d|4ade80|1e5235/.test(PROMO))
  ok("the commission badge is not in the promo row", !/CommissionBadge/.test(PROMO))
}

console.log("\nunrelated surfaces that happen to share the old green are untouched:")
for (const f of ["components/thankYou/ThankYouView.tsx", "app/locator-beast/r/[token]/page.tsx"]) {
  ok(`${f.split("/").pop()} still uses its own palette`, /dff5e6|e4f6ec/.test(read(f)))
}

console.log(`\nCommission badge: ${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
