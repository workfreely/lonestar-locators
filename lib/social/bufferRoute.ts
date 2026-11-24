// BUFFER AS A PUBLISHING ROUTE — which destinations go through Buffer, and what that changes.
//
// PURE and dependency-free, like marketRestriction and tiktokGate, so every decision below is
// unit-testable without a database, a network or an API key. The worker is a thin shell around
// these functions; lib/social/bufferServer.ts holds the I/O and the secret.
//
// ── WHAT A "ROUTE" IS, AND WHY IT IS NOT A NEW DESTINATION ──────────────────────────────────
// destinations.ts already answers "what is this post FOR, and what geometry does it need"
// (instagram_reel, tiktok_video). A route answers a different question: "whose API carries the
// bytes". The same instagram_reel can leave through Meta's Graph API with our own OAuth token, or
// through Buffer with Buffer's. Nothing about the asset changes — same 1080×1920 render, same
// caption, same safe area — so adding `instagram_reel_via_buffer` would duplicate every geometry
// rule in the system to express a transport choice.
//
// So the route lives on the DESTINATION ROW, not on the destination id. A social_connections row
// carrying both a buffer_account_id and a buffer_channel_id is Buffer-routed; everything else
// publishes exactly as it does today.
//
// ── THE INVARIANT THAT KEEPS TWO WORKERS FROM FIGHTING ──────────────────────────────────────
// Three workers now select from social_posts, and a post must be claimable by exactly one of
// them. The partition is this predicate and nothing else:
//
//   social-instagram-publish   instagram_reel / instagram_story   AND NOT Buffer-routed
//   social-tiktok-publish      tiktok_video                       AND NOT Buffer-routed
//   social-buffer-publish      either provider                    AND Buffer-routed
//
// All three ask isBufferRouted() about the same row, so the partition cannot drift. A row that
// is half-configured — an account with no channel, or a channel with no account — is NOT
// Buffer-routed, which deliberately leaves it with the native worker rather than stranding it
// between the two. See bufferRoutingFor.

import { DESTINATIONS, isSocialDestination, type SocialDestination } from "@/lib/social/destinations"

/** The two columns that together name a Buffer destination. Both, or neither. */
export type BufferRouting = {
  /** social_buffer_accounts.id — which Buffer account's API key carries this. */
  accountId: string
  /** Buffer's own channel id, e.g. the Instagram or TikTok channel inside that account. */
  channelId: string
}

/** The shape this module needs off a social_connections row. Deliberately minimal. */
export type RoutableConnection = {
  buffer_account_id?: unknown
  buffer_channel_id?: unknown
}

const str = (v: unknown): string | null => {
  const s = typeof v === "string" ? v.trim() : ""
  return s ? s : null
}

/**
 * Is this destination Buffer-routed, and through what?
 *
 * BOTH COLUMNS OR NEITHER. A row with an account but no channel names a Buffer account with no
 * channel to post to; a row with a channel but no account names a channel with no credential to
 * post it. Either one alone is a misconfiguration, and the safe reading is "not Buffer-routed":
 * the native worker then handles the row as it always has, and its own guards report the real
 * problem (no token, destination paused) in language the operator already knows. Treating a
 * half-configured row as Buffer-routed would instead hand it to a worker that cannot publish it
 * and would fail it — turning a typo into a dead post.
 */
export function bufferRoutingFor(conn: RoutableConnection | null | undefined): BufferRouting | null {
  const accountId = str(conn?.buffer_account_id)
  const channelId = str(conn?.buffer_channel_id)
  if (!accountId || !channelId) return null
  return { accountId, channelId }
}

/** The predicate all three workers share. One definition, so the partition cannot drift. */
export function isBufferRouted(conn: RoutableConnection | null | undefined): boolean {
  return bufferRoutingFor(conn) !== null
}

// ── WHICH DESTINATIONS BUFFER CAN ACTUALLY CARRY ────────────────────────────────────────────
// Buffer's InstagramPostMetadataInput.type is a PostType, whose values include `reel` and
// `story`; TikTok's metadata input carries no type at all, because a TikTok post is a video.
//
// instagram_story is DELIBERATELY EXCLUDED. Buffer's own documentation is explicit that text,
// links and stickers on a story force reminder-based publishing — a push notification to a phone,
// not an API publish. An unattended cron has no phone to tap, so routing a story through Buffer
// would produce a post that silently never goes out. It is excluded here rather than left to fail
// at Buffer, so the refusal names the real reason.
//
// tiktok_story is excluded for the plainer reason that destinations.ts already declares it
// unsupported by the provider.
export const BUFFER_DESTINATIONS: readonly SocialDestination[] = ["instagram_reel", "tiktok_video"] as const

/** Buffer's PostType for this destination, or null when Buffer takes no type (TikTok). */
export type BufferPostType = "reel" | "post" | "story"

export function bufferPostTypeFor(destination: SocialDestination): BufferPostType | null {
  if (destination === "instagram_reel") return "reel"
  return null
}

export type BufferDestinationRefusal =
  | "not_a_destination"
  | "not_carried_by_buffer"
  | "not_publishable"
  /** The surface is publishable through Buffer, but this route has not been cleared for it. */
  | "route_not_enabled"

/**
 * May this destination be published through Buffer at all?
 *
 * ── THE QUESTION DESTINATIONS.publish ANSWERS IS NOT THIS ROUTE'S QUESTION ──────────────────
 * This used to refuse anything whose `publish` was not "supported", which refused tiktok_video
 * outright. The reasoning was conservative and, on inspection, misdirected. `publish` records
 * whether WE may call a network's publishing API directly, and tiktok_video reads
 * 'awaiting_approval' for one stated reason: "our app audit is incomplete". The restriction that
 * sits behind that — an unaudited TikTok app may only self-post, privately — is a restriction on
 * OUR developer app, enforced by TikTok against OUR client credentials, on requests WE make.
 *
 * This route makes none of those requests. Buffer calls TikTok with Buffer's own audited app and
 * with the grant Lisette gave Buffer directly, in Buffer's own dashboard. Our audit state is not
 * a property of that request and cannot be violated by it. Keeping the check was not caution, it
 * was a gate answering a question nobody asked — and its effect was to make every TikTok post on
 * this route fail with "not cleared for automatic publishing yet", which is not true of Buffer.
 *
 * ── WHAT THE OLD CHECK WAS NEVERTHELESS PROVIDING, AND WHAT REPLACES IT ─────────────────────
 * It gave a PER-SURFACE clearance: Instagram could be live while TikTok was not. That is worth
 * keeping, so it is kept — as `routeEnabled`, which the worker supplies from
 * SOCIAL_BUFFER_TIKTOK_ENABLED (see lib/social/bufferGate.ts). The clearance is now a decision the
 * operator makes about this route, rather than a field describing an unrelated audit.
 *
 * ── WHAT IS STILL REFUSED HERE, AND WHY IT IS A DIFFERENT KIND OF FACT ──────────────────────
 * `unsupported_by_provider` stays refused, and it is not the same kind of statement at all: it
 * records that the NETWORK has no such endpoint — TikTok's Content Posting API documents video and
 * photo publishing and no Story surface — which no approval of ours or Buffer's can change.
 *
 * ── THE SAFEGUARDS THIS DOES NOT TOUCH ──────────────────────────────────────────────────────
 * Everything else that stood between a row and TikTok still stands: CRON_SECRET,
 * SOCIAL_BUFFER_AUTOPUBLISH_ENABLED, the owner-wide Auto Posting switch, the per-destination
 * posting_paused, Buffer's own channel health check (disconnected / locked / reminder publishing),
 * the market restriction twice over, the identity and personal-ownership refusals, human approval
 * on the row, and the creator's saved AI/branded-content disclosure — which Buffer CAN carry and
 * which the worker still requires. Exactly one check was removed, and it was the one that was
 * measuring our own app rather than this route.
 *
 * `routeEnabled` defaults to true so that every existing caller and test keeps its meaning: the
 * clearance is the worker's to supply, and a caller asking the pure question gets the pure answer.
 */
export function bufferDestinationRefusal(
  destination: unknown,
  routeEnabled = true,
): BufferDestinationRefusal | null {
  if (!isSocialDestination(destination)) return "not_a_destination"
  if (!BUFFER_DESTINATIONS.includes(destination)) return "not_carried_by_buffer"
  if (DESTINATIONS[destination].publish === "unsupported_by_provider") return "not_publishable"
  if (!routeEnabled) return "route_not_enabled"
  return null
}

export const BUFFER_REFUSAL_MESSAGE: Record<BufferDestinationRefusal, string> = {
  not_a_destination: "this post has no recognised destination — reassign it",
  not_carried_by_buffer:
    "Buffer cannot publish this surface automatically. Instagram Stories through Buffer require a " +
    "phone notification, which an unattended worker cannot answer — publish this one natively or by hand.",
  not_publishable:
    "the network has no API for this surface, so nothing can publish it automatically — see DESTINATIONS.publishNote",
  route_not_enabled:
    "publishing this surface through Buffer is not switched on yet — set SOCIAL_BUFFER_TIKTOK_ENABLED once you have accepted that Buffer, not we, chooses the TikTok privacy level and the comment/duet/stitch settings",
}

// ── THE SIGNED-URL INGEST WINDOW ────────────────────────────────────────────────────────────
// Buffer does not take the video bytes; it takes a URL and fetches the media itself. Our renders
// live in a PRIVATE Supabase bucket, so the URL we hand over is a signed one that expires. If it
// expires before Buffer fetches it, Buffer reports a media error and the post fails — and the
// failure looks like a bad video rather than a bad clock, which is the confusing part.
//
// MEASURED, NOT ASSUMED:
//   • a signed URL honours its requested TTL exactly: a 3600s request produced a JWT whose `exp`
//     was 3591s out, and a HEAD against it returned 200 with Content-Type video/mp4.
//   • the one completed Buffer publish went from dueAt 22:36:04Z to sentAt 22:36:46Z — Buffer
//     fetched the media, handed it to TikTok and recorded a result in 42 SECONDS.
//
// So the window only closes if we schedule into Buffer's own queue and let it sit. That is why
// the worker publishes with shareNow and nothing else, and why the TTL below is two hours rather
// than the one hour Instagram's direct publisher uses: two hours is ~170× the observed ingest,
// and it costs nothing, because the URL is minted at send time and never stored.
export const BUFFER_SIGN_TTL_SECONDS = 60 * 60 * 2

/** The observed end-to-end ingest, from the one real publish. Used to express the margin below. */
export const BUFFER_OBSERVED_INGEST_SECONDS = 42

/**
 * Does a signed URL minted now survive long enough for Buffer to fetch it?
 *
 * Expressed as a function rather than a comment so the margin is asserted by the test suite and
 * cannot rot: if someone lowers the TTL or Buffer gets slower, a test fails rather than a post.
 * The required margin is 10×, which is still a twentieth of the real headroom — it is a guard
 * against a careless edit, not a prediction about Buffer.
 */
export function signTtlCoversIngest(
  ttlSeconds: number = BUFFER_SIGN_TTL_SECONDS,
  observedIngestSeconds: number = BUFFER_OBSERVED_INGEST_SECONDS,
): boolean {
  return ttlSeconds >= observedIngestSeconds * 10
}

// ── WHAT BUFFER'S ANSWER MEANS FOR THE ROW ──────────────────────────────────────────────────
// Buffer's PostStatus has six values. Three of them are terminal for us, three are not, and the
// difference decides whether a row is finished, retried or left alone — so it is spelled out here
// rather than inferred at the call site.
export type BufferPostStatus = "draft" | "error" | "needs_approval" | "scheduled" | "sending" | "sent"

export type BufferOutcome =
  /** Published. Record published_at and stop. */
  | { kind: "published" }
  /** Buffer is still working. Leave the row claimed and reconcile next run — NEVER re-send. */
  | { kind: "pending"; detail: string }
  /** Buffer will not publish this without a human. Terminal: needs_attention. */
  | { kind: "failed"; detail: string }

/**
 * Map Buffer's status onto what the row should become.
 *
 * `scheduled` AND `draft` ARE FAILURES HERE, which is the counter-intuitive part and the reason
 * this is a named function. The worker sends mode: shareNow, so a post that comes back `scheduled`
 * or `draft` means Buffer did not accept "publish now" — it parked the post in a queue instead.
 * Treating that as `pending` would be wrong twice over: nothing is going to change it, so the row
 * would be reconciled for ever, and meanwhile Buffer may publish it later, at a time nobody chose,
 * from a queue nobody is watching. Stopping and saying so is the only honest answer.
 *
 * `needs_approval` is the same situation with a clearer cause: Buffer's own approval workflow is
 * on for that organization and the post is waiting on a person inside Buffer.
 */
export function bufferOutcomeFor(status: BufferPostStatus | string, errorMessage?: string | null): BufferOutcome {
  switch (status) {
    case "sent":
      return { kind: "published" }
    case "sending":
      return { kind: "pending", detail: "Buffer is still sending this post" }
    case "error":
      return {
        kind: "failed",
        detail: errorMessage?.trim()
          ? `Buffer could not publish this: ${errorMessage.trim().slice(0, 240)}`
          : "Buffer reported an error publishing this post, with no detail given",
      }
    case "needs_approval":
      return {
        kind: "failed",
        detail: "Buffer is holding this post for approval inside Buffer — approve or disable Buffer's approval workflow",
      }
    case "scheduled":
      return {
        kind: "failed",
        detail:
          "Buffer queued this post instead of publishing it now. Nothing here will publish it, and " +
          "Buffer may send it later unattended — check the channel's queue in Buffer and delete or send it by hand.",
      }
    case "draft":
      return {
        kind: "failed",
        detail: "Buffer saved this post as a draft instead of publishing it — check the channel's settings in Buffer",
      }
    default:
      return { kind: "failed", detail: `Buffer returned an unrecognised status: ${String(status).slice(0, 60)}` }
  }
}

// ── RETRY POLICY ────────────────────────────────────────────────────────────────────────────
// There are exactly two kinds of Buffer call in the worker, and they get OPPOSITE treatment.
//
//   READS  (post status)  are idempotent, so a transient failure is retried in-process.
//   WRITES (createPost)   are NOT. A createPost that times out may still have created the post:
//                         the request reached Buffer, Buffer reached the network, and our socket
//                         died waiting for the reply. Retrying that is how one approved video
//                         becomes two public posts. So a failed createPost is NEVER retried, in
//                         this run or a later one — the row keeps its claim and is reconciled by
//                         asking Buffer what exists, never by sending again.
//
// This is the same rule the TikTok worker follows around init, stated here because Buffer's
// single-call publish makes it much easier to get wrong.
export type BufferCallFailure = "retryable" | "terminal" | "unknown"

/**
 * Should a FAILED READ be retried?
 *
 * Network-shaped failures and Buffer's own 5xx/429 are retryable; anything that names a problem
 * with the request itself is not. Unknown is treated as retryable BY THE CALLER ONLY FOR READS —
 * a read that keeps failing costs a reconcile cycle, which is free, whereas being wrong in the
 * other direction loses the status of a post that may already be live.
 */
export function classifyReadFailure(status: number | null, message: string | null | undefined): BufferCallFailure {
  if (status !== null) {
    if (status === 429 || status >= 500) return "retryable"
    if (status >= 400) return "terminal"
  }
  const m = (message ?? "").toLowerCase()
  if (!m) return "unknown"
  if (/(timeout|timed out|econnreset|enotfound|eai_again|socket hang up|network|fetch failed|aborted)/.test(m)) {
    return "retryable"
  }
  if (/(unauthorized|forbidden|not found|invalid|validation|unknown field|cannot query)/.test(m)) return "terminal"
  return "unknown"
}
