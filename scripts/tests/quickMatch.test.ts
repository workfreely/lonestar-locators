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
//   • a curated property with no policy on record is labelled as such and can never outrank one
//     that has been assessed;
//   • six is a ceiling and nothing pads the list up to it.
import {
  runQuickMatch, evaluateEligibility, assessProperty, readScreeningFacts,
  rankRecommendations, MAX_RECOMMENDATIONS, CREDIT_CEILING, offenseTypeFromCharge,
  criminalPolicyVerdict, lookbackVerdict, restrictedOffenseVerdict,
  type QuickMatchProperty, type ClientNeeds,
} from "@/lib/quickMatch"
import { ageMeetsMinimum, balanceWithinCap, balanceIsPaidOff } from "@/lib/quickMatch/buckets"
import { resolveClientNeeds, fiveDigitZip } from "@/lib/quickMatch/needs"
import { toRecommendationRow, QUICK_MATCH_ORIGIN } from "@/lib/quickMatch/persist"
import { readScreening } from "@/components/crm/QuickMatchBadge"
import { CRIMINAL_CHARGE_OPTIONS } from "@/lib/formOptions"
import { OFFENSE_TYPE_OPTIONS } from "@/lib/propertyIntel/approvalCriteria"
import { readFileSync, existsSync } from "node:fs"

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

console.log("\n═══ CURATED-ONLY — recommendable, labelled, and never above an assessed property")
const bare = prop({ placeId: "q1", propertyName: "No Policy On Record" })
const bareRun = runQuickMatch({ lead: { credit_score: 540 }, properties: [bare], needs: needs() })
ok("a curated member with no policy IS recommended", bareRun.recommendations.length === 1)
ok("…in its own tier", bareRun.recommendations[0].tier === "curated_only")
ok("…and the reason says NO screening policy is on record",
  bareRun.recommendations[0].reasons[0].includes("NO screening policy on record"))
ok("…and it does not claim anything is met",
  !bareRun.recommendations[0].reasons.some((r) => /requirement.*is met|compatible/i.test(r)))
ok("the tier counts report it separately", bareRun.tierCounts.curated_only === 1)
// The ordering guarantee: a curated-only property with EVERY housing term in its favour still
// ranks below a needs-verification property with every one against it.
const perfectBare = prop({ placeId: "q2", propertyName: "Perfect Fit, No Policy", zip: "78232",
  bedsMin: 1, bedsMax: 3, twobrStartingRent: 700 })
const awkwardAssessed = prop({ placeId: "q3", propertyName: "Assessed But Awkward", zip: "70000",
  creditObservedApprovalScore: 450, bedsMin: 4, bedsMax: 4, twobrStartingRent: 4000 })
const ordered = runQuickMatch({
  lead: { credit_score: 540 }, properties: [perfectBare, awkwardAssessed],
  needs: needs({ bedrooms: 2, budgetMax: 1200, destinationZip: "78232", preferredZips: ["78232"] }),
  travelMinutes: { q2: 5 },
})
ok("an ASSESSED property outranks a curated-only one however badly it fits",
  ordered.recommendations[0].property.placeId === "q3",
  ordered.recommendations.map((r) => `${r.property.placeId}:${r.tier}:${r.score}`).join(" "))
ok("…and both are still offered", ordered.recommendations.length === 2)

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
const noEstimate = rankRecommendations([{ property: far, assessment: assessProperty(far, c540), travelMinutes: null }],
  needs({ destinationZip: "78254", commuteLimitMinutes: 20 }))
ok("with no travel estimate the 20-minute limit is NOT claimed met",
  !noEstimate[0].reasons.some((x) => x.includes("within the 20-minute limit")))
ok("…it is reported as unconfirmed", noEstimate[0].unverified.some((u) => u.includes("20-minute limit is unconfirmed")))
ok("…even though the property is IN the destination ZIP",
  noEstimate[0].reasons.some((x) => x.includes("destination ZIP 78254")))
const withEstimate = rankRecommendations([{ property: far, assessment: assessProperty(far, c540), travelMinutes: 14 }],
  needs({ destinationZip: "78254", commuteLimitMinutes: 20, commuteDestinationLabel: "Fort Sam Houston" }))
ok("a real 14-minute estimate DOES satisfy a 20-minute limit",
  withEstimate[0].reasons.some((x) => x.includes("within the 20-minute limit")))
ok("…and names the destination the agent saved",
  withEstimate[0].reasons.some((x) => x.includes("Fort Sam Houston")))
const over = rankRecommendations([{ property: far, assessment: assessProperty(far, c540), travelMinutes: 35 }],
  needs({ destinationZip: "78254", commuteLimitMinutes: 20 }))
ok("a 35-minute estimate is reported as beyond the limit",
  over[0].reasons.some((x) => x.includes("beyond the 20-minute limit")))

console.log("\n═══ SURROUNDING AREAS are offered, and labelled as such")
const near = prop({ placeId: "s1", zip: "78248", creditMinimumStatus: "no_check_reported" })
const ranked = rankRecommendations([{ property: near, assessment: assessProperty(near, c540), travelMinutes: null }],
  needs({ preferredZips: ["78232"] }))
ok("a property outside the named ZIPs is still offered", ranked.length === 1)
ok("…and labelled a surrounding area rather than a stated preference",
  ranked[0].reasons.some((x) => x.includes("surrounding area rather than one the client named")))
const inZip = prop({ placeId: "s2", zip: "78232", creditMinimumStatus: "no_check_reported" })
ok("a property in a named ZIP says so",
  rankRecommendations([{ property: inZip, assessment: assessProperty(inZip, c540), travelMinutes: null }],
    needs({ preferredZips: ["78232"] }))[0].reasons.some((x) => x.includes("one of the client's preferred areas")))
ok("a preferred-ZIP property outranks a surrounding one",
  rankRecommendations([
    { property: near, assessment: assessProperty(near, c540), travelMinutes: null },
    { property: inZip, assessment: assessProperty(inZip, c540), travelMinutes: null },
  ], needs({ preferredZips: ["78232"] }))[0].property.placeId === "s2")

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
ok("…but a property with NOTHING on record does not repeat it as a separate gap",
  !runQuickMatch({ lead: { credit_score: 540 },
    properties: [prop({ placeId: "u2", screeningRequirementsCheckedAt: null })],
    needs: needs() }).recommendations[0].unverified.some((u) => u.includes("no verification date")))

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
  properties: [prop({ placeId: "ChIJwrite", propertyName: "Written", address: "9 Oak" })], needs: needs() }).recommendations[0]
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

console.log("\n═══ THE BADGE reads only what it recognises")
ok("a valid screening record is read", readScreening(row.screening)?.tier === rec.tier)
ok("a row with no screening renders no chip", readScreening(null) === null && readScreening(undefined) === null)
ok("a row with an unknown tier renders no chip", readScreening({ tier: "excellent" }) === null)
ok("a non-object renders no chip", readScreening("quick_match") === null)
ok("missing arrays become empty, never undefined",
  readScreening({ tier: "curated_only" })?.unverified?.length === 0)

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

  // The badge is agent-only. It must never be imported by a client-facing surface.
  for (const f of ["app/locator-beast/r/[token]/RecommendationList.tsx"]) {
    if (!existsSync(f)) { ok(`${f} — not present`, true); continue }
    ok(`the client-facing ${f.split("/").pop()} does not import the Quick Match badge`,
      !/QuickMatchBadge|readScreening|screening/.test(read(f)))
  }
}

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"} — ${pass} passed, ${fail} failed\n`)
process.exit(fail > 0 ? 1 : 0)
