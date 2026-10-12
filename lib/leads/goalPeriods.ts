// ONE STORED GOAL, TWO VIEWS OF IT.
//
// Sales Goals shows a Monthly and a Yearly commission goal, and the dashboard shows a monthly and
// a yearly progress bar. Only the MONTHLY figure is stored (profiles.monthly_commission_goal).
// The yearly figure is derived here, and the yearly INPUT writes back through here, so the two can
// never drift apart — $10,000/mo is $120,000/yr on every surface by construction rather than by
// two columns agreeing.
//
// Multiplication is exact. Division is the direction that can lose precision, so yearlyToMonthly
// rounds to whole dollars: a yearly figure that is not a multiple of 12 settles on the nearest
// month that is, and the yearly field then re-renders from that stored month. That is a visible,
// predictable settle rather than a hidden fraction accumulating in the database.
export const MONTHS_PER_YEAR = 12

/** The annual goal implied by a monthly one. Exact. */
export function monthlyToYearly(monthly: number): number {
  return monthly * MONTHS_PER_YEAR
}

/** The monthly goal implied by an annual one, to the nearest whole dollar. */
export function yearlyToMonthly(yearly: number): number {
  return Math.round(yearly / MONTHS_PER_YEAR)
}
