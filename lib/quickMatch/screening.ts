// Quick Match — does this property's stated policy fit this client's situation?
//
// ── THE AUTHORITY RULE, WHICH IS THE WHOLE DESIGN ───────────────────────────────────────────
// Two kinds of evidence exist about a property, and they are NOT equal:
//
//   STRUCTURED COLUMNS are a value the owner typed against a named requirement. They can settle
//   a question in either direction: they can make a property a Strong Candidate, and they can
//   rule it out as a Known Mismatch.
//
//   FREE-TEXT NOTES are an agent's sentence about a phone call. They can only ever RAISE a
//   question — Needs Verification, with the sentence quoted so the agent can judge it. A regex
//   over prose may never produce an acceptance or a rejection.
//
// The reason is asymmetric cost, and an error of mine proved it: scoring a note for broken-lease
// policy, I matched the singular "broken lease" and missed the PLURAL in "no collections, broken
// leases or evictions", and three properties that exclude broken leases came out as Strong
// Candidates. A phrase bank will always have another such gap. A typed column will not.
//
// So: a property with nothing but notes can never be more than Needs Verification, and a
// property with no evidence at all falls to `curated_only` — recommendable on the strength of
// human curation alone, ranked beneath everything else, and labelled as having no policy on
// record. It is never dressed up as a match.
//
// ── THE OTHER POLICIES THAT ARE ENCODED, NOT DOCUMENTED ─────────────────────────────────────
// • `credit_observed_approval_score` is a historical approval — somebody once got in at 450. It
//   is NOT a minimum. It cannot make a property Strong (the next applicant may be judged
//   differently) and it cannot rule one out (a lower score is not evidence of denial). It
//   contributes a Needs-Verification note and nothing else.
// • An UNKNOWN policy is never acceptance. Every null column widens the question instead of
//   narrowing it, and a client's issue the property says nothing about keeps that property out
//   of Strong Candidate however much else lines up.
// • Criminal background lives in ./criminal, where the offense/conviction asymmetry is proved.
import type {
  QuickMatchProperty, ScreeningAssessment, Finding, ScreeningOutcome, PolicyStatus,
  BalanceRequirement,
} from "./types"
import type { ScreeningFacts } from "./eligibility"
import { ageMeetsMinimum, balanceWithinCap, balanceIsPaidOff, type BucketVerdict } from "./buckets"
import {
  criminalPolicyVerdict, criminalPolicyLabel, lookbackVerdict, lookbackQuestion,
  restrictedOffenseVerdict, restrictedOffenseText, offenseLabel,
} from "./criminal"
import { CREDIT_CEILING } from "./eligibility"

const f = (field: string, verdict: BucketVerdict, text: string, fromNotes = false): Finding =>
  ({ field, verdict, text, fromNotes })

/**
 * Does a note mention the client's issue at all?
 *
 * Used ONLY to decide whether a free-text note is RELEVANT enough to raise a question. It never
 * decides acceptance. Both singular and plural, because of the bug described above — and even
 * with both, this is a relevance test, not a policy reader.
 */
function noteMentions(notes: string | null, kind: "broken_lease" | "eviction" | "debt" | "criminal"): boolean {
  if (!notes) return false
  const n = notes.toLowerCase()
  if (kind === "broken_lease") return /broken lease|broken leases|\bbl\b/.test(n)
  if (kind === "eviction") return /eviction|evictions/.test(n)
  if (kind === "criminal") return /felony|felonies|misdemeanor|misdemeanour|criminal|background|offense|offence|conviction|charge/.test(n)
  return /debt|collection|collections|balance owed|owe/.test(n)
}

/** The first sentence of a note that mentions the issue, for quoting back to the agent. */
function quoteAbout(notes: string | null, kind: "broken_lease" | "eviction" | "debt" | "criminal"): string | null {
  if (!notes) return null
  for (const line of notes.split(/\n+/)) {
    for (const sentence of line.split(/(?<=[.;])\s+/)) {
      if (noteMentions(sentence, kind)) return sentence.trim().slice(0, 300)
    }
  }
  return noteMentions(notes, kind) ? notes.trim().slice(0, 300) : null
}

/** A policy status against "the client has this incident". */
function statusVerdict(status: PolicyStatus | null, paid: boolean | null): BucketVerdict {
  if (status === null) return "unknown"
  if (status === "not_accepted") return "fails"
  if (status === "accepted") return "meets"
  // accepted_if_paid — turns entirely on a fact the amount bucket cannot supply.
  return balanceIsPaidOff(paid)
}

const statusLabel = (status: PolicyStatus | null, noun: string): string =>
  status === "not_accepted" ? `${noun} are not accepted`
    : status === "accepted_if_paid" ? `${noun} accepted only if the balance is paid off`
    : `${noun} accepted`

/**
 * A balance REQUIREMENT against the one paid/unpaid fact we hold.
 *
 *   balance_ok        nothing to prove.                                        MEETS.
 *   must_be_paid      needs a settled balance; only the explicit paid flag can say so.
 *   payments_or_plan  a settled balance satisfies it outright; a payment plan is a fact the
 *                     intake does not record, so "still owed" is a QUESTION, not a failure.
 */
function balanceRequirementVerdict(req: BalanceRequirement, paid: boolean | null): BucketVerdict {
  if (req === "balance_ok") return "meets"
  if (req === "must_be_paid") return balanceIsPaidOff(paid)
  return paid === true ? "meets" : "unknown"
}

const balanceRequirementLabel = (req: BalanceRequirement): string =>
  req === "balance_ok" ? "An outstanding balance is acceptable"
    : req === "must_be_paid" ? "The balance must be paid in full"
    : "Payments toward the balance, or an established payment arrangement, are required"

/**
 * The client's rental-debt answer as a paid/unpaid fact.
 *
 * `paid` is settled, `owed` is not, and `payment_plan` means a balance exists under an
 * arrangement — which satisfies "payments or a plan" and fails "must be paid in full".
 */
function debtPaid(status: string | null): boolean | null {
  if (status === "paid" || status === "none") return true
  if (status === "owed") return false
  return null // payment_plan and null alike: not a settled balance, and not a bare refusal
}

/**
 * Assess one property against one client.
 *
 * Only the client's ACTUAL issues are checked. A client with no eviction is not measured against
 * an eviction policy, and a property's strictness about something the client does not have is
 * neither a point for nor against it.
 */
export function assessProperty(property: QuickMatchProperty, facts: ScreeningFacts): ScreeningAssessment {
  const findings: Finding[] = []
  const unverified: string[] = []
  const conflicts: string[] = []
  const conditions: string[] = []
  /** Did any STRUCTURED requirement actually apply? Strong is impossible without one. */
  let structuredChecks = 0

  const ask = (q: string) => { if (!unverified.includes(q)) unverified.push(q) }
  const conflict = (c: string) => { if (!conflicts.includes(c)) conflicts.push(c) }
  /** Issues whose gap a NOTE has already explained, so the coverage sweep below does not say it
   *  a second time in different words. The note version quotes the office's sentence, which is
   *  strictly more useful, so it wins. */
  const notedGaps = new Set<string>()

  // ── CREDIT ──────────────────────────────────────────────────────────────────
  if (property.creditMinimumStatus === "no_check_reported") {
    structuredChecks++
    findings.push(f("credit", "meets", "Credit score reportedly not checked"))
  } else if (property.creditMinimumScore !== null) {
    structuredChecks++
    if (facts.creditScore === null) {
      findings.push(f("credit", "unknown", `Reported minimum ${property.creditMinimumScore}; the client's score is not on record`))
      ask("The client's credit score is not recorded, so the reported minimum cannot be checked")
    } else if (facts.creditScore >= property.creditMinimumScore) {
      findings.push(f("credit", "meets", `Credit ${facts.creditScore} meets the reported minimum of ${property.creditMinimumScore}`))
    } else {
      findings.push(f("credit", "fails", `Credit ${facts.creditScore} is below the reported minimum of ${property.creditMinimumScore}`))
      conflict(`Stated credit minimum ${property.creditMinimumScore} is above the client's ${facts.creditScore}`)
    }
  } else if (property.creditObservedApprovalScore !== null) {
    // A historical approval only. Never a minimum, in either direction.
    findings.push(f("credit", "unknown",
      `A prior applicant was approved at ${property.creditObservedApprovalScore}. This is an observation, not a stated minimum`, true))
    ask(`No stated credit minimum; ${property.creditObservedApprovalScore} is one historical approval, not a policy`)
  }

  // ── BROKEN LEASE ────────────────────────────────────────────────────────────
  if (facts.hasBrokenLease) {
    let structuredHere = 0
    if (property.brokenLeaseStatus !== null) {
      structuredChecks++; structuredHere++
      const v = statusVerdict(property.brokenLeaseStatus, facts.brokenLeasePaid)
      findings.push(f("broken_lease_status", v, statusLabel(property.brokenLeaseStatus, "Broken leases")))
      if (v === "fails") conflict("Broken leases are not accepted, and the client has one on record")
      if (property.brokenLeaseStatus === "accepted_if_paid" && v === "unknown") {
        ask("Whether the client's broken-lease balance is paid off is not recorded — the intake's amount buckets cannot express a zero balance")
      }
    }
    if (property.brokenLeaseMinAgeYears !== null) {
      structuredChecks++; structuredHere++
      const v = ageMeetsMinimum(facts.brokenLeaseAge, property.brokenLeaseMinAgeYears)
      findings.push(f("broken_lease_min_age_years", v,
        `Requires the broken lease to be ${property.brokenLeaseMinAgeYears}+ years old; the client reports "${facts.brokenLeaseAge ?? "not recorded"}"`))
      if (v === "fails") conflict(`Requires the broken lease to be ${property.brokenLeaseMinAgeYears}+ years old; the client's is newer`)
      if (v === "unknown") ask(`The client's reported age bucket cannot be compared to a ${property.brokenLeaseMinAgeYears}-year requirement with certainty`)
    }
    if (property.brokenLeaseBalanceRequirement !== null) {
      structuredChecks++; structuredHere++
      const req = property.brokenLeaseBalanceRequirement
      const v = balanceRequirementVerdict(req, facts.brokenLeasePaid)
      findings.push(f("broken_lease_balance_requirement", v, balanceRequirementLabel(req)))
      if (v === "fails") conflict("The broken-lease balance must be paid in full, and the client's is not")
      if (v === "unknown") {
        ask(req === "must_be_paid"
          ? "The balance must be paid in full, and whether the client's broken-lease balance is paid off is not recorded — the intake's amount buckets cannot express a zero balance"
          : "Whether the client has made payments or arranged a plan is not recorded")
      }
    }
    if (property.brokenLeaseMaxBalance !== null) {
      structuredChecks++; structuredHere++
      const v = balanceWithinCap(facts.brokenLeaseAmount, property.brokenLeaseMaxBalance)
      findings.push(f("broken_lease_max_balance", v,
        `Accepts a balance up to $${property.brokenLeaseMaxBalance.toLocaleString()}; the client reports "${facts.brokenLeaseAmount ?? "not recorded"}"`))
      if (v === "fails") conflict(`The client's broken-lease balance is above the $${property.brokenLeaseMaxBalance.toLocaleString()} the property accepts`)
      if (v === "unknown") ask(`The client's balance bucket straddles the $${property.brokenLeaseMaxBalance.toLocaleString()} limit`)
    }
    if (property.brokenLeasePositiveHistoryRequired !== null) {
      structuredChecks++; structuredHere++
      // The intake records nothing about rental history SINCE the incident, so a requirement is
      // always a question and only "not required" is an answer.
      const v: BucketVerdict = property.brokenLeasePositiveHistoryRequired ? "unknown" : "meets"
      findings.push(f("broken_lease_positive_history_required", v,
        property.brokenLeasePositiveHistoryRequired
          ? "Requires positive rental history since the broken lease"
          : "Positive rental history since the broken lease is not required"))
      if (v === "unknown") ask("Requires positive rental history since the broken lease; the client's rental history since then is not recorded")
    }
    // Nothing structured at all — can the notes at least raise the question?
    if (structuredHere === 0) {
      const quote = quoteAbout(property.creditScreeningNotes, "broken_lease")
      if (quote) {
        findings.push(f("notes", "unknown", `Agent note mentions broken leases: "${quote}"`, true))
        ask("No structured broken-lease policy is recorded, so the client's broken lease has not been measured against anything \u2014 and the agent note above is not confirmed policy")
        notedGaps.add("broken_lease")
      }
    }
  }

  // ── EVICTION ────────────────────────────────────────────────────────────────
  if (facts.hasEviction) {
    let structuredHere = 0
    if (property.evictionStatus !== null) {
      structuredChecks++; structuredHere++
      const v = statusVerdict(property.evictionStatus, facts.evictionPaid)
      findings.push(f("eviction_status", v, statusLabel(property.evictionStatus, "Evictions")))
      if (v === "fails") conflict("Evictions are not accepted, and the client has one on record")
      if (property.evictionStatus === "accepted_if_paid" && v === "unknown") {
        ask("Whether the client's eviction balance is paid off is not recorded")
      }
    }
    if (property.evictionMinAgeYears !== null) {
      structuredChecks++; structuredHere++
      const v = ageMeetsMinimum(facts.evictionAge, property.evictionMinAgeYears)
      findings.push(f("eviction_min_age_years", v,
        `Requires the eviction to be ${property.evictionMinAgeYears}+ years old; the client reports "${facts.evictionAge ?? "not recorded"}"`))
      if (v === "fails") conflict(`Requires the eviction to be ${property.evictionMinAgeYears}+ years old; the client's is newer`)
      if (v === "unknown") ask(`The client's eviction age cannot be compared to a ${property.evictionMinAgeYears}-year requirement with certainty`)
    }
    if (property.evictionBalanceRequirement !== null) {
      structuredChecks++; structuredHere++
      const req = property.evictionBalanceRequirement
      const v = balanceRequirementVerdict(req, facts.evictionPaid)
      findings.push(f("eviction_balance_requirement", v, balanceRequirementLabel(req)))
      if (v === "fails") conflict("The eviction balance must be paid in full, and the client's is not")
      if (v === "unknown") ask("Whether the client's eviction balance is settled, or under an arrangement, is not recorded")
    }
    if (property.evictionPositiveHistoryRequired !== null) {
      structuredChecks++; structuredHere++
      const v: BucketVerdict = property.evictionPositiveHistoryRequired ? "unknown" : "meets"
      findings.push(f("eviction_positive_history_required", v,
        property.evictionPositiveHistoryRequired
          ? "Requires positive rental history since the eviction"
          : "Positive rental history since the eviction is not required"))
      if (v === "unknown") ask("Requires positive rental history since the eviction; the client's rental history since then is not recorded")
    }
    if (structuredHere === 0) {
      const quote = quoteAbout(property.creditScreeningNotes, "eviction")
      if (quote) {
        findings.push(f("notes", "unknown", `Agent note mentions evictions: "${quote}"`, true))
        ask("No structured eviction policy is recorded, so the client's eviction has not been measured against anything \u2014 and the agent note above is not confirmed policy")
        notedGaps.add("eviction")
      }
    }
  }

  // ── RENTAL DEBT ─────────────────────────────────────────────────────────────
  if (facts.hasRentalDebt) {
    let structuredHere = 0
    const paid = debtPaid(facts.rentalDebtStatus)
    if (property.rentalDebtStatus !== null) {
      structuredChecks++; structuredHere++
      const v = statusVerdict(property.rentalDebtStatus, paid)
      findings.push(f("rental_debt_status", v,
        property.rentalDebtStatus === "not_accepted" ? "Outstanding rental debt is not accepted"
          : property.rentalDebtStatus === "accepted_if_paid" ? "Rental debt accepted only if paid off"
          : "Outstanding rental debt is acceptable"))
      if (v === "fails") conflict("Outstanding rental debt is not accepted, and the client has a balance on record")
      if (v === "unknown") ask("Rental debt is accepted only if paid; whether the client's debt is settled is not recorded")
    }
    if (property.rentalDebtBalanceRequirement !== null) {
      structuredChecks++; structuredHere++
      const req = property.rentalDebtBalanceRequirement
      const v = balanceRequirementVerdict(req, paid)
      findings.push(f("rental_debt_balance_requirement", v, balanceRequirementLabel(req)))
      if (v === "fails") conflict("The rental-debt balance must be paid in full, and the client's is not")
      if (v === "unknown") ask("Whether the client's rental debt is settled, or under an arrangement, is not recorded")
    }
    if (property.rentalDebtMaxBalance !== null) {
      structuredChecks++; structuredHere++
      // The intake holds no DOLLAR figure for rental debt — only the paid/owed status — so a
      // ceiling can only ever be a question here. Saying so beats inventing a comparison.
      findings.push(f("rental_debt_max_balance", "unknown",
        `Accepts rental debt up to $${property.rentalDebtMaxBalance.toLocaleString()}; the client's balance is not recorded as an amount`))
      ask(`The property accepts rental debt up to $${property.rentalDebtMaxBalance.toLocaleString()}; the client's balance is not recorded as an amount`)
    }
    if (structuredHere === 0) {
      const quote = quoteAbout(property.creditScreeningNotes, "debt")
      if (quote) {
        findings.push(f("notes", "unknown", `Agent note mentions debt or collections: "${quote}"`, true))
        ask("No structured rental-debt policy is recorded, so the client's balance has not been measured against anything \u2014 and the agent note above is not confirmed policy")
        notedGaps.add("rental_debt")
      }
    }
  }

  // ── CRIMINAL BACKGROUND ─────────────────────────────────────────────────────
  // Felony and misdemeanor are assessed separately, because a property may weigh them very
  // differently — which is why they are separate columns on both sides.
  const criminalPairs: Array<{
    kind: "Felony" | "Misdemeanor"
    present: boolean
    policy: typeof property.felonyPolicy
    minAge: number | null
    restrictions: string | null
    reportedAge: string | null
    policyField: string
    ageField: string
  }> = [
    {
      kind: "Felony", present: facts.hasFelony, policy: property.felonyPolicy,
      minAge: property.felonyMinAgeYears, restrictions: property.felonyRestrictions,
      reportedAge: facts.felonyAge, policyField: "felony_policy", ageField: "felony_min_age_years",
    },
    {
      kind: "Misdemeanor", present: facts.hasMisdemeanor, policy: property.misdemeanorPolicy,
      minAge: property.misdemeanorMinAgeYears, restrictions: property.misdemeanorRestrictions,
      reportedAge: facts.misdemeanorAge, policyField: "misdemeanor_policy", ageField: "misdemeanor_min_age_years",
    },
  ]

  let criminalStructured = 0
  for (const c of criminalPairs) {
    if (!c.present) continue
    if (c.policy !== null) {
      structuredChecks++; criminalStructured++
      const v = criminalPolicyVerdict(c.policy)
      findings.push(f(c.policyField, v, criminalPolicyLabel(c.policy, c.kind)))
      if (v === "fails") conflict(`${c.kind} records are not considered, and the client has one on record`)
      if (c.policy === "case_by_case") {
        ask(`${c.kind} records are weighed case by case here — the outcome has to be confirmed with the leasing office`)
      }
    }
    if (c.minAge !== null) {
      structuredChecks++; criminalStructured++
      const v = lookbackVerdict(c.reportedAge, c.minAge, property.criminalLookbackBasis)
      const basisText = property.criminalLookbackBasis === "offense_date" ? "the offense date"
        : property.criminalLookbackBasis === "conviction_date" ? "the conviction date"
        : "a date the office has not specified"
      findings.push(f(c.ageField, v,
        `Requires ${c.minAge}+ years from ${basisText}; the client reports "${c.reportedAge ?? "not recorded"}"`))
      if (v === "fails") conflict(`Requires ${c.minAge}+ years from the conviction date; the client's ${c.kind.toLowerCase()} is newer`)
      if (v === "unknown") ask(lookbackQuestion(c.reportedAge, c.minAge, property.criminalLookbackBasis))
    }
    // The office's own sentence. A question, never a verdict — the authority rule. It is also a
    // DOCUMENTED RESTRICTION bearing on a record this client has, so it is reported as a potential
    // conflict for the agent to settle, not merely as a gap in our data.
    if (c.restrictions) {
      findings.push(f(`${c.kind.toLowerCase()}_restrictions`, "unknown",
        `${c.kind} restrictions as recorded: "${c.restrictions}"`, true))
      conflict(`${c.kind} restriction on record, in the office's own words: "${c.restrictions}"`)
      ask(`${c.kind} restrictions are recorded as free text ("${c.restrictions}") and have not been structured — read it against the client's charge`)
    }
  }

  // The restricted CATEGORIES apply to a client with any criminal record, since the set is not
  // split by felony/misdemeanor.
  if (facts.hasFelony || facts.hasMisdemeanor) {
    const restricted = property.criminalRestrictedOffenseTypes
    if (restricted && restricted.length > 0) {
      structuredChecks++; criminalStructured++
      const v = restrictedOffenseVerdict(restricted, facts.offenseType)
      findings.push(f("criminal_restricted_offense_types", v,
        restrictedOffenseText(restricted, facts.offenseType, facts.criminalCharge)))
      if (v === "fails" && facts.offenseType) {
        conflict(`Restricts ${offenseLabel(facts.offenseType)} offenses, which is the client's recorded charge`)
      }
      if (v === "unknown") {
        // A restriction we cannot clear is still a documented restriction. The agent is told it
        // exists AND what is missing, because those are two different things to act on.
        conflict(`Restricts ${restricted.map(offenseLabel).join(", ")}, and the client's charge category is not recorded`)
        ask(`The property restricts ${restricted.map(offenseLabel).join(", ")}; the client's charge category is not recorded`)
      }
    } else {
      // An empty selection means NO RESTRICTIONS RECORDED — never "every offense is accepted".
      ask("No restricted offense categories are recorded for this property, so the client's charge has not been measured against any")
    }
    const quote = quoteAbout(property.backgroundScreeningNotes, "criminal")
    if (quote) {
      findings.push(f("background_screening_notes", "unknown", `Background note: "${quote}"`, true))
      ask("The background note above is an agent's sentence, not a confirmed policy")
    }
  }

  // ── APPROVAL COSTS. Not pass/fail — the agent and client need to know them. ──
  if (property.screeningAdditionalDeposit) conditions.push(`Additional deposit: ${property.screeningAdditionalDeposit}`)
  if (property.screeningRiskFee) conditions.push(`Risk fee: ${property.screeningRiskFee}`)
  if (property.screeningGuarantorProgram) conditions.push(`Guarantor programme: ${property.screeningGuarantorProgram}`)

  const structured = findings.filter((x) => !x.fromNotes)

  // Which of the client's issues MUST be answered for this property to be a Strong Candidate?
  const required: string[] = []
  if (facts.creditScore !== null && facts.creditScore <= CREDIT_CEILING) required.push("credit")
  if (facts.hasBrokenLease) required.push("broken_lease")
  if (facts.hasEviction) required.push("eviction")
  if (facts.hasRentalDebt) required.push("rental_debt")
  if (facts.hasFelony) required.push("felony")
  if (facts.hasMisdemeanor) required.push("misdemeanor")

  // Which does this property actually state a structured requirement for?
  const covered = new Set<string>()
  if (property.creditMinimumStatus === "no_check_reported" || property.creditMinimumScore !== null) covered.add("credit")
  if (property.brokenLeaseStatus !== null || property.brokenLeaseMinAgeYears !== null
      || property.brokenLeaseBalanceRequirement !== null || property.brokenLeaseMaxBalance !== null
      || property.brokenLeasePositiveHistoryRequired !== null) covered.add("broken_lease")
  if (property.evictionStatus !== null || property.evictionMinAgeYears !== null
      || property.evictionBalanceRequirement !== null || property.evictionPositiveHistoryRequired !== null) covered.add("eviction")
  if (property.rentalDebtStatus !== null || property.rentalDebtBalanceRequirement !== null
      || property.rentalDebtMaxBalance !== null) covered.add("rental_debt")
  if (property.felonyPolicy !== null || property.felonyMinAgeYears !== null) covered.add("felony")
  if (property.misdemeanorPolicy !== null || property.misdemeanorMinAgeYears !== null) covered.add("misdemeanor")

  const ISSUE_LABEL: Record<string, string> = {
    credit: "credit minimum", broken_lease: "broken-lease", eviction: "eviction",
    rental_debt: "rental-debt", felony: "felony", misdemeanor: "misdemeanor",
  }
  const uncovered = required.filter((r) => !covered.has(r))
  for (const u of uncovered) {
    if (notedGaps.has(u)) continue
    ask(u === "credit"
      ? "This property states no credit minimum, so the client's score has not been measured against anything"
      : `This property states no structured ${ISSUE_LABEL[u]} policy, so the client's ${ISSUE_LABEL[u]} situation has not been measured against anything`)
  }

  // The verification date is only worth flagging when there IS something to have verified. On a
  // property with nothing on record it would repeat what `curated_only` already says.
  if (structuredChecks > 0 && !property.screeningRequirementsCheckedAt) {
    ask("The property's screening requirements have no verification date on record")
  }

  // ── THE TIER, AND THE ONE CONDITION A TEST FOUND MISSING ────────────────────────────────
  // Note the LAST clause of the Strong test: `findings.every(meets)`, over ALL findings and not
  // just the structured ones. A free-text note can never produce "meets" (the authority rule), so
  // this says: a property with an unresolved sentence about this client's kind of record cannot
  // be a Strong Candidate, however completely its structured columns line up.
  //
  // That was not true of the first version of this function, and the test
  // "free-text felony restrictions can only ever raise a question" caught it: a property with
  // felony_policy = considered and felony_restrictions = "Nothing assault related" came out
  // STRONG for a client whose recorded charge is Assault, because the sentence was filed as an
  // open question and open questions did not block Strong. The sentence IS the restriction. Until
  // somebody reads it against the client's charge, the honest answer is Needs Verification.
  const outcome: ScreeningOutcome =
    structured.some((x) => x.verdict === "fails") ? "known_mismatch"
      : structuredChecks > 0 && structured.length > 0 && uncovered.length === 0
        && findings.every((x) => x.verdict === "meets") ? "strong_candidate"
      : findings.length > 0 ? "needs_verification"
      : "curated_only"

  return { outcome, findings, unverified, conflicts, conditions }
}
