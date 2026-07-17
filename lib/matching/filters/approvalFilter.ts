// Approval Filter — placeholder. Not implemented yet.
//
// Returns an inert, zero-impact result so lib/matching/filters/
// finalRankingEngine.ts can call every filter uniformly without changing
// the combined score.
//
// TODO(approval-filter): implement real scoring here. Related prior art
// already exists and is a likely starting point once this is built out:
//   - lib/matching/approvalFilter.ts — credit/eviction/felony
//     APPROVED/REVIEW/DENIED classification (not wired into production)
//   - lib/matching/managementApprovalFilter.ts — management-company
//     approval-friendliness bonus (computed but not scored in
//     components/crm/LeadInsights.tsx today)
//   - components/crm/LeadInsights.tsx's own inline CREDIT / BROKEN LEASE /
//     EVICTION / CRIMINAL BACKGROUND / MANAGEMENT FLEXIBILITY blocks,
//     which currently do this scoring live in production and would need
//     to be migrated here to fully consolidate.

import type { FilterResult } from "./types"

export function runApprovalFilter(lead: any, property: any): FilterResult {
  return { score: 0, reasons: ["Not Implemented"], status: "not_implemented" }
}
