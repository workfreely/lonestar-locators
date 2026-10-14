// GOOGLE INTEGRATION HEALTH — the pure rules.
//
// Deliberately free of any Supabase or googleapis import so the classification can be tested
// directly, and so a caller that only needs to CLASSIFY an error does not pull in a database
// client. The I/O lives next door in integrationHealth.ts.

/** Failures that mean the stored token will never work again without human reauthorization. */
export const TERMINAL_AUTH_ERRORS = new Set(["invalid_grant", "unauthorized_client", "invalid_client"])

/** The one action key that syncs to Google Calendar automatically, server-side. */
export const AUTO_SYNCED_ACTION_KEY = "contact_lead"

/**
 * Reduce any thrown Google error to a short, safe code.
 *
 * NOTHING SENSITIVE SURVIVES THIS. Google's messages routinely contain the account address
 * ("Token has been expired or revoked for user@example.com"), and this value is persisted and
 * read by the UI — so anything that is not already a bare machine code collapses to
 * "unknown_error" rather than being stored verbatim.
 */
export function classifyGoogleError(e: unknown): string {
  const raw =
    (e as { response?: { data?: { error?: string } } })?.response?.data?.error ??
    (e as { code?: string | number })?.code ??
    "unknown_error"
  const code = String(raw).toLowerCase().slice(0, 48)
  return /^[a-z0-9_]+$/.test(code) ? code : "unknown_error"
}

/**
 * Should this failure tell the agent to reconnect?
 *
 * Only a terminal auth error. A transient one (a 500 from Google, a timeout, a rate limit) is
 * still recorded, but must never send someone through an OAuth flow to fix something that fixes
 * itself — an indicator that cries wolf is one people learn to ignore.
 */
export function isTerminalAuthError(code: string): boolean {
  return TERMINAL_AUTH_ERRORS.has(code)
}

/**
 * The row a successful reconnect writes to `google_credentials`.
 *
 * ── WHY THIS IS A FUNCTION AND NOT AN INLINE OBJECT ─────────────────────────────────────────
 * A reconnect has to clear the recorded failure, and that is easy to forget because nothing about
 * writing a fresh refresh token suggests it. Forgetting it is silent and total: `last_error`
 * stays "invalid_grant", so `shouldAttemptGoogle` keeps returning false and `getGoogleHealth`
 * keeps reporting needsReconnect — the agent reconnects successfully, the Integrations page still
 * says "Reconnect Google", and every Contacts and Calendar call is still skipped before it is
 * attempted. A good token would sit there unused indefinitely.
 *
 * Clearing it in the SAME write as the token is what makes the two impossible to disagree.
 */
export function reconnectCredentialRow(opts: {
  userId: string
  refreshToken: string
  googleEmail: string | null
  scopes: readonly string[]
  now?: Date
}) {
  return {
    user_id: opts.userId,
    refresh_token: opts.refreshToken,
    google_email: opts.googleEmail,
    scopes: [...opts.scopes],
    updated_at: (opts.now ?? new Date()).toISOString(),
    // The connection is healthy as of this moment, by definition: Google just issued this token.
    last_error: null,
    last_error_at: null,
  }
}
