// WHICH TIKTOK DESTINATION, AND IS ITS TOKEN STILL GOOD — the decisions, with no I/O.
//
// These three questions decide which account Social Beast publishes as. They used to be answered
// inside lib/social/tiktokServer.ts, which carries `import "server-only"` and therefore cannot be
// imported by a test at all (the package is not installed outside Next's own resolution). The
// answers were consequently unverifiable, and "which account does this publish as?" is the single
// question in this area whose wrong answer is invisible: the upload succeeds, TikTok reports
// PUBLISH_COMPLETE, and the video is simply on the wrong brand's account.
//
// So the DECISIONS live here, pure, and the I/O stays behind the server-only guard that protects
// the tokens. The same split lib/social/signedMedia.ts documents for the same reason — the guard is
// kept where the secrets are, not spread over the logic that has none.
//
// Nothing here touches a token, a secret, the network or the database.

/** Refresh this long BEFORE expiry, so a token cannot lapse between the check and the API call
 *  that uses it. */
export const TIKTOK_EXPIRY_MARGIN_MS = 60_000

/**
 * The owner's ONE TikTok connection, or null when they have none — or more than one.
 *
 * MORE THAN ONE IS NULL, DELIBERATELY. The previous behaviour was an unordered `limit 1` in SQL:
 * an arbitrary account, returned as though it were a decision. Null is the honest answer to "which
 * of your accounts did you mean?" — the caller surfaces it as "not connected" / "choose a
 * destination", and the publish paths that know their destination pass its id instead.
 *
 * Rows are expected newest-last, but the result does not depend on their order: with one row there
 * is nothing to order, and with several there is no answer to order.
 */
export function soleConnectionId(rows: readonly { id: string }[] | null | undefined): string | null {
  const list = (rows ?? []).filter((r) => !!r?.id)
  return list.length === 1 ? list[0].id : null
}

/**
 * Does this connection's access token need refreshing before use?
 *
 * A MISSING EXPIRY IS NOT "FRESH FOREVER" — it is unknown, and a token we cannot date is one we
 * cannot vouch for, so it refreshes. The old code read `!!token_expires_at && …`, which treated a
 * null expiry as valid indefinitely and would hand TikTok a token that expired days ago.
 */
export function tokenNeedsRefresh(
  tokenExpiresAt: string | null | undefined,
  now: number = Date.now(),
): boolean {
  if (!tokenExpiresAt) return true
  const at = new Date(tokenExpiresAt).getTime()
  if (Number.isNaN(at)) return true          // unparseable is also unknown
  return at < now + TIKTOK_EXPIRY_MARGIN_MS
}

/**
 * May this owner use this connection?
 *
 * Asked because the request-time routes accept a connection id from the caller, and without this a
 * route would be a way to borrow another owner's credential by guessing an id. A row whose owner is
 * unknown is refused rather than allowed: an absent owner cannot be shown to be this one.
 */
export function connectionBelongsToOwner(
  rowOwnerUserId: string | null | undefined,
  ownerId: string | null | undefined,
): boolean {
  if (!rowOwnerUserId || !ownerId) return false
  return rowOwnerUserId === ownerId
}
