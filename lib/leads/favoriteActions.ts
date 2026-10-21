// WHICH SECONDARY ACTION A FAVORITE'S PROPERTY ROW OFFERS.
//
// Schedule Tour and Check Application share one slot on the card, beside Guest Card Sent. They
// belong to different moments — you schedule before a tour, you check an application after one was
// submitted — so offering both would put an action on screen that cannot apply.
//
// Pure, and in lib/ rather than the component, so the rule can be stated per case in a test
// without dragging React and a browser Supabase client in with it.

/** Exactly one, or none. "Both" is deliberately not representable. */
export type FavoriteSecondaryAction = "check_application" | "schedule_tour" | null

export function favoriteSecondaryAction(input: {
  /** An open (incomplete) check_application action exists for this property. */
  checkApplicationOpen: boolean
  /** The screen supplied a handler for it. */
  canCheckApplication: boolean
  /** A tour is already scheduled for this property. */
  hasScheduledTour: boolean
  /** The screen supplied a Schedule Tour handler. */
  canScheduleTour: boolean
  /** A real scheduling URL resolved (tour_url, else website_url). */
  hasScheduleTarget: boolean
}): FavoriteSecondaryAction {
  // Check Application outranks Schedule Tour: it is the later workflow state, and the one still
  // awaiting an answer. In practice they rarely collide — Schedule Tour hides once a tour exists,
  // and an open check_application implies a tour happened — but stating the precedence means a
  // card can never offer both, whatever the data looks like.
  if (input.checkApplicationOpen && input.canCheckApplication) return "check_application"
  if (!input.hasScheduledTour && input.canScheduleTour && input.hasScheduleTarget) return "schedule_tour"
  return null
}
