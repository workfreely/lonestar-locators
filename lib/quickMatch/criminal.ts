// Quick Match — criminal-background screening, which is the one part of this engine where the
// safe answer is asymmetric.
//
// ── WHY A LOOKBACK CANNOT BE COMPARED LIKE A BROKEN-LEASE AGE ────────────────────────────────
// A broken lease has one date. A criminal record has two — the OFFENSE date and the CONVICTION
// date — and they can sit years apart. The property editor records which one the leasing office
// counts from (`criminal_lookback_basis`), because "7 years" means two different things
// depending on the answer. The INTAKE does not: it asks "how long ago" and stores a bucket in
// `felony_age` / `misdemeanor_age` with no basis attached.
//
// So the comparison has a known bar on one side and an ambiguous measurement on the other, and
// only one direction of answer is safe in each case. The arithmetic, written out:
//
//   An offense never happens after its conviction, so  age_from_offense >= age_from_conviction.
//
//   Office counts from the OFFENSE date, client reports A:
//     if the client answered with the conviction age, the offense age is >= A;
//     if with the offense age, it is A.
//     Either way A >= required  ⟹  the offense age clears the bar.        MEETS IS SAFE.
//     A below the bar proves nothing: they may have answered from the conviction, and the
//     offense could still be old enough.                                   A FAIL IS NOT SAFE.
//
//   Office counts from the CONVICTION date, client reports A:
//     the conviction age is <= the offense age <= whichever A they meant,
//     so if A is ENTIRELY below the bar the conviction age is too.         FAILS IS SAFE.
//     A above the bar proves nothing: an old offense can carry a recent
//     conviction.                                                          A PASS IS NOT SAFE.
//
//   Office did not say which date it counts from:
//     the bar itself is ambiguous as well as the measurement.              NEITHER IS SAFE.
//
// The consequence, stated plainly rather than hidden: a lookback requirement will usually come
// back "unknown", and the property will be Needs Verification with the requirement quoted for
// the agent to settle on the phone. That is the honest output of the data we hold. Recording
// which date the client answered from is what would make these decidable, and it is a change to
// the intake, not to this file.
import type { BucketVerdict } from "./buckets"
import { ageInterval } from "./buckets"
import {
  OFFENSE_TYPE_OPTIONS, type CriminalPolicy, type LookbackBasis, type OffenseType,
} from "@/lib/propertyIntel/approvalCriteria"

/** The offense category's agent-facing label, from the editor's own option list. */
export const offenseLabel = (t: OffenseType): string =>
  OFFENSE_TYPE_OPTIONS.find((o) => o.value === t)?.label ?? t

/**
 * A stated criminal policy, against "this client has a record of that kind".
 *
 *   not_considered  the office does not consider the application.          FAILS.
 *   considered      the office WILL review it. That is a real, stated, positive policy — and it
 *                   is review, never approval, which the finding text says.
 *   case_by_case    undecidable in advance BY DEFINITION. The honest verdict is unknown, and the
 *                   property becomes Needs Verification rather than a quiet pass or a quiet no.
 *   null            nobody has asked. Unknown — and NEVER read as acceptance.
 */
export function criminalPolicyVerdict(policy: CriminalPolicy | null): BucketVerdict {
  if (policy === "not_considered") return "fails"
  if (policy === "considered") return "meets"
  return "unknown" // case_by_case and null alike
}

export const criminalPolicyLabel = (policy: CriminalPolicy | null, kind: "Felony" | "Misdemeanor"): string =>
  policy === "not_considered" ? `${kind} records are not considered`
    : policy === "considered" ? `${kind} records are considered — the office reviews the application, which is not approval`
    : policy === "case_by_case" ? `${kind} records are weighed case by case, so the outcome cannot be known in advance`
    : `No ${kind.toLowerCase()} policy is on record`

/**
 * Does the client's reported age clear the property's minimum lookback?
 *
 * See the proof at the top of this file. `meets` is reachable only from an offense-date basis
 * and `fails` only from a conviction-date basis; everything else is `unknown`.
 */
export function lookbackVerdict(
  reportedAge: string | null | undefined,
  requiredYears: number | null | undefined,
  basis: LookbackBasis | null,
): BucketVerdict {
  if (requiredYears === null || requiredYears === undefined) return "unknown"
  const iv = ageInterval(reportedAge)
  if (!iv) return "unknown"
  if (basis === "offense_date") return iv.lo >= requiredYears ? "meets" : "unknown"
  if (basis === "conviction_date") return iv.hi !== null && iv.hi <= requiredYears ? "fails" : "unknown"
  return "unknown"
}

/** Why a lookback came back unknown, in the agent's terms. Never shown for a decided verdict. */
export function lookbackQuestion(
  reportedAge: string | null,
  requiredYears: number,
  basis: LookbackBasis | null,
): string {
  const reported = reportedAge ? `"${reportedAge}"` : "nothing"
  if (basis === null) {
    return `Requires the record to be ${requiredYears}+ years old, but does not say whether that counts from the offense or the conviction date — confirm which, and the client's date`
  }
  const from = basis === "offense_date" ? "the offense date" : "the conviction date"
  return `Requires ${requiredYears}+ years from ${from}; the client reported ${reported} without saying which date that is measured from`
}

/**
 * Is the client's charge in the categories the property restricts?
 *
 *   The client's category is in the set            → FAILS, and it is a documented CONFLICT.
 *   The set is non-empty and the category unknown  → unknown; the restriction is the question.
 *   The set is non-empty and the category is not in it → MEETS.
 *   The set is null or empty                       → unknown. An empty selection means NO
 *                                                    RESTRICTIONS RECORDED, never "every
 *                                                    offense is accepted". That is the approved
 *                                                    reading and the whole reason the column is
 *                                                    nullable.
 */
export function restrictedOffenseVerdict(
  restricted: OffenseType[] | null,
  clientOffense: OffenseType | null,
): BucketVerdict {
  if (!restricted || restricted.length === 0) return "unknown"
  if (clientOffense === null) return "unknown"
  return restricted.includes(clientOffense) ? "fails" : "meets"
}

export function restrictedOffenseText(
  restricted: OffenseType[] | null,
  clientOffense: OffenseType | null,
  clientCharge: string | null,
): string {
  const list = (restricted ?? []).map(offenseLabel).join(", ")
  if (!restricted || restricted.length === 0) {
    return "No restricted offense categories are recorded, so the client's charge has not been measured against any"
  }
  if (clientOffense === null) {
    return `Restricts ${list}; the client's charge category is not recorded${clientCharge ? ` (intake says "${clientCharge}")` : ""}`
  }
  return restricted.includes(clientOffense)
    ? `Restricts ${list}, which includes the client's ${offenseLabel(clientOffense)} charge`
    : `Restricts ${list}; the client's charge is ${offenseLabel(clientOffense)}, which is not among them`
}
