// THE QUICK MATCH DROPDOWN — five criteria, read from Approval Criteria.
//
// Run: npx tsx scripts/tests/quickMatchCriteriaRows.test.ts   (pure — reads source, no network)
//
// The dropdown used to carry the engine's prose about THIS CLIENT (possible conflicts, open
// questions, approval costs). It now carries five facts about the PROPERTY, and the distinction
// is the point of these assertions: the rows come from the property's own recorded columns, not
// from the screening verdict stored on the recommendation row, and an unrecorded column prints
// Unknown rather than disappearing.
//
// It lives under scripts/tests rather than scripts/leads because it names felony_policy and
// misdemeanor_policy: criminalBackground.test.ts sweeps the tree for modules outside the seven
// that own those fields, and scripts/tests is its skip list. Being inside that list is a
// statement that this file is a test of the vocabulary, not a second consumer of it.
import { readFileSync } from "node:fs"
import { screeningCriteriaRows } from "@/lib/propertyIntel/approvalCriteria"

const read = (p: string) => readFileSync(p, "utf8")
let pass = 0, fail = 0
const ok = (what: string, cond: boolean, detail = "") => {
  if (cond) { pass++; console.log(`  ok   ${what}`) }
  else { fail++; console.log(`  FAIL ${what}${detail ? `  — ${detail}` : ""}`) }
}

console.log("\nQUICK MATCH DROPDOWN — five criteria\n")

// ── THE FIVE, IN ORDER ─────────────────────────────────────────────────────────────────────
const nothingRecorded = {
  creditMinimumScore: null, brokenLeaseStatus: null, evictionStatus: null,
  misdemeanorPolicy: null, felonyPolicy: null,
}
const rows = screeningCriteriaRows(nothingRecorded)
ok("exactly five rows", rows.length === 5, String(rows.length))
ok("…in the order asked for",
  rows.map((r) => r.label).join(" | ")
    === "Minimum Credit Score | Broken Lease Policy | Eviction Policy | Misdemeanor | Felony",
  rows.map((r) => r.label).join(" | "))
ok("an unrecorded column prints Unknown, never a blank",
  rows.every((r) => r.value === "Unknown" && r.recorded === false))

// ── ABACUS ALAMO RANCH, THE REAL RECORDED ROW ──────────────────────────────────────────────
// property_catalog, place ChIJq42a1ZhDXIYRtrTF7gbdX7c: credit_minimum_score 520 and nothing
// else recorded. This is the example the correction was asked to be verified against.
const abacus = screeningCriteriaRows({
  creditMinimumScore: 520, brokenLeaseStatus: null, evictionStatus: null,
  misdemeanorPolicy: null, felonyPolicy: null,
})
ok("Abacus shows its recorded credit minimum", abacus[0].value === "520" && abacus[0].recorded)
ok("…and Unknown for the four nobody has asked about",
  abacus.slice(1).every((r) => r.value === "Unknown" && !r.recorded))

// ── THE VOCABULARY IS THE EDITOR'S, NOT A SECOND COPY ──────────────────────────────────────
const filled = screeningCriteriaRows({
  creditMinimumScore: 600, brokenLeaseStatus: "accepted_if_paid", evictionStatus: "accepted_if_paid",
  misdemeanorPolicy: "case_by_case", felonyPolicy: "not_considered",
})
ok("broken lease uses its own wording", filled[1].value === "Accepted if paid off")
ok("…and eviction uses ITS own, which differs on the same token",
  filled[2].value === "Conditional — accepted if balances are paid")
ok("misdemeanor and felony read from the criminal vocabulary",
  filled[3].value === "Case-by-Case" && filled[4].value === "Not Considered")
ok("every filled row is marked recorded", filled.every((r) => r.recorded))

// A token the editor does not know is not a policy. It reads as Unknown rather than being
// echoed onto the card, because an unrecognised value is exactly where a guess does damage.
const junk = screeningCriteriaRows({
  creditMinimumScore: null, brokenLeaseStatus: "probably_fine", evictionStatus: null,
  misdemeanorPolicy: "¯\\_(ツ)_/¯", felonyPolicy: null,
})
ok("an unknown token is not echoed onto the card",
  junk[1].value === "Unknown" && junk[3].value === "Unknown")

// ── WHERE IT COMES FROM, AND WHERE IT DOES NOT ─────────────────────────────────────────────
const badge = read("components/crm/QuickMatchBadge.tsx")
const card = read("components/crm/BestMatches.tsx")
const dash = read("components/crm/DashboardClient.tsx")

ok("the panel renders the five rows and nothing else from the screening payload",
  /criteria!\.map\(\(c\) =>/.test(badge) && !/conflicts|unverified|conditions|geography/.test(
    badge.slice(badge.indexOf("export function QuickMatchDetail"))))
ok("the rows are derived from the PROPERTY's columns, not the row's stored verdict",
  /screeningCriteriaRows\(qmProperty\)/.test(card)
    && !/screeningCriteriaRows\(\s*screening/.test(card))
ok("no property outside the loaded collection gets invented criteria",
  /const criteria = qmProperty \? screeningCriteriaRows\(qmProperty\) : null/.test(card))
ok("…and with none, the chip offers no disclosure at all",
  /export function quickMatchHasDetail\(criteria[\s\S]{0,180}?return !!criteria && criteria\.length > 0/.test(badge))

ok("the criteria are loaded through the engine's OWN read path, not a new query",
  /loadQuickMatchCollection\(supabase\)/.test(dash)
    && !/from\("property_catalog"\)/.test(dash))
ok("…once for the workspace, not once per client",
  /setQuickMatchCriteriaByKey\(new Map\(properties\.map/.test(dash)
    && /\}, \[\]\)/.test(dash.slice(dash.indexOf("loadQuickMatchCollection"))))
ok("…keyed the way the card looks them up", /`pid:\$\{p\.placeId\}`/.test(dash))

// ── WHAT MUST NOT HAVE MOVED ───────────────────────────────────────────────────────────────
// The derivation is pure: no client, no table, no write. (The file's older validator calls
// Set.delete on a token, which is why this looks at the added function rather than the file.)
const derivation = read("lib/propertyIntel/approvalCriteria.ts")
  .slice(read("lib/propertyIntel/approvalCriteria.ts").indexOf("export function screeningCriteriaRows"))
ok("the derivation touches no database at all",
  !/supabase|\.from\(|\.rpc\(|insert|update|upsert|delete/i.test(derivation))
ok("the chip's own label, colour and placement are untouched",
  badge.includes('cls: "border-[#2b4a7a] bg-[#0f1d2e] text-[#7cb2f5]"')
    && badge.includes('label: "Quick Match"')
    && /<QuickMatchChip\s+className="flex-none"/.test(card))
ok("the three Why-I-chose-this highlights know nothing about any of this",
  !/screeningCriteriaRows|quickMatchCriteria/.test(read("lib/leads/bedroomPricing.ts")))
ok("the client-facing page is untouched",
  !/screeningCriteriaRows|quickMatchCriteria|QuickMatch/.test(
    read("app/locator-beast/r/[token]/RecommendationList.tsx")))

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"} — ${pass} passed, ${fail} failed\n`)
process.exit(fail > 0 ? 1 : 0)
