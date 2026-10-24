/**
 * INCENTIVE AGE — the agent-facing "Verified 12 days ago" line.
 *
 *   npx tsx scripts/leads/incentiveAge.test.ts
 *
 * Two rules carry the whole feature:
 *   1. it INFORMS, it does not gate — nothing is hidden because of an age;
 *   2. the word "Verified" is earned from provenance, never assumed from a timestamp.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { relativeAge, ageLabel } from "@/lib/propertyIntel/relativeAge"

let pass = 0
let fail = 0
const ok = (l: string, c: boolean, d = "") => { if (c) { pass++; console.log(`  ✓ ${l}`) } else { fail++; console.log(`  ✗ ${l}${d ? ` — ${d}` : ""}`) } }
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1").replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
const read = (p: string) => strip(readFileSync(join(process.cwd(), p), "utf8"))
const ago = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString()

console.log("relative age reads the way a person would say it:")
for (const [days, expect] of [[0, "today"], [1, "yesterday"], [12, "12 days ago"], [30, "30 days ago"]] as const) {
  ok(`${days}d → "${expect}"`, relativeAge(ago(days)) === expect, String(relativeAge(ago(days))))
}
ok("~2 months", relativeAge(ago(61)) === "2 months ago", String(relativeAge(ago(61))))
ok("1 month is singular", relativeAge(ago(31)) === "1 month ago", String(relativeAge(ago(31))))
ok("over a year", /year/.test(String(relativeAge(ago(500)))), String(relativeAge(ago(500))))
ok("a future timestamp is not reported as negative", relativeAge(new Date(Date.now() + 86_400_000)) === "today")
ok("no date → null", relativeAge(null) === null)
ok("unparseable → null", relativeAge("not a date") === null)

console.log("\n'Verified' is earned from provenance, not from the date:")
ok('verified + date → "Verified 12 days ago"', ageLabel({ at: ago(12), verified: true }) === "Verified 12 days ago")
ok('NOT verified + date → "Updated …"', ageLabel({ at: ago(61), verified: false }) === "Updated 2 months ago")
ok("…and the default is the cautious one", ageLabel({ at: ago(12) }) === "Updated 12 days ago")
ok('no date → "Date unknown"', ageLabel({ at: null, verified: true }) === "Date unknown")
ok("…even when provenance says verified", !/Verified/.test(ageLabel({ at: null, verified: true })))

console.log("\nit informs the editor and gates nothing:")
{
  const PANEL = read("components/crm/MapPropertyEditor.tsx")
  const ROUTE = read("app/api/admin/owner/property-pricing/route.ts")
  const SHARED = read("packages/companion-shared/src/specials.ts")
  ok("the special shows an age line", /ageLabel\(\{ at: loaded\.currentSpecialCheckedAt/.test(PANEL))
  ok("the gift card shows one too", /ageLabel\(\{ at: loaded\.giftCardCheckedAt/.test(PANEL))
  ok("both read provenance for the Verified/Updated word",
    /verified: loaded\.fieldVerified\?\.current_special/.test(PANEL) && /verified: loaded\.fieldVerified\?\.gift_card_status/.test(PANEL))
  ok("the route reads provenance for those two fields",
    /"current_special", "gift_card_status"/.test(ROUTE))
  ok("…and returns the special's own timestamp", /currentSpecialCheckedAt: s\(row\.current_special_checked_at\)/.test(ROUTE))
  ok("the age never hides a field in the panel", !/ageLabel[\s\S]{0,200}?(hidden|return null|&&\s*\()/.test(PANEL))
  // The badge resolver must not have grown a gift-card expiry again.
  ok("the resolver applies NO freshness gate to the gift card", !/giftFresh/.test(SHARED))
  ok("the special has no gate either — the age informs, it never hides",
    !/requireSpecialFreshness|isSpecialCurrent\(input/.test(SHARED.slice(SHARED.indexOf("export function resolvePromoBadges"))))
  for (const f of ["components/crm/BestMatches.tsx", "components/crm/LeadFavorites.tsx",
                   "components/crm/explorer/BeastPropertyExplorer.tsx",
                   "app/locator-beast/r/[token]/RecommendationList.tsx"]) {
    ok(`${f.split("/").pop()} applies no age rule`, !/isSpecialCurrent|requireSpecialFreshness/.test(read(f)))
  }
}

console.log("\nclient-facing cards carry no timestamps:")
{
  const CLIENT = read("app/locator-beast/r/[token]/RecommendationList.tsx")
  const BADGES = read("components/crm/PromoBadges.tsx")
  ok("no age label on the client page", !/ageLabel|relativeAge|days ago/.test(CLIENT))
  ok("no age label in the shared badge component", !/ageLabel|relativeAge|days ago/.test(BADGES))
  ok("the badge row still renders only the two pills", (BADGES.match(/badges\.map/g) ?? []).length === 1)
}

console.log(`\nIncentive age: ${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
