// Pure selector for the ONE tour to surface against a Favorite Property. Kept
// DB-free so it's unit-testable and shared by the Workspace display. lead_tours
// remains the single source of truth — this never mutates or invents a tour.

export type TourLike = {
  scheduled_at: string
  status?: string | null
  property_id?: number | string | null
  lead_id?: number | string | null
}

/**
 * The relevant UPCOMING scheduled tour from a set (already narrowed to one
 * Favorite by the caller). Rules:
 *   - only status === "scheduled" counts (completed/canceled are excluded);
 *   - only tours at/after `now` are "upcoming" — a past appointment is not shown
 *     so a Favorite never surfaces a stale old tour;
 *   - when several are upcoming, the SOONEST wins.
 * Returns null when nothing qualifies (caller renders nothing extra).
 */
export function selectUpcomingTour<T extends TourLike>(tours: T[], now: number = Date.now()): T | null {
  const upcoming = tours
    .filter((t) => (t.status ?? "scheduled") === "scheduled")
    .filter((t) => {
      const ts = new Date(t.scheduled_at).getTime()
      return Number.isFinite(ts) && ts >= now
    })
    .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())
  return upcoming[0] ?? null
}

/** The upcoming tour for a specific Favorite (matches lead_tours.property_id). */
export function upcomingTourForFavorite<T extends TourLike>(
  tours: T[],
  favoriteId: number | string,
  now: number = Date.now(),
): T | null {
  const forFav = tours.filter((t) => t.property_id != null && String(t.property_id) === String(favoriteId))
  return selectUpcomingTour(forFav, now)
}
