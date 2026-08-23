import type { ExplorerProperty } from "./types"
import { assessLocationFit, type ClientLocationContext } from "./locationFit"

/**
 * Beast Suggestions — which loaded results are worth starring for this client.
 *
 * COMPUTED, NEVER STORED. This is map-local state; nothing here writes to
 * lead_recommendations. A suggestion is an invitation for the agent to click
 * "+ Recommendation", not a decision made on their behalf.
 *
 * THE ONLY DEFENSIBLE SIGNAL WE HAVE
 * The map requests just id/name/address/location from Places — no rent, beds,
 * amenities or availability — and the client record gives us a market plus saved
 * area names. So the single piece of real evidence is: does this property's
 * address name one of the areas the client themselves chose? That is
 * "Preferred Area Match", and it is the ONLY thing that earns a star.
 *
 * Being merely inside the client's market is not enough. Every result of a search
 * centred on that market is in the market, so starring on that basis would star
 * everything and mean nothing.
 *
 * The cap is a ceiling, not a quota: with two matches we suggest two, with none we
 * suggest none. There is deliberately no scoring, ranking or percentage — the
 * properties either carry the evidence or they don't.
 */
export const MAX_SUGGESTIONS = 5

export type Suggestion = {
  /** Stable identity of the suggested property. */
  placeId: string
  /** Factual reason, shown verbatim on the card. Never a score. */
  reason: string
}

export function computeSuggestions(
  properties: ExplorerProperty[],
  client: ClientLocationContext | null,
): Map<string, Suggestion> {
  const out = new Map<string, Suggestion>()
  // No client, or no saved areas to match against → no evidence → no suggestions.
  if (!client || !client.desiredAreas?.trim()) return out

  for (const p of properties) {
    if (out.size >= MAX_SUGGESTIONS) break
    const fit = assessLocationFit(p, client)
    // ONLY an explicit area match. "Within Preferred Market" is not evidence here.
    if (fit?.label === "Preferred Area Match") {
      out.set(p.placeId, { placeId: p.placeId, reason: fit.reason })
    }
  }
  return out
}
