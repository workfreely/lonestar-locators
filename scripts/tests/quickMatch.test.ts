// QUICK MATCH — the engine, proved from fixtures.
//
// Run: npx tsx scripts/tests/quickMatch.test.ts   (pure — no database, no network, no model)
//
// Every rule that could send a renter somewhere they will be declined is tested here, because
// that is the failure this feature has to avoid. In particular:
//   • 590 triggers and 591 does not — the boundary, inclusive, in both directions;
//   • an age bucket that STRADDLES a requirement is "unknown", never a guess;
//   • "paid off" can never be inferred from an amount bucket, because no bucket means zero;
//   • free text can raise a question but can never accept or reject;
//   • an UNKNOWN criminal policy is never an approval, and a charge is not a conviction;
//   • a lookback can prove a PASS only from an offense date and a FAIL only from a conviction
//     date — the asymmetry is proved here, nine combinations, not asserted in a comment;
//   • a property outside the curated collection cannot be recommended by any path;
//   • a property outside every area the client named is not recommended at all — geography is a
//     GATE, and the nine bands and exclusions are proved here rather than described;
//   • a curated property with NO policy on record is not recommended on curation alone; when the
//     client's own area puts it in front of them it is shown as Needs Verification, says so, and
//     can never outrank a property whose policies are recorded;
//   • six is a ceiling and nothing pads the list up to it.
import {
  runQuickMatch, evaluateEligibility, assessProperty, readScreeningFacts,
  rankRecommendations, rankRecommendationsDetailed, MAX_RECOMMENDATIONS, CREDIT_CEILING,
  offenseTypeFromCharge, criminalPolicyVerdict, lookbackVerdict, restrictedOffenseVerdict,
  assessGeography, resolveClientGeography, geographySummary, zipAnchor,
  resolveAreaAnchors, commuteHintZip,
  GEO_BAND_MILES, DISPLAY_TIERS, ASSESSED_TIERS,
  type QuickMatchProperty, type ClientNeeds, type ClientGeography,
} from "@/lib/quickMatch"
import { ageMeetsMinimum, balanceWithinCap, balanceIsPaidOff } from "@/lib/quickMatch/buckets"
import { resolveClientNeeds, fiveDigitZip } from "@/lib/quickMatch/needs"
import { toRecommendationRow, QUICK_MATCH_ORIGIN } from "@/lib/quickMatch/persist"
import { readScreening } from "@/components/crm/QuickMatchBadge"
import { CRIMINAL_CHARGE_OPTIONS } from "@/lib/formOptions"
// Imported HERE, in the test, to cross-check Quick Match's own resolution against the Unleash
// function this release leaves untouched, and against the catalogue they both read.
import { resolveDesiredAreaCenters } from "@/lib/propertyExplorer/multiArea"
import { centerForDesiredArea } from "@/lib/markets/catalog"
import { OFFENSE_TYPE_OPTIONS } from "@/lib/propertyIntel/approvalCriteria"
import { readFileSync, existsSync } from "node:fs"
import { execSync } from "node:child_process"

let pass = 0, fail = 0
const ok = (l: string, c: boolean, d = "") => { if (c) { pass++; console.log(`  ✓ ${l}`) } else { fail++; console.log(`  ✗ ${l}${d ? `\n      ${d}` : ""}`) } }

// ── fixtures ────────────────────────────────────────────────────────────────────────────────
const prop = (over: Partial<QuickMatchProperty> = {}): QuickMatchProperty => ({
  placeId: "p1", propertyName: "Fixture", address: "1 Main St", zip: "78232",
  websiteUrl: null, imageUrl: null, googleRating: null, currentSpecial: null,
  quickMatchCollection: "san_antonio",
  creditMinimumStatus: null, creditMinimumScore: null, creditObservedApprovalScore: null, creditScreeningNotes: null,
  brokenLeaseStatus: null, brokenLeaseMinAgeYears: null, brokenLeaseBalanceRequirement: null,
  brokenLeaseMaxBalance: null, brokenLeasePositiveHistoryRequired: null,
  evictionStatus: null, evictionMinAgeYears: null, evictionBalanceRequirement: null,
  evictionPositiveHistoryRequired: null,
  rentalDebtStatus: null, rentalDebtBalanceRequirement: null, rentalDebtMaxBalance: null,
  felonyPolicy: null, felonyMinAgeYears: null, felonyRestrictions: null,
  misdemeanorPolicy: null, misdemeanorMinAgeYears: null, misdemeanorRestrictions: null,
  criminalRestrictedOffenseTypes: null, criminalLookbackBasis: null, backgroundScreeningNotes: null,
  screeningAdditionalDeposit: null, screeningRiskFee: null, screeningGuarantorProgram: null,
  screeningRequirementsCheckedAt: "2026-11-02",
  bedsMin: 1, bedsMax: 3, onebrStartingRent: null, twobrStartingRent: null, threebrStartingRent: null,
  rentMin: 900, latitude: 29.59, longitude: -98.45, ...over,
})
const needs = (over: Partial<ClientNeeds> = {}): ClientNeeds => ({
  bedrooms: null, budgetMax: null, preferredZips: [], destinationZip: null,
  commuteLimitMinutes: null, commuteDestinationLabel: null, ...over,
})

/**
 * A resolved geographic requirement. `applicable` is DERIVED unless overridden, exactly as
 * resolveClientGeography derives it, so a fixture cannot claim a requirement it has no anchor
 * for — which is the mistake these tests exist to catch.
 */
const geo = (over: Partial<ClientGeography> = {}): ClientGeography => {
  const base = { destinationZip: null, anchors: [], unresolvedAreas: [], marketSlug: "san-antonio" }
  const merged = { ...base, ...over }
  return { ...merged, applicable: over.applicable ?? (merged.anchors.length > 0 || merged.destinationZip !== null) }
}

// One anchor, and properties placed due north of it so the distance is an exact meridian arc:
// 1 mile of latitude is 1609.344 / 6_371_000 radians, so these offsets are arithmetic, not
// approximations of a city map.
const ANCHOR = { label: "Stone Oak", lat: 29.6, lng: -98.5 }
const northOf = (mi: number) => ANCHOR.lat + (mi * 1609.344 / 6_371_000) * (180 / Math.PI)
const atMiles = (mi: number, over: Partial<QuickMatchProperty> = {}) =>
  prop({ latitude: northOf(mi), longitude: ANCHOR.lng, ...over })
const stoneOak = geo({ anchors: [ANCHOR] })

console.log("\n═══ ELIGIBILITY — 590 versus 591")
ok("590 triggers Quick Match (inclusive)", evaluateEligibility({ credit_score: 590 }).eligible)
ok("591 does NOT trigger it", !evaluateEligibility({ credit_score: 591 }).eligible)
ok("589 triggers it", evaluateEligibility({ credit_score: 589 }).eligible)
ok("the ceiling constant is 590", CREDIT_CEILING === 590)
ok("a 590 client's reason names the score", evaluateEligibility({ credit_score: 590 }).reasons[0].includes("590"))
ok("a string '590' from the DB still triggers", evaluateEligibility({ credit_score: "590" }).eligible)

console.log("\n═══ ELIGIBILITY — rental history regardless of score")
ok("broken lease with 720 credit triggers", evaluateEligibility({ credit_score: 720, credit_history: "Broken Lease" }).eligible)
ok("eviction with 780 credit triggers", evaluateEligibility({ credit_score: 780, credit_history: "Eviction" }).eligible)
ok("a broken-lease AGE alone triggers", evaluateEligibility({ credit_score: 700, broken_lease_age: "3 years" }).eligible)
ok("outstanding apartment debt triggers", evaluateEligibility({ credit_score: 700, rental_debt_status: "owed" }).eligible)
ok("a payment plan is also an outstanding balance", evaluateEligibility({ rental_debt_status: "payment_plan" }).eligible)
ok('rental_debt_status "paid" is an ANSWER, not a problem', !evaluateEligibility({ rental_debt_status: "paid" }).eligible)
ok('…nor is "none"', !evaluateEligibility({ rental_debt_status: "none" }).eligible)
ok("several issues list several reasons",
  evaluateEligibility({ credit_score: 540, credit_history: "Broken Lease" }).reasons.length === 2)
// INDEPENDENCE, stated as the requirement states it: no credit score at all, still eligible.
ok("a broken lease with NO credit score on file triggers",
  evaluateEligibility({ credit_score: null, credit_history: "Broken Lease" }).eligible)
ok("an eviction with NO credit score on file triggers",
  evaluateEligibility({ credit_score: null, credit_history: "Eviction" }).eligible)
ok("apartment debt with NO credit score on file triggers",
  evaluateEligibility({ credit_score: null, rental_debt_status: "owed" }).eligible)
ok("…and none of those reasons mentions credit",
  ["Broken Lease", "Eviction"].every((h) =>
    evaluateEligibility({ credit_history: h }).reasons.every((r) => !/credit score/i.test(r))))

console.log("\n═══ ELIGIBILITY — criminal background")
ok("a felony on record triggers, whatever the score",
  evaluateEligibility({ credit_score: 780, criminal_background: "Felony" }).eligible)
ok("a misdemeanor on record triggers",
  evaluateEligibility({ credit_score: 780, criminal_background: "Misdemeanor" }).eligible)
ok("a felony AGE alone triggers", evaluateEligibility({ felony_age: "3 years" }).eligible)
ok("a misdemeanor AGE alone triggers", evaluateEligibility({ misdemeanor_age: "7+ years" }).eligible)
ok('"None" is a CLEAN answer and does not trigger',
  !evaluateEligibility({ credit_score: 700, criminal_background: "None" }).eligible)
ok('…and "None" is not overridden by a stray age value',
  !evaluateEligibility({ criminal_background: "None", felony_age: "3 years" }).eligible)
ok("the reason names the charge when one is recorded",
  evaluateEligibility({ criminal_background: "Felony", criminal_charge: "Assault" })
    .reasons.some((r) => r.includes("Assault")))
ok("the reason says it needs property-specific screening",
  evaluateEligibility({ criminal_background: "Felony" })
    .reasons.some((r) => r.includes("property-specific screening")))
ok("a felony with NO credit score on file triggers",
  evaluateEligibility({ credit_score: null, criminal_background: "Felony" }).eligible)
ok("a misdemeanor with NO credit score on file triggers",
  evaluateEligibility({ credit_score: null, criminal_background: "Misdemeanor" }).eligible)
ok("…and a 590 score needs no second qualifier of any kind",
  evaluateEligibility({ credit_score: 590, credit_history: "Clean", criminal_background: "None" }).eligible)
ok("a felony AND a misdemeanor are read independently, not as one answer", (() => {
  const f = readScreeningFacts({ criminal_background: "Felony", misdemeanor_age: "2 years" })
  return f.hasFelony && f.hasMisdemeanor
})())

console.log("\n═══ ELIGIBILITY — MISSING information is not a problem")
ok("an empty lead is NOT eligible", !evaluateEligibility({}).eligible)
ok("null credit score alone is NOT eligible", !evaluateEligibility({ credit_score: null }).eligible)
ok("a clean history is NOT eligible", !evaluateEligibility({ credit_score: 700, credit_history: "Clean" }).eligible)
ok('eviction_court "No" is NOT an eviction (the sentinel trap)',
  !evaluateEligibility({ credit_score: 700, credit_history: "Clean", eviction_court: "No" }).eligible)
ok('…nor is "None" or "N/A"',
  !evaluateEligibility({ eviction_court: "None" }).eligible && !evaluateEligibility({ eviction_court: "N/A" }).eligible)
ok("a real court name IS an eviction", evaluateEligibility({ eviction_court: "Bexar County JP 3" }).eligible)

console.log("\n═══ THE CHARGE → CATEGORY MAPPING IS A LOOKUP, NOT AN INTERPRETATION")
ok("every intake charge option maps to a property offense token",
  CRIMINAL_CHARGE_OPTIONS.every((label) => offenseTypeFromCharge(label) !== null),
  CRIMINAL_CHARGE_OPTIONS.filter((l) => offenseTypeFromCharge(l) === null).join(", "))
ok("the two option lists use the SAME labels, which is why the lookup works",
  CRIMINAL_CHARGE_OPTIONS.every((l) => OFFENSE_TYPE_OPTIONS.some((o) => o.label === l)))
ok('"Drug Related" → drug', offenseTypeFromCharge("Drug Related") === "drug")
ok('"Theft / Fraud" → theft_fraud', offenseTypeFromCharge("Theft / Fraud") === "theft_fraud")
ok('"Sex Offense" → sex_offense', offenseTypeFromCharge("Sex Offense") === "sex_offense")
ok("case does not matter", offenseTypeFromCharge("assault") === "assault")
ok("an unrecognised charge maps to NOTHING rather than a guess",
  offenseTypeFromCharge("Public intoxication") === null)
ok("a blank charge maps to nothing", offenseTypeFromCharge("") === null && offenseTypeFromCharge(null) === null)

console.log("\n═══ CRIMINAL POLICY — unknown is never approval")
ok("not_considered → fails", criminalPolicyVerdict("not_considered") === "fails")
ok("considered → meets (review, and the text says so, but it is a stated policy)",
  criminalPolicyVerdict("considered") === "meets")
ok("case_by_case → UNKNOWN, because it is undecidable in advance",
  criminalPolicyVerdict("case_by_case") === "unknown")
ok("null → UNKNOWN, never meets", criminalPolicyVerdict(null) === "unknown")

console.log("\n═══ THE LOOKBACK ASYMMETRY — all nine combinations")
// age_from_offense >= age_from_conviction, and the client's basis is unrecorded. So a PASS is
// safe only on an offense-date basis, and a FAIL only on a conviction-date basis.
ok("offense basis, bucket clears the bar → MEETS", lookbackVerdict("7+ years", 5, "offense_date") === "meets")
ok("offense basis, bucket exactly on the bar → MEETS", lookbackVerdict("5 years", 5, "offense_date") === "meets")
ok("offense basis, bucket entirely BELOW the bar → unknown, NOT a fail",
  lookbackVerdict("2 years", 5, "offense_date") === "unknown")
ok("offense basis, bucket straddles the bar → unknown", lookbackVerdict("3 years", 4, "offense_date") === "unknown")
ok("conviction basis, bucket entirely below the bar → FAILS",
  lookbackVerdict("2 years", 5, "conviction_date") === "fails")
ok("conviction basis, bucket clears the bar → unknown, NOT a pass",
  lookbackVerdict("7+ years", 5, "conviction_date") === "unknown")
ok("conviction basis, bucket straddles the bar → unknown",
  lookbackVerdict("3 years", 4, "conviction_date") === "unknown")
ok("NO stated basis → unknown even on a wide clear", lookbackVerdict("7+ years", 3, null) === "unknown")
ok("NO stated basis → unknown even on a clear miss", lookbackVerdict("Less than 1 year", 7, null) === "unknown")
ok("no requirement at all → unknown, never a pass", lookbackVerdict("7+ years", null, "offense_date") === "unknown")
ok("an unrecognised age bucket → unknown", lookbackVerdict("ages ago", 3, "offense_date") === "unknown")

console.log("\n═══ RESTRICTED OFFENSE CATEGORIES — empty means NOT RECORDED")
ok("the client's category is in the restricted set → fails",
  restrictedOffenseVerdict(["assault", "sex_offense"], "assault") === "fails")
ok("the client's category is NOT in the set → meets",
  restrictedOffenseVerdict(["assault", "sex_offense"], "drug") === "meets")
ok("the set is stated but the client's category is unknown → unknown",
  restrictedOffenseVerdict(["assault"], null) === "unknown")
ok("an EMPTY set is 'no restrictions recorded', NOT 'everything accepted'",
  restrictedOffenseVerdict([], "assault") === "unknown")
ok("…and null is the same", restrictedOffenseVerdict(null, "assault") === "unknown")

console.log("\n═══ AGE BUCKETS — the straddle is 'unknown', never a guess")
ok('"3 years" meets a 3-year requirement', ageMeetsMinimum("3 years", 3) === "meets")
ok('"2 years" FAILS a 3-year requirement', ageMeetsMinimum("2 years", 3) === "fails")
ok('"3 years" is UNKNOWN against a 4-year requirement (bucket spans 3–4)', ageMeetsMinimum("3 years", 4) === "unknown")
ok('"5 years" meets a 5-year requirement', ageMeetsMinimum("5 years", 5) === "meets")
ok('"3 years" FAILS a 5-year requirement', ageMeetsMinimum("3 years", 5) === "fails")
ok('"7+ years" meets a 7-year requirement', ageMeetsMinimum("7+ years", 7) === "meets")
ok('"5 years" is UNKNOWN against a 6-year requirement', ageMeetsMinimum("5 years", 6) === "unknown")
ok('"Less than 1 year" fails a 1-year requirement', ageMeetsMinimum("Less than 1 year", 1) === "fails")
ok("a missing age is unknown, not a fail", ageMeetsMinimum(null, 3) === "unknown")
ok("no requirement is unknown, not a pass", ageMeetsMinimum("7+ years", null) === "unknown")

console.log("\n═══ BALANCE — paid-off can NEVER come from an amount bucket")
ok('"Less than $500" does NOT mean paid off', balanceIsPaidOff(null) === "unknown")
ok("the explicit flag true means paid", balanceIsPaidOff(true) === "meets")
ok("the explicit flag false means unpaid", balanceIsPaidOff(false) === "fails")
ok('"$1,000-$2,000" is within a $2,000 cap', balanceWithinCap("$1,000-$2,000", 2000) === "meets")
ok('"$2,000-$5,000" EXCEEDS a $1,000 cap', balanceWithinCap("$2,000-$5,000", 1000) === "fails")
ok('"$1,000-$2,000" is UNKNOWN against a $1,500 cap', balanceWithinCap("$1,000-$2,000", 1500) === "unknown")
ok('"$5,000+" exceeds a $9,000 cap only as unknown', balanceWithinCap("$5,000+", 9000) === "unknown")

console.log("\n═══ CREDIT against a property minimum")
const c540 = readScreeningFacts({ credit_score: 540, credit_history: "Clean" })
ok("540 meets a reported 450 minimum → strong",
  assessProperty(prop({ creditMinimumStatus: "reported_minimum", creditMinimumScore: 450 }), c540).outcome === "strong_candidate")
ok("540 below a reported 600 minimum → KNOWN MISMATCH",
  assessProperty(prop({ creditMinimumStatus: "reported_minimum", creditMinimumScore: 600 }), c540).outcome === "known_mismatch")
ok('"credit not checked" → strong',
  assessProperty(prop({ creditMinimumStatus: "no_check_reported" }), c540).outcome === "strong_candidate")
ok("no policy recorded at all → CURATED ONLY, which is not a match",
  assessProperty(prop(), c540).outcome === "curated_only")

console.log("\n═══ A HISTORICAL APPROVAL IS NOT A MINIMUM")
const obs = assessProperty(prop({ creditObservedApprovalScore: 450 }), c540)
ok("an observed 450 does NOT make a property strong", obs.outcome === "needs_verification")
ok("…and it is flagged as an observation, not a policy",
  obs.unverified.some((u) => u.includes("historical approval")))
ok("a 400 client is NOT ruled out by an observed 450 either",
  assessProperty(prop({ creditObservedApprovalScore: 450 }), readScreeningFacts({ credit_score: 400 })).outcome === "needs_verification")

console.log("\n═══ BROKEN LEASE — structured policy decides")
const bl3paid = readScreeningFacts({ credit_score: 540, credit_history: "Broken Lease", broken_lease_age: "3 years", broken_lease_amount: "Less than $500", broken_lease_paid: true })
const bl3unknown = readScreeningFacts({ credit_score: 540, credit_history: "Broken Lease", broken_lease_age: "3 years", broken_lease_amount: "Less than $500" })
const bl2 = readScreeningFacts({ credit_score: 540, credit_history: "Broken Lease", broken_lease_age: "2 years", broken_lease_paid: true })
const oakwell = prop({ propertyName: "Villas at Oakwell Farms", creditMinimumStatus: "no_check_reported", brokenLeaseStatus: "accepted", brokenLeaseMinAgeYears: 3, brokenLeaseBalanceRequirement: "must_be_paid" })

ok("not_accepted → KNOWN MISMATCH",
  assessProperty(prop({ creditMinimumStatus: "no_check_reported", brokenLeaseStatus: "not_accepted" }), bl3paid).outcome === "known_mismatch")
ok("Oakwell Farms: exactly 3 years AND paid → STRONG", assessProperty(oakwell, bl3paid).outcome === "strong_candidate")
ok("Oakwell Farms: 3 years but paid-status unknown → NEEDS VERIFICATION",
  assessProperty(oakwell, bl3unknown).outcome === "needs_verification")
ok("…and it says exactly why",
  assessProperty(oakwell, bl3unknown).unverified.some((u) => u.includes("cannot express a zero balance")))
ok("Oakwell Farms: 2 years, paid → KNOWN MISMATCH on age", assessProperty(oakwell, bl2).outcome === "known_mismatch")
ok("accepted_if_paid with paid=true → strong",
  assessProperty(prop({ creditMinimumStatus: "no_check_reported", brokenLeaseStatus: "accepted_if_paid" }), bl3paid).outcome === "strong_candidate")
ok("accepted_if_paid with paid=false → KNOWN MISMATCH",
  assessProperty(prop({ creditMinimumStatus: "no_check_reported", brokenLeaseStatus: "accepted_if_paid" }),
    readScreeningFacts({ credit_history: "Broken Lease", broken_lease_age: "5 years", broken_lease_paid: false })).outcome === "known_mismatch")
ok("a max-balance cap the client exceeds → KNOWN MISMATCH",
  assessProperty(prop({ creditMinimumStatus: "no_check_reported", brokenLeaseStatus: "accepted", brokenLeaseMaxBalance: 500 }),
    readScreeningFacts({ credit_history: "Broken Lease", broken_lease_amount: "$2,000-$5,000" })).outcome === "known_mismatch")

console.log("\n═══ POSITIVE RENTAL HISTORY — a requirement we cannot answer is a question")
ok("'required' is a question, because the intake records nothing since the incident",
  assessProperty(prop({ creditMinimumStatus: "no_check_reported", brokenLeaseStatus: "accepted",
    brokenLeasePositiveHistoryRequired: true }), bl3paid).outcome === "needs_verification")
ok("…and it says what is missing",
  assessProperty(prop({ creditMinimumStatus: "no_check_reported", brokenLeaseStatus: "accepted",
    brokenLeasePositiveHistoryRequired: true }), bl3paid)
    .unverified.some((u) => u.includes("rental history since")))
ok("'not required' is an ANSWER and leaves the property strong",
  assessProperty(prop({ creditMinimumStatus: "no_check_reported", brokenLeaseStatus: "accepted",
    brokenLeasePositiveHistoryRequired: false }), bl3paid).outcome === "strong_candidate")

console.log("\n═══ EVICTION")
const ev = readScreeningFacts({ credit_score: 540, credit_history: "Eviction", eviction_age: "2 years" })
ok("evictions not accepted → KNOWN MISMATCH",
  assessProperty(prop({ creditMinimumStatus: "no_check_reported", evictionStatus: "not_accepted" }), ev).outcome === "known_mismatch")
ok("a 7-year eviction requirement against a 2-year eviction → KNOWN MISMATCH",
  assessProperty(prop({ creditMinimumStatus: "no_check_reported", evictionStatus: "accepted", evictionMinAgeYears: 7 }), ev).outcome === "known_mismatch")
ok("a 2-year requirement against a 2-year eviction → STRONG",
  assessProperty(prop({ creditMinimumStatus: "no_check_reported", evictionStatus: "accepted", evictionMinAgeYears: 2 }), ev).outcome === "strong_candidate")
ok("a broken-lease-only client is NOT ruled out by an eviction policy",
  assessProperty(prop({ creditMinimumStatus: "no_check_reported", evictionStatus: "not_accepted" }), bl3paid).outcome !== "known_mismatch")
ok("an eviction balance requirement of must_be_paid against an unpaid balance → KNOWN MISMATCH",
  assessProperty(prop({ creditMinimumStatus: "no_check_reported", evictionStatus: "accepted",
    evictionBalanceRequirement: "must_be_paid" }),
    readScreeningFacts({ credit_history: "Eviction", eviction_age: "5 years", eviction_paid: false })).outcome === "known_mismatch")

console.log("\n═══ RENTAL DEBT")
const debt = readScreeningFacts({ credit_score: 540, rental_debt_status: "owed" })
ok("rental debt not accepted → KNOWN MISMATCH",
  assessProperty(prop({ creditMinimumStatus: "no_check_reported", rentalDebtStatus: "not_accepted" }), debt).outcome === "known_mismatch")
ok("accepted_if_paid against an owed balance → KNOWN MISMATCH",
  assessProperty(prop({ creditMinimumStatus: "no_check_reported", rentalDebtStatus: "accepted_if_paid" }), debt).outcome === "known_mismatch")
ok("a payment plan is a QUESTION against must_be_paid, not a verdict",
  assessProperty(prop({ creditMinimumStatus: "no_check_reported", rentalDebtStatus: "accepted",
    rentalDebtBalanceRequirement: "must_be_paid" }),
    readScreeningFacts({ rental_debt_status: "payment_plan" })).outcome === "needs_verification")
ok("a debt CEILING cannot be compared, because the intake holds no amount",
  assessProperty(prop({ creditMinimumStatus: "no_check_reported", rentalDebtStatus: "accepted",
    rentalDebtMaxBalance: 1500 }), debt)
    .unverified.some((u) => u.includes("not recorded as an amount")))

console.log("\n═══ CRIMINAL BACKGROUND, END TO END")
const fel = readScreeningFacts({ credit_score: 540, criminal_background: "Felony", criminal_charge: "Assault", felony_age: "7+ years" })
const felNoCharge = readScreeningFacts({ credit_score: 540, criminal_background: "Felony", felony_age: "7+ years" })
const creditOk = { creditMinimumStatus: "no_check_reported" as const }

ok("felony not considered → KNOWN MISMATCH",
  assessProperty(prop({ ...creditOk, felonyPolicy: "not_considered" }), fel).outcome === "known_mismatch")
ok("…and the conflict names it",
  assessProperty(prop({ ...creditOk, felonyPolicy: "not_considered" }), fel)
    .conflicts.some((c) => c.includes("not considered")))
ok("felony CONSIDERED, nothing else outstanding → STRONG",
  assessProperty(prop({ ...creditOk, felonyPolicy: "considered" }), fel).outcome === "strong_candidate")
ok("…and the finding says review, not approval",
  assessProperty(prop({ ...creditOk, felonyPolicy: "considered" }), fel)
    .findings.some((f) => f.text.includes("which is not approval")))
ok("CASE BY CASE → NEEDS VERIFICATION, never a quiet pass",
  assessProperty(prop({ ...creditOk, felonyPolicy: "case_by_case" }), fel).outcome === "needs_verification")
ok("…and it says it must be confirmed with the leasing office",
  assessProperty(prop({ ...creditOk, felonyPolicy: "case_by_case" }), fel)
    .unverified.some((u) => u.includes("leasing office")))
ok("a restricted category that matches the charge → KNOWN MISMATCH",
  assessProperty(prop({ ...creditOk, felonyPolicy: "considered",
    criminalRestrictedOffenseTypes: ["assault", "sex_offense"] }), fel).outcome === "known_mismatch")
ok("…and the conflict names the client's own charge",
  assessProperty(prop({ ...creditOk, felonyPolicy: "considered",
    criminalRestrictedOffenseTypes: ["assault"] }), fel)
    .conflicts.some((c) => c.includes("Assault")))
ok("a restricted category that does NOT match → still strong",
  assessProperty(prop({ ...creditOk, felonyPolicy: "considered",
    criminalRestrictedOffenseTypes: ["drug"] }), fel).outcome === "strong_candidate")
ok("a restricted set with the charge unknown → needs verification, and it is a CONFLICT too",
  (() => {
    const a = assessProperty(prop({ ...creditOk, felonyPolicy: "considered",
      criminalRestrictedOffenseTypes: ["assault"] }), felNoCharge)
    return a.outcome === "needs_verification" && a.conflicts.length > 0
  })())
ok("an EMPTY restricted set is reported as not recorded, not as acceptance",
  assessProperty(prop({ ...creditOk, felonyPolicy: "considered" }), fel)
    .unverified.some((u) => u.includes("No restricted offense categories are recorded")))
ok("a felony lookback on a CONVICTION basis the client cannot clear → KNOWN MISMATCH",
  assessProperty(prop({ ...creditOk, felonyPolicy: "considered", felonyMinAgeYears: 7,
    criminalLookbackBasis: "conviction_date" }),
    readScreeningFacts({ criminal_background: "Felony", felony_age: "2 years" })).outcome === "known_mismatch")
ok("the SAME facts on an OFFENSE basis are only a question",
  assessProperty(prop({ ...creditOk, felonyPolicy: "considered", felonyMinAgeYears: 7,
    criminalLookbackBasis: "offense_date" }),
    readScreeningFacts({ criminal_background: "Felony", felony_age: "2 years" })).outcome === "needs_verification")
ok("an UNSTATED basis is always a question, and says the basis itself is missing",
  assessProperty(prop({ ...creditOk, felonyPolicy: "considered", felonyMinAgeYears: 7 }), fel)
    .unverified.some((u) => u.includes("does not say whether that counts from the offense or the conviction")))
ok("free-text felony restrictions can only ever raise a question",
  assessProperty(prop({ ...creditOk, felonyPolicy: "considered",
    felonyRestrictions: "Nothing assault related" }), fel).outcome === "needs_verification")
ok("…and they are reported as a documented conflict for review, quoted verbatim",
  assessProperty(prop({ ...creditOk, felonyPolicy: "considered",
    felonyRestrictions: "Nothing assault related" }), fel)
    .conflicts.some((c) => c.includes("Nothing assault related")))
ok("a background NOTE can question but never accept",
  assessProperty(prop({ ...creditOk, felonyPolicy: "considered",
    backgroundScreeningNotes: "No felonies of any kind, corporate policy." }), fel)
    .outcome === "needs_verification")
ok("a MISDEMEANOR client is not judged by the felony policy",
  assessProperty(prop({ ...creditOk, felonyPolicy: "not_considered" }),
    readScreeningFacts({ criminal_background: "Misdemeanor", misdemeanor_age: "3 years" })).outcome !== "known_mismatch")
ok("…and a misdemeanor policy of its own does apply",
  assessProperty(prop({ ...creditOk, misdemeanorPolicy: "not_considered" }),
    readScreeningFacts({ criminal_background: "Misdemeanor", misdemeanor_age: "3 years" })).outcome === "known_mismatch")
ok("a client with NO record is not measured against any criminal policy",
  assessProperty(prop({ ...creditOk, felonyPolicy: "not_considered", misdemeanorPolicy: "not_considered" }), c540)
    .outcome === "strong_candidate")

console.log("\n═══ COVERAGE — an unexamined issue can never be a Strong Candidate")
const creditOnlyPolicy = prop({ creditMinimumStatus: "reported_minimum", creditMinimumScore: 450 })
ok("credit passes but the broken lease is unaddressed → NOT strong",
  assessProperty(creditOnlyPolicy, bl3paid).outcome === "needs_verification")
ok("…and it says the broken lease was measured against nothing",
  assessProperty(creditOnlyPolicy, bl3paid).unverified.some((u) => u.includes("no structured broken-lease policy")))
ok("the same property IS strong for a credit-only client",
  assessProperty(creditOnlyPolicy, c540).outcome === "strong_candidate")
ok("a FELONY client at a credit-only property is NOT strong",
  assessProperty(creditOnlyPolicy, fel).outcome === "needs_verification")
ok("…and it says the felony was measured against nothing",
  assessProperty(creditOnlyPolicy, fel).unverified.some((u) => u.includes("no structured felony policy")))
ok("an eviction client at a broken-lease-only property is NOT strong",
  assessProperty(prop({ ...creditOk, brokenLeaseStatus: "accepted" }),
    readScreeningFacts({ credit_score: 540, credit_history: "Eviction", eviction_age: "5 years" })).outcome === "needs_verification")

console.log("\n═══ FREE TEXT can question, never accept or reject")
const noteExcludes = prop({ creditMinimumStatus: "reported_minimum", creditMinimumScore: 450,
  creditScreeningNotes: "450 reported; no collections, broken leases or evictions" })
const a = assessProperty(noteExcludes, bl3paid)
ok("a note that excludes broken leases does NOT produce a Known Mismatch", a.outcome !== "known_mismatch")
ok("…it produces Needs Verification instead", a.outcome === "needs_verification")
ok("…and quotes the sentence for the agent", a.findings.some((f) => f.fromNotes && f.text.includes("broken leases")))
ok("the PLURAL 'broken leases' is still detected (the bug that proved this rule)",
  a.findings.some((f) => f.fromNotes && /broken leases/.test(f.text)))
ok("a note alone can never make a property strong",
  assessProperty(prop({ creditScreeningNotes: "very lenient, works with anything" }), bl3paid).outcome !== "strong_candidate")

console.log("\n═══ ONLY curated collection properties can be recommended")
const member = prop({ placeId: "m1", propertyName: "Member", creditMinimumStatus: "no_check_reported" })
const nonMember = prop({ placeId: "x1", propertyName: "Not A Member", quickMatchCollection: null, creditMinimumStatus: "no_check_reported" })
const mixed = runQuickMatch({ lead: { credit_score: 540 }, properties: [member, nonMember], needs: needs() })
ok("a non-member is refused by the engine even when passed in", mixed.rejectedNonMembers === 1)
ok("…and never appears in the recommendations",
  mixed.recommendations.every((r) => r.property.placeId !== "x1"))
ok("…while the member does", mixed.recommendations.some((r) => r.property.placeId === "m1"))
ok("an empty-string collection is also not membership",
  runQuickMatch({ lead: { credit_score: 540 }, properties: [prop({ quickMatchCollection: "" })], needs: needs() }).recommendations.length === 0)
ok("considered count counts members only", mixed.consideredCount === 1)

console.log("\n═══ GEOGRAPHY IS A GATE — in it, next to it, near it, or not recommended")
const assessedAt = (mi: number, id: string) =>
  atMiles(mi, { placeId: id, propertyName: `At ${mi}mi`, creditMinimumStatus: "no_check_reported" })
const g2mi = assessedAt(2, "g2"), g5mi = assessedAt(5, "g5"), g9mi = assessedAt(9, "g9"), g20mi = assessedAt(20, "g20")
ok("a property 2 miles from a named area is IN it", assessGeography(g2mi, stoneOak).band === "in_area")
ok("…at 5 miles it is next to it", assessGeography(g5mi, stoneOak).band === "adjacent")
ok("…at 9 miles it is near it", assessGeography(g9mi, stoneOak).band === "nearby")
ok("…at 20 miles it is in NO band", assessGeography(g20mi, stoneOak).band === null)
ok("the outer band is 12 miles, and the constant says so", GEO_BAND_MILES.nearby === 12)
ok("the distance is measured, not bucketed by ZIP",
  Math.abs((assessGeography(g5mi, stoneOak).miles ?? 0) - 5) < 0.01)
ok("the in-area reason names the area the client typed",
  (assessGeography(g2mi, stoneOak).reason ?? "").includes("In Stone Oak"))
const farRun = rankRecommendationsDetailed(
  [g2mi, g20mi].map((property) => ({ property, assessment: assessProperty(property, c540), travelMinutes: null })),
  needs({ geography: stoneOak }))
ok("a property beyond the outer band is NOT recommended",
  farRun.recommendations.length === 1 && farRun.recommendations[0].property.placeId === "g2")
ok("…and it is reported as excluded by geography, not silently dropped",
  farRun.excludedByGeography.length === 1 && farRun.excludedByGeography[0].placeId === "g20")
ok("…with a reason naming the distance and the limit",
  /20.*miles.*Stone Oak/.test(farRun.excludedByGeography[0].why[0]) && farRun.excludedByGeography[0].why[0].includes("12-mile"))
ok("…and it is NOT counted as a screening mismatch", farRun.excludedByGeography[0].why.every((w) => !/credit|policy/i.test(w)))

// The Houston case, which is why the gate exists: lead 92 asks for Greenway / Upper Kirby and
// the curated collection is San Antonio. The honest answer is NONE, not six wrong cities.
const houston = geo({ anchors: [{ label: "Greenway / Upper Kirby", lat: 29.733, lng: -95.431 }], marketSlug: "houston" })
const wrongCity = rankRecommendationsDetailed(
  [g2mi, g5mi, g9mi].map((property) => ({ property, assessment: assessProperty(property, c540), travelMinutes: null })),
  needs({ geography: houston }))
ok("a client whose market the collection does not cover gets NOTHING", wrongCity.recommendations.length === 0)
ok("…and every property is accounted for", wrongCity.excludedByGeography.length === 3)

console.log("\n═══ GEOGRAPHY — several areas, the destination ZIP, and what cannot be measured")
const twoAreas = geo({ anchors: [ANCHOR, { label: "Alamo Heights", lat: 29.4847, lng: -98.4661 }] })
ok("the NEAREST named area decides the band, not the first",
  assessGeography(g2mi, twoAreas).anchorLabel === "Stone Oak")
ok("…and the reason says it was the closest of them",
  (assessGeography(g2mi, twoAreas).reason ?? "").includes("closest of the areas"))
const zipGeo = geo({ destinationZip: "78232", anchors: [ANCHOR] })
ok("a property in the destination ZIP is its own strongest band",
  assessGeography(prop({ zip: "78232" }), zipGeo).band === "destination_zip")
// NOTE the ZIP on the comparison property. The fixture's default zip IS 78232, so the first
// version of this test compared two exact destination-ZIP matches and proved nothing.
const inAreaOtherZip = atMiles(2, { placeId: "near", zip: "78299", creditMinimumStatus: "no_check_reported" })
const elevenInZip = atMiles(11, { placeId: "zipmatch", zip: "78232", creditMinimumStatus: "no_check_reported" })
ok("…and it outranks a nearer property that is not in that ZIP",
  rankRecommendations([
    { property: inAreaOtherZip, assessment: assessProperty(inAreaOtherZip, c540), travelMinutes: null },
    { property: elevenInZip, assessment: assessProperty(elevenInZip, c540), travelMinutes: null },
  ], needs({ geography: zipGeo }))[0].property.placeId === "zipmatch")
const noCoords = prop({ placeId: "nc", zip: "70000", latitude: null, longitude: null, creditMinimumStatus: "no_check_reported" })
const ncRun = rankRecommendationsDetailed(
  [{ property: noCoords, assessment: assessProperty(noCoords, c540), travelMinutes: null }],
  needs({ geography: stoneOak }))
ok("a property with no coordinates is NOT treated as nearby", ncRun.recommendations.length === 0)
ok("…and the reason says the distance could not be measured",
  ncRun.excludedByGeography[0].why[0].includes("could not be measured"))

// The ZIP centroid is MEASURED from the curated members in that ZIP, or it does not exist.
const members = [prop({ placeId: "z1", zip: "78232", latitude: 29.6, longitude: -98.5 }),
                 prop({ placeId: "z2", zip: "78232", latitude: 29.62, longitude: -98.48 })]
const za = zipAnchor(members, "78232")
ok("a destination ZIP gets a centroid averaged over the curated members in it",
  za !== null && Math.abs(za.lat - 29.61) < 1e-9 && Math.abs(za.lng - -98.49) < 1e-9)
ok("…labelled as the ZIP it came from", za?.label === "ZIP 78232")
ok("a ZIP with no curated member in it yields NO anchor", zipAnchor(members, "78999") === null)
ok("…and then only an exact ZIP match is in band",
  assessGeography(prop({ zip: "78998", latitude: 29.6, longitude: -98.5 }),
    geo({ destinationZip: "78999" })).band === null)

console.log("\n═══ GEOGRAPHY — when the client named nowhere, it is not a criterion")
const noWhere = rankRecommendationsDetailed(
  [g20mi].map((property) => ({ property, assessment: assessProperty(property, c540), travelMinutes: null })),
  needs())
ok("with no area and no ZIP on record, distance excludes nothing", noWhere.recommendations.length === 1)
ok("…and nothing is recorded as a geographic exclusion", noWhere.excludedByGeography.length === 0)
ok("…but the row SAYS location was not used",
  noWhere.recommendations[0].unverified.some((u) => u.includes("location was not used")))
ok("geography is reported as not applicable", assessGeography(g2mi, geo({ applicable: false })).applicable === false)
ok("the summary says so in the agent's words",
  geographySummary(geo({ applicable: false })).includes("not used to rank"))
ok("…and otherwise names what was used", geographySummary(stoneOak).includes("Stone Oak"))
ok("an area with no catalogued centroid is reported, never guessed at",
  geographySummary(geo({ anchors: [ANCHOR], unresolvedAreas: ["Nowhere Heights"] })).includes("no centroid on record"))

console.log("\n═══ GEOGRAPHY — read off a real lead row, through Unleash's own centroids")
const realGeo = resolveClientGeography(
  { city: "San Antonio", neighborhoods: "Stone Oak", submarkets: "Alamo Heights", destination_zip: null }, [])
ok("the market comes from leads.city", realGeo.marketSlug === "san-antonio")
ok("both named columns are resolved, not just neighborhoods", realGeo.anchors.length === 2)
ok("…and they carry their labels", realGeo.anchors.map((a) => a.label).join("|") === "Stone Oak|Alamo Heights")
ok("geography is applicable for this client", realGeo.applicable)
const unknownArea = resolveClientGeography({ city: "San Antonio", neighborhoods: "Nowhere At All" }, [])
ok("an unrecognised area resolves to NO anchor rather than a downtown one", unknownArea.anchors.length === 0)
ok("…it is reported as unresolved", unknownArea.unresolvedAreas.includes("Nowhere At All"))
ok("…and geography is then not a criterion at all", !unknownArea.applicable)
ok("a lead with no market cannot resolve an area",
  resolveClientGeography({ city: null, neighborhoods: "Stone Oak" }, []).anchors.length === 0)

console.log("\n═══ DESTINATION ZIP — the field the agent typed, never where the client lives")
// 78240 is a real San Antonio ZIP (Medical Center / Babcock) and the curated collection has
// members in it. Here it is a fixture, so the arithmetic is on the page rather than trusted.
const z240 = resolveClientGeography({ city: "San Antonio", destination_zip: "78240" }, [])
ok("a typed destination ZIP is read", z240.destinationZip === "78240")
ok("…and it is recorded as coming from the profile field", z240.zipSource === "destination_zip")
ok("…so geography is a criterion even with no named area at all",
  z240.applicable && z240.anchors.length === 0)
const in240 = prop({ placeId: "in240", zip: "78240" })
ok("a property in 78240 is in the strongest band", assessGeography(in240, z240).band === "destination_zip")
ok("…and the reason names the ZIP", (assessGeography(in240, z240).reason ?? "").includes("78240"))
ok("a property outside it, with no member in 78240 to measure from, is not in band",
  assessGeography(prop({ placeId: "out240", zip: "78260" }), z240).band === null)
// With curated members in the ZIP, it gets a MEASURED centroid and the bands widen honestly.
const m240 = [prop({ placeId: "m1", zip: "78240", latitude: 29.5, longitude: -98.58 })]
const z240m = resolveClientGeography({ city: "San Antonio", destination_zip: "78240" }, m240)
ok("a curated member in the ZIP gives it a centroid", z240m.anchors.length === 1)
ok("…labelled as the ZIP", z240m.anchors[0].label === "ZIP 78240")
ok("…and a neighbouring property is then ranked by distance from it",
  assessGeography(prop({ placeId: "nb", zip: "78229", latitude: 29.52, longitude: -98.58 }), z240m).band === "in_area")
ok("the destination ZIP outranks a named area for the same property", (() => {
  const both = resolveClientGeography(
    { city: "San Antonio", destination_zip: "78240", neighborhoods: "Stone Oak" }, m240)
  return assessGeography(in240, both).band === "destination_zip"
})())
// NOT the client's own address. `leads` has no residential ZIP column, and nothing here invents
// one: a ZIP sitting in any other field is not a destination.
ok("a ZIP on the lead row that is NOT destination_zip is never used as a destination",
  !resolveClientGeography(
    { city: "San Antonio", zip: "78240", current_zip: "78240", address: "123 Main St, San Antonio, TX 78240" },
    []).applicable)
ok("…and the destination ZIP stays null in that case",
  resolveClientGeography({ city: "San Antonio", zip: "78240", address: "123 Main St 78240" }, []).destinationZip === null)
ok("the end-to-end needs read carries the same ZIP from the same field",
  resolveClientNeeds({ city: "San Antonio", destination_zip: "78240" }).destinationZip === "78240")
ok("a malformed value is no ZIP at all",
  fiveDigitZip("7824") === null && fiveDigitZip("78240-1234") === null && fiveDigitZip("782401") === null)

console.log("\n═══ COMMUTE DESTINATION — a Google anchor is left alone; an unanchored ZIP is a hint")
ok("an anchored destination yields NO hint, whatever its label says",
  commuteHintZip("ChIJq6qq1234", "78254") === null
  && commuteHintZip("ChIJq6qq1234", "Brooke Army Medical Center, TX 78234") === null)
ok("an unanchored destination that is nothing but a ZIP becomes a hint",
  commuteHintZip(null, "78254") === "78254")
ok("…and a ZIP at the end of a typed address is found",
  commuteHintZip(null, "San Antonio, TX 78254") === "78254")
ok("a place name with no ZIP yields no hint — which one it meant is a guess",
  commuteHintZip(null, "Alamo Heights") === null)
ok("a street number is not a ZIP", commuteHintZip(null, "12345 Main St") === null)
ok("an empty box yields no hint",
  commuteHintZip(null, "") === null && commuteHintZip(null, null) === null && commuteHintZip("", "   ") === null)

const hinted = resolveClientGeography(
  { city: "San Antonio", destination_zip: null, commute_anchor_label: "78254", commute_anchor_place_id: null }, [])
ok("the hint makes geography a criterion", hinted.applicable && hinted.destinationZip === "78254")
ok("…and it is recorded as coming from the commute destination", hinted.zipSource === "commute_destination")
ok("…the agent-facing sentence says which field it read",
  (assessGeography(prop({ zip: "78254" }), hinted).reason ?? "").includes("commute destination"))
ok("…and so does the summary", geographySummary(hinted).includes("from the commute destination"))
const anchoredDest = resolveClientGeography(
  { city: "San Antonio", commute_anchor_label: "Brooke Army Medical Center, 78234", commute_anchor_place_id: "ChIJbamc" }, [])
ok("a Google-anchored destination produces no geographic anchor and is otherwise untouched",
  !anchoredDest.applicable && anchoredDest.destinationZip === null && anchoredDest.zipSource === null)
ok("a typed destination ZIP wins over a commute hint", (() => {
  const g = resolveClientGeography(
    { city: "San Antonio", destination_zip: "78240", commute_anchor_label: "78254" }, [])
  return g.destinationZip === "78240" && g.zipSource === "destination_zip"
})())
// The hint is a PLACE, never a drive: a stated limit with no estimate stays unconfirmed.
const hintProp = prop({ placeId: "hp", zip: "78254", creditMinimumStatus: "no_check_reported" })
const hintRun = rankRecommendationsDetailed(
  [{ property: hintProp, assessment: assessProperty(hintProp, c540), travelMinutes: null }],
  needs({ geography: hinted, commuteLimitMinutes: 20, commuteDestinationLabel: "78254" }))
ok("the hinted property is recommended on the ZIP match", hintRun.recommendations.length === 1)
ok("…the 20-minute limit is reported as unconfirmed, not met",
  hintRun.recommendations[0].unverified.some((u) => u.includes("could not be estimated")))
ok("…and no reason invents a travel time",
  hintRun.recommendations[0].reasons.every((r) => !/minute/.test(r)))

console.log("\n═══ AREA ANCHORS RESOLVE INSIDE QUICK MATCH, off the shared market catalogue")
ok("a catalogued area resolves to a labelled centroid", (() => {
  const a = resolveAreaAnchors("Stone Oak", "san-antonio")
  return a.length === 1 && a[0].label === "Stone Oak" && Number.isFinite(a[0].lat)
})())
ok("the centroid is the catalogue's own value, not a copy of it", (() => {
  const c = centerForDesiredArea("Stone Oak", "san-antonio")
  const a = resolveAreaAnchors("Stone Oak", "san-antonio")[0]
  return c !== null && a.lat === c.lat && a.lng === c.lng
})())
ok("an unknown label is dropped and consumes no slot", (() => {
  const a = resolveAreaAnchors("Nowhere At All, Stone Oak, Alamo Heights", "san-antonio", 2)
  return a.length === 2 && a[0].label === "Stone Oak" && a[1].label === "Alamo Heights"
})())
ok("…so the cap applies to what RESOLVED, in order",
  resolveAreaAnchors("Stone Oak, Alamo Heights, Medical Center, Downtown San Antonio", "san-antonio", 3)
    .map((a) => a.label).join("|") === "Stone Oak|Alamo Heights|Medical Center")
ok("no market means no anchors — never a downtown fallback",
  resolveAreaAnchors("Stone Oak", null).length === 0)
ok("an unrecognised area is never replaced by a market center",
  resolveAreaAnchors("Nowhere At All", "san-antonio").length === 0)
ok("blank input yields nothing",
  resolveAreaAnchors(null, "san-antonio").length === 0 && resolveAreaAnchors(" , ,", "san-antonio").length === 0)
// THE POINT OF THE WHOLE FUNCTION: Unleash's own resolver is untouched, and this one agrees with
// it coordinate for coordinate, because both read the same catalogue entry.
ok("Unleash's untouched resolver returns exactly the same coordinates", (() => {
  const input = "Nowhere At All, Stone Oak, Alamo Heights, Medical Center"
  const u = resolveDesiredAreaCenters(input, "san-antonio")
  const q = resolveAreaAnchors(input, "san-antonio")
  return u.length === q.length && u.length === 3
    && u.every((c, i) => c.lat === q[i].lat && c.lng === q[i].lng)
})())

console.log("\n═══ NO POLICY ON RECORD — never recommended on curation alone")
const bare = atMiles(2, { placeId: "q1", propertyName: "No Policy On Record" })
ok("the fixture really has nothing on record for this client",
  assessProperty(bare, c540).outcome === "curated_only")
const bareAlone = rankRecommendationsDetailed(
  [{ property: bare, assessment: assessProperty(bare, c540), travelMinutes: null }], needs())
ok("with no geographic evidence it is NOT recommended", bareAlone.recommendations.length === 0)
ok("…and the reason is that nothing else put it in front of the client",
  bareAlone.excludedNoPolicy.length === 1 && bareAlone.excludedNoPolicy[0].why[0].includes("no area"))
ok("there is no 'No policy' label left to wear", !(DISPLAY_TIERS as readonly string[]).includes("curated_only"))
ok("…though it is still COUNTED as its own assessment outcome",
  (ASSESSED_TIERS as readonly string[]).includes("curated_only"))

const bareInArea = rankRecommendationsDetailed(
  [{ property: bare, assessment: assessProperty(bare, c540), travelMinutes: null }],
  needs({ geography: stoneOak }))
ok("in the client's OWN area it IS recommended", bareInArea.recommendations.length === 1)
const br = bareInArea.recommendations[0]
ok("…as Needs Verification, never as a match", br.tier === "needs_verification")
ok("…and the row records that no policy is on record", br.policyOnRecord === false)
ok("…the screening tier underneath is unchanged", br.screeningTier === "curated_only")
ok("…the geographic fact leads the reasons", br.reasons[0].includes("In Stone Oak"))
ok("…and the very next line says NO policy is on record",
  br.reasons[1].includes("NO screening policy is on record"))
ok("…it claims nothing is met",
  !br.reasons.some((r) => /requirement.*is met|compatible/i.test(r)))
ok("…and it still lists what must be checked", br.unverified.length > 0)

// "otherwise plausible" is exactly two facts, and either one failing is enough.
const bareWrongBeds = atMiles(2, { placeId: "q2", bedsMin: 4, bedsMax: 4 })
const wrongBedsRun = rankRecommendationsDetailed(
  [{ property: bareWrongBeds, assessment: assessProperty(bareWrongBeds, c540), travelMinutes: null }],
  needs({ geography: stoneOak, bedrooms: 2 }))
ok("no policy AND the wrong bedroom count is not recommended", wrongBedsRun.recommendations.length === 0)
ok("…with that stated as the reason", wrongBedsRun.excludedNoPolicy[0].why[0].includes("2-bedroom"))
const bareOverBudget = atMiles(2, { placeId: "q3", twobrStartingRent: 2400 })
const overRun = rankRecommendationsDetailed(
  [{ property: bareOverBudget, assessment: assessProperty(bareOverBudget, c540), travelMinutes: null }],
  needs({ geography: stoneOak, bedrooms: 2, budgetMax: 1200 }))
ok("no policy AND over budget is not recommended", overRun.recommendations.length === 0)
ok("…with that stated as the reason", overRun.excludedNoPolicy[0].why[0].includes("budget"))
ok("an UNKNOWN rent is not held against it, because unknown is not over",
  rankRecommendationsDetailed([{ property: bare, assessment: assessProperty(bare, c540), travelMinutes: null }],
    needs({ geography: stoneOak, bedrooms: 2, budgetMax: 1200 })).recommendations.length === 1)

console.log("\n═══ ORDERING — evidence first, then distance; neither can be bought with the other")
const assessedFar = assessedAt(9, "far-assessed")
const orderRun = rankRecommendations([
  { property: bare, assessment: assessProperty(bare, c540), travelMinutes: null },
  { property: assessedFar, assessment: assessProperty(assessedFar, c540), travelMinutes: null },
], needs({ geography: stoneOak }))
ok("a property with policies on record outranks one without, even 7 miles further out",
  orderRun[0].property.placeId === "far-assessed",
  orderRun.map((r) => `${r.property.placeId}:${r.screeningTier}:${r.score}`).join(" "))
ok("…and both are still offered", orderRun.length === 2)
const sameTier = rankRecommendations([
  { property: assessedAt(9, "nine"), assessment: assessProperty(assessedAt(9, "nine"), c540), travelMinutes: null },
  { property: assessedAt(2, "two"), assessment: assessProperty(assessedAt(2, "two"), c540), travelMinutes: null },
], needs({ geography: stoneOak }))
ok("within one tier the nearer property wins", sameTier[0].property.placeId === "two")
// The measurement recorded in GEO_WEIGHT: band must NOT outrank tier. This is the live case
// described there, in miniature — eight properties the client is known to qualify for, one mile
// further out than six about which nothing is recorded.
ok("a NEARER property with nothing on record never displaces a further one that is assessed",
  rankRecommendations([
    { property: atMiles(0.5, { placeId: "closest-bare" }), assessment: assessProperty(atMiles(0.5, { placeId: "closest-bare" }), c540), travelMinutes: null },
    { property: assessedAt(11, "furthest-assessed"), assessment: assessProperty(assessedAt(11, "furthest-assessed"), c540), travelMinutes: null },
  ], needs({ geography: stoneOak }))[0].property.placeId === "furthest-assessed")

console.log("\n═══ SIX IS A MAXIMUM, AND NOTHING PADS IT")
const many = Array.from({ length: 12 }, (_, i) =>
  prop({ placeId: `s${i}`, propertyName: `Strong ${String(i).padStart(2, "0")}`, creditMinimumStatus: "no_check_reported" }))
const capped = runQuickMatch({ lead: { credit_score: 540 }, properties: many, needs: needs() })
ok("twelve strong candidates are capped at six", capped.recommendations.length === MAX_RECOMMENDATIONS)
ok("the cap constant is six", MAX_RECOMMENDATIONS === 6)
const allMismatch = runQuickMatch({ lead: { credit_score: 540, credit_history: "Broken Lease", broken_lease_age: "1 year" },
  properties: [prop({ placeId: "z1", creditMinimumStatus: "no_check_reported", brokenLeaseStatus: "not_accepted" })], needs: needs() })
ok("a property ruled out by a stated policy is EXCLUDED, not downgraded", allMismatch.recommendations.length === 0)
ok("…and the exclusion is reported with its reason",
  allMismatch.excludedMismatches.length === 1 && allMismatch.excludedMismatches[0].why.length > 0)
ok("an ineligible client gets no recommendations at all",
  runQuickMatch({ lead: { credit_score: 720, credit_history: "Clean" }, properties: many, needs: needs() }).recommendations.length === 0)
ok("…and the reason is that Quick Match does not apply, not that nothing matched",
  !runQuickMatch({ lead: { credit_score: 720, credit_history: "Clean" }, properties: many, needs: needs() }).eligibility.eligible)

console.log("\n═══ BUDGET — never claimed from the community minimum")
const threeBr = prop({ placeId: "b1", creditMinimumStatus: "no_check_reported", rentMin: 850, threebrStartingRent: null, bedsMin: 1, bedsMax: 3 })
const r3 = rankRecommendations(
  [{ property: threeBr, assessment: assessProperty(threeBr, c540), travelMinutes: null }],
  needs({ bedrooms: 3, budgetMax: 900 }))
ok("a 3BR with no 3BR rent is NOT claimed to be within budget",
  !r3[0].reasons.some((x) => x.includes("within the")))
ok("…instead budget fit is listed as not established",
  r3[0].unverified.some((u) => u.includes("budget fit is not established")))
ok("…and the $850 community minimum is never quoted as the 3BR price",
  !r3.flatMap((x) => x.reasons).some((t) => t.includes("850")))
const priced = prop({ placeId: "b2", creditMinimumStatus: "no_check_reported", threebrStartingRent: 880 })
ok("a real 3BR rent within budget IS claimed",
  rankRecommendations([{ property: priced, assessment: assessProperty(priced, c540), travelMinutes: null }],
    needs({ bedrooms: 3, budgetMax: 900 }))[0].reasons.some((x) => x.includes("within the $900 budget")))

console.log("\n═══ COMMUTE — a nearby ZIP is never assumed to meet a limit")
const far = prop({ placeId: "c1", zip: "78254", creditMinimumStatus: "no_check_reported" })
const farZip = geo({ destinationZip: "78254" })
const noEstimate = rankRecommendations([{ property: far, assessment: assessProperty(far, c540), travelMinutes: null }],
  needs({ destinationZip: "78254", commuteLimitMinutes: 20, geography: farZip }))
ok("with no travel estimate the 20-minute limit is NOT claimed met",
  !noEstimate[0].reasons.some((x) => x.includes("within the 20-minute limit")))
ok("…it is reported as unconfirmed", noEstimate[0].unverified.some((u) => u.includes("20-minute limit is unconfirmed")))
ok("…even though the property is IN the destination ZIP",
  noEstimate[0].reasons.some((x) => x.includes("destination ZIP 78254")))
const withEstimate = rankRecommendations([{ property: far, assessment: assessProperty(far, c540), travelMinutes: 14 }],
  needs({ destinationZip: "78254", commuteLimitMinutes: 20, commuteDestinationLabel: "Fort Sam Houston", geography: farZip }))
ok("a real 14-minute estimate DOES satisfy a 20-minute limit",
  withEstimate[0].reasons.some((x) => x.includes("within the 20-minute limit")))
ok("…and names the destination the agent saved",
  withEstimate[0].reasons.some((x) => x.includes("Fort Sam Houston")))
const over = rankRecommendations([{ property: far, assessment: assessProperty(far, c540), travelMinutes: 35 }],
  needs({ destinationZip: "78254", commuteLimitMinutes: 20, geography: farZip }))
ok("a 35-minute estimate is reported as beyond the limit",
  over[0].reasons.some((x) => x.includes("beyond the 20-minute limit")))

console.log("\n═══ THE OLD ZIP-LIST NUDGE IS GONE — distance replaced it")
// Until this release, "area" was a 40-point bonus for an exact ZIP-list hit and a label
// otherwise. No client on file has an intake ZIP list, so it fired for nobody while out-of-town
// properties were recommended freely. It is replaced by a measured distance and a gate; these
// assertions exist so it cannot quietly come back.
const s1 = atMiles(2, { placeId: "s1", zip: "78248", creditMinimumStatus: "no_check_reported" })
const s2 = atMiles(2, { placeId: "s2", zip: "78232", creditMinimumStatus: "no_check_reported" })
const zipList = rankRecommendations(
  [s1, s2].map((property) => ({ property, assessment: assessProperty(property, c540), travelMinutes: null })),
  needs({ preferredZips: ["78232"], geography: stoneOak }))
ok("a bare preferred-ZIP list no longer labels anything a 'surrounding area'",
  !zipList.flatMap((r) => r.reasons).some((x) => x.includes("surrounding area")))
ok("…nor claims a ZIP is 'one of the client's preferred areas'",
  !zipList.flatMap((r) => r.reasons).some((x) => x.includes("preferred areas")))
ok("two properties the same distance out are not separated by their ZIPs",
  zipList[0].score === zipList[1].score)
ok("…and both are still offered", zipList.length === 2)
ok("a DESTINATION ZIP, which is a real column an agent fills, does still rank",
  assessGeography(s2, geo({ destinationZip: "78232", anchors: [ANCHOR] })).band === "destination_zip")

console.log("\n═══ TIER ORDERING — strong before needs-verification, always")
const strong = prop({ placeId: "t1", propertyName: "Strong", creditMinimumStatus: "no_check_reported" })
const needsV = prop({ placeId: "t2", propertyName: "Unsure", creditObservedApprovalScore: 450 })
const order = runQuickMatch({ lead: { credit_score: 540 }, properties: [needsV, strong], needs: needs() })
ok("the strong candidate ranks first", order.recommendations[0].property.placeId === "t1")
ok("the tiers are labelled",
  order.recommendations[0].tier === "strong_candidate" && order.recommendations[1].tier === "needs_verification")
ok("no recommendation claims approval is guaranteed",
  order.recommendations.every((r) => !r.reasons.some((x) => /guarantee[ds]?\b(?! of)/i.test(x) && !x.includes("not a guarantee"))))
ok("a strong candidate still says it is not a guarantee",
  order.recommendations[0].reasons.some((x) => x.includes("not a guarantee of approval")))

console.log("\n═══ APPROVAL COSTS are surfaced, not hidden")
const costly = prop({ placeId: "k1", creditMinimumStatus: "no_check_reported",
  screeningAdditionalDeposit: "1 month", screeningRiskFee: "$500", screeningGuarantorProgram: "Liberty Rent" })
const k = runQuickMatch({ lead: { credit_score: 540 }, properties: [costly], needs: needs() }).recommendations[0]
ok("an additional deposit is listed", k.conditions.some((c) => c.includes("1 month")))
ok("a risk fee is listed", k.conditions.some((c) => c.includes("$500")))
ok("a guarantor programme is listed", k.conditions.some((c) => c.includes("Liberty Rent")))
ok("a property with screening values but no verification date says so",
  runQuickMatch({ lead: { credit_score: 540 },
    properties: [prop({ placeId: "u1", creditMinimumStatus: "no_check_reported", screeningRequirementsCheckedAt: null })],
    needs: needs() }).recommendations[0].unverified.some((u) => u.includes("no verification date")))
// Asked of the screening engine directly, because a property with nothing on record is no
// longer recommended without geographic evidence — and this claim is about the assessment, not
// about whether the row reaches the agent.
ok("…but a property with NOTHING on record does not repeat it as a separate gap",
  !assessProperty(prop({ placeId: "u2", screeningRequirementsCheckedAt: null }), c540)
    .unverified.some((u) => u.includes("no verification date")))

console.log("\n═══ WHAT THE CLIENT ASKED FOR — read off the real columns")
ok('beds "2" → 2', resolveClientNeeds({ beds: "2" }).bedrooms === 2)
ok('beds "3+" → 3', resolveClientNeeds({ beds: "3+" }).bedrooms === 3)
ok('beds "1-2" is a RANGE and yields no requirement', resolveClientNeeds({ beds: "1-2" }).bedrooms === null)
ok('desired_rent "$1,200–$1,300" → a 1300 ceiling',
  resolveClientNeeds({ desired_rent: "$1,200–$1,300" }).budgetMax === 1300)
ok("no desired_rent → no ceiling, never a default",
  resolveClientNeeds({}).budgetMax === null)
ok("destination_zip is used when it is five digits",
  resolveClientNeeds({ destination_zip: "78240" }).destinationZip === "78240")
ok("…and refused when it is not", resolveClientNeeds({ destination_zip: "782" }).destinationZip === null)
ok("an empty destination_zip is not a ZIP", fiveDigitZip("") === null && fiveDigitZip(null) === null)
ok("the destination ZIP is the one comparable area signal",
  resolveClientNeeds({ destination_zip: "78240" }).preferredZips.join() === "78240")
ok("named areas are reported but NOT turned into ZIPs", (() => {
  const n = resolveClientNeeds({ neighborhoods: "Stone Oak, La Cantera/The Rim", submarkets: "Stone Oak" })
  return n.namedAreas.length === 2 && n.preferredZips.length === 0
})())
ok("commute_max_minutes is carried through",
  resolveClientNeeds({ commute_max_minutes: 20 }).commuteLimitMinutes === 20)
ok("a zero or negative commute limit is not a limit",
  resolveClientNeeds({ commute_max_minutes: 0 }).commuteLimitMinutes === null)
ok("the destination label comes from commute_anchor_label",
  resolveClientNeeds({ commute_anchor_label: "Fort Sam Houston" }).commuteDestinationLabel === "Fort Sam Houston")
ok('an empty commute_anchor_label (the "" an Edit Client save leaves) is not a label',
  resolveClientNeeds({ commute_anchor_label: "" }).commuteDestinationLabel === null)

console.log("\n═══ WHAT GETS WRITTEN — the row shape, and what it deliberately omits")
const rec = runQuickMatch({ lead: { credit_score: 540 },
  properties: [prop({ placeId: "ChIJwrite", propertyName: "Written", address: "9 Oak",
    creditMinimumStatus: "no_check_reported" })], needs: needs() }).recommendations[0]
const row = toRecommendationRow(102, rec, "san_antonio", "2026-11-04T20:00:00.000Z")
ok("the identity carrier is the canonical place_id URL",
  String(row.property_url) === "https://www.google.com/maps/place/?q=place_id:ChIJwrite")
ok("…which is what makes canonical_property_key dedupe against the agent's own row",
  /q=place_id:/.test(String(row.property_url)))
ok("origin marks it as generated", row.origin === QUICK_MATCH_ORIGIN && row.origin === "quick_match")
ok("the image is left NULL for the catalog to resolve", row.property_image_url === null)
ok("sort_order is NOT set, so the agent's arrangement is untouched", !("sort_order" in row))
ok("reviewed_at is NOT set — only the agent marks a row kept", !("reviewed_at" in row))
ok("`reasons` is NOT written: that column is in line for the client-facing page", !("reasons" in row))
ok("the screening detail carries the tier",
  (row.screening as { tier: string }).tier === rec.tier)
ok("…the open questions", Array.isArray((row.screening as { unverified: string[] }).unverified))
ok("…the documented conflicts", Array.isArray((row.screening as { conflicts: string[] }).conflicts))
ok("…and when it was computed",
  (row.screening as { computedAt: string }).computedAt === "2026-11-04T20:00:00.000Z")
ok("the collection it came from is recorded",
  (row.screening as { collection: string }).collection === "san_antonio")
ok("…and whether the property states ANY policy for this client",
  (row.screening as { policyOnRecord: boolean }).policyOnRecord === true)
// The row for a property that reached the agent on geography alone has to carry both facts, or
// the chip cannot tell the agent which kind of Verify it is looking at.
const bareRow = toRecommendationRow(102, bareInArea.recommendations[0], "san_antonio", "2026-11-04T20:00:00.000Z")
ok("a no-policy row is stored with the softened tier",
  (bareRow.screening as { tier: string }).tier === "needs_verification")
ok("…and with policyOnRecord false, which is what the chip leads with",
  (bareRow.screening as { policyOnRecord: boolean }).policyOnRecord === false)
ok("…and the geographic reason that justified it",
  String((bareRow.screening as { geography: string }).geography).includes("Stone Oak"))

console.log("\n═══ THE BADGE reads only what it recognises")
ok("a valid screening record is read", readScreening(row.screening)?.tier === rec.tier)
ok("a row with no screening renders no chip", readScreening(null) === null && readScreening(undefined) === null)
ok("a row with an unknown tier renders no chip", readScreening({ tier: "excellent" }) === null)
ok("a non-object renders no chip", readScreening("quick_match") === null)
// curated_only was a chip until this release. A row carrying it is now unreadable rather than
// rendered under a label that no longer exists.
ok("the retired 'No policy' tier renders no chip", readScreening({ tier: "curated_only" }) === null)
ok("missing arrays become empty, never undefined",
  readScreening({ tier: "needs_verification" })?.unverified?.length === 0)
ok("an absent policyOnRecord is read as NO policy, which is the safe direction",
  readScreening({ tier: "needs_verification" })?.policyOnRecord === false)
ok("…and a true one is carried through",
  readScreening({ tier: "strong_candidate", policyOnRecord: true })?.policyOnRecord === true)
ok("the geographic line is read when present",
  readScreening({ tier: "needs_verification", geography: "In Stone Oak" })?.geography === "In Stone Oak")
ok("…and an empty one is null rather than a blank paragraph",
  readScreening({ tier: "needs_verification", geography: "  " })?.geography === null)

console.log("\n═══ SOURCE DISCIPLINE — the promises a grep can hold")
{
  const read = (f: string) => readFileSync(f, "utf8")
  const strip = (b: string) => b.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1")

  const persist = strip(read("lib/quickMatch/persist.ts"))
  // EVERY delete must be scoped three ways. A delete missing any one of them could reach a row
  // the agent picked or kept, which is the single worst thing this feature could do.
  const deletes = persist.split(".delete()").slice(1)
  ok("persist.ts issues exactly one delete", deletes.length === 1)
  ok("…and it is scoped to this lead, to our own origin, AND to unreviewed",
    deletes.every((d) => {
      const tail = d.slice(0, 400)
      return /\.eq\("lead_id"/.test(tail) && /\.eq\("origin", QUICK_MATCH_ORIGIN\)/.test(tail)
        && /\.is\("reviewed_at", null\)/.test(tail)
    }), deletes.map((d) => d.slice(0, 120)).join(" || "))
  ok("the insert is an upsert that IGNORES a duplicate, so the agent's row wins",
    /ignoreDuplicates: true/.test(persist) && /onConflict: "lead_id,canonical_property_key"/.test(persist))
  ok("persist.ts never touches lead_favorites, a share, a message or a schedule",
    !/lead_favorites|client_recommendation_share|lead_tours|messages|twilio/i.test(persist))

  const route = strip(read("app/api/admin/quick-match/[leadId]/route.ts"))
  ok("the route never uses the service role",
    !/supabase\/admin|supabaseAdmin|SERVICE_ROLE/.test(route))
  ok("…and refuses an unauthenticated caller before reading anything",
    /auth\.getUser\(\)/.test(route) && /401/.test(route))
  ok("GET is read-only: it never calls the persistence layer",
    (() => {
      const get = route.slice(route.indexOf("export async function GET"), route.indexOf("export async function POST"))
      return !/persistQuickMatch|markQuickMatchRun|\.insert\(|\.upsert\(|\.delete\(|\.update\(/.test(get)
    })())
  ok("the automatic pass respects the stamp, so a removed property is not resurrected",
    /!wantRefresh && alreadyRan/.test(route) && /already_ran/.test(route))
  ok("the stamp is written only AFTER a successful persist",
    route.indexOf("persistQuickMatch") < route.indexOf("markQuickMatchRun"))

  const dry = strip(read("scripts/quickMatch/dryRun.ts"))
  ok("the dry-run harness writes NOTHING",
    !/\.insert\(|\.upsert\(|\.update\(|\.delete\(|\.rpc\(/.test(dry))

  // ── THE WORKFLOW INVARIANTS, held by grep rather than by assurance ──────────────────────
  // Each of these is a promise made about the release. A grep is a weak proof of a behaviour and
  // a strong proof of an ABSENCE, which is exactly what these are.
  const repoFiles = (dir: string): string[] =>
    execSync(`find ${dir} -type f \\( -name '*.ts' -o -name '*.tsx' \\)`, { encoding: "utf8" })
      .split("\n").filter(Boolean)
  const surfaces = [...repoFiles("components"), ...repoFiles("app"), ...repoFiles("lib")]

  // 1. ONE SECTION, NO NEW PANEL. The chip is rendered by the existing Recommended Properties
  //    list and nothing else; a second consumer would mean a second surface.
  const badgeUsers = surfaces.filter((f) => !f.endsWith("QuickMatchBadge.tsx") && /QuickMatchBadge/.test(read(f)))
  ok("the Quick Match chip is rendered by exactly one surface",
    badgeUsers.length === 1, badgeUsers.join(" "))
  ok("…and that surface is the existing Recommended Properties list",
    badgeUsers[0] === "components/crm/BestMatches.tsx")
  ok("no Quick Match page or tab was added under app/",
    repoFiles("app").filter((f) => /quick-?match/i.test(f) && !f.includes("/api/")).length === 0)
  ok("…and the only Quick Match route is the one API endpoint",
    repoFiles("app").filter((f) => /quick-match/i.test(f)).length === 1)

  // 2. TOP PICK IS UNTOUCHED. It lives on leads.top_pick_favorite_id and in lead_favorites;
  //    Quick Match writes lead_recommendations and one timestamp.
  const qmDir = repoFiles("lib/quickMatch").map(read).join("\n") + route + strip(read("components/crm/QuickMatchBadge.tsx"))
  ok("nothing in Quick Match reads or writes the Top Pick",
    !/top_pick|topPick/i.test(qmDir))
  ok("…nor lead_favorites, where favourites and their order live",
    !/lead_favorites/.test(qmDir))
  ok("…and the only tables it writes are lead_recommendations and leads.quick_match_at",
    (() => {
      const writes = (persist + route).match(/from\("([a-z_]+)"\)/g) ?? []
      const tables = new Set(writes.map((w) => w.slice(6, -2)))
      return [...tables].every((t) => ["lead_recommendations", "leads", "property_catalog"].includes(t))
    })())

  // 3. UNLEASH BEAST. Quick Match borrows its centroid resolution and its distance function and
  //    touches nothing else; Unleash, for its part, knows nothing about Quick Match.
  const qmImports = repoFiles("lib/quickMatch").map(read).join("\n")
    .match(/from "@\/lib\/propertyExplorer\/[a-zA-Z]+"/g) ?? []
  ok("Quick Match borrows from Unleash only multiArea, commuteMode and types",
    [...new Set(qmImports)].every((i) => /multiArea|commuteMode|types/.test(i)),
    [...new Set(qmImports)].join(" "))
  ok("no Unleash module imports Quick Match",
    repoFiles("lib/propertyExplorer").every((f) => !/quickMatch/.test(read(f))))
  ok("the search, shortlist and ranking modules are not imported by Quick Match at all",
    !/propertySearch|beastShortlist|nameSearch|suggestions|locationFit/.test(qmImports))

  // AND THE WHOLE RELEASE, not only its imports: no Unleash Beast file is touched. An earlier
  // draft widened resolveDesiredAreaAnchors inside multiArea.ts; it was reverted, and this is
  // what keeps it reverted. BASELINE is the production commit the release is cut from, so a
  // rebase that moves it makes these fail rather than quietly check nothing.
  const BASELINE = "4cae1a4"
  const haveBaseline = (() => {
    try { execSync(`git cat-file -e ${BASELINE}^{commit}`, { stdio: "ignore" }); return true } catch { return false }
  })()
  ok("the release baseline commit is present, so the diffs below are real", haveBaseline)
  const touched = (paths: string) => haveBaseline
    ? execSync(`git diff --name-only ${BASELINE} -- ${paths}`, { encoding: "utf8" }).trim()
    : "the baseline commit is missing"
  ok("the release changes nothing under lib/propertyExplorer — Unleash's search, filters, ranking",
    touched("lib/propertyExplorer") === "", touched("lib/propertyExplorer"))
  ok("…nor the Explorer UI, its toolbar or its navigation",
    touched("components/crm/explorer components/crm/BeastPropertyExplorer.tsx") === "",
    touched("components/crm/explorer components/crm/BeastPropertyExplorer.tsx"))
  ok("…nor the market centroid catalogue both of them read",
    touched("lib/markets/catalog.ts") === "", touched("lib/markets/catalog.ts"))
  // Unleash reads exactly one RPC. No migration in this release redefines it or its grants.
  const releaseSqlFiles = execSync(`git diff --name-only ${BASELINE} -- supabase`, { encoding: "utf8" })
    .split("\n").filter((f) => f.endsWith(".sql") && existsSync(f))
  const releaseSql = releaseSqlFiles.map(read).join("\n")
  const isRollback = (f: string) => /(^|\/)ROLLBACK_/.test(f)
  const sqlOf = (files: string[]) =>
    files.map(read).join("\n").split("\n").map((l) => l.replace(/--.*$/, "")).join("\n")
  const forwardSql = sqlOf(releaseSqlFiles.filter((f) => !isRollback(f)))
  const rollbackSql = sqlOf(releaseSqlFiles.filter(isRollback))
  ok("no migration in this release redefines Unleash's lb_property_catalog_by_ids",
    !/(create|replace|drop|alter)\s+(or\s+replace\s+)?function\s+[a-z_.]*lb_property_catalog_by_ids/i.test(releaseSql))
  // THE GRANTS ON IT DO CHANGE, AND THAT IS THE POINT OF 20261115000001. This guard used to
  // forbid any grant or revoke naming the function, which was right while the release carried no
  // SQL; the approved security migration revokes EXECUTE from anon and from public and restates
  // the authenticated grant that was always intended. So what is asserted now is the END STATE —
  // nothing may hand this function back to anon or public — which is strictly more than the old
  // blanket check, because that one would have passed a file containing no grants at all.
  //
  // Comments are stripped first: the migration quotes the ORIGINAL `… to anon, authenticated;`
  // grant in its header to explain what it is undoing, and a blanket regex reads that quote as a
  // live statement.
  const grantsOf = (sql: string) => sql.match(/grant\s+execute[^;]*lb_property_catalog_by_ids[^;]*;/gi) ?? []
  ok("…no migration this release APPLIES grants it to anon or to public",
    !/grant[^;]*lb_property_catalog_by_ids[^;]*\bto\b[^;]*\b(anon|public)\b/i.test(forwardSql))
  ok("…every grant it receives goes to authenticated and nothing else",
    grantsOf(forwardSql).every((s) => /\bto\s+authenticated\s*;/i.test(s)), grantsOf(forwardSql).join(" | "))
  ok("…and anon and public are both revoked from it",
    /revoke\s+execute[^;]*lb_property_catalog_by_ids[^;]*from\s+anon\s*;/i.test(forwardSql) &&
      /revoke\s+execute[^;]*lb_property_catalog_by_ids[^;]*from\s+public\s*;/i.test(forwardSql))
  // The rollback is the one file that MAY hand it back, because undoing the revoke is its whole
  // job. Pinned, so an accidental no-op rollback is not mistaken for a safe one.
  ok("…while the rollback does restore the anon grant, which is what a rollback is for",
    /grant\s+execute[^;]*lb_property_catalog_by_ids[^;]*\bto\b[^;]*\banon\b/i.test(rollbackSql))

  // 4. AGENT-ONLY. The screening column must not be named by either share function.
  for (const m of ["supabase/prepared/20261114000001_lead_quick_match_state.sql"]) {
    // The share functions ARE named in this file — in a comment and in a COMMENT ON string that
    // records why the new column sits outside them. What must be absent is any statement that
    // touches them, which is what this looks for.
    const sql = read(m).replace(/--.*$/gm, "")
    ok("the state migration contains no statement that redefines or drops a share function",
      !/(create|replace|drop|alter)\s+(or\s+replace\s+)?function\s+\S*lb_(create|prepare)_client_share/i.test(sql))
    ok("…and no grant or revoke on one either",
      !/(grant|revoke)[\s\S]{0,120}lb_(create|prepare)_client_share/i.test(sql))
  }

  // The badge is agent-only. It must never be imported by a client-facing surface.
  for (const f of ["app/locator-beast/r/[token]/RecommendationList.tsx"]) {
    if (!existsSync(f)) { ok(`${f} — not present`, true); continue }
    ok(`the client-facing ${f.split("/").pop()} does not import the Quick Match badge`,
      !/QuickMatchBadge|readScreening|screening/.test(read(f)))
  }
}

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"} — ${pass} passed, ${fail} failed\n`)
process.exit(fail > 0 ? 1 : 0)
