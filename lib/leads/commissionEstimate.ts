// ─── Commission projection ──────────────────────────────────────────────────
// How a single lead's commission is ESTIMATED for dashboard pipeline/projection
// figures. Chosen per-account via the Sales Goals "Projection Method" setting
// (profiles.projection_method). Kept as one account-wide setting — no per-market
// commission — to keep onboarding simple.

export type ProjectionMethod = "avg_commission" | "lead_budget"

export const DEFAULT_PROJECTION_METHOD: ProjectionMethod = "avg_commission"

// Lower end of a lead's budget range. Budgets are free-form strings like
// "$1,800 - $1,900", "1800-1900", or a single "$1,800" — pull every number and
// take the smallest. Returns null when there's no usable figure.
export function parseLowerBudget(desiredRent: string | null | undefined): number | null {
  if (!desiredRent) return null
  const matches = String(desiredRent).match(/\d[\d,]*(?:\.\d+)?/g)
  if (!matches) return null
  const nums = matches
    .map((m) => Number(m.replace(/,/g, "")))
    .filter((n) => !Number.isNaN(n) && n > 0)
  if (nums.length === 0) return null
  return Math.min(...nums)
}

// Estimated commission for one lead under the given projection method.
// - "avg_commission": every lead is worth the account's avg commission.
// - "lead_budget":    the lower end of the lead's budget range, falling back to
//                     the average when the lead has no usable budget.
export function estimateLeadCommission(
  lead: any,
  method: ProjectionMethod,
  avgCommission: number,
): number {
  if (method === "lead_budget") {
    const lower = parseLowerBudget(lead?.desired_rent)
    if (lower !== null) return lower
  }
  return avgCommission
}

// Sum of estimated commission across a set of leads.
export function sumEstimatedCommission(
  leads: any[],
  method: ProjectionMethod,
  avgCommission: number,
): number {
  return leads.reduce((total, lead) => total + estimateLeadCommission(lead, method, avgCommission), 0)
}
