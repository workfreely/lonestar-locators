// IS THIS CONNECTION ACTUALLY USABLE RIGHT NOW?
//
// ── THE BUG THIS EXISTS TO PREVENT ──────────────────────────────────────────────────────────
// `status` is set at OAuth time and never revisited. The admin's TikTok row has read
// status='connected' since 20 September while its access token expired on 28 September — twelve
// days of a dead connection describing itself as live. Anything testing `status === 'connected'`
// believes it, including the autopilot planner, which counts that row as an enabled destination
// and will plan posts for an account that cannot publish.
//
// A token CAN be refreshed (TikTok refresh tokens last 365 days and getValidTikTokAccessToken
// rotates in place), so an expired access token is NOT the same as a broken connection. The three
// states are therefore distinguished rather than collapsed:
//
//   live            status connected, access token still valid
//   needs_refresh   status connected, access token expired, refresh may still succeed
//   disconnected    status is not connected, or there is no expiry recorded to judge
//
// WHAT CALLERS SHOULD DO WITH THAT: anything that PUBLISHES may treat needs_refresh as usable,
// because the publish path refreshes on the way through. Anything that reports state to a human
// must not call it "Connected" — that is the lie this module removes.
export type ConnectionHealth = "live" | "needs_refresh" | "disconnected"

export type HealthInput = {
  status?: string | null
  token_expires_at?: string | null
}

/** Clock injected so the boundary is testable without waiting for a token to expire. */
export function connectionHealth(c: HealthInput | null | undefined, now: Date = new Date()): ConnectionHealth {
  if (!c || c.status !== "connected") return "disconnected"
  const exp = c.token_expires_at ? Date.parse(c.token_expires_at) : NaN
  // No recorded expiry is NOT treated as healthy. An unknown expiry means we cannot say the token
  // works, and claiming "live" on the strength of a missing value is how the current bug reads.
  if (Number.isNaN(exp)) return "disconnected"
  return exp > now.getTime() ? "live" : "needs_refresh"
}

/** A human-facing label. Never says "Connected" for a connection that cannot currently post. */
export function connectionHealthLabel(h: ConnectionHealth): string {
  return h === "live" ? "Connected" : h === "needs_refresh" ? "Reconnect needed" : "Not connected"
}

/**
 * May the autopilot PLAN for this destination?
 *
 * needs_refresh counts as usable: the publish path refreshes on the way through, and excluding a
 * refreshable account would silently drop it out of the rotation for a reason nobody could see.
 * A disconnected one is excluded — planning posts for it fills a queue that can never drain.
 */
export function isPlannableConnection(c: HealthInput | null | undefined, now: Date = new Date()): boolean {
  return connectionHealth(c, now) !== "disconnected"
}
