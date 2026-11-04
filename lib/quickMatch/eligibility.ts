// Quick Match — who the feature is FOR.
//
// Quick Match exists for applicants whose credit, rental history or criminal background makes
// ordinary approval uncertain. Eligibility is a statement about the CLIENT only; it says nothing
// about any property, and it is never a judgement about the person.
//
// ── THE RULE THAT SHAPES THIS FILE ──────────────────────────────────────────────────────────
// Missing information is NOT a screening problem. A blank credit score means nobody has asked
// yet, not that the score is low; an empty eviction field means the question went unanswered,
// not that there was an eviction. Treating silence as a problem would route clients with a
// half-filled form into a credit-challenged workflow they may have no need for, so every
// trigger below requires a POSITIVE signal.
//
// The partner trap is the opposite one: a NEGATIVE answer is also not a problem. The intake
// records "No" in eviction_court for a client with no eviction and "None" in
// criminal_background for a client with no record, and the pre-existing
// lib/matching/approvalFilter.ts derives hasEviction from `eviction_court != null`, which reads
// that "No" as an eviction. That is why this file derives its own facts rather than reusing
// deriveBooleans: the sentinel set below is the difference between the two.
import { ageInterval, balanceInterval } from "./buckets"
import { OFFENSE_TYPE_OPTIONS, type OffenseType } from "@/lib/propertyIntel/approvalCriteria"

/** Answers that mean "nothing to report". A field holding one of these is a CLEAN answer. */
const NEGATIVE = new Set([
  "", "no", "none", "n/a", "na", "no history", "clean", "false", "0", "$0",
  "no criminal background", "no record",
])

const isPositive = (v: unknown): boolean => {
  if (v === null || v === undefined) return false
  if (typeof v === "boolean") return v
  if (typeof v === "number") return v > 0
  return !NEGATIVE.has(String(v).trim().toLowerCase())
}

/**
 * The client's CRIMINAL_CHARGE_OPTIONS answer → the property's OFFENSE_TYPES token.
 *
 * Not a new mapping: the labels in OFFENSE_TYPE_OPTIONS (the property editor's chips) are the
 * SAME STRINGS as CRIMINAL_CHARGE_OPTIONS (the intake's list) — "DWI", "Drug Related",
 * "Assault", "Theft / Fraud", "Sex Offense", "Other". Matching on the label is therefore a
 * lookup, not an interpretation, and a label that changes on one side stops matching loudly
 * (returns null → the category is treated as unrecorded) rather than silently mis-categorising
 * somebody's charge.
 */
export function offenseTypeFromCharge(charge: string | null | undefined): OffenseType | null {
  const t = String(charge ?? "").trim().toLowerCase()
  if (!t) return null
  const hit = OFFENSE_TYPE_OPTIONS.find((o) => o.label.toLowerCase() === t)
  return (hit?.value as OffenseType) ?? null
}

export type ScreeningFacts = {
  creditScore: number | null
  /** CREDIT_HISTORY_OPTIONS: "Clean" | "Broken Lease" | "Eviction", or null if unanswered. */
  creditHistory: string | null
  hasBrokenLease: boolean
  brokenLeaseAge: string | null
  brokenLeaseAmount: string | null
  /** The separate paid/unpaid fact. null = not recorded, which is NOT "unpaid". */
  brokenLeasePaid: boolean | null
  hasEviction: boolean
  evictionAge: string | null
  evictionBalance: string | null
  evictionPaid: boolean | null
  /** Outstanding apartment debt or collections, as a positive signal only. */
  hasRentalDebt: boolean
  /** none | owed | paid | payment_plan, or null when nobody has asked. */
  rentalDebtStatus: string | null

  // ── CRIMINAL BACKGROUND ─────────────────────────────────────────────────────
  /** CRIMINAL_BACKGROUND_OPTIONS: "None" | "Misdemeanor" | "Felony", or null. */
  criminalBackground: string | null
  hasFelony: boolean
  hasMisdemeanor: boolean
  felonyAge: string | null
  misdemeanorAge: string | null
  /** The charge category, mapped to the property vocabulary. null = not recorded. */
  offenseType: OffenseType | null
  /** The intake's own wording, for quoting back. */
  criminalCharge: string | null
}

/**
 * Read a lead row into the facts Quick Match reasons over.
 *
 * `credit_history` is the authoritative answer to "has there been a broken lease or an
 * eviction", because it is the question the form actually asks. The age and balance fields
 * corroborate it — a client who named an age clearly has the incident — but a "Clean" history
 * is never overridden by a stray age value. `criminal_background` plays the same role for the
 * criminal questions, and "None" is likewise never overridden.
 */
export function readScreeningFacts(lead: Record<string, unknown> | null | undefined): ScreeningFacts {
  const l = lead ?? {}
  const str = (k: string): string | null => {
    const v = l[k]
    return typeof v === "string" && v.trim() !== "" ? v.trim() : null
  }
  const history = str("credit_history")
  const historyIs = (want: string) => (history ?? "").toLowerCase() === want

  const scoreRaw = l["credit_score"]
  const score = typeof scoreRaw === "number" ? scoreRaw
    : Number.isFinite(Number(scoreRaw)) && scoreRaw !== null && scoreRaw !== "" ? Number(scoreRaw) : null

  const blAge = str("broken_lease_age")
  const blAmt = str("broken_lease_amount")
  const evAge = str("eviction_age")
  const evBal = str("eviction_balance")

  // A broken lease is established by the history answer, or by the client having supplied an age
  // or amount for one. An age/amount that is not a recognised bucket is ignored rather than
  // trusted — it cannot be reasoned over anyway.
  const hasBrokenLease = historyIs("broken lease") || ageInterval(blAge) !== null || balanceInterval(blAmt) !== null

  // Eviction, with the sentinel guard. `eviction_court` holding "No" is a clean answer.
  const hasEviction = historyIs("eviction") || ageInterval(evAge) !== null || balanceInterval(evBal) !== null
    || isPositive(l["eviction_court"])

  const debtStatus = str("rental_debt_status")
  // "none" and "paid" are both ANSWERS, and neither is an outstanding debt. Only a recorded
  // balance still owed — or a payment plan, which means a balance exists — is a positive signal.
  const hasRentalDebt = debtStatus === "owed" || debtStatus === "payment_plan"
    || isPositive(l["apartment_debt"]) || isPositive(l["owes_apartment"])

  // ── CRIMINAL ────────────────────────────────────────────────────────────────
  // The intake's single-valued answer, plus the two age fields. A client whose record holds both
  // a felony and a misdemeanor can only pick one in criminal_background, so the age fields are
  // read INDEPENDENTLY rather than as detail on that one answer: a misdemeanor age beside a
  // "Felony" answer means both, not a contradiction.
  const criminalBackground = str("criminal_background")
  const bg = (criminalBackground ?? "").toLowerCase()
  const clearOfRecord = bg !== "" && NEGATIVE.has(bg)
  const felAge = str("felony_age")
  const misAge = str("misdemeanor_age")
  const hasFelony = !clearOfRecord && (bg === "felony" || ageInterval(felAge) !== null)
  const hasMisdemeanor = !clearOfRecord && (bg === "misdemeanor" || ageInterval(misAge) !== null)
  const charge = str("criminal_charge")

  const tri = (k: string): boolean | null => (typeof l[k] === "boolean" ? (l[k] as boolean) : null)

  return {
    creditScore: score !== null && Number.isFinite(score) ? score : null,
    creditHistory: history,
    hasBrokenLease, brokenLeaseAge: blAge, brokenLeaseAmount: blAmt, brokenLeasePaid: tri("broken_lease_paid"),
    hasEviction, evictionAge: evAge, evictionBalance: evBal, evictionPaid: tri("eviction_paid"),
    hasRentalDebt, rentalDebtStatus: debtStatus,
    criminalBackground,
    hasFelony, hasMisdemeanor,
    felonyAge: felAge, misdemeanorAge: misAge,
    offenseType: clearOfRecord ? null : offenseTypeFromCharge(charge),
    criminalCharge: clearOfRecord ? null : charge,
  }
}

/** The inclusive credit ceiling. 590 triggers Quick Match; 591 does not. */
export const CREDIT_CEILING = 590

export type Eligibility = {
  eligible: boolean
  /** Every trigger that fired, in the order the policy lists them. Agent-facing. */
  reasons: string[]
}

/**
 * Is this client a Quick Match candidate?
 *
 * Any ONE trigger is enough:
 *   • a credit score at or below 590 — INCLUSIVE, so 590 qualifies and 591 does not;
 *   • a broken lease, whatever the score;
 *   • an eviction, whatever the score;
 *   • outstanding apartment debt or collections, whatever the score;
 *   • a felony or misdemeanor on record, whatever the score — a criminal background is screened
 *     property by property, so it is exactly the case Quick Match exists to work through.
 *
 * A client with no positive signal is not eligible, and that includes a client about whom
 * nothing is known yet.
 */
export function evaluateEligibility(lead: Record<string, unknown> | null | undefined): Eligibility {
  const f = readScreeningFacts(lead)
  const reasons: string[] = []
  if (f.creditScore !== null && f.creditScore <= CREDIT_CEILING) {
    reasons.push(`Credit score ${f.creditScore} is at or below ${CREDIT_CEILING}`)
  }
  if (f.hasBrokenLease) reasons.push("Broken lease on record")
  if (f.hasEviction) reasons.push("Eviction on record")
  if (f.hasRentalDebt) reasons.push("Outstanding apartment debt or collections on record")
  if (f.hasFelony) {
    reasons.push(f.criminalCharge
      ? `Felony on record (${f.criminalCharge}) — needs property-specific screening`
      : "Felony on record — needs property-specific screening")
  }
  if (f.hasMisdemeanor) {
    reasons.push(f.criminalCharge
      ? `Misdemeanor on record (${f.criminalCharge}) — needs property-specific screening`
      : "Misdemeanor on record — needs property-specific screening")
  }
  return { eligible: reasons.length > 0, reasons }
}
