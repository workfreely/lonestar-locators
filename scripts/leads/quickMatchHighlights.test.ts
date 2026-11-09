// Quick Match's two written highlights — the location line and the screening label — and the
// composition that turns them into the three lines a client reads.
//
// Run: npx tsx scripts/leads/quickMatchHighlights.test.ts
import { readFileSync } from "node:fs"
import path from "node:path"
import { areaHighlightText, isAreaHighlight, LOCATION_SLOT_INDEX } from "@/lib/leads/locationHighlight"
import type { LocationInputs } from "@/lib/quickMatch/highlights"
import {
  screeningHighlight, quickMatchHighlights, locationHighlight,
  CREDIT_FRIENDLY, BACKGROUND_CASE_BY_CASE, BROKEN_LEASE_CASE_BY_CASE, EVICTION_CASE_BY_CASE,
  brokenLeaseYearsLabel, evictionYearsLabel,
} from "@/lib/quickMatch/highlights"
import { displayReasons, PRICING_SLOT_INDEX } from "@/lib/leads/bedroomPricing"
import { applyCommuteReason } from "@/lib/commute/commuteReason"
import { readScreeningFacts } from "@/lib/quickMatch/eligibility"
import type { Finding, QuickMatchProperty } from "@/lib/quickMatch/types"
import type { Recommendation } from "@/lib/quickMatch/ranking"
import { MAX_REASONS } from "@bc/companion-shared"

let pass = 0, fail = 0
const ok = (l: string, c: boolean) => { if (c) { pass++; console.log(`  ✓ ${l}`) } else { fail++; console.log(`  ✗ ${l}`) } }
const read = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8")

/** A member with every criterion unrecorded. Each test states ONLY what it is about. */
const prop = (over: Partial<QuickMatchProperty> = {}): QuickMatchProperty => ({
  placeId: "pid-1", propertyName: "Test Property", address: null, zip: null, websiteUrl: null,
  imageUrl: null, googleRating: null, currentSpecial: null, quickMatchCollection: "default",
  creditMinimumStatus: null, creditMinimumScore: null, creditObservedApprovalScore: null,
  creditScreeningNotes: null,
  brokenLeaseStatus: null, brokenLeaseMinAgeYears: null, brokenLeaseBalanceRequirement: null,
  brokenLeaseMaxBalance: null, brokenLeasePositiveHistoryRequired: null,
  evictionStatus: null, evictionMinAgeYears: null, evictionBalanceRequirement: null,
  evictionPositiveHistoryRequired: null,
  rentalDebtStatus: null, rentalDebtBalanceRequirement: null, rentalDebtMaxBalance: null,
  felonyPolicy: null, felonyMinAgeYears: null, felonyRestrictions: null,
  misdemeanorPolicy: null, misdemeanorMinAgeYears: null, misdemeanorRestrictions: null,
  criminalRestrictedOffenseTypes: null, criminalLookbackBasis: null, backgroundScreeningNotes: null,
  screeningAdditionalDeposit: null, screeningRiskFee: null, screeningGuarantorProgram: null,
  screeningRequirementsCheckedAt: null,
  bedsMin: null, bedsMax: null, onebrStartingRent: null, twobrStartingRent: null,
  threebrStartingRent: null, rentMin: null, latitude: 29.5, longitude: -98.5,
  ...over,
}) as QuickMatchProperty

const f = (field: string, verdict: Finding["verdict"], fromNotes = false): Finding =>
  ({ field, verdict, text: field, ...(fromNotes ? { fromNotes: true } : {}) })

const lowCredit = readScreeningFacts({ credit_score: 540 })
const evicted = readScreeningFacts({ credit_score: 540, credit_history: "Eviction", eviction_age: "5-7 years" })
const brokenLease = readScreeningFacts({ credit_score: 540, credit_history: "Broken Lease", broken_lease_age: "5-7 years" })
const felon = readScreeningFacts({ credit_score: 540, criminal_background: "Felony" })
const misdemeanant = readScreeningFacts({ credit_score: 540, criminal_background: "Misdemeanor" })

console.log("LOCATION — the band becomes a preposition, and the mileage is dropped:")
ok("in_area claims membership", areaHighlightText("in_area", "Medical Center") === "Located in Medical Center")
ok("adjacent does NOT claim membership", areaHighlightText("adjacent", "Medical Center") === "Next to Medical Center")
ok("nearby does NOT claim membership", areaHighlightText("nearby", "Westover Hills") === "Near Westover Hills")
ok("the client's own label is used verbatim", areaHighlightText("in_area", "Westover Hills") === "Located in Westover Hills")
ok("an unresolved band says nothing", areaHighlightText(null, "Medical Center") === null)
ok("a band outside the band set says nothing", areaHighlightText("destination_zip", "ZIP 78229") === null)
ok("a ZIP anchor says nothing even in a known band", areaHighlightText("in_area", "ZIP 78229") === null)
ok("a missing label says nothing", areaHighlightText("in_area", "   ") === null)
ok("a label too long for the editor says nothing rather than being truncated",
  areaHighlightText("in_area", "A".repeat(40)) === null)
ok("location owns slot one, pricing slot two", LOCATION_SLOT_INDEX === 0 && PRICING_SLOT_INDEX === 1)

console.log("\nNO MILES, NO MINUTES — a centroid distance is not a drive:")
for (const band of ["in_area", "adjacent", "nearby"] as const) {
  const t = areaHighlightText(band, "Medical Center") ?? ""
  ok(`${band} carries no distance or duration`,
    !/\d/.test(t) && !/\b(miles?|mins?|minutes?|drive|commute)\b/i.test(t))
}

console.log("\nPROVENANCE — only an UNEDITED generated line is replaceable:")
ok("our own output is recognised", isAreaHighlight("Located in Medical Center"))
ok("…in every band", isAreaHighlight("Next to Medical Center") && isAreaHighlight("Near Westover Hills"))
ok("an appended edit is NOT ours", !isAreaHighlight("Located in Medical Center, by the Rim"))
ok("a reworded edit is NOT ours", !isAreaHighlight("Right in the Medical Center"))
ok("an edit that only adds punctuation is NOT ours", !isAreaHighlight("Located in Medical Center!"))
ok("a drive time is not an area line", !isAreaHighlight("19 min to Fort Sam"))
ok("a price is not an area line", !isAreaHighlight("2BR from $1,679"))
ok("empty is not an area line", !isAreaHighlight("") && !isAreaHighlight(null))

console.log("\nSCREENING — Credit-Friendly, the default for this collection:")
ok("a client at the ceiling gets it", screeningHighlight(prop(), [], [], readScreeningFacts({ credit_score: 590 })) === CREDIT_FRIENDLY)
ok("a client below the ceiling gets it", screeningHighlight(prop(), [], [], lowCredit) === CREDIT_FRIENDLY)
ok("one point above the ceiling gets NOTHING",
  screeningHighlight(prop(), [], [], readScreeningFacts({ credit_score: 591 })) === null)
ok("no score on record gets nothing", screeningHighlight(prop(), [], [], readScreeningFacts({})) === null)
ok("a recorded minimum the client FAILS silences it",
  screeningHighlight(prop({ creditMinimumScore: 600 }), [f("credit", "fails")], [], lowCredit) === null)
ok("a recorded minimum the client meets still gets it",
  screeningHighlight(prop({ creditMinimumScore: 500 }), [f("credit", "meets")], [], lowCredit) === CREDIT_FRIENDLY)
ok("ANY open conflict silences the slot entirely",
  screeningHighlight(prop(), [], ["Restricts drug offenses, and the client's charge category is not recorded"], lowCredit) === null)

console.log("\nSCREENING — a dated policy the client clears, with the PROPERTY'S number:")
{
  const p = prop({ evictionStatus: "accepted", evictionMinAgeYears: 5 })
  const findings = [f("eviction_status", "meets"), f("eviction_min_age_years", "meets")]
  ok("the number comes from the property, not a constant",
    screeningHighlight(p, findings, [], evicted) === "Eviction 5+ Years OK")
  const p3 = prop({ evictionStatus: "accepted", evictionMinAgeYears: 3 })
  ok("a different property says its own number",
    screeningHighlight(p3, findings, [], evicted) === "Eviction 3+ Years OK")
  ok("it outranks the credit default", screeningHighlight(p, findings, [], evicted) !== CREDIT_FRIENDLY)
}
{
  const p = prop({ brokenLeaseStatus: "accepted", brokenLeaseMinAgeYears: 3 })
  ok("broken lease reads the same way",
    screeningHighlight(p, [f("broken_lease_status", "meets"), f("broken_lease_min_age_years", "meets")], [], brokenLease)
      === "Broken Lease 3+ Years OK")
}
ok("an UNRESOLVED balance condition in the family withholds the label",
  screeningHighlight(
    prop({ evictionStatus: "accepted_if_paid", evictionMinAgeYears: 5, evictionBalanceRequirement: "must_be_paid" }),
    [f("eviction_status", "meets"), f("eviction_min_age_years", "meets"), f("eviction_balance_requirement", "unknown")],
    [], evicted,
  ) === CREDIT_FRIENDLY)
ok("a minimum the client does NOT clear withholds the label",
  screeningHighlight(
    prop({ evictionStatus: "accepted", evictionMinAgeYears: 7 }),
    [f("eviction_status", "meets"), f("eviction_min_age_years", "unknown")],
    [], evicted,
  ) === CREDIT_FRIENDLY)
ok("an agent NOTE can never establish the label",
  screeningHighlight(
    prop({ evictionMinAgeYears: 5 }), [f("eviction_status", "meets", true)], [], evicted,
  ) === CREDIT_FRIENDLY)
ok("a client with no eviction never sees an eviction label",
  screeningHighlight(
    prop({ evictionStatus: "accepted", evictionMinAgeYears: 5 }),
    [f("eviction_status", "meets"), f("eviction_min_age_years", "meets")], [], lowCredit,
  ) === CREDIT_FRIENDLY)
ok("no recorded minimum means no dated claim, whatever the status says",
  screeningHighlight(prop({ evictionStatus: "accepted" }), [f("eviction_status", "meets")], [], evicted) === CREDIT_FRIENDLY)

console.log("\nSCREENING — individual review of a record the client actually has:")
ok("a case-by-case felony policy earns the label",
  screeningHighlight(prop({ felonyPolicy: "case_by_case" }), [f("felony_policy", "unknown")], [], felon) === BACKGROUND_CASE_BY_CASE)
ok("'considered' is also individual review",
  screeningHighlight(prop({ felonyPolicy: "considered" }), [f("felony_policy", "meets")], [], felon) === BACKGROUND_CASE_BY_CASE)
ok("a misdemeanor policy serves a misdemeanor client",
  screeningHighlight(prop({ misdemeanorPolicy: "case_by_case" }), [f("misdemeanor_policy", "unknown")], [], misdemeanant) === BACKGROUND_CASE_BY_CASE)
ok("a felony policy does NOT serve a misdemeanor-only client",
  screeningHighlight(prop({ felonyPolicy: "case_by_case" }), [f("felony_policy", "unknown")], [], misdemeanant) === CREDIT_FRIENDLY)
ok("'not considered' earns nothing — and the engine's own conflict silences the slot",
  screeningHighlight(
    prop({ felonyPolicy: "not_considered" }), [f("felony_policy", "fails")],
    ["Felony records are not considered, and the client has one on record"], felon,
  ) === null)
ok("…and even with no conflict recorded it never becomes a background label",
  screeningHighlight(prop({ felonyPolicy: "not_considered" }), [f("felony_policy", "fails")], [], felon) === CREDIT_FRIENDLY)
ok("an unrecorded policy earns nothing", screeningHighlight(prop(), [], [], felon) === CREDIT_FRIENDLY)
ok("a free-text restriction withholds the label",
  screeningHighlight(
    prop({ felonyPolicy: "case_by_case", felonyRestrictions: "non-violent only" }),
    [f("felony_policy", "unknown"), f("felony_restrictions", "unknown", true)], [], felon,
  ) === CREDIT_FRIENDLY)
ok("a failing lookback withholds the label",
  screeningHighlight(
    prop({ felonyPolicy: "case_by_case", felonyMinAgeYears: 10 }),
    [f("felony_policy", "unknown"), f("felony_min_age_years", "fails")], [], felon,
  ) === CREDIT_FRIENDLY)
ok("a dated eviction policy still outranks a background label",
  screeningHighlight(
    prop({ evictionStatus: "accepted", evictionMinAgeYears: 5, felonyPolicy: "case_by_case" }),
    [f("eviction_status", "meets"), f("eviction_min_age_years", "meets"), f("felony_policy", "unknown")],
    [], readScreeningFacts({ credit_score: 540, credit_history: "Eviction", eviction_age: "5-7 years", criminal_background: "Felony" }),
  ) === "Eviction 5+ Years OK")

console.log("\nTHE LABELS NEVER PROMISE APPROVAL:")
{
  const all = [
    CREDIT_FRIENDLY, BACKGROUND_CASE_BY_CASE, BROKEN_LEASE_CASE_BY_CASE, EVICTION_CASE_BY_CASE,
    brokenLeaseYearsLabel(3), evictionYearsLabel(5),
  ]
  ok("no label says approved, guaranteed, qualified or accepted",
    all.every((t) => !/\b(approv|guarantee|qualif|accepted|eligible)\w*/i.test(t)))
  ok("every label fits the editor's 40-character input", all.every((t) => t.length <= 40))
  ok("the approved wording is exact",
    brokenLeaseYearsLabel(3) === "Broken Lease 3+ Years OK" && evictionYearsLabel(5) === "Eviction 5+ Years OK"
    && CREDIT_FRIENDLY === "Credit-Friendly" && BACKGROUND_CASE_BY_CASE === "Background Case-by-Case"
    && BROKEN_LEASE_CASE_BY_CASE === "Broken Lease Case-by-Case" && EVICTION_CASE_BY_CASE === "Eviction Case-by-Case")
}

console.log("\nTWO WRITTEN, NEVER THREE — the price slot is left for the composers:")
{
  // The ZIP is what now earns "Located in": membership is PROVED against the curated list, and
  // the band no longer has any say in the wording. 78229 is the Medical Center ZIP.
  const rec = {
    property: prop({ zip: "78229" }),
    geo: { band: "in_area", applicable: true, miles: 0.9, anchorLabel: "Medical Center", reason: "In Medical Center", outsideReason: null },
    assessment: { outcome: "strong_candidate", findings: [], unverified: [], conflicts: [], conditions: [] },
    conflicts: [],
  } as unknown as Recommendation
  const inMedicalCenter: LocationInputs = {
    market: "San Antonio",
    requestedAreas: ["Medical Center"],
    driveTimeLineByPlaceId: new Map(),
  }
  const written = quickMatchHighlights(rec, lowCredit, inMedicalCenter)
  ok("location first, screening second", written.join("|") === "Located in Medical Center|Credit-Friendly")
  ok("never more than two are stored", written.length <= 2)
  ok("no price is ever stored", !written.some((t) => t.includes("$")))

  const shown = displayReasons(
    written, { onebrStartingRent: null, twobrStartingRent: 1679, threebrStartingRent: null },
    "2BR", MAX_REASONS,
  )
  ok("the composer lands the price between them",
    shown.join("|") === "Located in Medical Center|2BR from $1,679/month|Credit-Friendly")
  ok("three lines reach the client", shown.length === 3)

  const noPrice = displayReasons(
    written, { onebrStartingRent: null, twobrStartingRent: null, threebrStartingRent: null },
    "2BR", MAX_REASONS,
  )
  ok("with no bedroom rent the slot simply stays open, with no invented figure",
    noPrice.join("|") === "Located in Medical Center|Credit-Friendly")

  const unsupported = quickMatchHighlights(
    { ...rec, property: prop({ zip: null }), geo: { ...rec.geo, band: null, anchorLabel: null } } as unknown as Recommendation,
    readScreeningFacts({}),
    inMedicalCenter,
  )
  ok("nothing supportable means nothing written", unsupported.length === 0)
}

console.log("\nNO \"NEAR\" AND NO \"NEXT TO\" ARE GENERATED ANY MORE:")
{
  // The bands still choose and order the properties. They no longer choose any WORDING: an
  // approximation from a centroid is not an answer to "how convenient is this to my area?".
  const loc: LocationInputs = {
    market: "San Antonio",
    requestedAreas: ["Medical Center"],
    driveTimeLineByPlaceId: new Map(),
  }
  const outside = (band: string) =>
    locationHighlight(
      {
        property: prop({ zip: "78216" }),
        geo: { band, applicable: true, miles: 4.1, anchorLabel: "Medical Center", reason: null, outsideReason: null },
      } as unknown as Recommendation,
      loc,
    )
  ok("adjacent generates nothing on its own", outside("adjacent") === null)
  ok("nearby generates nothing on its own", outside("nearby") === null)
  ok("and neither does in_area without a ZIP that proves membership",
    locationHighlight(
      { property: prop({ zip: "78216" }), geo: { band: "in_area", anchorLabel: "Medical Center" } } as unknown as Recommendation,
      loc,
    ) === null)

  // A MEASURED figure is the only thing that fills the slot for a property outside the area.
  const withDrive: LocationInputs = {
    ...loc,
    driveTimeLineByPlaceId: new Map([["pid-1", "11 min to Medical Center"]]),
  }
  ok("a measured drive time fills the slot instead",
    locationHighlight(
      { property: prop({ zip: "78216" }), geo: { band: "nearby", anchorLabel: "Medical Center" } } as unknown as Recommendation,
      withDrive,
    ) === "11 min to Medical Center")

  // Rule 1 beats rule 2, and it beats the band too.
  ok("proven membership outranks a drive time",
    locationHighlight(
      { property: prop({ zip: "78229" }), geo: { band: "nearby", anchorLabel: "Medical Center" } } as unknown as Recommendation,
      withDrive,
    ) === "Located in Medical Center")
  ok("membership is checked against EVERY requested area, not just the nearest anchor",
    locationHighlight(
      { property: prop({ zip: "78251" }), geo: { band: "adjacent", anchorLabel: "Medical Center" } } as unknown as Recommendation,
      { ...loc, requestedAreas: ["Medical Center", "Westover Hills"] },
    ) === "Located in Westover Hills")

  // The retired wordings must not survive anywhere in the generator.
  const gen = readFileSync(path.join(process.cwd(), "lib/quickMatch/highlights.ts"), "utf8")
    .split("\n").filter((l) => !l.trim().startsWith("*") && !l.trim().startsWith("//")).join("\n")
  ok("highlights.ts no longer passes a band to the wording function",
    !/areaHighlightText\(\s*r\.geo\.band/.test(gen))
  ok("…and the only preposition it can produce is the membership one",
    /areaHighlightText\("in_area"/.test(gen) && !/"adjacent"|"nearby"/.test(gen))
}

console.log("\nMANUAL EDITS SURVIVE A LATER COMMUTE:")
{
  const generated = ["Located in Medical Center", CREDIT_FRIENDLY]
  const r = applyCommuteReason(generated, 19, "Fort Sam")
  ok("a drive time REPLACES the generated area line", r.reasons.join("|") === "19 min to Fort Sam|Credit-Friendly")
  ok("the array does not grow, so the price slot survives", r.reasons.length === 2)
  ok("the outcome names what happened", r.outcome === "replaced_area")
  ok("the composed result is still the approved three lines",
    displayReasons(r.reasons, { onebrStartingRent: null, twobrStartingRent: 1679, threebrStartingRent: null }, "2BR", MAX_REASONS)
      .join("|") === "19 min to Fort Sam|2BR from $1,679/month|Credit-Friendly")
}
{
  const edited = ["Located in Medical Center, by the Rim", CREDIT_FRIENDLY, "Great pool"]
  const r = applyCommuteReason(edited, 19, "Fort Sam")
  ok("an EDITED location line is never replaced", r.reasons.join("|") === edited.join("|"))
  ok("and the suppression is reported, not swallowed", r.outcome === "skipped_at_limit")
}
{
  const r = applyCommuteReason(["22 min to Fort Sam", CREDIT_FRIENDLY], 19, "Fort Sam")
  ok("an existing drive time is still updated in place", r.reasons.join("|") === "19 min to Fort Sam|Credit-Friendly")
  ok("…and reported as updated", r.outcome === "updated")
}
{
  const manual = ["Walk to work", "Quiet street", "Great pool"]
  const r = applyCommuteReason(manual, 19, "Fort Sam")
  ok("three manual reasons with no location line are untouched", r.reasons.join("|") === manual.join("|"))
  ok("…and the drive time is reported as withheld", r.outcome === "skipped_at_limit")
}

console.log("\nTHE WRITE PATH — guards that must not be edited away:")
{
  const persist = read("lib/quickMatch/persist.ts")
  // `eligibleKeys` since the backfill release — the draft still vouches for exactly the rows its
  // ignoreDuplicates upsert returned, which is what this has always been asserting.
  // The third argument is `loc` since the location release; the SECOND is still `data ?? []`,
  // which is the claim — the draft vouches for exactly the rows its upsert returned, nothing more.
  ok("only pairs this draft inserted are considered",
    /ignoreDuplicates: true/.test(persist) && /eligibleKeys/.test(persist)
    && /data \?\? \[\], facts, loc\)/.test(persist))
  ok("a non-empty reasons row is never overwritten", /occupied\.has\(key\)/.test(persist))
  ok("an all-blank row counts as empty", /String\(t \?\? ""\)\.trim\(\) !== ""/.test(persist))
  ok("only the reasons column is sent, so the commute cache survives",
    !/commute_minutes/.test(persist) && !/washer_dryer_status/.test(persist))
  ok("a highlight failure never fails its caller", /never fails its caller/i.test(persist))
  const hl = read("lib/quickMatch/highlights.ts")
  ok("no agent-facing screening text is read",
    !/assessment\.reasons|\.unverified|\.conditions|screening\.reasons/.test(hl))
  ok("the two lease case-by-case labels are documented as having no column",
    /no structured source/i.test(hl))
  // The criminal-background guard (scripts/tests/criminalBackground.test.ts) admits this module
  // to its allowlist on the strength of these four assertions. They are what keep the exception
  // narrow, so they belong beside the code they describe.
  ok("it reads only the two POLICY fields, never a charge, an age or a restriction",
    /felonyPolicy|misdemeanorPolicy/.test(hl)
    && !/criminalCharge|felonyAge|misdemeanorAge|offenseType|criminalBackground\b/.test(hl))
  ok("…and never a free-text note", !/backgroundScreeningNotes|creditScreeningNotes/.test(hl))
  ok("…and the only background string it can emit is the fixed label",
    (hl.match(/"Background[^"]*"/g) ?? []).every((t) => t === '"Background Case-by-Case"'))
  ok("a client's own charge can never reach a label",
    screeningHighlight(
      prop({ felonyPolicy: "case_by_case" }), [f("felony_policy", "unknown")], [],
      readScreeningFacts({ credit_score: 540, criminal_background: "Felony", criminal_charge: "Aggravated assault" }),
    ) === BACKGROUND_CASE_BY_CASE)
  const commute = read("app/api/admin/leads/commute/route.ts")
  ok("a replaced area line is written, not dropped", /outcome !== "replaced_area"/.test(commute))
  ok("withheld drive times are reported", /suppressed/.test(commute))
  const dash = read("components/crm/DashboardClient.tsx")
  ok("the written lines reach the workspace without a refetch", /body\.highlights/.test(dash))
  ok("the commute pass runs again after a draft", /if \(wrote && active\) mergeCommuteRows/.test(dash))
}

console.log(`\nQuick Match highlights: ${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
