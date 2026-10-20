/**
 * Special badges — the advertised wording, and the freshness source.
 *
 *   npx tsx scripts/leads/specialBadge.test.ts
 *
 * ── TWO BUGS, BOTH REPRODUCED FROM PRODUCTION ───────────────────────────────────────────────
 * 1. "Up to 6 Weeks Free" rendered as "6 Weeks Free". The badge dropped the ceiling, turning an
 *    offer the property qualified into a guarantee it never made. A renter was told something
 *    the property did not say.
 * 2. A special saved through the owner editor showed NO badge at all. Both freshness gates read
 *    the RECORD-level property_catalog.verified_at, which the editor never sets — it stamps
 *    current_special_checked_at. On The Links on PGA Parkway and Waterford Market (verified_at
 *    null, special checked today) the badge was suppressed entirely.
 *
 * The second fix is a COALESCE, not a replacement: four master-import rows carry verified_at and
 * no current_special_checked_at, and an outright switch would have hidden their working badges.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { normalizeShortSpecial, isSpecialCurrent } from "@bc/companion-shared"

let pass = 0
let fail = 0
const ok = (label: string, cond: boolean, detail = "") => {
  if (cond) { pass++; console.log(`  ✓ ${label}`) } else { fail++; console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`) }
}
const eq = (label: string, a: unknown, b: unknown) =>
  ok(label, JSON.stringify(a) === JSON.stringify(b), `got ${JSON.stringify(a)}`)
const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1").replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
const read = (p: string) => strip(readFileSync(join(process.cwd(), p), "utf8"))

console.log("\n=== 1. THE FIVE SPECIFIED CASES ===")
eq('"6 Weeks Free"', normalizeShortSpecial("6 Weeks Free"), "6 Weeks Free")
eq('"Up to 6 Weeks Free"', normalizeShortSpecial("Up to 6 Weeks Free"), "Up to 6 Weeks Free")
eq('"Up to 10 Weeks Free"', normalizeShortSpecial("Up to 10 Weeks Free"), "Up to 10 Weeks Free")
eq('"1 Month Free"', normalizeShortSpecial("1 Month Free"), "1 Month Free")
eq("no special → no badge", normalizeShortSpecial(""), null)
eq("null → no badge", normalizeShortSpecial(null), null)
eq('"None" → no badge', normalizeShortSpecial("None"), null)

console.log("\n=== 2. THE QUALIFIER IS PRESERVED, in every spelling ===")
for (const s of ["Up to 6 Weeks Free", "Up To 6 Weeks Free", "up to 6 weeks free", "UP TO 6 WEEKS FREE"]) {
  eq(JSON.stringify(s), normalizeShortSpecial(s), "Up to 6 Weeks Free")
}
eq('"as much as" also qualifies', normalizeShortSpecial("As much as 8 weeks free"), "Up to 8 Weeks Free")
eq("dollars off", normalizeShortSpecial("Up to $1,000 Off"), "Up to $1,000 Off")
eq("gift card", normalizeShortSpecial("Up to $500 Gift Card"), "Up to $500 Gift Card")
eq("credit", normalizeShortSpecial("Up to $1,500 Credit"), "Up to $1,500 Credit")

console.log("\n=== 3. AN UNQUALIFIED OFFER IS NOT MISLABELLED ===")
eq("plain weeks", normalizeShortSpecial("6 Weeks Free"), "6 Weeks Free")
eq("plain months", normalizeShortSpecial("2 Months Free"), "2 Months Free")
eq("plain dollars", normalizeShortSpecial("$1,000 Off"), "$1,000 Off")
// "on select units" narrows WHO qualifies, not HOW MUCH — not a ceiling, so not prefixed.
eq("a condition is not a ceiling", normalizeShortSpecial("6 weeks free on select units"), "6 Weeks Free")

console.log("\n=== 4. LONG MASTER TEXT — the ceiling must not leak across clauses ===")
{
  // Every one of these is a REAL production value. The badge quotes the GUARANTEED clause; the
  // "up to" belongs to a different, secondary offer and must not attach to it.
  const live: [string, string][] = [
    ["100% off rent for 2 month(s) on a 12 mo lease Other Concessions: Receive up to 2 Months Free $1500 credit when you t…", "2 Months Free"],
    ["100% off rent for 1 month(s) on a 12 mo lease Look & Lease: PLUS UP TO an additional TWO WEEKS of FREE RENT When You LO…", "1 Month Free"],
    ["100% off rent for 2 month(s) on a 12 mo lease Other Concessions: 8 WEEKS FREE.", "2 Months Free"],
    ["Look & Lease: Look & Lease to Receive a $200 Gift Card ends 12/8/2026 Gift Card: Look & Lease to Receive a $200 Gift Ca…", "$200 Gift Card"],
  ]
  for (const [raw, expected] of live) eq(`${raw.slice(0, 44)}…`, normalizeShortSpecial(raw), expected)

  // …but when the ceiling DOES qualify the quoted clause, it is kept.
  eq("ceiling adjacent to the clause IS kept",
    normalizeShortSpecial("Other Concessions: Receive up to 2 Months Free"), "Up to 2 Months Free")
}

console.log("\n=== 5. FRESHNESS — the gate, and the 45-day policy ===")
{
  const days = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString()
  ok("today is current", isSpecialCurrent(days(0)))
  ok("44 days is current", isSpecialCurrent(days(44)))
  ok("46 days is NOT current", !isSpecialCurrent(days(46)))
  ok("null is NOT current", !isSpecialCurrent(null))
  ok("undefined is NOT current", !isSpecialCurrent(undefined))
  ok("unparseable is NOT current", !isSpecialCurrent("not a date"))
  ok("the 45-day policy is unchanged", isSpecialCurrent(days(44)) && !isSpecialCurrent(days(46)))
}

console.log("\n=== 6. THE GATE READS THE SPECIAL'S OWN DATE, falling back to the record's ===")
{
  const bm = read("components/crm/BestMatches.tsx")
  const lf = read("components/crm/LeadFavorites.tsx")
  ok("Recommended Properties coalesces",
    /isSpecialCurrent\(r\.current_special_checked_at \?\? r\.verified_at\)/.test(bm))
  ok("Favorites coalesces",
    /isSpecialCurrent\(fav\.current_special_checked_at \?\? fav\.verified_at\)/.test(lf))
  ok("neither reads verified_at alone", !/isSpecialCurrent\((r|fav)\.verified_at\)/.test(bm + lf))

  // The three production shapes, simulated through the real gate.
  const today = new Date().toISOString()
  const old = new Date(Date.now() - 60 * 86_400_000).toISOString()
  const gate = (specialChecked: string | null, verified: string | null) =>
    isSpecialCurrent(specialChecked ?? verified)
  ok("owner-saved special, verified_at null → SHOWS (the reported bug)", gate(today, null))
  ok("master-import row, no special date → still SHOWS via fallback", gate(null, today))
  ok("both absent → hidden", !gate(null, null))
  ok("both stale → hidden", !gate(old, old))
  ok("stale special date beats a fresh record date", !gate(old, today))
}

console.log("\n=== 7. THE READ PATH CARRIES THE NEW FIELD ===")
{
  const cat = read("lib/propertyExplorer/catalog.ts")
  ok("CatalogRecord declares it", /currentSpecialCheckedAt: string \| null/.test(cat))
  ok("fetchCatalog maps it", /currentSpecialCheckedAt: s\(r\.current_special_checked_at\)/.test(cat))
  ok("attachCatalogRatings attaches it", /current_special_checked_at: rec\?\.currentSpecialCheckedAt \?\? null/.test(cat))
  const mig = read("supabase/migrations/20261028000000_special_freshness_source.sql")
  ok("the RPC returns it", /current_special_checked_at timestamptz/.test(mig))
  ok("the client resolver coalesces too",
    /coalesce\(pc\.current_special_checked_at, pc\.verified_at\)/.test(mig))
  ok("nothing writes verified_at in the migration", !/set\s+verified_at|update .*verified_at/i.test(mig))
}

console.log("\n=== 8. CLEARING A SPECIAL REMOVES THE BADGE ===")
{
  eq("cleared to empty", normalizeShortSpecial(""), null)
  eq('"n/a"', normalizeShortSpecial("n/a"), null)
  eq('"--"', normalizeShortSpecial("--"), null)
  eq("unrecognised text", normalizeShortSpecial("Ask the leasing office"), null)
}

console.log(fail === 0 ? `\nALL PASS ✅ (${pass} passed, ${fail} failed)\n` : `\n${pass} passed, ${fail} failed\n`)
process.exit(fail === 0 ? 0 : 1)
