// Social Autopilot — headless canonical-property resolver (client). REUSES the exact
// Map/Explorer read-only search (loadGoogleMaps + Place.searchByText + nameSearchTextQuery) —
// no map, no CRM/tour logic, no second property source — then applies the pure confidence gate
// in propertyAutoMatch to decide whether ONE dominant match can be auto-applied.
//
// Returns the auto-match (or null) AND the raw candidates, so a caller can auto-fill on a clear
// win and otherwise leave the inferred text for the operator to confirm from suggestions.
import { loadGoogleMaps } from "@/lib/propertyExplorer/loadMaps"
import { nameSearchTextQuery } from "@/lib/propertyExplorer/nameSearch"
import { decideAutoMatch, type AutoMatchCandidate, type AutoMatchResult } from "@/lib/social/propertyAutoMatch"

export type ResolveResult = AutoMatchResult & { candidates: AutoMatchCandidate[] }

const EMPTY: ResolveResult = { match: null, ambiguous: false, candidates: [] }

/** Run the read-only property search for an inferred name and decide an auto-match. Never
 *  throws — if Maps can't load or the name is too short, returns an empty result (the caller
 *  simply keeps the inferred text and manual entry still works). */
export async function resolvePropertyMatch(
  inferredName: string | null | undefined,
  market: string | null | undefined,
): Promise<ResolveResult> {
  const name = (inferredName ?? "").trim()
  if (name.length < 3) return EMPTY
  try {
    const maps = await loadGoogleMaps()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const Place = (maps as any).places.Place
    const { places } = await Place.searchByText({
      fields: ["id", "displayName", "formattedAddress"],
      textQuery: nameSearchTextQuery(name),
      maxResultCount: 8,
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const candidates: AutoMatchCandidate[] = (places ?? [])
      .map((p: any) => ({ placeId: p.id as string, name: (p.displayName as string) ?? "", address: (p.formattedAddress as string) ?? null }))
      .filter((c: AutoMatchCandidate) => c.placeId && c.name)
    const decision = decideAutoMatch(name, market, candidates)
    return { ...decision, candidates }
  } catch {
    return EMPTY
  }
}
