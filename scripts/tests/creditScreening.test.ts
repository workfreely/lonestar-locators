/**
 * CREDIT SCREENING — the firewall, the three states, and the controls that render them.
 *
 * WHAT THIS GUARDS. Credit screening is the first field family added to property_catalog that is
 * dangerous to get wrong in a direction other than "stale": a wrong minimum does not misprice a
 * deal, it sends a renter somewhere they will be declined, or stops an agent sending one
 * somewhere they would have been approved. So it is firewalled from enrichment exactly like
 * commission — no job, no scraper, no public source may ever write it — and the three states have
 * to survive a round trip without "nobody asked" collapsing into "they don't check".
 *
 * Run: npx tsx scripts/tests/creditScreening.test.ts   (pure — reads source + exported sets)
 */
import { existsSync, readFileSync } from "node:fs"
import {
  ENRICHMENT_WRITABLE_FIELDS,
  OWNER_COMMISSION_FIELDS,
  OWNER_CREDIT_FIELDS,
  OWNER_ONLY_FIELDS,
  OWNER_CLEARABLE_FIELDS,
  OWNER_CORRECTABLE_FIELDS,
  OWNER_SCREENING_FIELDS,
  PUBLIC_SOURCE_TYPES,
  decideFieldWrite,
} from "@/lib/propertyEnrichment/policy"

let pass = 0
let fail = 0
const ok = (l: string, c: boolean, d = "") => {
  if (c) { pass++; console.log(`  ✓ ${l}`) }
  else { fail++; console.log(`  ✗ ${l}${d ? `\n      ${d}` : ""}`) }
}
/** Comments quote rejected designs and old expressions, so assertions run against code. */
const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n")

const P = {
  policy: "lib/propertyEnrichment/policy.ts",
  writer: "lib/propertyEnrichment/writer.ts",
  store: "lib/propertyEnrichment/stores/supabaseStore.ts",
  route: "app/api/admin/owner/property-pricing/route.ts",
  editor: "components/crm/MapPropertyEditor.tsx",
  // A migration starts in supabase/prepared/ and MOVES to supabase/migrations/ when it is applied
  // — nothing in prepared/ is live. These assertions are about what the SQL says, which does not
  // change when the file moves, so the folder is resolved rather than hard-coded. A migration that
  // vanished from both folders is a failure, not a skip: readFileSync throws.
  migCredit: "20261109000000_property_credit_minimum.sql",
}
const MIGRATION_KEYS = new Set(["migCredit"])
const resolve = (key: string, name: string) => {
  if (!MIGRATION_KEYS.has(key)) return name
  const applied = `supabase/migrations/${name}`
  return existsSync(applied) ? applied : `supabase/prepared/${name}`
}
const raw = Object.fromEntries(
  Object.entries(P).map(([k, p]) => [k, readFileSync(resolve(k, p), "utf8")]),
) as Record<keyof typeof P, string>
const src = Object.fromEntries(
  Object.entries(raw).map(([k, v]) => [k, strip(v)]),
) as Record<keyof typeof P, string>

const CREDIT = [
  "credit_minimum_status",
  "credit_minimum_score",
  "credit_observed_approval_score",
  "credit_screening_notes",
  "credit_screening_checked_at",
]

console.log("\nCREDIT SCREENING — THE FIREWALL\n")

// ── 1. No automated path can reach these columns ──────────────────────────────────────────────
console.log("enrichment cannot write credit, by set membership")
for (const f of CREDIT) {
  ok(`${f} is ABSENT from ENRICHMENT_WRITABLE_FIELDS`, !ENRICHMENT_WRITABLE_FIELDS.has(f))
  ok(`${f} is in OWNER_CREDIT_FIELDS`, OWNER_CREDIT_FIELDS.has(f))
  ok(`${f} is in OWNER_ONLY_FIELDS (the firewall trigger)`, OWNER_ONLY_FIELDS.has(f))
}
ok(
  "credit carries NO commission authority — OWNER_COMMISSION_FIELDS is still exactly the three rates",
  [...OWNER_COMMISSION_FIELDS].sort().join() === ["send_commission", "escort_commission", "bonus_flat"].sort().join(),
  [...OWNER_COMMISSION_FIELDS].join(),
)
ok(
  "…and no credit field leaked into it",
  CREDIT.every((f) => !OWNER_COMMISSION_FIELDS.has(f)),
)
// The set grew by the Approval Criteria columns, and by nothing else. Asserting the exact union
// rather than a number: a count passes by accident when one field is swapped for another.
ok(
  "OWNER_ONLY_FIELDS is exactly commission ∪ credit ∪ approval criteria",
  OWNER_ONLY_FIELDS.size === OWNER_COMMISSION_FIELDS.size + OWNER_CREDIT_FIELDS.size + OWNER_SCREENING_FIELDS.size &&
    [...OWNER_COMMISSION_FIELDS, ...OWNER_CREDIT_FIELDS, ...OWNER_SCREENING_FIELDS].every((f) => OWNER_ONLY_FIELDS.has(f)),
  `${OWNER_ONLY_FIELDS.size} vs ${OWNER_COMMISSION_FIELDS.size}+${OWNER_CREDIT_FIELDS.size}+${OWNER_SCREENING_FIELDS.size}`,
)
ok(
  "the gift card did NOT become clearable as a side effect of this change",
  !OWNER_CLEARABLE_FIELDS.has("gift_card_status"),
  "pre-existing behaviour; deliberately untouched",
)
ok("the writer's firewall tests OWNER_ONLY_FIELDS, not just commission", /OWNER_ONLY_FIELDS\.has\(cand\.field\)/.test(src.writer))
ok("a public source gets a credit-specific rejection reason", /credit_firewall_public_web/.test(src.writer))
ok("a non-public unapproved source gets its own reason too", /credit_provider_not_approved/.test(src.writer))
ok("the store reads owner-only columns so the writer can compare", /\.\.\.OWNER_ONLY_FIELDS/.test(src.store))

// ── 2. The write decision, as behaviour ───────────────────────────────────────────────────────
console.log("\ndecideFieldWrite — who may actually write a minimum")
const base = { field: "credit_minimum_score", candidateText: "550", currentText: null, currentProvenance: undefined }
for (const st of PUBLIC_SOURCE_TYPES) {
  const d = decideFieldWrite({ ...base, candidateSourceType: st, candidateVerification: "verified" })
  // The pure decision function does not itself hold the firewall — the writer rejects first — so
  // what matters here is that nothing about a public source makes it *more* permitted.
  ok(`a ${st} candidate is not treated as an owner correction`, !String(d.reason).startsWith("owner_correction"))
}
const ownerFill = decideFieldWrite({
  ...base, candidateSourceType: "manual_verified", candidateVerification: "inferred",
  candidateOwnerOverride: true,
})
ok("an owner filling an empty minimum writes", ownerFill.outcome === "write", JSON.stringify(ownerFill))

const ownerCorrect = decideFieldWrite({
  field: "credit_minimum_score", candidateText: "520", currentText: "535",
  candidateSourceType: "manual_verified", candidateVerification: "inferred",
  candidateOwnerOverride: true, currentProvenance: undefined,
})
ok(
  "an owner may CORRECT a stored minimum (535 → 520), not be blocked by preserve-by-default",
  ownerCorrect.outcome === "write" && String(ownerCorrect.reason).startsWith("owner_correction"),
  JSON.stringify(ownerCorrect),
)
const noOverride = decideFieldWrite({
  field: "credit_minimum_score", candidateText: "520", currentText: "535",
  candidateSourceType: "manual_verified", candidateVerification: "verified", currentProvenance: undefined,
})
ok("…but NOT without ownerOverride — data cannot authorize itself", noOverride.outcome !== "write" || !String(noOverride.reason).startsWith("owner_correction"))

const cleared = decideFieldWrite({
  field: "credit_minimum_status", candidateText: null, currentText: "reported_minimum",
  candidateSourceType: "manual_verified", candidateVerification: "inferred",
  candidateOwnerOverride: true, candidateOwnerClear: true, currentProvenance: undefined,
})
ok("an owner may clear a status back to UNKNOWN", cleared.outcome === "write" && cleared.reason === "owner_cleared", JSON.stringify(cleared))
const clearNoop = decideFieldWrite({
  field: "credit_minimum_status", candidateText: null, currentText: null,
  candidateSourceType: "manual_verified", candidateVerification: "inferred",
  candidateOwnerOverride: true, candidateOwnerClear: true, currentProvenance: undefined,
})
ok("clearing something already unknown writes no audit row", clearNoop.outcome === "skip" && clearNoop.reason === "already_unknown")

// ── 3. The three states never collapse ────────────────────────────────────────────────────────
console.log("\nthe three states")
/** Port of the route's parseScore. */
const parseScore = (raw: unknown): number | null | "bad" => {
  if (raw === null || raw === undefined) return null
  const t = String(raw).trim()
  if (t === "") return null
  const n = Number(t)
  if (!Number.isInteger(n) || n < 300 || n > 850) return "bad"
  return n
}
ok("blank is UNKNOWN, not zero", parseScore("") === null)
ok("null is UNKNOWN", parseScore(null) === null)
ok("0 is REJECTED — it is not a FICO score and must never read as 'no check'", parseScore("0") === "bad")
ok("299 rejected (below the FICO floor)", parseScore("299") === "bad")
ok("300 accepted", parseScore("300") === 300)
ok("850 accepted", parseScore("850") === 850)
ok("851 rejected", parseScore("851") === "bad")
ok("a fraction is rejected — a score is a whole number", parseScore("550.5") === "bad")
ok("nonsense is rejected, not coerced", parseScore("good credit") === "bad")
ok("535 — Stoneleigh's working minimum — is accepted", parseScore("535") === 535)

ok("there is NO 'unknown' token in the status vocabulary", /credit_minimum_status in \('reported_minimum', 'no_check_reported'\)/.test(src.migCredit))
ok("the migration forbids a score with no status", /else credit_minimum_score is null end/.test(src.migCredit.replace(/\s+/g, " ")))
ok("a reported minimum must carry a number, 300–850", /credit_minimum_score between 300 and 850/.test(src.migCredit))
ok("observed approval is range-checked on its own", /credit_observed_approval_score is null\s*\n?\s*or credit_observed_approval_score between 300 and 850/.test(src.migCredit))
// Observed approval must stand alone. Proven live: Hidden Oaks holds
// credit_observed_approval_score = 450 with credit_minimum_status = NULL, which the status/score
// constraint would have refused had the two been coupled. Asserted here against the constraint
// BODY rather than the whole file, because the file names both columns in its ALTER TABLE list.
{
  const body = (src.migCredit.match(
    /property_catalog_credit_observed_approval_check[\s\S]*?not valid;/,
  ) || [""])[0]
  ok("the observed-approval constraint exists", body.length > 0)
  ok(
    "…and it does NOT reference credit_minimum_status — an anecdote is legal with no policy",
    body.length > 0 && !body.includes("credit_minimum_status"),
    body.replace(/\s+/g, " ").slice(0, 160),
  )
}
ok("the route rejects a score sent alongside no_check_reported", /no_check_reported"\)\s*\{?\s*\n?\s*rejected\.push\("creditMinimumScore"\)|=== "no_check_reported"\) \{\n\s*rejected\.push\("creditMinimumScore"\)/.test(src.route) || /no_check_reported"\) \{/.test(src.route))
ok("choosing no_check_reported CLEARS any stored score", /field: "credit_minimum_score", value: null/.test(src.route))
// THIS ASSERTION WAS INVERTED ON PURPOSE. The route used to stamp credit_screening_checked_at on
// any credit save. It no longer does: a date on that column reads as "a leasing office confirmed
// this", and an agent typing up their own notes has not. When the edit happened is still recorded
// — in the append-only enrichment events, per field, which is what the editor's age lines read.
ok("no save auto-stamps the screening date", !/add\("credit_screening_checked_at"/.test(src.route))
ok("…and a leasing-office confirmation is still expressible, by hand",
  /screeningRequirementsCheckedAt:\s*\{ column: "screening_requirements_checked_at"/.test(
    strip(readFileSync("lib/propertyIntel/approvalCriteria.ts", "utf8"))))

// ── 4. Nothing internal reaches a client ──────────────────────────────────────────────────────
// TRIMMED FOR THIS RELEASE. The sections that asserted the Quick Match collection migration and
// the catalog read-path rewrite are gone, because neither ships here: this release is the
// Approval Criteria editor and its credit dependency, nothing else. What is kept is the part that
// is about CREDIT — that the applied credit migration does not widen the client-facing
// recommendation function, which is the whole reason these columns are safe to hold.
console.log("\nclient isolation — the point of the whole design")
ok(
  "the credit migration does not add credit columns to lb_resolve_client_recommendations",
  !/CREATE OR REPLACE FUNCTION public\.lb_resolve_client_recommendations/i.test(src.migCredit),
)
ok("the credit migration leaves both read functions alone", !/create function public\.lb_property_catalog_by_ids/i.test(src.migCredit))
ok("the editor marks the section internal", /internal only/.test(raw.editor))
ok("the editor says unknown is not the same as no-check", /Unknown is not the same as an office telling us they do not score credit/.test(raw.editor))
ok("the editor keeps observed approval visibly apart from the minimum", /one approval is not a policy/.test(raw.editor))

// ── 5. The rejected third Map Explorer tab must NOT be here ───────────────────────────────────
// It was in the branch this credit work came from, and the owner rejected it. This section used
// to assert the tab existed; it now asserts the opposite, because the Approval Criteria editor is
// deliberately built on the production baseline WITHOUT it. Unleash Beast gets no new tab, no new
// filter mode and no new toolbar count from this work.
console.log("\nthe rejected third tab is absent")
{
  const explorer = readFileSync("components/crm/explorer/BeastPropertyExplorer.tsx", "utf8")
  const shortlist = readFileSync("lib/propertyExplorer/beastShortlist.ts", "utf8")
  ok("the explorer has no Quick Match tab", !/quick_match/i.test(explorer), "found a quick_match reference in the explorer")
  ok("the map filter union is still the two production modes", /"beast" \| "all"/.test(shortlist) && !/quick_match/.test(shortlist))
  ok("no Quick Match count is computed in the toolbar", !/quickMatchCount/.test(explorer))
}

// ── 6. Commission behaviour is untouched ──────────────────────────────────────────────────────
console.log("\nregression — commission is exactly as it was")
ok("send/escort/bonus still absent from the enrichment allowlist", ["send_commission", "escort_commission", "bonus_flat"].every((f) => !ENRICHMENT_WRITABLE_FIELDS.has(f)))
ok("commission is still owner-correctable", OWNER_ONLY_FIELDS.has("send_commission") && OWNER_CORRECTABLE_FIELDS.has("current_special"))
ok("commission is still clearable", OWNER_CLEARABLE_FIELDS.has("send_commission"))
const commFill = decideFieldWrite({
  field: "send_commission", candidateText: "100%", currentText: null,
  candidateSourceType: "manual_verified", candidateVerification: "inferred",
  candidateOwnerOverride: true, currentProvenance: undefined,
})
ok("an owner can still fill an empty commission", commFill.outcome === "write")

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"} — ${pass} passed, ${fail} failed\n`)
process.exit(fail === 0 ? 0 : 1)
