// BALANCE AS AN OUTCOME, NOT AS A REQUEST.
//
// The planner's existing market order is a REQUEST made from the slot index:
//
//     wantMarket = order[slotIndex % order.length]
//
// which alternates perfectly while both markets have inventory, and drifts the moment one does
// not. With [San Antonio, Austin] and nothing fresh in Austin, every even slot asks for San
// Antonio and gets it, every odd slot asks for Austin and falls forward to San Antonio — so eight
// of eight placements are San Antonio and the next request is still decided by parity, which knows
// nothing about that. The request stayed balanced; the feed did not.
//
// This chooses from what was ACTUALLY PLACED: the least-posted permitted market, ties broken by
// the destination's own rotation order so the result is deterministic. When inventory is present
// in both markets the counts never differ by more than one and the output is identical to the
// parity rule — it is strictly a repair of the drift case, not a different policy.
//
// IT IS STILL ONLY A PREFERENCE. "Prefer a balanced rotation when approved content is available"
// is what this implements: it changes which market is ASKED for, and the planner's existing
// fallback still decides what happens when the answer is "nothing". The HARD restriction
// (market_restriction, lib/social/marketRestriction.ts) is a different mechanism entirely and is
// applied before any of this runs — a preference can reorder a candidate set, never widen it.
//
// Pure, and opt-in: a rule that does not ask for balancing keeps the parity rule byte for byte.

/**
 * Which market this slot should ask for.
 *
 * `order` is the destination's weighted, rotated market order — index 0 is what it would have
 * asked for first. `placed` is how many placements each market has ACHIEVED so far on this
 * destination, which the caller accumulates as it fills slots.
 *
 * Returns null only when there are no markets to choose from, which the planner already reads as
 * "no market preference for this slot".
 */
export function balancedMarketRequest(
  order: readonly string[],
  placed: ReadonlyMap<string, number>,
): string | null {
  if (order.length === 0) return null
  let best = order[0]
  let bestCount = placed.get(order[0]) ?? 0
  for (let i = 1; i < order.length; i++) {
    const m = order[i]
    const n = placed.get(m) ?? 0
    // Strict <, so a tie keeps the earlier position in the destination's own order. That is what
    // makes the first slot of a fresh queue match the parity rule rather than depending on how the
    // markets happen to sort.
    if (n < bestCount) { best = m; bestCount = n }
  }
  return best
}

/** The spread between the most- and least-posted market. 0 or 1 is balanced; higher means one
 *  market's inventory ran out and the fallback carried the slots. Reported rather than inferred. */
export function marketImbalance(order: readonly string[], placed: ReadonlyMap<string, number>): number {
  if (order.length === 0) return 0
  const counts = order.map((m) => placed.get(m) ?? 0)
  return Math.max(...counts) - Math.min(...counts)
}
