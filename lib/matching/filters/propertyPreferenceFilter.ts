// Property Preference Filter — placeholder. Not implemented yet.
//
// Returns an inert, zero-impact result so lib/matching/filters/
// finalRankingEngine.ts can call every filter uniformly without changing
// the combined score.
//
// TODO(property-preference-filter): implement real scoring here. The
// existing live logic to migrate lives in components/crm/LeadInsights.tsx's
// inline PROPERTY TYPE and BEDROOMS blocks (synonym-matched property type
// vs. lead.property_type, and bedroom-count proximity vs. lead.beds).

import type { FilterResult } from "./types"

export function runPropertyPreferenceFilter(lead: any, property: any): FilterResult {
  return { score: 0, reasons: ["Not Implemented"], status: "not_implemented" }
}
