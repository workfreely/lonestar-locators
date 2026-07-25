export const TRIAL_LENGTH_DAYS = 30
export const MONTHLY_PRICE_USD = 149

export function computeTrialWindow(startedAt: Date = new Date()) {
  const trialStartedAt = startedAt
  const trialEndsAt = new Date(startedAt)
  trialEndsAt.setDate(trialEndsAt.getDate() + TRIAL_LENGTH_DAYS)
  return { trialStartedAt, trialEndsAt }
}
