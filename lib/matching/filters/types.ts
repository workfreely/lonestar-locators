// Shared result shape for every independent matching-engine filter.
// Each filter is a pure function: (lead, property) -> FilterResult.
export type FilterResult = {
  score: number
  reasons: string[]
  status?: string
}
