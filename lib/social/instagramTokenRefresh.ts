// WHEN AN INSTAGRAM TOKEN SHOULD BE RENEWED — the decision, with nothing attached to it.
//
// ── WHY THIS EXISTS AT ALL ──────────────────────────────────────────────────────────────────
// refreshLongLivedToken has been in lib/social/instagram.ts since the integration was written and
// has never had a caller. There is no refresh cron. The publish worker does not refresh either:
// it checks token_expires_at and refuses with "reconnect the destination". So an Instagram token
// lives exactly 60 days from the day it was authorized and then the account goes dark, and the
// only remedy is re-authorizing by hand.
//
// ── THE RULES ARE META'S, NOT OURS ──────────────────────────────────────────────────────────
// A long-lived token can be exchanged for a fresh 60 days only while it is still valid, and only
// once it is at least 24 hours old. Both are hard limits at the provider, so both are encoded
// here rather than discovered as a 400 at runtime. A token that has ALREADY expired is beyond
// refreshing by anyone — that account needs re-authorization, and saying so is more useful than
// attempting a call that cannot succeed.
//
// Pure. No database, no fetch, no clock of its own — `now` is passed in, so every decision is
// reproducible in a test.

/** Renew this far ahead of expiry. Wide enough that a fortnight of failed runs is still safe. */
export const REFRESH_WINDOW_DAYS = 14

/** Meta's own floor: a long-lived token cannot be refreshed until it is a day old. */
export const MIN_TOKEN_AGE_HOURS = 24

const DAY_MS = 86_400_000
const HOUR_MS = 3_600_000

export type RefreshDecision =
  | { refresh: true }
  | { refresh: false; reason: RefreshSkip }

/** Every reason, named — a skipped account should never be a mystery in the run report. */
export type RefreshSkip =
  | "not_connected"       // disconnected or in error: re-authorization, not renewal
  | "no_expiry_recorded"  // nothing to reason about; treated as needing a human, never guessed
  | "already_expired"     // past the point Meta will renew it
  | "too_new"             // inside Meta's 24-hour floor
  | "not_due_yet"         // healthy and outside the renewal window

export type RefreshCandidate = {
  status: string | null
  /** social_connections.token_expires_at */
  tokenExpiresAt: string | null
  /** social_connections.updated_at — when this row's token was last written. The closest thing
   *  we store to "how old is this token", and deliberately conservative: it can only make the
   *  token look NEWER than it is, which delays a refresh rather than attempting an early one. */
  updatedAt: string | null
}

const ms = (iso: string | null): number | null => {
  if (!iso) return null
  const t = new Date(iso).getTime()
  return Number.isFinite(t) ? t : null
}

/**
 * Should this connection's token be renewed right now?
 *
 * ── WHAT IS DELIBERATELY NOT A REASON TO SKIP ───────────────────────────────────────────────
 * A PAUSED destination is still refreshed. Pausing an account says "do not publish from it", not
 * "let its credentials die" — and a token left to expire while paused turns a reversible pause
 * into a reconnection the operator did not ask for. The same goes for a market-restricted
 * account that happens to have published nothing lately.
 */
export function refreshDecision(c: RefreshCandidate, now: Date): RefreshDecision {
  // An account that is not connected needs a person, not a token. Renewing the credential of a
  // row already marked `error` would also paper over the error, since a refresh does not clear
  // status — the account would keep failing with a newer token.
  if ((c.status ?? "").trim() !== "connected") return { refresh: false, reason: "not_connected" }

  const expiresAt = ms(c.tokenExpiresAt)
  // NEVER GUESSED. A missing expiry could mean a token minted before the column existed or a
  // write that half-finished; either way, refreshing on an assumption risks spending the one
  // valid token we hold on a call that may fail.
  if (expiresAt === null) return { refresh: false, reason: "no_expiry_recorded" }

  const t = now.getTime()
  if (expiresAt <= t) return { refresh: false, reason: "already_expired" }

  const writtenAt = ms(c.updatedAt)
  if (writtenAt !== null && t - writtenAt < MIN_TOKEN_AGE_HOURS * HOUR_MS) {
    return { refresh: false, reason: "too_new" }
  }

  if (expiresAt - t > REFRESH_WINDOW_DAYS * DAY_MS) return { refresh: false, reason: "not_due_yet" }

  return { refresh: true }
}

/** Whole days until this token dies, for the run report and for an operator-facing warning. */
export function daysUntilExpiry(tokenExpiresAt: string | null, now: Date): number | null {
  const expiresAt = ms(tokenExpiresAt)
  if (expiresAt === null) return null
  return Math.floor((expiresAt - now.getTime()) / DAY_MS)
}

/**
 * An account nobody can rescue automatically: expired, or so close that a refresh may not land.
 * Surfaced by the run so a silent slide into expiry is impossible — the failure mode this whole
 * module exists to prevent is nobody noticing until posting stops.
 */
export function needsHumanAttention(c: RefreshCandidate, now: Date): boolean {
  const d = refreshDecision(c, now)
  if (d.refresh) return false
  return d.reason === "already_expired" || d.reason === "no_expiry_recorded"
}
