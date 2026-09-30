import { sendNotification } from "./send"
import { welcomeEmail, trialStartedEmail } from "./templates"

// PASS 8 split these apart, because the two events stopped happening together.
//
// The trial used to begin at signup, so "your account is live" and "your trial has
// started" were one moment and shipped as one pair. The trial now begins at
// successful Texas licence verification, which can be days later — so sending the
// trial-started email at onboarding would state something untrue and carry a trial
// end date that does not exist yet.

/** Account is live — sent at ONBOARDING COMPLETION. Says nothing about a trial. */
export async function sendAccountWelcomeEmail(params: {
  to: string
  name?: string | null
}): Promise<void> {
  await sendNotification({ to: params.to, ...welcomeEmail({ name: params.name }) })
}

/**
 * The trial has genuinely started — sent ONLY after lb_verify_license reports
 * trial_granted = true, with the trial_ends_at that same transaction committed.
 *
 * Never send this speculatively. Every non-granting path (re-verification, a
 * previously consumed trial, an already-paid account, a non-Texas licence, the
 * internal demo exemption) reports trial_granted = false and must stay silent.
 */
export async function sendTrialStartedEmail(params: {
  to: string
  name?: string | null
  trialEndsAt: string | Date
}): Promise<void> {
  await sendNotification({
    to: params.to,
    ...trialStartedEmail({ name: params.name, trialEndsAt: params.trialEndsAt }),
  })
}
