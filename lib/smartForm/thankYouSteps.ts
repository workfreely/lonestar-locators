// Builds the renter-facing "what happens next" step flow + intro for the
// thank-you page. Pure + testable, and fully multi-agent: every dynamic value
// comes from the current agent/workspace (name, brokerage, city) or the agent's
// own optional overrides. Nothing is hardcoded to any specific agent/brokerage.
//
// Step 1 (the just-submitted form) is standardized and always "Completed".
// Steps 2-4 have editable title/body (blank => the defaults below). The reward
// step (5) is conditional on the agent enabling it.

export type ThankYouStep = {
  title: string
  body: string
  /** Step 1 (the just-submitted form) renders as completed. */
  done?: boolean
  /** Substrings of `body` the page should render in bold (e.g. the action to
   *  select + the agent/brokerage to list, in the default apply step). Only set
   *  to safe, known substrings of `body`; never set for agent-provided override
   *  text. */
  emphasis?: string[]
}

// Canonical defaults — shared by the page (fallbacks) and the editor (placeholder
// text), so the two can never drift.
export const THANKYOU_DEFAULTS = {
  intro:
    "You're one step closer to finding the perfect home in {city}. I'm already working on your best list of options and will be in touch soon.",
  introNoCity:
    "You're one step closer to finding the perfect home. I'm already working on your best list of options and will be in touch soon.",
  step1Title: "Tell us what you're looking for",
  step1Body: "Your search details are in.",
  step2Title: "Get your personalized apartment list",
  step2Body:
    "We'll narrow down the best options based on your budget, move date, preferred areas, current pricing, specials, and what fits your search.",
  step3Title: "Tour your favorites",
  step3Body: "Once you narrow down your options, we'll help coordinate tours and answer questions along the way.",
  step4Title: "List your locator when you apply",
  rewardTitle: "Move in and get rewarded",
  rewardBody: "Get free movers or a cash rebate for working with me.",
} as const

const pick = (override: string | null | undefined, fallback: string) => {
  const t = (override ?? "").trim()
  return t.length ? t : fallback
}

// Renders the intro, substituting {firstName} and {city} safely. A blank
// override uses the default (which itself is city-aware).
export function buildThankYouIntro(
  override: string | null | undefined,
  vars: { firstName?: string | null; city?: string | null },
): string {
  const first = (vars.firstName ?? "").trim()
  const city = (vars.city ?? "").trim()
  const template = (override ?? "").trim() || (city ? THANKYOU_DEFAULTS.intro : THANKYOU_DEFAULTS.introNoCity)
  return template.replace(/\{firstName\}/g, first || "there").replace(/\{city\}/g, city || "your area")
}

// Whether the optional reward step should render. Three-state toggle: "on"/"off"
// are explicit; "" (auto/unset) defaults to ON only when a reward description is
// already configured, per the product rule.
export function shouldShowReward(showReward: string | null | undefined, incentive: string | null | undefined): boolean {
  const s = (showReward ?? "").trim()
  if (s === "on") return true
  if (s === "off") return false
  return (incentive ?? "").trim().length > 0
}

export function buildThankYouSteps(input: {
  agentName: string
  brokerage?: string | null
  // Step overrides (blank => default).
  step2Title?: string | null
  step2Body?: string | null
  step3Title?: string | null
  step3Body?: string | null
  step4Title?: string | null
  /** Optional agent override for the apply-step body; blank uses the default. */
  applyInstructions?: string | null
  // Reward step.
  showReward?: string | null
  rewardTitle?: string | null
  /** Reward description (canonical thankYouIncentive); blank uses the default. */
  incentive?: string | null
}): ThankYouStep[] {
  const agent = (input.agentName ?? "").trim() || "your locator"
  const brokerage = (input.brokerage ?? "").trim()

  // Default apply step lists "{agent} with {brokerage}" and emphasizes it; an
  // agent-provided override is used verbatim with no emphasis.
  const usingDefaultApply = !(input.applyInstructions ?? "").trim()
  const applyPhrase = `${agent}${brokerage ? ` with ${brokerage}` : ""}`
  const applyBody = usingDefaultApply
    ? `When you're ready to apply, select Realtor or Apartment Locator and list ${applyPhrase} so the property knows who helped you.`
    : (input.applyInstructions as string).trim()

  const steps: ThankYouStep[] = [
    { title: THANKYOU_DEFAULTS.step1Title, body: THANKYOU_DEFAULTS.step1Body, done: true },
    { title: pick(input.step2Title, THANKYOU_DEFAULTS.step2Title), body: pick(input.step2Body, THANKYOU_DEFAULTS.step2Body) },
    { title: pick(input.step3Title, THANKYOU_DEFAULTS.step3Title), body: pick(input.step3Body, THANKYOU_DEFAULTS.step3Body) },
    {
      title: pick(input.step4Title, THANKYOU_DEFAULTS.step4Title),
      body: applyBody,
      // Bold the two scannable phrases in the default copy: what to select and
      // who to list. Overrides carry no emphasis (rendered as the agent wrote).
      emphasis: usingDefaultApply ? ["Realtor or Apartment Locator", applyPhrase] : undefined,
    },
  ]

  if (shouldShowReward(input.showReward, input.incentive)) {
    steps.push({
      title: pick(input.rewardTitle, THANKYOU_DEFAULTS.rewardTitle),
      body: pick(input.incentive, THANKYOU_DEFAULTS.rewardBody),
    })
  }

  return steps
}
