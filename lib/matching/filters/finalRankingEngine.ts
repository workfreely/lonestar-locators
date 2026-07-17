// Final Ranking Engine — combines the independent filter outputs into a
// single 0-100 match score.
//
// v1 status: Location Filter is the only filter with real scoring today;
// Approval / Budget / Property Preference are inert placeholders
// (score: 0), so the combined total below currently equals the Location
// Filter's score alone.
//
// NOT wired into components/crm/LeadInsights.tsx yet. That component's own
// calculateMatchScore (credit, eviction, bedrooms, budget, property type,
// city, management flexibility, plus this same Location Filter logic via
// runLocationFilter) remains the live production path, unchanged — so
// existing recommendation scores and ordering are unaffected by this file.
//
// TODO(final-ranking): once Approval / Budget / Property Preference have
// real scoring, migrate components/crm/LeadInsights.tsx to call
// runFinalRanking() instead of its own inline scoring, retiring the
// duplicate inline logic at that point.

import type { FilterResult } from "./types"
import { runLocationFilter } from "./locationFilter"
import { runApprovalFilter } from "./approvalFilter"
import { runBudgetFilter } from "./budgetFilter"
import { runPropertyPreferenceFilter } from "./propertyPreferenceFilter"

export type FinalRankingResult = FilterResult & {
  filters: {
    location: FilterResult
    approval: FilterResult
    budget: FilterResult
    propertyPreference: FilterResult
  }
}

export function runFinalRanking(lead: any, property: any): FinalRankingResult {
  const location = runLocationFilter(lead, property)
  const approval = runApprovalFilter(lead, property)
  const budget = runBudgetFilter(lead, property)
  const propertyPreference = runPropertyPreferenceFilter(lead, property)

  const rawTotal = location.score + approval.score + budget.score + propertyPreference.score
  const score = Math.max(0, Math.min(100, Math.round(rawTotal)))

  const reasons = [
    ...location.reasons,
    ...approval.reasons,
    ...budget.reasons,
    ...propertyPreference.reasons,
  ]

  return {
    score,
    reasons,
    filters: { location, approval, budget, propertyPreference },
  }
}
