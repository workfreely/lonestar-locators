// FOLLOW-UP AGENT — AUTOMATIC ENROLMENT OF NEW SMART LEAD FORM SUBMISSIONS.
//
// This is the one piece that was never built. Every other part of the pipeline is deployed and
// the tick runs every minute, but it finds nothing: `leads.followup_opt_in` is false on all 14
// production leads, and the only way to set it has been a manual per-lead toggle. Enrolment IS
// the switch — there is no separate kill switch to find.
//
// ── THE POSTURE ─────────────────────────────────────────────────────────────────────────────
// Enrolment causes a real text message to a real person, so this decision is built the same way
// the agent-beta gate is: an ALLOWLIST THAT IS EMPTY BY DEFAULT. Merging this code enrols
// nobody. It stays that way until a specific number is named in configuration, which is a
// deliberate act by a person in the Vercel dashboard rather than a value a deploy can change.
//
// TWO SWITCHES, AND THEY ARE NOT THE SAME SWITCH:
//
//   FOLLOWUP_AUTO_ENROLL_PHONES    a comma/whitespace-separated allowlist of E.164 numbers.
//                                  For a SUPERVISED TEST: exactly the tester's own number.
//   FOLLOWUP_AUTO_ENROLL_ENABLED   general activation for every consenting submission.
//                                  "true" enables it. Anything else — absent, "false", "1",
//                                  "yes" — does not. Only the exact string counts, because a
//                                  truthy-looking value is how a flag like this turns itself on.
//
// The allowlist exists so a live test can happen without general activation, and general
// activation does not require the allowlist. Neither one weakens the gates below it: the engine
// still checks account authorization, SMS consent, quiet hours, the one-time-introduction guard
// and every suppression rule it checked before. Auto-enrolment only sets followup_opt_in; it
// cannot make an ineligible lead eligible.

export const AUTO_ENROLL_PHONES_FLAG = "FOLLOWUP_AUTO_ENROLL_PHONES"
export const AUTO_ENROLL_ENABLED_FLAG = "FOLLOWUP_AUTO_ENROLL_ENABLED"

export type AutoEnrollDecision = {
  enroll: boolean
  reason:
    | "allowlisted"
    | "generally_enabled"
    | "not_enabled"
    | "no_consent"
    | "account_not_authorized"
    | "no_phone"
    | "not_a_new_lead"
}

/** Parse the allowlist. Comma or whitespace separated; blank entries ignored. */
export function autoEnrollPhones(env: NodeJS.ProcessEnv = process.env): string[] {
  return (env[AUTO_ENROLL_PHONES_FLAG] ?? "")
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

/** General activation. ONLY the exact string "true" enables it. */
export function autoEnrollGenerallyEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return (env[AUTO_ENROLL_ENABLED_FLAG] ?? "").trim().toLowerCase() === "true"
}

/**
 * Should this freshly created lead be enrolled into the Follow-Up Agent?
 *
 * ORDER IS THE DESIGN. The refusals that protect a PERSON come first and are checked whatever the
 * flags say, so no configuration can enrol a lead that never consented or an account that is not
 * authorized to text at all. The flags are consulted last and only ever grant.
 *
 * `isNewLead` is false for a resubmission of an existing lead. Enrolling there would be a second
 * attempt at an introduction the person may already have had; the engine's t1 ledger guard would
 * refuse it anyway, and this refuses before it gets that far.
 */
export function shouldAutoEnroll(input: {
  isNewLead: boolean
  smsOptIn: boolean | null | undefined
  accountAuthorized: boolean
  phoneE164: string | null | undefined
  env?: NodeJS.ProcessEnv
}): AutoEnrollDecision {
  const env = input.env ?? process.env

  if (!input.isNewLead) return { enroll: false, reason: "not_a_new_lead" }
  // CONSENT IS NOT OPTIONAL and is not something a flag may override. The engine treats a missing
  // opt-in as a hard stop too; refusing here means we never even record an enrolment we would
  // have had to cancel.
  if (input.smsOptIn !== true) return { enroll: false, reason: "no_consent" }
  if (!input.accountAuthorized) return { enroll: false, reason: "account_not_authorized" }
  const phone = (input.phoneE164 ?? "").trim()
  if (!phone) return { enroll: false, reason: "no_phone" }

  // The supervised-test path: exactly the numbers named in configuration.
  if (autoEnrollPhones(env).includes(phone)) return { enroll: true, reason: "allowlisted" }
  // General activation, for every consenting submission.
  if (autoEnrollGenerallyEnabled(env)) return { enroll: true, reason: "generally_enabled" }

  return { enroll: false, reason: "not_enabled" }
}
