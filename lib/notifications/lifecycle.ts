import { sendNotification } from "./send"
import { welcomeEmail, trialStartedEmail } from "./templates"

// Fired once when a user's account goes live and their free trial begins (the
// end of onboarding). Sends the account welcome + the trial-started confirmation
// as a pair. Both trial entry points (the onboarding path and the fallback
// start-trial route) call this, so the messaging is identical either way.
// Never throws — sendNotification() swallows and logs its own failures.
export async function sendAccountStartedEmails(params: {
  to: string
  name?: string | null
  trialEndsAt?: string | Date | null
}): Promise<void> {
  await sendNotification({ to: params.to, ...welcomeEmail({ name: params.name }) })
  await sendNotification({
    to: params.to,
    ...trialStartedEmail({ name: params.name, trialEndsAt: params.trialEndsAt }),
  })
}
