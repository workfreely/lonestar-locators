import { supabaseAdmin } from "@/lib/supabase/admin"

// GOOGLE INTEGRATION HEALTH — one place that decides whether an agent's Google connection is
// usable, and makes a dead one visible.
//
// ── WHY THIS EXISTS ─────────────────────────────────────────────────────────────────────────
// Contacts and Calendar are deliberately best-effort so a Google outage can never break a lead
// write. The cost of that is silence: a refresh token revoked in August kept failing into
// October, and every new lead quietly skipped its contact and its calendar event with nothing
// surfaced anywhere. This records the failure so the UI can ask for a reconnect.
//
// WHAT IS NEVER STORED: the token, the Google account, or the provider's message. Only a short
// classification code, because the agent's only useful action is "reconnect" and anything more
// detailed is a leak waiting to happen.

// The pure rules live next door so they can be tested without a database client.
export { TERMINAL_AUTH_ERRORS, classifyGoogleError, isTerminalAuthError } from "./integrationHealthRules"
import { isTerminalAuthError } from "./integrationHealthRules"

/**
 * Record a failure against the agent's credential row.
 *
 * Never throws: health reporting must not become a second failure mode on a path that was
 * already best-effort.
 */
export async function recordGoogleFailure(userId: string, code: string): Promise<void> {
  try {
    await supabaseAdmin
      .from("google_credentials")
      .update({ last_error: code, last_error_at: new Date().toISOString() })
      .eq("user_id", userId)
  } catch {
    /* health is advisory; a failure to record one is not worth surfacing */
  }
}

/** Clear the failure after a successful call, so the indicator shows the CURRENT state. */
export async function clearGoogleFailure(userId: string): Promise<void> {
  try {
    await supabaseAdmin
      .from("google_credentials")
      .update({ last_error: null, last_error_at: null })
      .eq("user_id", userId)
      .not("last_error", "is", null) // no write when already healthy
  } catch {
    /* advisory */
  }
}

export type GoogleHealth =
  | { connected: false; needsReconnect: false }
  | { connected: true; needsReconnect: false }
  | { connected: true; needsReconnect: true; since: string | null }

/**
 * What the UI should show for this agent.
 *
 * `needsReconnect` is true only for a TERMINAL auth failure. A transient error (a 500 from
 * Google, a timeout) is recorded but must not tell the agent to reauthorize — that would send
 * people through an OAuth flow to fix something that fixed itself.
 */
export async function getGoogleHealth(userId: string): Promise<GoogleHealth> {
  const { data } = await supabaseAdmin
    .from("google_credentials")
    .select("refresh_token, last_error, last_error_at")
    .eq("user_id", userId)
    .maybeSingle()

  if (!data?.refresh_token) return { connected: false, needsReconnect: false }
  const code = (data.last_error ?? "").trim()
  if (code && isTerminalAuthError(code)) {
    return { connected: true, needsReconnect: true, since: data.last_error_at ?? null }
  }
  return { connected: true, needsReconnect: false }
}

/**
 * Should we even attempt a Google call for this agent?
 *
 * A revoked token does not heal on its own, so retrying it on every lead is pure waste — and it
 * is how a broken integration stays invisible, because each attempt fails the same silent way.
 * Returns false once a terminal error is on record, until a reconnect clears it.
 */
export async function shouldAttemptGoogle(userId: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("google_credentials")
    .select("last_error")
    .eq("user_id", userId)
    .maybeSingle()
  const code = (data?.last_error ?? "").trim()
  return !(code && isTerminalAuthError(code))
}
