export const runtime = "nodejs"
// ── WHY THIS ROUTE DECLARES A TIME BUDGET ───────────────────────────────────────────────────
// Without maxDuration a Vercel Node function gets the platform default, which is seconds. This
// worker makes several network round trips per post — a channel health read, createPost, and a
// status read — and createPost alone is allowed 30 seconds by the client. On 24 Nov Lisette's
// debut was claimed, sent to Buffer, and the function was killed before anything could be
// written back: the row was left `publishing` with no post id and NO error_message, because the
// catch that records Buffer's own words never ran. Three minutes later the stranded sweep marked
// it needs_attention with a generic message, and the real cause was simply absent.
//
// 300 is the same ceiling social-render uses. It is a CEILING, not a cost: a run with nothing due
// returns in milliseconds, and MAX_PER_RUN already bounds how much work one invocation can take.
export const maxDuration = 300

export const dynamic = "force-dynamic"

import { NextResponse, type NextRequest } from "next/server"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { shouldHoldForReview, publishHoldEnabled, publishHoldDecision } from "@/lib/social/publishHold"
import { isAgentOwnedPost } from "@/lib/social/agentIdentity"
import { readAutoPosting, isEligibleAfterResume, isWithinLatenessWindow } from "@/lib/social/autoPosting"
import { DESTINATIONS, isSocialDestination } from "@/lib/social/destinations"
import { renderRefusalFor, REFUSAL_MESSAGE, type RenderIdentityState } from "@/lib/social/renderAuthorization"
import { marketRestrictionViolation, parseMarketRestriction } from "@/lib/social/marketRestriction"
import { marketRestrictionWaived } from "@/lib/social/personalOwnership"
import { debutRefusalFor, DEBUT_REFUSAL_MESSAGE } from "@/lib/social/debutGate"
import { releaseStoryForReel } from "@/lib/social/storyFollowUp"
import { contentOwnershipCache, debutStateCache } from "@/lib/social/ownershipServer"
import { effectiveAgent } from "@/lib/social/agentIdentity"
import {
  BUFFER_DESTINATIONS, BUFFER_REFUSAL_MESSAGE, BUFFER_SIGN_TTL_SECONDS,
  bufferDestinationRefusal, bufferOutcomeFor, bufferPostTypeFor, isBufferRouted, isBufferStory,
} from "@/lib/social/bufferRoute"
import { bufferAutopublishEnabled, bufferTikTokEnabled } from "@/lib/social/bufferGate"
import { bufferDestinationCache, type BufferDestination } from "@/lib/social/bufferServer"
import { createBufferPost, fetchBufferPost, fetchBufferChannel, BufferApiError } from "@/lib/social/buffer"
import { buildInstagramCaptionPayload, buildTikTokCaptionPayload, isOverlayTemplate } from "@/lib/social/composePost"
import { truncateToRunes } from "@/lib/social/tiktok"

/**
 * SOCIAL BEAST — the BUFFER due-post worker.
 *
 * A THIRD SIBLING of the Instagram and TikTok workers, never a modification of either. It imports
 * no Instagram publishing helper and no TikTok publishing helper: the only things it borrows are
 * the shared DECISIONS the other two already use — the hold gate, the auto-posting switch, the
 * market restriction, the identity refusal, the caption builders. Those are the rules that must
 * not be allowed to differ between routes. Everything about HOW bytes reach a network is its own.
 *
 * ── WHY A THIRD WORKER AND NOT A BRANCH ─────────────────────────────────────────────────────
 * The native workers resolve an OAuth token of OURS per destination and refuse to publish without
 * one. A Buffer-routed destination has no such token and never will — Buffer holds the network
 * credential. A branch inside either worker would therefore have to disable that worker's central
 * guard for some rows, which is the kind of change that makes a safety property conditional. A
 * separate worker keeps `no token, no publish` absolutely true where it belongs, and lets this
 * file state its own, different precondition: no Buffer key, no publish.
 *
 * ── THE PARTITION, AND WHY NO POST CAN BE PUBLISHED TWICE ───────────────────────────────────
 * All three workers ask isBufferRouted() about the same social_connections row:
 *
 *   social-instagram-publish   instagram_* AND NOT Buffer-routed
 *   social-tiktok-publish      tiktok_video AND NOT Buffer-routed
 *   social-buffer-publish      BUFFER_DESTINATIONS AND Buffer-routed      ← this file
 *
 * One predicate, three callers, mutually exclusive by construction. The filter is applied twice
 * here on purpose: once in the query (so the per-run limit is not spent on rows that belong to
 * another worker) and once in the loop (because the query filter is an optimisation and the
 * predicate is the rule).
 *
 * ── MIRRORED PAIRS PUBLISH INDEPENDENTLY, AND NOTHING HERE KNOWS THEY ARE A PAIR ────────────
 * A mirrored destination posts the same creative to two networks at the same minute (see
 * lib/social/mirroredSchedule.ts), so two social_posts rows share one source_content_id and one
 * scheduled_at. That is a SCHEDULING fact, and this worker deliberately does not learn it:
 *
 *   • every gate, claim, send and outcome below is keyed on the POST ID. No query filters, groups
 *     or dedupes on source_content_id, and no row's fate is read from another row;
 *   • so Instagram failing cannot pause, re-send, retry or fail TikTok, and cannot cause either to
 *     be sent twice — the two rows have separate claims, separate external_post_id values and
 *     separate statuses, and a claim is the only thing that authorises a send;
 *   • a run that publishes one half and not the other is a CORRECT outcome, not a half-failure.
 *     The unsent half stays 'scheduled' and is picked up by the next run on its own terms.
 *
 * The one thing a pair changes is REPORTING: `byProvider` below counts outcomes per network, so
 * "the Reel went out and the TikTok did not" is visible in the run summary rather than only
 * discoverable by querying two rows. Pairing them in the SUMMARY is safe; pairing them in a
 * DECISION would be the coupling this worker exists without.
 *
 * ── IT CANNOT PUBLISH TODAY, AND THAT IS DELIBERATE ─────────────────────────────────────────
 * Five independent gates, each failing closed, any one of which stops everything:
 *
 *   1. CRON_SECRET                            — may this caller invoke the worker at all
 *   2. SOCIAL_BUFFER_AUTOPUBLISH_ENABLED      — may the worker publish at all (missing ⇒ no)
 *   3. Auto Posting master switch             — the operator's own pause, shared with both siblings
 *   4. DESTINATIONS[d].publish === supported  — the per-destination audit gate
 *   5. social_connections.posting_paused      — the per-destination pause
 *
 * Gate 2 is not wired into vercel.json either: this worker has no cron entry until activation is
 * approved, so in production it is unreachable as well as disarmed.
 *
 * ── DUPLICATE SAFETY ────────────────────────────────────────────────────────────────────────
 * The same two-claim shape both siblings proved, adapted to Buffer's single-call publish:
 *
 *   CLAIM 1  scheduled → publishing, guarded on status='scheduled' AND external_post_id IS NULL.
 *            Of N concurrent workers exactly one wins a row; the losers update 0 rows and skip.
 *   CLAIM 2  media_publish_claimed_at NULL → now(), immediately BEFORE createPost. A null claim
 *            therefore PROVES Buffer was never asked to create a post, so nothing can be duplicated.
 *
 * And the rule that matters most with a one-call publish: a createPost that fails ambiguously is
 * NEVER retried, here or on a later run. The row keeps its claim and is reconciled by asking
 * Buffer what exists. Re-sending is the only way this design can produce two public posts, so it
 * is the one thing the code never does.
 */

/** Small, like both siblings: a cron invocation should finish well inside its budget, and the
 *  reconcile sweep at the top of the next run is five minutes away. */
const MAX_PER_RUN = 3

/**
 * How old a claim must be before the stranded sweep will call it stranded.
 *
 * ── THE RACE THIS CLOSES ────────────────────────────────────────────────────────────────────
 * Between claim 2 and the line that persists the Buffer post id, a row matches the stranded
 * sweep's filter exactly: status 'publishing', claimed, no external_post_id. If a second
 * invocation overlaps the first inside that window — a retried cron, a manual trigger, two
 * instances — its sweep would mark a row needs_attention while the first invocation is still
 * mid-publish, and the operator would be told to go and check Buffer for a post that was about to
 * succeed. The first run then persists its id onto a needs_attention row and finishes it, so no
 * duplicate is created, but the ledger has told a lie in the meantime.
 *
 * Both sibling workers have this window and simply order by updated_at. Three minutes is longer
 * than any publish this worker performs — the measured end-to-end was 42 seconds, and the HTTP
 * timeout is 30 — and far shorter than the five-minute cron interval, so a genuinely crashed row
 * is still reconciled on the very next run.
 */
const STRANDED_AFTER_MS = 3 * 60 * 1000

type Row = Record<string, unknown>

function joinedOne(v: unknown): Record<string, unknown> | null {
  const x = Array.isArray(v) ? v[0] : v
  return x && typeof x === "object" ? (x as Record<string, unknown>) : null
}

export async function POST(req: NextRequest) {
  return run(req)
}
export async function GET(req: NextRequest) {
  return run(req)
}

/**
 * Is THIS SURFACE cleared on this route?
 *
 * Instagram rides SOCIAL_BUFFER_AUTOPUBLISH_ENABLED alone — the worker's own master switch, which
 * gate 2 has already checked before any row is read. TikTok additionally needs
 * SOCIAL_BUFFER_TIKTOK_ENABLED, because publishing TikTok through Buffer means accepting that
 * Buffer, not we, chooses the privacy level and the comment/duet/stitch settings: its
 * TikTokPostMetadataInput carries only `title` and `isAiGenerated`. That is a decision to take
 * deliberately and separately, so it has its own switch rather than arriving with the route.
 */
function routeEnabledFor(destination: unknown): boolean {
  return destination === "tiktok_video" ? bufferTikTokEnabled() : true
}

/** The joined shape both the reconcile sweep and the due loop need. Declared once so the two
 *  queries cannot drift in what they know about a row. */
const SELECT_COLUMNS =
  "id, destination, status, scheduled_at, approved_at, needs_review_at, render_status, " +
  "rendered_storage_path, caption, hashtags, social_special, source_content_id, overlay_template, " +
  "connection_id, external_post_id, media_publish_claimed_at, cover_thumb_offset_ms, " +
  // The three tiktok_privacy_level / tiktok_allowed_interactions / tiktok_disclosure columns are
  // DELIBERATELY NOT SELECTED, because they DO NOT EXIST in production — verified against the live
  // catalog on 22 Nov 2026 (social_posts has 61 columns and not one starts with `tiktok`).
  //
  // social-tiktok-publish's own due query does select them, and would therefore return HTTP 500
  // `query_failed` the moment SOCIAL_TIKTOK_AUTOPUBLISH_ENABLED is set to 'true'. That is a
  // pre-existing fault in that worker, not something this route introduces, and it is reported
  // rather than silently worked around here.
  //
  // The consequence for this worker is correct and safe: readSavedSettings() below finds no saved
  // decision on any row, so a TikTok post can never satisfy the "no decision, no post" rule and is
  // refused. In practice it never even reaches that check — bufferDestinationRefusal() already
  // refuses every tiktok_video row while that destination is `awaiting_approval`. Both gates must
  // open, and the columns must exist, before TikTok can publish through Buffer.
  "source:source_content_id(market, property_type, special, budget_range, amenities, available_to_agents), " +
  "destination_connection:connection_id!inner(agent_user_id, owner_user_id, buffer_account_id, buffer_channel_id), " +
  "render:render_id(identity_state, identity_owner_user_id)"

async function run(req: NextRequest) {
  // ── GATE 1 ────────────────────────────────────────────────────────────────────────────────
  const cronSecret = process.env.CRON_SECRET
  const auth = req.headers.get("authorization")
  if (!cronSecret || auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // ── GATE 2 — before every read and every write ────────────────────────────────────────────
  // Returning HERE rather than inside the loop is the point: a guard further down could still
  // have claimed a row before deciding not to publish it, and a claim is a database write.
  if (!bufferAutopublishEnabled()) {
    return NextResponse.json({
      ok: true,
      enabled: false,
      inert: true,
      reason: "SOCIAL_BUFFER_AUTOPUBLISH_ENABLED is not 'true' — worker is deployed but disarmed",
      published: 0,
      claimed: 0,
    })
  }

  // ── GATE 3 — the operator's master switch, shared with both siblings ──────────────────────
  // Fail closed: a missing row, an unreadable row or an unrecognised value all resolve to paused.
  const owner = process.env.SOCIAL_AUTOPOST_OWNER_USER_ID ?? null
  if (!owner) {
    return NextResponse.json({ ok: true, inert: true, reason: "no owner configured", published: 0, claimed: 0 })
  }
  const settings = await readAutoPosting(supabaseAdmin, owner)
  if (settings.state !== "on") {
    return NextResponse.json({
      ok: true,
      enabled: true,
      autoPosting: settings.state,
      inert: true,
      reason: settings.unreadable
        ? "Auto Posting could not be read — failing closed, nothing published"
        : "Social Beast Auto Posting is PAUSED",
      published: 0,
      claimed: 0,
    })
  }

  const result = {
    reconciled: 0, published: 0, pending: 0, failed: 0, claimed: 0,
    skippedNotBufferRouted: 0, skippedNoRender: 0, skippedNotApproved: 0,
    missedWhilePaused: 0, tooLate: 0, heldForReview: 0,
    notPublishableDestination: 0,
    blockedByMarketRestriction: 0, blockedByIdentity: 0,
    skippedDestinationUnreadable: 0, misconfiguredDestination: 0,
    skippedDestinationPaused: 0, reconcileSkippedPaused: 0,
    channelUnusable: 0, signFailed: 0,
    // WHICH HANDLE EACH DESTINATION ACTUALLY RESOLVED TO, for the operator to read.
    //
    // REPORTING ONLY. Nothing branches on it — see the note at the call site. The one risk in this
    // route that no downstream check can catch is an inverted channel mapping: Buffer accepts the
    // post, the network accepts it, the row records published, and the video is simply on the wrong
    // account. A TikTok open_id is scoped to the app that issued it, so the mapping cannot be
    // verified from our database at all. This is the one place the handle is visible, and it costs
    // nothing: the channel health read already fetched it and was throwing it away.
    resolvedChannels: {} as Record<string, { channelId: string; handle: string | null; bufferAccount: string | null }>,
    // Personal ownership and the first-video hold. Counted apart from the generic skips because
    // they are the two conditions an operator will actually be asking about: "why has her personal
    // video not gone out" and "why has nothing else gone out yet".
    blockedByPersonalOwnership: 0, marketWaivedForPersonal: 0,
    heldForFirstVideo: 0, skippedOwnershipUnreadable: 0,
    // PER-NETWORK OUTCOMES. The flat counters above say how the RUN went; this says how each
    // platform went, which is the question a mirrored pair raises. Keyed on the destination's own
    // provider, so it needs no knowledge of which rows are paired with which.
    byProvider: {} as Record<string, ProviderTally>,
    heldReasons: [] as { id: string; reason: string }[],
  }

  // Credentials resolved at most once per destination per run, and never held in module state —
  // see bufferDestinationCache. An unreadable result is not cached, so a hiccup on one row does
  // not condemn the next.
  const destinations = bufferDestinationCache()
  // Same discipline as the credential cache: per-run memos, never module state, and an unreadable
  // answer is not cached. Both read columns that arrive with a prepared migration, which is why
  // they are separate narrow queries rather than columns on the due select — see ownershipServer.
  const ownerships = contentOwnershipCache()
  const debuts = debutStateCache()

  // The worker is inert when no destination is Buffer-routed at all. Asked of the table rather
  // than of a resolved credential, so this short-circuits before any Vault read.
  const { count: routedCount } = await supabaseAdmin
    .from("social_connections")
    .select("id", { count: "exact", head: true })
    .not("buffer_account_id", "is", null)
    .not("buffer_channel_id", "is", null)
  if (!routedCount) {
    return NextResponse.json({ ok: true, inert: true, reason: "no Buffer-routed destination", ...result })
  }

  // ── 0) RECONCILE FIRST — observe, never re-send ───────────────────────────────────────────
  // Rows claimed for createPost that carry no Buffer post id. Buffer may or may not have created
  // the post: the claim was written immediately before the call, so the call either never happened
  // or its reply never arrived. We cannot ask "is there a post for this video?" — Buffer has no
  // such query, and `posts` is a queue listing, not a content search — so there is nothing to
  // observe and nothing safe to retry. The row is failed with a reason a human can act on.
  //
  // THIS IS THE DELIBERATE COST OF A ONE-CALL PUBLISH. The alternative, re-sending, is how one
  // approved video becomes two public posts, and a duplicate on a client-facing account is worse
  // than a post that needs a person to look at Buffer's queue once.
  const { data: strandedRows } = await supabaseAdmin
    .from("social_posts")
    .select("id, connection_id, destination_connection:connection_id!inner(buffer_account_id, buffer_channel_id)")
    .in("destination", BUFFER_DESTINATIONS)
    .eq("status", "publishing")
    .not("media_publish_claimed_at", "is", null)
    .is("external_post_id", null)
    .not("destination_connection.buffer_channel_id", "is", null)
    // Only claims old enough to be genuinely stranded — see STRANDED_AFTER_MS. A row claimed
    // seconds ago is a publish in flight, not a crash.
    .lt("media_publish_claimed_at", new Date(Date.now() - STRANDED_AFTER_MS).toISOString())
    .order("updated_at", { ascending: true })
    .limit(MAX_PER_RUN)
  for (const r of (strandedRows ?? []) as Row[]) {
    if (!isBufferRouted(joinedOne(r.destination_connection))) continue
    // A PAUSED DESTINATION'S ROW IS DEFERRED, NOT FAILED. This sweep cannot publish — it has no
    // post id to act on — but it does move the row to needs_attention, which is terminal for
    // automation. Doing that to an account the operator has deliberately paused would turn a pause
    // into a cleared queue. The row keeps its claim and is swept on the first run after a resume,
    // which is also when the operator is present to act on it. Both siblings make the same choice.
    const d = await destinations.get((r.connection_id as string | null) ?? null)
    if (d.ok && d.destination.postingPaused) {
      result.reconcileSkippedPaused++
      continue
    }
    await markFailed(
      String(r.id),
      "claimed for Buffer but no Buffer post id was recorded — check this channel's queue in Buffer " +
        "before retrying, in case the post was created",
    )
    result.reconciled++
  }

  // Rows that DID get a Buffer post id but never completed. Safe to observe: the id is the handle
  // and reading a post changes nothing.
  //
  // A PAUSE DOES NOT APPLY HERE, deliberately. This path cannot initiate a publish — the post was
  // already handed to Buffer and exists there — so all it does is record what happened. Refusing
  // to record it because the account was paused afterwards would leave a live video showing as
  // 'publishing' for ever, which is worse than the pause being briefly inconsistent with reality.
  const { data: pendingRows } = await supabaseAdmin
    .from("social_posts")
    .select("id, external_post_id, connection_id, destination_connection:connection_id!inner(buffer_account_id, buffer_channel_id)")
    .in("destination", BUFFER_DESTINATIONS)
    .eq("status", "publishing")
    .not("external_post_id", "is", null)
    .not("destination_connection.buffer_channel_id", "is", null)
    .limit(MAX_PER_RUN)
  for (const r of (pendingRows ?? []) as Row[]) {
    if (!isBufferRouted(joinedOne(r.destination_connection))) continue
    const postId = String(r.id)
    try {
      // THIS ROW'S destination. A Buffer post id belongs to the account that created it, so asking
      // with the other account's key would report nothing at all — which, read carelessly, looks
      // like "the post does not exist" and would fail a live post. Unresolvable ⇒ left pending.
      const d = await destinations.get((r.connection_id as string | null) ?? null)
      if (!d.ok) { result.pending++; continue }
      const snap = await fetchBufferPost(d.destination.apiKey, String(r.external_post_id))
      const before = result.pending
      await recordOutcome(postId, snap, result, tallyFor(result.byProvider, d.destination.provider))
      // Counted as reconciled only when the row actually left 'publishing'. A row that is still
      // sending is reported as pending, not as work done — otherwise the run report would claim
      // progress on every pass while nothing changed.
      if (result.pending === before) result.reconciled++
    } catch {
      result.pending++ // transient: leave it for the next run rather than failing a live post
    }
  }

  // ── 1) DUE POSTS ──────────────────────────────────────────────────────────────────────────
  // The same three conditions both siblings use, for the same reasons: approved_at because nothing
  // unapproved may publish, render_status because the overlay exists only in the rendered
  // derivative, and external_post_id IS NULL so a row already handed to Buffer is never re-sent.
  const nowIso = new Date().toISOString()
  const { data: due, error: dueErr } = await supabaseAdmin
    .from("social_posts")
    .select(SELECT_COLUMNS)
    .in("destination", BUFFER_DESTINATIONS)
    .eq("status", "scheduled")
    .lte("scheduled_at", nowIso)
    .is("external_post_id", null)
    .not("destination_connection.buffer_channel_id", "is", null)
    .not("destination_connection.buffer_account_id", "is", null)
    .order("scheduled_at", { ascending: true })
    .limit(MAX_PER_RUN)
  if (dueErr) {
    console.error("[buffer-worker] due query failed:", dueErr.message)
    return NextResponse.json({ error: "query_failed" }, { status: 500 })
  }

  // `as unknown as Row[]`: SELECT_COLUMNS is a concatenated const rather than a string literal, so
  // supabase-js cannot infer a row type from it and falls back to GenericStringError[]. The two
  // sweeps above use inline literals and type cleanly. The query string itself is verified by
  // executing it against production read-only — see scripts/social/bufferPublish.test.ts and the
  // run report — because a type assertion proves nothing about what PostgREST accepts.
  for (const row of (due ?? []) as unknown as Row[]) {
    const postId = String(row.id)
    try {
      const rowConn = joinedOne(row.destination_connection)

      // THE PARTITION, enforced in code and not only in the query. The query filter above is an
      // optimisation; this is the rule, and it is the same function the two native workers call to
      // exclude these rows. If the two ever disagreed, a post could be published twice — so the
      // decision is made in one place and asked three times.
      if (!isBufferRouted(rowConn)) {
        result.skippedNotBufferRouted++
        continue // untouched: no claim, no status change, still scheduled
      }

      // ── GATE 4 — the audit gate, plus "can Buffer even do this surface" ──────────────────
      const refusal = bufferDestinationRefusal(row.destination, routeEnabledFor(row.destination))
      if (refusal) {
        // not_publishable is a WAITING condition that applies to every row equally, so it is a
        // silent skip exactly as it is in the TikTok worker — failing every post while an audit is
        // pending would empty the queue for a reason that is going to resolve on its own. The other
        // two are per-row configuration errors, so they stop and say so.
        if (refusal === "not_publishable") {
          result.notPublishableDestination++
          continue // untouched
        }
        await markFailed(postId, BUFFER_REFUSAL_MESSAGE[refusal])
        result.notPublishableDestination++
        result.failed++
        continue
      }
      const destination = isSocialDestination(row.destination) ? row.destination : null
      if (!destination) {
        result.notPublishableDestination++
        continue
      }

      const rowSrc = joinedOne(row.source)
      const rowRender = joinedOne(row.render)

      if (!isEligibleAfterResume(row.scheduled_at as string | null, settings)) {
        result.missedWhilePaused++
        continue
      }
      if (!isWithinLatenessWindow(row.scheduled_at as string | null)) {
        result.tooLate++
        continue
      }
      if (!row.approved_at) {
        result.skippedNotApproved++
        continue
      }
      if (row.render_status !== "ready" || !row.rendered_storage_path) {
        result.skippedNoRender++
        continue
      }

      // ── WHOSE VIDEO IS THIS, AND IS IT STILL ALLOWED HERE? ───────────────────────────────
      // ONE read, used by the review hold, the first-video hold, the market waiver and the
      // identity refusal. It used to sit further down, after the destination was resolved, and the
      // review hold above it read available_to_agents off the due select's join instead — two
      // reads of one row, which can disagree about a video edited in between. scripts/social/
      // personalOwnership.test.ts asserts there is only this one.
      //
      // It is read HERE, after approval and the render check and still BEFORE the destination is
      // resolved, for two reasons: an unapproved or unrendered post costs no extra query, and
      // resolving a destination can FAIL a post for being misconfigured — which must not happen to
      // a post that was going to be held anyway, because a hold keeps the slot and a failure burns
      // it. Fails CLOSED: an unreadable answer holds the post, because reading a failure as "no
      // restriction" would release the protection on exactly the run that could not see it.
      const destinationIdentity = { connectionId: (row.connection_id as string | null) ?? null, ...(rowConn ?? {}) }
      const sourceContentId = (row.source_content_id as string | null) ?? null
      const owned = await ownerships.get(sourceContentId)
      if (!owned.ok) {
        console.warn("[buffer-worker]", postId, owned.reason)
        result.skippedOwnershipUnreadable++
        continue
      }
      const ownership = owned.ownership

      const holdDecision = publishHoldDecision({
        isAgentOwned: isAgentOwnedPost(row as { connection_id?: string | null }, rowConn),
        needsReviewAt: row.needs_review_at as string | null,
        // WHOSE PERSONAL VIDEO IT IS, so the withdrawal rule cannot read an ASSIGNMENT as a
        // withdrawal. An assigned personal video is stored as available_to_agents = false plus a
        // named person, and without the assignment that false held the agent's own video for ever
        // — her debut included, which is the one post that gates every other post on her account.
        availableToAgents: ownership.availableToAgents ?? undefined,
        personalAgentUserId: ownership.personalAgentUserId ?? null,
        agentUserId: effectiveAgent(rowConn ?? {}),
      })
      if (holdDecision.hold) {
        result.heldForReview++
        result.heldReasons.push({ id: postId, reason: holdDecision.reason })
        continue
      }
      if (shouldHoldForReview(row.needs_review_at as string | null) && publishHoldEnabled()) {
        result.heldForReview++
        continue
      }

      // ── THE DESTINATION, ITS KEY AND ITS SETTINGS — RESOLVED BEFORE THE CLAIM ────────────
      // BEFORE the claim, for the reason both siblings give at the same point: a claim moves the
      // row out of 'scheduled', and needs_attention has no route back to publishable, so claiming
      // first would let a condition the post can recover from burn its slot. The two outcomes are
      // therefore kept apart:
      //
      //   misconfigured   a real configuration error — nothing will change on its own, so the post
      //                   is FAILED with a reason naming what to fix.
      //   unreadable      transient. The post is left EXACTLY as it is — still scheduled, still
      //                   due, nothing claimed — and publishes on the next run.
      const resolved = await destinations.get((row.connection_id as string | null) ?? null)
      if (!resolved.ok) {
        if (resolved.kind === "misconfigured") {
          await markFailed(postId, resolved.reason)
          result.misconfiguredDestination++
          result.failed++
        } else {
          console.warn("[buffer-worker]", postId, resolved.reason)
          result.skippedDestinationUnreadable++
        }
        continue
      }
      const dest = resolved.destination

      // ── MARKET RESTRICTION, ENFORCEMENT POINT ONE: BEFORE THE CLAIM ─────────────────────
      // The planner filters each destination's pool before selection, so a restricted account is
      // never offered another market. This is the independent check at the publishing end, for the
      // paths that never consult a plan: a destination chosen by hand in the editor, a duplicated
      // post, an autoschedule, a SQL statement. Checked BEFORE the claim so a refused post keeps
      // its slot, and recorded as a FAULT because nothing in normal operation produces it — a post
      // that reaches here is on the wrong brand and needs a human to move it.
      //
      // Read from the SAME row that carried the API key, so the restriction and the credential can
      // never come from different reads of a row that changed in between.
      // ── WHOSE VIDEO IS THIS, AND HAS THIS ACCOUNT'S FIRST ONE LANDED? ──────────────────
      // Read here, before the market check, because the market check's own answer depends on it:
      // a personal video assigned to this destination's person carries no market and would be
      // refused for having none. Both reads fail CLOSED — an unreadable answer holds the post,
      // because both features RESTRICT and reading a failure as "no restriction" would release
      // the protection on exactly the run that could not see it.
      // THE FIRST VIDEO. A hold, never a failure: the row keeps its slot and publishes as soon as
      // the debut has landed on every one of this account's destinations. Asked of the
      // DESTINATION's effective agent, so it is this account's own first video that is waited for.
      const debutAgent = effectiveAgent(rowConn ?? {})
      const debut = await debuts.get(debutAgent)
      if (!debut.ok) {
        console.warn("[buffer-worker]", postId, debut.reason)
        result.skippedOwnershipUnreadable++
        continue
      }
      if (debutRefusalFor(debut.state, sourceContentId)) {
        result.heldForFirstVideo++
        continue
      }

      // ── MARKET RESTRICTION, ENFORCEMENT POINT ONE ───────────────────────────────────────
      const market = (rowSrc?.market as string | null) ?? null
      // WAIVED ONLY FOR THIS PERSON'S OWN PERSONAL VIDEO. The row must name somebody, and that
      // somebody must be this destination's own effective agent; an unassigned row is never
      // waived, so the restriction is unchanged for everything in the library today. It waives the
      // MARKET and nothing else — approval, rendering, identity, the pause and the owner-wide
      // switch all still apply, and the identity refusal below independently re-asks whether this
      // video may reach this account at all.
      const marketWaived = marketRestrictionWaived(ownership, destinationIdentity)
      if (marketWaived) result.marketWaivedForPersonal++
      const preClaimViolation = marketWaived ? null : marketRestrictionViolation(dest.marketRestriction, market)
      if (preClaimViolation) {
        await markFailed(postId, preClaimViolation)
        result.blockedByMarketRestriction++
        result.failed++
        continue
      }

      // ── CHECKPOINT: WHOSE FACE IS IN THIS, AND WHOSE ACCOUNT IS THIS ────────────────────
      // The same question both siblings ask at the same point, from the same module, so no route
      // can disagree about whether a video is safe to publish.
      const identityRefusal = renderRefusalFor({
        render: {
          identityState: (rowRender?.identity_state as RenderIdentityState | null) ?? null,
          identityOwnerUserId: (rowRender?.identity_owner_user_id as string | null) ?? null,
        },
        // The ownership read above, not the due select's join: one object, so the sharing
        // decision and the assignment cannot come from two reads of a row someone edited in
        // between. personalAgentUserId is what refuses a video assigned to somebody else — in
        // BOTH directions, including at the operator's own account.
        source: { availableToAgents: ownership.availableToAgents ?? null, personalAgentUserId: ownership.personalAgentUserId ?? null },
        destination: destinationIdentity,
      })
      if (identityRefusal) {
        await markFailed(postId, REFUSAL_MESSAGE[identityRefusal])
        if (identityRefusal === "personal_other_agent") result.blockedByPersonalOwnership++
        else result.blockedByIdentity++
        result.failed++
        continue
      }

      // ── GATE 5 — THIS DESTINATION'S OWN PAUSE SWITCH ────────────────────────────────────
      // posting_paused is per DESTINATION; Auto Posting (gate 3) is per OWNER. Pausing Lisette's
      // Instagram must stop Lisette's Instagram and nothing else, and the owner-wide switch cannot
      // express that. A pause is the operator's deliberate choice, not a fault, so the post is left
      // EXACTLY as it is — still scheduled, still due, nothing claimed, no slot burned — and
      // publishes the moment the account is resumed.
      if (dest.postingPaused) {
        result.skippedDestinationPaused++
        continue
      }

      // ── IS THE CHANNEL STILL USABLE INSIDE BUFFER? ──────────────────────────────────────
      // A channel disconnected or locked in Buffer still has a valid id and a valid API key, so a
      // createPost against it fails with a message about the channel that reads like a problem with
      // our request. Asking first turns that into one actionable sentence. It is also the only
      // place that can catch defaultToReminders flipping to true, which would make Buffer send a
      // phone notification instead of publishing — silently, from this worker's point of view,
      // because the post would simply never go out.
      //
      // A READ, so it is before the claim and safe to repeat.
      try {
        const channel = await fetchBufferChannel(dest.apiKey, dest.channelId)
        // RECORDED, NOT COMPARED. Writing the handle into the result lets a human check the mapping
        // against the accounts before anything is armed — call the worker with the arm switch off
        // and read which handle each destination resolved to. Deliberately NOT asserted against an
        // expected name: the route's whole correctness story is that it addresses accounts by id, so
        // introducing a name comparison here would make a rename on TikTok able to refuse a post.
        // Keyed by connection id, so two destinations can never overwrite each other's entry.
        result.resolvedChannels[dest.connectionId] = {
          channelId: dest.channelId,
          handle: channel.name,
          bufferAccount: dest.bufferAccountLabel,
        }
        const channelFault = channelRefusal(channel, dest)
        if (channelFault) {
          await markFailed(postId, channelFault)
          result.channelUnusable++
          result.failed++
          continue
        }
      } catch (e) {
        // Could not ask. Transient by assumption, in the safe direction: nothing is claimed and the
        // post is still due. A channel that is genuinely gone will be reported on the next run.
        console.warn("[buffer-worker]", postId, "channel check failed:", describe(e))
        result.skippedDestinationUnreadable++
        continue
      }

      // ── THE CAPTION, BUILT BY THE SAME CODE THE NATIVE ROUTES USE ───────────────────────
      // Not re-implemented here. The caption a post publishes with must not depend on which
      // transport carried it, or the same approved post would read differently on Buffer than it
      // does natively — and nobody would know which one the client saw.
      const captionSource = rowSrc as never
      const overlayTemplate = isOverlayTemplate(row.overlay_template) ? row.overlay_template : null
      const isTikTok = destination === "tiktok_video"
      const caption = isTikTok
        ? buildTikTokCaptionPayload({
            caption: row.caption as string | null,
            socialSpecial: row.social_special as string | null,
            sourceContentId: row.source_content_id as string | null,
            overlayTemplate,
            source: captionSource,
          })
        : buildInstagramCaptionPayload({
            caption: row.caption as string | null,
            hashtags: row.hashtags as string[] | null,
            socialSpecial: row.social_special as string | null,
            sourceContentId: row.source_content_id as string | null,
            overlayTemplate,
            source: captionSource,
          })

      // ── WHAT BUFFER CAN CARRY FOR TIKTOK, AND WHAT WE THEREFORE ASK FOR ────────────────
      // Buffer's TikTokPostMetadataInput has exactly two fields, `title` and `isAiGenerated`, and
      // `isAiGenerated` is OPTIONAL. There is no privacy level and no comment/duet/stitch toggle;
      // Buffer applies the channel's own TikTok defaults. So a post publishes here with no
      // disclosure field at all, and Buffer requires nothing further of us.
      //
      // THIS ROUTE USED TO REFUSE EVERY TIKTOK POST that had no saved `tiktok_disclosure`, on a
      // column that does not exist in production — so the refusal was total. It was removed for the
      // same reason this file already gives for privacy and interactions: "requiring [them] HERE
      // would refuse posts without protecting anything, which is the worst kind of gate — it reads
      // as a safeguard and enforces nothing."
      //
      // It also derived `isAiGenerated` from that disclosure (`disclosure !== "none"`), which is a
      // category error: the disclosure enum is about COMMERCIAL content — your brand, branded
      // content — while `isAiGenerated` is about AI-GENERATED content. Declaring a brand
      // relationship on human-shot footage would have labelled it AI-generated to TikTok, and
      // declaring "none" on a genuinely synthetic video would have failed to label it. Wrong in
      // both directions, so the derivation is gone rather than relocated.
      //
      // WHAT COMPLIANCE ACTUALLY REQUIRES, and where each part is met:
      //   - TikTok requires AI-generated realistic content to be LABELLED. This library is not
      //     that: the voice clips are recordings of the operator's own voice, presenter clips are
      //     uploaded footage of a real person, and overlays are text. So no AI label is correct,
      //     and `isAiGenerated` is left unset rather than guessed at.
      //   - TikTok requires COMMERCIAL content to be DISCLOSED. This content is commercial, and
      //     Buffer cannot transmit that flag — so it is disclosed in the caption, which the caption
      //     pipeline composes. That is a real disclosure; a field Buffer drops is not.
      //
      // If an AI label is ever genuinely needed, it belongs on social_settings as one owner-level
      // boolean — a table that already exists — not as three per-post columns and a new dialog.

      // ── CLAIM 1 — before anything external happens ──────────────────────────────────────
      const { data: claimed } = await supabaseAdmin
        .from("social_posts")
        .update({ status: "publishing", publish_attempted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("id", postId)
        .eq("status", "scheduled")
        .is("external_post_id", null)
        .not("approved_at", "is", null)
        .select("id")
      if (!claimed || claimed.length === 0) continue // another worker won it, or approval was revoked
      result.claimed++

      // ── THE SIGNED MEDIA URL, MINTED NOW AND NEVER STORED ──────────────────────────────
      // Buffer fetches the media itself, so this is a URL rather than bytes. Two hours of life
      // against a measured 42-second ingest; see BUFFER_SIGN_TTL_SECONDS for the measurements.
      // Minted AFTER the claim and immediately before the send, so its clock starts as late as
      // possible, and never written to a column — a signed URL is a bearer token.
      const { data: signed, error: signErr } = await supabaseAdmin.storage
        .from("social-media")
        .createSignedUrl(row.rendered_storage_path as string, BUFFER_SIGN_TTL_SECONDS)
      if (signErr || !signed?.signedUrl) {
        await markFailed(postId, "could not sign the rendered video for Buffer to fetch")
        result.signFailed++
        result.failed++
        continue
      }

      // ── MARKET RESTRICTION, ENFORCEMENT POINT TWO: THE LAST THING BEFORE THE SEND ───────
      // Re-read from the database, not from `dest`, and checked again here with nothing between
      // this line and createPost but the claim. The pre-claim check above used a value read before
      // the channel round trip and the signing round trip — a second or more earlier, and across
      // two awaits. If an operator narrows a destination's markets in that window, the pre-claim
      // check has already passed on a restriction that no longer applies.
      //
      // It costs one indexed read per publish and it is the difference between "we checked" and
      // "we checked at the moment it mattered".
      const fresh = await freshRestriction(dest.connectionId)
      if (fresh.ok) {
        // The SAME waiver as the pre-claim check, recomputed from the same ownership object rather
        // than carried as a boolean — so if the two checks ever disagree it is because the
        // restriction changed, which is the only thing this second read exists to notice.
        const lateViolation = marketWaived ? null : marketRestrictionViolation(fresh.restriction, market)
        if (lateViolation) {
          await markFailed(postId, lateViolation)
          result.blockedByMarketRestriction++
          result.failed++
          continue
        }
      } else {
        // Could not re-read. The row is already claimed, so it cannot simply be left as it was —
        // and publishing on an unknown restriction is the one thing this check exists to prevent.
        // Returned to 'scheduled' so the next run re-decides it from scratch, with nothing sent.
        await releaseClaim(postId)
        console.warn("[buffer-worker]", postId, fresh.reason)
        result.skippedDestinationUnreadable++
        continue
      }

      // ── CLAIM 2 — immediately before the send ───────────────────────────────────────────
      // After this line, Buffer may have been asked to create a post. A null claim proves it was
      // not. Nothing goes between this update and createPost.
      const { data: claimed2 } = await supabaseAdmin
        .from("social_posts")
        .update({ media_publish_claimed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("id", postId)
        .is("media_publish_claimed_at", null)
        .select("id")
      if (!claimed2 || claimed2.length === 0) continue

      const created = await createBufferPost(dest.apiKey, {
        channelId: dest.channelId,
        // A STORY SENDS NO TEXT, and that is load-bearing rather than cosmetic. An Instagram Story
        // has no caption, so there is nothing to say; and text on a Story is one of the three
        // things (with links and stickers) that push Buffer into reminder publishing, which an
        // unattended cron cannot complete. The caption is still BUILT above — the same builder the
        // native routes use — so a Reel and its Story cannot drift; it is simply not sent for the
        // surface that has no place to put it.
        //
        // Buffer applies each network's own limit; truncating to TikTok's 2200 runes keeps the two
        // routes identical, since the native TikTok path does exactly this.
        text: isBufferStory(destination) ? "" : truncateToRunes(caption, 2200),
        videoUrl: signed.signedUrl,
        thumbnailOffsetMs: Number(row.cover_thumb_offset_ms ?? 0) || 0,
        postType: bufferPostTypeFor(destination),
      })

      // PERSIST THE BUFFER POST ID BEFORE ASKING ANYTHING ELSE. It is the reconciliation key if
      // this process dies in the next millisecond, and it is what makes claim 1's
      // `external_post_id IS NULL` guard mean something on the next run.
      await supabaseAdmin
        .from("social_posts")
        .update({ external_post_id: created.id, updated_at: new Date().toISOString() })
        .eq("id", postId)

      // Buffer's createPost returns a status immediately, but shareNow is asynchronous on Buffer's
      // side — the verified publish took 42 seconds to reach `sent`. So the create response is
      // recorded and then the post is read once: if it has already completed, the row finishes
      // now; if not, it is left claimed WITH its id and the reconcile sweep resolves it next run.
      const tally = tallyFor(result.byProvider, dest.provider)
      try {
        const snap = await fetchBufferPost(dest.apiKey, created.id)
        await recordOutcome(postId, snap, result, tally)
      } catch (e) {
        // The post exists and we could not read it. NOT a failure of the post — leaving it pending
        // is correct, and the sweep at the top of the next run has its id.
        console.warn("[buffer-worker]", postId, "status read failed:", describe(e))
        result.pending++
        tally.pending++
      }
    } catch (e) {
      // Reached when createBufferPost throws. The row keeps its claim and its (absent) post id, so
      // the stranded sweep will surface it. The message is Buffer's own where there is one, which
      // is what makes the row's error_message worth reading.
      await markFailed(postId, describe(e))
      result.failed++
      // The ROW's own destination, not the resolved credential: `dest` is scoped to the try above
      // and a throw can happen before it exists. The destination column is the authoritative
      // network for a post anyway — `platform` has drifted from it before.
      tallyFor(result.byProvider, isSocialDestination(row.destination) ? DESTINATIONS[row.destination].provider : null).failed++
    }
  }

  return NextResponse.json({ ok: true, enabled: true, ...result })
}

/** Buffer's own words where we have them, ours where we do not. Never a credential: BufferApiError
 *  is constructed from Buffer's message and an HTTP status, and the key is not interpolated into
 *  either. */
function describe(e: unknown): string {
  if (e instanceof BufferApiError) return e.message.slice(0, 300)
  return e instanceof Error ? e.message.slice(0, 300) : "buffer publish error"
}

/**
 * Why this Buffer channel cannot be published to right now, or null when it can.
 *
 * defaultToReminders is the subtle one. When Buffer decides an Instagram post must be a reminder,
 * it does not refuse — it accepts the post and sends a push notification to a phone. From a cron's
 * point of view that is indistinguishable from success, and the video simply never appears. So a
 * channel in that state is refused up front, with the reason spelled out.
 */
function channelRefusal(
  channel: { isDisconnected: boolean; isLocked: boolean; defaultToReminders: boolean | null; service: string | null },
  dest: BufferDestination,
): string | null {
  const who = dest.bufferAccountLabel ? `the ${dest.bufferAccountLabel} Buffer account` : "Buffer"
  if (channel.isDisconnected) {
    return `this channel is disconnected inside ${who} — reconnect it in Buffer before publishing`
  }
  if (channel.isLocked) {
    return `this channel is locked inside ${who} and cannot be posted to — check the Buffer plan's channel limit`
  }
  if (channel.defaultToReminders === true) {
    return (
      `this Buffer channel is set to reminder publishing, so Buffer would send a phone notification ` +
      `instead of publishing — turn off "Enable Notifications by default" for it in Buffer`
    )
  }
  // A service mismatch means the channel mapping points at the wrong channel entirely, which would
  // publish one network's post to another account. Worth catching even though it needs a bad edit.
  if (dest.provider && channel.service && dest.provider !== channel.service) {
    return `this destination is ${dest.provider} but its Buffer channel is ${channel.service} — the channel mapping is wrong`
  }
  return null
}

/** Re-read ONE destination's market restriction, as late as possible. Deliberately its own
 *  function and its own query: the value must not come from a cache that predates the send. */
async function freshRestriction(
  connectionId: string,
): Promise<{ ok: true; restriction: string[] | null } | { ok: false; reason: string }> {
  const { data, error } = await supabaseAdmin
    .from("social_connections")
    .select("market_restriction")
    .eq("id", connectionId)
    .maybeSingle()
  if (error) return { ok: false, reason: `could not re-read market restriction before sending: ${error.message.slice(0, 160)}` }
  return { ok: true, restriction: parseMarketRestriction((data as { market_restriction?: unknown } | null)?.market_restriction) }
}

/**
 * Hand a claimed row back to 'scheduled'.
 *
 * Only ever called BEFORE claim 2, so nothing has been sent and there is nothing to duplicate —
 * the guard on media_publish_claimed_at being null is what makes that a fact rather than a hope.
 * Used for the one condition that is discovered after claim 1 and is recoverable: a restriction we
 * could not re-read.
 */
async function releaseClaim(postId: string) {
  await supabaseAdmin
    .from("social_posts")
    .update({ status: "scheduled", updated_at: new Date().toISOString() })
    .eq("id", postId)
    .eq("status", "publishing")
    .is("media_publish_claimed_at", null)
    .is("external_post_id", null)
}

export type ProviderTally = { published: number; pending: number; failed: number }

/** This provider's slot in the run summary, created on first use. Returns the SAME object on every
 *  call for a provider, so callers increment the summary rather than a copy of it. */
function tallyFor(byProvider: Record<string, ProviderTally>, provider: string | null | undefined): ProviderTally {
  const key = ((provider ?? "").trim() || "unknown").toLowerCase()
  const existing = byProvider[key]
  if (existing) return existing
  const fresh: ProviderTally = { published: 0, pending: 0, failed: 0 }
  byProvider[key] = fresh
  return fresh
}

/** Turn one Buffer snapshot into the row's final (or continuing) state. One place, so the create
 *  path and the reconcile path cannot interpret Buffer differently.
 *
 *  `tally` is this row's PROVIDER slot in the run summary. Passed in rather than looked up, so
 *  this function still knows nothing about connections — and incremented alongside the flat
 *  counter, never instead of it, so the two can never disagree. */
async function recordOutcome(
  postId: string,
  snap: { status: string; sentAt: string | null; notificationStatus: string | null; externalLink: string | null; errorMessage: string | null },
  result: { published: number; pending: number; failed: number },
  tally?: ProviderTally,
) {
  // A notificationStatus of any kind means Buffer treated this as a reminder, not an API publish.
  // That is a fault even when Buffer calls it 'sent', because 'markedAsPublished' means a human
  // told Buffer it had been posted — it is not evidence that anything was published by us.
  if (snap.notificationStatus) {
    await markFailed(
      postId,
      `Buffer handled this as a phone reminder (${snap.notificationStatus}), not an automatic publish — ` +
        `check that this channel is a professional account with reminder publishing turned off`,
    )
    result.failed++
    if (tally) tally.failed++
    return
  }

  const outcome = bufferOutcomeFor(snap.status, snap.errorMessage)
  if (outcome.kind === "published") {
    await supabaseAdmin
      .from("social_posts")
      .update({
        status: "published",
        published_at: snap.sentAt ?? new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", postId)
    result.published++
    if (tally) tally.published++

    // ── THE COMPANION STORY, 45 MINUTES BEHIND ITS REEL ───────────────────────────────────
    // The same call instagramFinalize makes at the same moment, for the same reason: a Story is
    // released by its Reel's SUCCESS, never by a schedule. Reached only here, after published_at
    // and status are written, so decideStoryFollowUp sees the publish facts it gates on.
    //
    // Buffer-routed Instagram was the gap. The native finalizer has always called this; the Buffer
    // worker never did, so a companion created at approval on a Buffer-routed account sat as an
    // unscheduled draft for ever. Everything that makes it safe is in releaseStoryForReel and is
    // unchanged: it is called with the REEL's id and returns `no_story` for anything without a
    // companion, so calling it for every published row — Stories and TikToks included — is a
    // no-op except where there is genuinely a Story to release.
    //
    // NON-FATAL, deliberately. A Story that could not be scheduled must not call a successful Reel
    // publish into question, and the row is already recorded published above.
    try {
      const rel = await releaseStoryForReel(supabaseAdmin as never, postId)
      if (rel.scheduled) console.log("[buffer-worker]", postId, `story ${rel.storyId} released for ${rel.dueAt}`)
      else if (rel.reason !== "no_story") console.log("[buffer-worker]", postId, `story not scheduled: ${rel.reason}`)
    } catch (e) {
      console.warn("[buffer-worker]", postId, "story release failed:", describe(e))
    }
    return
  }
  if (outcome.kind === "failed") {
    await markFailed(postId, outcome.detail)
    result.failed++
    if (tally) tally.failed++
    return
  }
  // Still working. Left at status='publishing' WITH its Buffer post id, which the reconcile sweep
  // at the top of the next run resolves. Not an error and not a loss.
  result.pending++
  if (tally) tally.pending++
}

async function markFailed(postId: string, reason: string) {
  await supabaseAdmin
    .from("social_posts")
    .update({ status: "needs_attention", error_message: reason, updated_at: new Date().toISOString() })
    .eq("id", postId)
}
