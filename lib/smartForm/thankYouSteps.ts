// Builds the renter-facing "what happens next" step flow for the thank-you page.
// Pure + testable, and fully multi-agent: every dynamic value comes from the
// current agent/workspace (name, brokerage, optional apply-instruction override,
// optional incentive). Nothing is hardcoded to any specific agent or brokerage.

export type ThankYouStep = {
  title: string
  body: string
  /** Step 1 (the just-submitted form) renders as completed. */
  done?: boolean
}

export function buildThankYouSteps(input: {
  agentName: string
  brokerage?: string | null
  /** Optional agent override for the apply-step copy; blank uses the default. */
  applyInstructions?: string | null
  /** Optional client incentive/reward; the reward step shows ONLY when non-blank. */
  incentive?: string | null
}): ThankYouStep[] {
  const agent = (input.agentName ?? "").trim() || "your locator"
  const brokerage = (input.brokerage ?? "").trim()
  const override = (input.applyInstructions ?? "").trim()
  const incentive = (input.incentive ?? "").trim()

  const applyBody = override
    ? override
    : `When you're ready to apply, select Realtor or Apartment Locator and list ${agent}${
        brokerage ? ` with ${brokerage}` : ""
      } so the property knows who helped you.`

  const steps: ThankYouStep[] = [
    { title: "Tell us what you're looking for", body: "Your search details are in.", done: true },
    {
      title: "Get your personalized apartment list",
      body: "We'll narrow down the best options based on your budget, move date, preferred areas, current pricing, specials, and what fits your search.",
    },
    {
      title: "Tour your favorites",
      body: "Once you narrow down your options, we'll help coordinate tours and answer questions along the way.",
    },
    { title: "Apply with your locator listed", body: applyBody },
  ]

  // Conditional reward step — only when the agent has configured an incentive.
  if (incentive) {
    steps.push({
      title: "Move in and get rewarded",
      body: `After you move in and your lease is confirmed, you'll receive ${incentive}.`,
    })
  }

  return steps
}
