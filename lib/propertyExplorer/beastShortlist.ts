import type { ExplorerProperty } from "./types"

// BEAST MATCHES vs ALL PROPERTIES — the map-view filter, as pure functions.
//
// ── THE BUG THIS FIXES ──────────────────────────────────────────────────────────────────────
// "Beast matches" were never a result set. Unleash runs the ordinary area search, which loads
// the whole surrounding inventory into `results`, and then DECORATES the winners: every other
// marker is dimmed to 0.22 opacity and the matches get a blue halo. The shortlist existed only
// as opacity on live Google marker objects.
//
// That makes it as durable as those objects. The marker effect calls clearMarkers() and rebuilds
// every pin whenever `visible`, `suggestions` or `onSelectProperty` changes identity — and the
// Dashboard passes `activeClient`, `recommendedUrls` and `onSelectProperty` as fresh literals on
// each of ITS renders. So adding a recommendation re-renders the Dashboard, the markers are
// destroyed and rebuilt at full opacity, and the surrounding inventory the agent never asked for
// snaps back into view around the eight they were working through. Nothing was "populated": it
// had been on the map all along, dimmed.
//
// Opacity is a decoration. Identity is a filter. These functions make the shortlist a set of ids
// held in React state, so a marker rebuild re-renders the SAME shortlist instead of losing it.

/** Shown when the run produced no ranked evidence. Matches the pre-existing fallback exactly. */
export const BEAST_SHORTLIST_FALLBACK_CAP = 10

export type MapFilterMode = "beast" | "all"

/**
 * The ids that make up one Unleash run's shortlist.
 *
 * DELIBERATELY IDENTICAL to what the halo pass already chose, so the filter and the halos can
 * never disagree about which properties are "the matches":
 *   • the ranked Beast Suggestions, in rank order, restricted to the ones actually plotted
 *     (a suggestion with no coordinates has no marker, and never had a halo either);
 *   • failing that, the first ten plotted properties — the existing gesture fallback.
 *
 * The ranked list arrives already capped at MAX_SUGGESTIONS, and is NOT re-capped here: capping
 * it again to the fallback number would silently change the ranked path's size.
 */
export function resolveShortlistIds(
  rankedIds: readonly string[],
  plottedIds: readonly string[],
  cap: number = BEAST_SHORTLIST_FALLBACK_CAP,
): string[] {
  const plotted = new Set(plottedIds)
  const ranked = rankedIds.filter((id) => plotted.has(id))
  // Dedupe while keeping first-seen order, so a repeated id cannot inflate the count.
  const seen = new Set<string>()
  const unique = (ids: readonly string[]) => ids.filter((id) => (seen.has(id) ? false : (seen.add(id), true)))
  return ranked.length > 0 ? unique(ranked) : unique(plottedIds).slice(0, Math.max(0, cap))
}

/**
 * Narrow what the map plots to the active shortlist.
 *
 * ORDER IS NOT TOUCHED. The surviving properties keep the order `visible` already had — the
 * search/result order the map has always plotted in — so this filters the view and changes no
 * ranking.
 *
 * The SELECTED property is always kept, even if it is not a match: the agent clicked it, its
 * detail panel is open, and pulling its marker out from under an open card would be its own bug.
 *
 * Returns the input array unchanged (same reference) whenever the filter is inactive, so React
 * sees no new identity and no marker rebuild happens on account of this function.
 */
export function applyShortlist<T extends ExplorerProperty>(
  visible: T[],
  shortlist: readonly string[] | null,
  mode: MapFilterMode,
  selectedPlaceId?: string | null,
): T[] {
  if (mode !== "beast" || shortlist === null) return visible
  const keep = new Set(shortlist)
  return visible.filter((p) => keep.has(p.placeId) || (!!selectedPlaceId && p.placeId === selectedPlaceId))
}

/**
 * Does the shortlist belong to the context now on screen?
 *
 * A shortlist is one client's. Carrying it into another client's session would show client A's
 * eight properties while the map claims to be working client B — so a changed client id (or the
 * loss of a client entirely) invalidates it. Changing MARKET invalidates it too: the results it
 * indexes are cleared by the market switch, so the ids would match nothing.
 */
export function shortlistStillValid(
  held: { clientId: string | number | null; marketSlug: string | null },
  current: { clientId: string | number | null; marketSlug: string | null },
): boolean {
  return (
    String(held.clientId ?? "") === String(current.clientId ?? "") &&
    String(held.marketSlug ?? "") === String(current.marketSlug ?? "")
  )
}
