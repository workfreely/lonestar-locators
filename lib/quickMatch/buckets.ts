// Quick Match — the arithmetic of the intake's BUCKETED screening answers.
//
// ── WHY THIS FILE EXISTS ────────────────────────────────────────────────────────────────────
// The Smart Form does not collect "how many years ago" or "how much do you owe". It collects a
// BUCKET, from HISTORY_AGE_OPTIONS and BALANCE_OPTIONS in lib/formOptions. A bucket is an
// INTERVAL, not a number, and the gaps matter: the age options run 1, 2, 3, 5, 7+ with no 4 and
// no 6, so "3 years" means "at least three, less than five".
//
// Comparing a bucket to a property requirement therefore has THREE outcomes, not two. A property
// wanting four years, against a client who answered "3 years", cannot be decided: the client may
// be at three (fails) or four (passes). Collapsing that to a yes or a no is the error this file
// exists to prevent — a false yes sends a renter to be declined, and a false no skips a property
// that would have approved them.
//
// So every comparison returns "meets" | "fails" | "unknown", and "unknown" is a real answer that
// the tiering layer turns into Needs Verification rather than guessing.
export type BucketVerdict = "meets" | "fails" | "unknown"

/** A half-open interval [lo, hi). hi === null means unbounded above. */
export type Interval = { lo: number; hi: number | null }

/**
 * HISTORY_AGE_OPTIONS → the span of ages the answer actually covers.
 *
 * "3 years" spans [3, 5) because the next option up is "5 years": a four-year-old lease has no
 * option of its own and is recorded here. Likewise "5 years" spans [5, 7). Being explicit about
 * that is what makes a four-year requirement come back "unknown" instead of a confident wrong
 * answer.
 */
export const AGE_BUCKETS: Record<string, Interval> = {
  "Less than 1 year": { lo: 0, hi: 1 },
  "1 year": { lo: 1, hi: 2 },
  "2 years": { lo: 2, hi: 3 },
  "3 years": { lo: 3, hi: 5 },
  "5 years": { lo: 5, hi: 7 },
  "7+ years": { lo: 7, hi: null },
}

/**
 * BALANCE_OPTIONS → the span of dollars the answer covers.
 *
 * NOTE THE FLOOR. The smallest option is "Less than $500", whose span starts at 0 but which a
 * client with NOTHING OUTSTANDING still has to pick, because the form offers no $0 and no
 * "paid in full". That is why `balanceIsPaidOff` below refuses to read any bucket as paid, and
 * why a property requiring a zero balance needs the separate `broken_lease_paid` fact.
 */
export const BALANCE_BUCKETS: Record<string, Interval> = {
  "Less than $500": { lo: 0, hi: 500 },
  "$500-$1,000": { lo: 500, hi: 1000 },
  "$1,000-$2,000": { lo: 1000, hi: 2000 },
  "$2,000-$5,000": { lo: 2000, hi: 5000 },
  "$5,000+": { lo: 5000, hi: null },
}

const interval = (table: Record<string, Interval>, answer: string | null | undefined): Interval | null => {
  if (typeof answer !== "string") return null
  return table[answer.trim()] ?? null
}

export const ageInterval = (answer: string | null | undefined) => interval(AGE_BUCKETS, answer)
export const balanceInterval = (answer: string | null | undefined) => interval(BALANCE_BUCKETS, answer)

/**
 * Does a bucketed age satisfy "must be at least `requiredYears` old"?
 *
 * meets   — every age in the bucket clears the bar (lo >= required)
 * fails   — no age in the bucket can clear it (hi <= required)
 * unknown — the bucket straddles the bar, or the answer is missing/unrecognised
 *
 * `hi <= required` is the right failure test for a half-open interval: "2 years" is [2, 3), so
 * against a three-year requirement its largest possible value is just under three and every
 * value in it fails. That is the Villas at Oakwell Farms boundary, decided by arithmetic rather
 * than by reading the wording twice.
 */
export function ageMeetsMinimum(answer: string | null | undefined, requiredYears: number | null | undefined): BucketVerdict {
  if (requiredYears === null || requiredYears === undefined) return "unknown"
  const iv = ageInterval(answer)
  if (!iv) return "unknown"
  if (iv.lo >= requiredYears) return "meets"
  if (iv.hi !== null && iv.hi <= requiredYears) return "fails"
  return "unknown"
}

/**
 * Does a bucketed balance satisfy "must be at or under `maxDollars`"?
 *
 * The bucket is inclusive of its own top for this purpose — "$1,000-$2,000" against a $2,000
 * cap meets, because every dollar figure the client could have meant is within the cap.
 */
export function balanceWithinCap(answer: string | null | undefined, maxDollars: number | null | undefined): BucketVerdict {
  if (maxDollars === null || maxDollars === undefined) return "unknown"
  const iv = balanceInterval(answer)
  if (!iv) return "unknown"
  if (iv.hi !== null && iv.hi <= maxDollars) return "meets"
  if (iv.lo > maxDollars) return "fails"
  return "unknown"
}

/**
 * Is the client's broken-lease balance PAID OFF?
 *
 * Deliberately ignores the amount bucket entirely. No bucket can express zero — a client who
 * settled their balance still has to answer "Less than $500" — so reading "Less than $500" as
 * paid would be an invention, and reading it as unpaid would deny a client who owes nothing.
 * Only the explicit `broken_lease_paid` fact can answer this, and until it is recorded the
 * honest verdict is "unknown".
 */
export function balanceIsPaidOff(paid: boolean | null | undefined): BucketVerdict {
  if (paid === true) return "meets"
  if (paid === false) return "fails"
  return "unknown"
}

/** The weakest verdict wins: one unknown makes the whole conjunction unknown, one fail fails it. */
export function allOf(verdicts: BucketVerdict[]): BucketVerdict {
  if (verdicts.some((v) => v === "fails")) return "fails"
  if (verdicts.some((v) => v === "unknown")) return "unknown"
  return verdicts.length > 0 ? "meets" : "unknown"
}
