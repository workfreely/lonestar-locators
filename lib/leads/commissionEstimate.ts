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

// ─── Closed-lead commission snapshot (frozen at close) ──────────────────────
// Historical Sales / Meta analytics must stay stable when an agent later changes
// their Sales Goals. So the moment a lead CLOSES we compute its estimated
// commission with the SAME canonical estimateLeadCommission above and freeze it
// on the lead (closed_estimated_commission + closed_estimation_method). There is
// no second formula — this reuses the one estimator, so a snapshot can never
// drift from what the dashboard would have shown for that lead at close time.

export type ClosedCommissionSnapshot = {
  closed_estimated_commission: number
  closed_estimation_method: ProjectionMethod
}

// Build the frozen snapshot for a lead that is closing right now, under the
// account's projection method + average commission AT THIS MOMENT.
export function resolveClosedCommissionSnapshot(
  lead: any,
  method: ProjectionMethod,
  avgCommission: number,
): ClosedCommissionSnapshot {
  return {
    closed_estimated_commission: estimateLeadCommission(lead, method, avgCommission),
    closed_estimation_method: method,
  }
}

// Coerce a persisted numeric (supabase-js may hand back `numeric` as a string).
function toNumberOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

// One closed lead's historical commission: the frozen snapshot when present,
// else a live estimate (legacy / pre-migration close). The single place that
// resolves "frozen or estimate" for one lead — reused by the sum below and by
// Meta Sales Analytics so both treat pre-snapshot closes identically.
export function toFrozenOrEstimate(
  frozen: unknown,
  lead: any,
  method: ProjectionMethod,
  avgCommission: number,
): number {
  return toNumberOrNull(frozen) ?? estimateLeadCommission(lead, method, avgCommission)
}

// Estimated commission across a set of CLOSED leads for HISTORICAL reporting.
// Prefers the frozen per-lead snapshot; falls back to a live estimate only for
// closes that predate the snapshot (legacy / pre-migration rows). This is what
// keeps Sales Analytics — and Meta ROAS — stable across Sales Goals changes,
// while never dropping an older close that has no snapshot yet.
export function sumClosedEstimatedCommission(
  closedLeads: any[],
  method: ProjectionMethod,
  avgCommission: number,
): number {
  return closedLeads.reduce(
    (total, lead) => total + toFrozenOrEstimate(lead?.closed_estimated_commission, lead, method, avgCommission),
    0,
  )
}
