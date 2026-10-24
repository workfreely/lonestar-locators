// WHICH SECONDARY ACTION A FAVORITE'S PROPERTY ROW OFFERS.
//
// Schedule Tour, Tour Follow-Up and Check Application share ONE slot on the card, beside Guest Card
// Sent. They are consecutive moments in the same workflow — you schedule before a tour, you record
// the outcome after it happened, you check the application once one was submitted — so offering two
// at once would put an action on screen that cannot apply.
//
// Tour Follow-Up used to live in its own row at the bottom of the card, carrying a "TOURED" label
// and the tour's date and time beside it. That row restated what the action already says and cost a
// whole band of card height, so the action moved up here and the row went away. Moving it INTO this
// resolver is what keeps the guarantee: the slot holds one value, so "both" stays unrepresentable
// rather than merely avoided by the markup remembering to.
//
// Pure, and in lib/ rather than the component, so the rule can be stated per case in a test
// without dragging React and a browser Supabase client in with it.

/** Exactly one, or none. "Both" is deliberately not representable. */
export type FavoriteSecondaryAction = "check_application" | "tour_follow_up" | "schedule_tour" | null

export function favoriteSecondaryAction(input: {
  /** An open (incomplete) check_application action exists for this property. */
  checkApplicationOpen: boolean
  /** The screen supplied a handler for it. */
  canCheckApplication: boolean
  /** This property's tour has ALREADY OCCURRED and its open tour_follow_up action is still
   *  awaiting an outcome. False for an upcoming tour, which keeps its own scheduled display. */
  tourFollowUpOpen?: boolean
  /** The screen supplied a Tour Follow-Up handler. */
  canTourFollowUp?: boolean
  /** A tour is already scheduled for this property. */
  hasScheduledTour: boolean
  /** The screen supplied a Schedule Tour handler. */
  canScheduleTour: boolean
  /** A real scheduling URL resolved (tour_url, else website_url). */
  hasScheduleTarget: boolean
}): FavoriteSecondaryAction {
  // PRECEDENCE IS WORKFLOW ORDER, LATEST FIRST. Each step is the one still awaiting an answer at
  // its moment, so the later state wins whenever two could qualify from the data:
  //
  //   check_application  an application is in and its result is outstanding
  //   tour_follow_up     the tour happened; its outcome is what creates the application
  //   schedule_tour      no tour yet
  //
  // In practice they rarely collide — Schedule Tour hides once a tour exists, and an open
  // check_application implies a tour already happened — but stating the precedence means a card can
  // never offer two, whatever the data looks like.
  if (input.checkApplicationOpen && input.canCheckApplication) return "check_application"
  if (input.tourFollowUpOpen && input.canTourFollowUp) return "tour_follow_up"
  if (!input.hasScheduledTour && input.canScheduleTour && input.hasScheduleTarget) return "schedule_tour"
  return null
}
