// Comments — Automated Lead Capture: WHO IS THIS COMMENTER, and may we message them?
//
// ── THE REQUIREMENT ─────────────────────────────────────────────────────────────────────────
// ONE automatic private message per unique commenter per connected account. Not one per comment.
// Somebody who comments LIST on three different Reels is one person who gets one DM, ever.
//
// A per-comment unique key cannot express that — it is necessary (it stops a retry double-sending
// for a single comment) and insufficient (it says nothing about the person). The durable record is
// therefore the COMMENTER, keyed on a stable provider id, with the DM stamped on that row.
//
// ── WHY NOT THE USERNAME ────────────────────────────────────────────────────────────────────
// Usernames are mutable and reusable. Someone who renames themselves becomes a new person to us
// and gets a second unsolicited DM; worse, an abandoned handle can be claimed by someone else, and
// we would treat a stranger as already-messaged or message them on the strength of a name that is
// no longer theirs. Neither failure is acceptable for unsolicited messaging, so the username is
// stored for display and NEVER used as identity.
//
// ── THE PROVIDER LIMITATION, STATED HONESTLY ────────────────────────────────────────────────
// Instagram's comment WEBHOOK payload carries `from.id` (an IGSID) and `from.username`. The polling
// read of `GET /{ig-media-id}/comments` is commonly queried with a flat `username` and no confirmed
// `from.id`, and Meta's own reference pages for the Comment node did not resolve when checked, so
// WHETHER POLLING RETURNS A STABLE ID IS UNVERIFIED. It can only be settled by a real call with a
// permission we do not yet hold.
//
// That uncertainty is designed around rather than assumed away: no stable id ⇒ no DM. The
// commenter still gets a truthful public reply pointing at the bio link, which carries no
// unsolicited-messaging risk. If Phase 3 shows polling does return an id, nothing here changes
// except that more comments become DM-eligible.

/** What the provider told us about the author of a comment. Every field may be absent. */
export type RawCommentAuthor = {
  /** The provider's own stable id for this person (Instagram: IGSID). The ONLY identity we accept. */
  providerUserId?: string | null
  username?: string | null
  /** A profile URL the provider returned. Preferred over anything we could construct. */
  profileUrl?: string | null
}

export type CommenterIdentity = {
  /** Non-null only when the provider gave us a usable stable id. */
  providerUserId: string | null
  username: string | null
  /** Resolved profile URL, or null when we could not resolve one SAFELY. */
  profileUrl: string | null
  /** True only when a DM may be deduplicated reliably, and therefore only when one may be sent. */
  dmEligible: boolean
  /** Why not, when it isn't — surfaced in the Inbox so the reason is visible rather than inferred. */
  reason: "ok" | "no_stable_id" | "own_account"
}

/**
 * A username we are willing to put in a URL.
 *
 * Instagram handles are letters, digits, periods and underscores, 1–30 characters. Anything else
 * is either not a handle or has been truncated/decorated by a display layer, and guessing would
 * risk linking to the WRONG person's account — the one outcome the brief singles out. A value that
 * fails this is shown as plain text instead.
 */
const SAFE_IG_HANDLE = /^[A-Za-z0-9._]{1,30}$/

/** Strip a leading @ and surrounding whitespace, without altering the handle itself. */
const cleanHandle = (u: string | null | undefined): string | null => {
  const t = (u ?? "").trim().replace(/^@+/, "")
  return t.length > 0 ? t : null
}

/**
 * Resolve a profile URL for a commenter.
 *
 * PROVIDER-SUPPLIED WINS. A URL the platform returned is authoritative and is used verbatim —
 * subject only to it being an http(s) URL, so a malformed value cannot become a link.
 *
 * CONSTRUCTED ONLY FROM A VERIFIED HANDLE. With no provider URL we may build one, but only when the
 * username passes SAFE_IG_HANDLE. Otherwise we return null and the UI shows the name as plain text.
 * Showing an inert name is always better than opening a stranger's profile.
 */
export function resolveProfileUrl(provider: string, author: RawCommentAuthor): string | null {
  const given = (author.profileUrl ?? "").trim()
  if (given) {
    try {
      const u = new URL(given)
      if (u.protocol === "https:" || u.protocol === "http:") return u.toString()
    } catch {
      /* fall through to construction */
    }
  }
  const handle = cleanHandle(author.username)
  if (!handle || !SAFE_IG_HANDLE.test(handle)) return null
  if (provider === "instagram") return `https://www.instagram.com/${handle}/`
  // TikTok handles use the same safe character set but a different path shape. The UI keeps TikTok
  // disabled until the Business API work lands; this exists so the column is not a special case.
  if (provider === "tiktok") return `https://www.tiktok.com/@${handle}`
  return null
}

/**
 * Decide who this commenter is and whether they may be messaged.
 *
 * FAIL CLOSED. `dmEligible` is true only when a stable provider id is present. Absence is not an
 * error to log and continue past — it is the condition under which we must not message, because we
 * would have no way to know we had messaged them before.
 */
export function resolveCommenter(
  provider: string,
  author: RawCommentAuthor,
  /** The connected account's own provider user id — we never reply to ourselves. */
  ownProviderUserId: string | null,
): CommenterIdentity {
  const providerUserId = (author.providerUserId ?? "").trim() || null
  const username = cleanHandle(author.username)
  const profileUrl = resolveProfileUrl(provider, author)

  // Our own comment. Checked on the stable id first; the handle is a fallback for the case where
  // the id is absent, and it is safe HERE in a way it is not for identity — the worst outcome of a
  // false positive is that we skip replying to ourselves, which is what we wanted anyway.
  const own =
    (!!providerUserId && !!ownProviderUserId && providerUserId === ownProviderUserId) ||
    (!providerUserId && !!username && !!ownProviderUserId && username.toLowerCase() === ownProviderUserId.toLowerCase())
  if (own) return { providerUserId, username, profileUrl, dmEligible: false, reason: "own_account" }

  if (!providerUserId) return { providerUserId: null, username, profileUrl, dmEligible: false, reason: "no_stable_id" }

  return { providerUserId, username, profileUrl, dmEligible: true, reason: "ok" }
}

/** The stored commenter row the DM gate reads. */
export type CommenterRecord = {
  providerUserId: string
  /** When this person was last sent the automatic DM on THIS connected account. Null = never. */
  dmSentAt: string | null
  /**
   * When a send for this person was CLAIMED. Set before the API call, cleared only on a confirmed
   * failure. Non-null with dmSentAt null means a send is in flight, or finished with an outcome we
   * could not establish — either way nobody else may send.
   */
  dmClaimedAt: string | null
}

/**
 * THE ATOMIC CLAIM — the statement that actually enforces one DM per person.
 *
 * shouldSendPrivateReply below is a PRE-FILTER, not the guarantee: it reads state and then decides,
 * which is check-then-act. Two workers handling two comments from the SAME person both read
 * "never messaged", both decide to send, and the person gets two unsolicited messages. The unique
 * index on (connection_id, provider_user_id) prevents duplicate ROWS, not duplicate SENDS.
 *
 * The guarantee is this conditional update, which only one caller can win. Exported as the single
 * definition so the eventual sender cannot quietly use a different predicate — the same shape, and
 * the same reasoning, as the follow-up engine's claimIntent.
 *
 *   No row returned ⇒ somebody else owns this person's DM ⇒ DO NOT SEND.
 */
export const DM_CLAIM_SQL = `
update public.social_commenters
   set dm_claimed_at = now()
 where id = $1
   and dm_claimed_at is null
   and dm_sent_at is null
returning id`

/** What the platform told us about a private reply we attempted. */
export type DmOutcome = "accepted" | "failed" | "uncertain"

export type DmResolution = {
  /** Stamp dm_sent_at — only ever on a confirmed acceptance. */
  markSent: boolean
  /** Clear dm_claimed_at so a later comment may try again. Only on a CONFIRMED failure. */
  releaseClaim: boolean
  /** The action row's status. */
  status: "sent" | "failed" | "uncertain"
  /** May the public reply claim a DM was sent? */
  mayClaimDmPublicly: boolean
  /** May an automatic retry ever happen? */
  retryable: boolean
}

/**
 * Resolve a finished send attempt.
 *
 * `uncertain` is the case worth stating plainly: a send whose outcome we could not establish may
 * well have ARRIVED. Retrying it would be exactly the duplicate this feature must never produce,
 * so the claim is NOT released, nothing is retried, and it is surfaced for a human instead. A claim
 * nobody releases blocks further attempts to that person — the correct failure direction when the
 * alternative is messaging a stranger twice.
 *
 * This is also why a lost acknowledgment is safe: the claim was taken BEFORE the call, so a reply
 * that landed but whose response we never saw leaves the person claimed rather than unclaimed.
 */
export function resolveDmOutcome(outcome: DmOutcome): DmResolution {
  if (outcome === "accepted") {
    return { markSent: true, releaseClaim: false, status: "sent", mayClaimDmPublicly: true, retryable: false }
  }
  if (outcome === "failed") {
    return { markSent: false, releaseClaim: true, status: "failed", mayClaimDmPublicly: false, retryable: true }
  }
  return { markSent: false, releaseClaim: false, status: "uncertain", mayClaimDmPublicly: false, retryable: false }
}

export type DmDecision = {
  send: boolean
  reason: "ok" | "already_messaged" | "no_stable_id" | "own_account" | "automation_off" | "claim_held"
}

/**
 * May we send the automatic private message to this commenter, on this account, right now?
 *
 * A PRE-FILTER, NOT THE GUARANTEE. It reads state and then decides, so under concurrency it can go
 * stale between the read and the send. DM_CLAIM_SQL above is what actually enforces the rule; this
 * exists so the common cases are refused cheaply and with a reason worth showing in the Inbox.
 * Nothing may send on the strength of this function alone. Every condition is a REFUSAL — there is no path that
 * sends on missing information. The `dmSentAt` stamp lives on the commenter row, keyed
 * (connection_id, provider_user_id), so the guarantee is per person per connected account and
 * survives restarts, retries and re-polling of the same comment.
 *
 * NO FOLLOW-UPS. A person who has been messaged is never messaged again by this feature — there is
 * deliberately no reminder, no second attempt on a later comment, and no re-send window.
 */
export function shouldSendPrivateReply(input: {
  automationEnabled: boolean
  identity: CommenterIdentity
  existing: CommenterRecord | null
}): DmDecision {
  if (!input.automationEnabled) return { send: false, reason: "automation_off" }
  if (input.identity.reason === "own_account") return { send: false, reason: "own_account" }
  if (!input.identity.dmEligible || !input.identity.providerUserId) return { send: false, reason: "no_stable_id" }
  if (input.existing?.dmSentAt) return { send: false, reason: "already_messaged" }
  // A claim with no send is in flight, or finished with an outcome we could not establish. Either
  // way this person is spoken for. Refusing here saves a doomed claim attempt; DM_CLAIM_SQL is
  // still what makes it safe under concurrency, because this check can go stale between read and
  // write and that update cannot.
  if (input.existing?.dmClaimedAt) return { send: false, reason: "claim_held" }
  return { send: true, reason: "ok" }
}

/**
 * Which public reply may be used, given what actually happened to the DM.
 *
 * The rule the brief is emphatic about: a reply may only claim a DM once the platform has ACCEPTED
 * one. `dmAccepted` is the platform's confirmation, not our intention — a queued, failed or
 * uncertain send is NOT an acceptance, so all three fall through to the truthful fallback.
 */
export function publicReplyKind(dmAccepted: boolean): "dm_sent" | "bio_link" {
  return dmAccepted ? "dm_sent" : "bio_link"
}
