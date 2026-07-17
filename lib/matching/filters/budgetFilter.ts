// Budget Filter — placeholder. Not implemented yet.
//
// Returns an inert, zero-impact result so lib/matching/filters/
// finalRankingEngine.ts can call every filter uniformly without changing
// the combined score.
//
// TODO(budget-filter): implement real scoring here. The existing live
// logic to migrate lives in components/crm/LeadInsights.tsx's inline
// BUDGET block (compares property.price_value against lead.desired_rent,
// guideline-only, not a hard filter today).

import type { FilterResult } from "./types"

export function runBudgetFilter(lead: any, property: any): FilterResult {
  return { score: 0, reasons: ["Not Implemented"], status: "not_implemented" }
}
