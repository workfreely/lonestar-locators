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
import { isAgentOwnedPost, effectiveAgent } from "@/lib/social/agentIdentity"
import { readAutoPosting, isEligibleAfterResume, isWithinLatenessWindow } from "@/lib/social/autoPosting"
import { DESTINATIONS, isSocialDestination } from "@/lib/social/destinations"
import { renderRefusalFor, REFUSAL_MESSAGE, type RenderIdentityState } from "@/lib/social/renderAuthorization"
import { parseMarketRestriction, marketRestrictionViolation } from "@/lib/social/marketRestriction"
// THE PARTITION between this worker and social-buffer-publish. One predicate, asked by both, so
// a post is claimable by exactly one of them and can never be published twice.
import { isBufferRouted } from "@/lib/social/bufferRoute"
import { tiktokConfigured, truncateToRunes } from "@/lib/social/tiktok"
import { tiktokAutopublishEnabled } from "@/lib/social/tiktokGate"
import {
  readSavedSettings, validateAgainstCreatorInfo, interactionsToDisableFlags, disclosureToToggles,
} from "@/lib/social/tiktokPublishSettings"
import { getValidTikTokAccessTokenForConnection, type TikTokConnectionToken } from "@/lib/social/tiktokServer"
import { buildTikTokCaptionPayload, isOverlayTemplate } from "@/lib/social/composePost"
import {
  fetchTikTokCreatorInfo,
  resolveDirectPostSelection,
  resolveContentDisclosure,
  planSingleChunk,
  mp4DurationSeconds,
  withinCreatorDuration,
  initTikTokDirectPost,
  uploadTikTokVideoSingleChunk,
  fetchTikTokPostStatus,
} from "@/lib/social/tiktokPublish"

/**
 * SOCIAL BEAST — the TikTok due-post worker.
 *
 * A SIBLING of the Instagram worker, never a modification of it. The Instagram route states that
 * "no TikTok code path is imported or reachable from this file", and the reverse holds here: this
 * file imports no Instagram helper and its selection is filtered to destination='tiktok_video',
 * so neither worker can ever act on the other's posts. That separation is the whole reason this
 * is a second file rather than a branch inside the first.
 *
 * ── IT CANNOT PUBLISH TODAY, AND THAT IS DELIBERATE ─────────────────────────────────────────
 * Four independent gates, each failing closed, any one of which stops everything:
 *
 *   1. CRON_SECRET                           — may this caller invoke the worker at all
 *   2. SOCIAL_TIKTOK_AUTOPUBLISH_ENABLED     — may the worker publish at all (missing ⇒ no)
 *   3. Auto Posting master switch            — the operator's own pause, shared with Instagram
 *   4. DESTINATIONS.tiktok_video.publish     — currently "awaiting_approval", so EVERY row is
 *                                              refused per-row even if 1–3 were open
 *
 * Gate 4 is the audit gate and is not an env var on purpose: it is a declared property of the
 * destination, enforced identically by this worker, the Instagram worker and the manual publish
 * route, so there is exactly one place to change when TikTok approves the app.
 *
 * ── WHAT IT WRITES, AND WHY THAT MATTERS RIGHT NOW ──────────────────────────────────────────
 * When armed it persists publish_id into external_post_id. The submitted Content Posting API
 * audit answer states that we persist NO Content Posting API response data, and that is true of
 * the deployed system because gate 2 is closed and this route returns before any read or write.
 * ARMING THIS WORKER MAKES THAT ANSWER FALSE. Do not set the env flag while the audit is under
 * review. scripts/social/tiktokCompliance.test.ts asserts the "persists nothing" property of the
 * three request-time routes, which are unchanged.
 *
 * It uses only columns that already exist — external_post_id, status, publish_attempted_at,
 * media_publish_claimed_at, published_at, error_message — so no migration is required and none
 * is applied. TikTok's intermediate states (PROCESSING_UPLOAD, SEND_TO_USER_INBOX) are
 * deliberately NOT stored: they are always re-derivable from publish_id via Status Fetch, and the
 * reconcile sweep below does exactly that rather than caching a value that would need a column.
 *
 * ── DUPLICATE SAFETY ────────────────────────────────────────────────────────────────────────
 * The same two-claim shape the Instagram worker proved:
 *   1. scheduled → publishing, guarded on status='scheduled' AND external_post_id IS NULL.
 *      Of N concurrent workers exactly one wins a row; the losers update 0 rows and skip.
 *   2. media_publish_claimed_at NULL → now(), immediately BEFORE init. A null claim therefore
 *      proves TikTok was never asked to create a post, so nothing exists to duplicate.
 * A row claimed but never acknowledged is reconciled against TikTok — never re-posted.
 */

const MAX_PER_RUN = 3

/** Unaudited clients may only post SELF_ONLY. Mirrors the constant in the manual publish route;
 *  both flip together, and only after TikTok approves the app. */
const UNAUDITED = true


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
  if (!tiktokAutopublishEnabled()) {
    return NextResponse.json({
      ok: true,
      enabled: false,
      inert: true,
      reason: "SOCIAL_TIKTOK_AUTOPUBLISH_ENABLED is not 'true' — worker is deployed but disarmed",
      published: 0,
      claimed: 0,
    })
  }

  if (!tiktokConfigured()) return NextResponse.json({ ok: true, skipped: "not_configured" })

  // ── GATE 3 — the operator's master switch, shared with Instagram ──────────────────────────
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
    reconciled: 0, published: 0, pending: 0, failed: 0,
    skippedNoRender: 0, skippedNotApproved: 0, claimed: 0,
    missedWhilePaused: 0, tooLate: 0, heldForReview: 0, tooLong: 0,
    missingSettings: 0, settingsNoLongerValid: 0,
    notPublishableDestination: 0,
    blockedByMarketRestriction: 0, blockedByIdentity: 0, skippedDestinationUnreadable: 0,
    skippedBufferRouted: 0,
    noDestinationToken: 0, destinationTokenUnusable: 0,
    skippedDestinationPaused: 0, reconcileSkippedPaused: 0,
    heldReasons: [] as { id: string; reason: string }[],
  }

  // ── THE DESTINATION'S MARKET RESTRICTION, per connection ───────────────────────────────────
  // THE SAME module the Instagram worker and the planner use — one definition of what a
  // restriction means, consulted from three layers, so an Instagram guard and a TikTok guard can
  // never disagree about whether "dallas" is Dallas.
  //
  // Per CONNECTION rather than per owner, deliberately — and the token is now per connection too.
  // This comment used to say the token was owner-scoped (sa_get_tiktok_token takes p_owner) and
  // that it "has to be resolved before a second TikTok account can publish". That was true when it
  // was written; 20261115000003_tiktok_connection_scoped_tokens added
  // sa_get_tiktok_token_by_connection and this worker reads through
  // getValidTikTokAccessTokenForConnection, so a second account publishes with its OWN credential.
  // The owner-scoped entry point survives for the request-time routes and answers null — never a
  // guess — once two accounts exist. Cached for the run: MAX_PER_RUN is 3, and the value cannot
  // change mid-run in a way we would want to act on.
  //
  // THIS ALSO ANSWERS WHOSE ROW IT IS. The select already reads social_connections by id, so the
  // two Buffer routing columns come back for free and the partition between this worker and
  // social-buffer-publish costs no extra query. A Buffer-routed TikTok destination holds no TikTok
  // OAuth token of ours — Buffer holds the network credential — so without this check the row
  // would fall through to "destination has no usable token", be skipped untouched, and log that
  // warning every five minutes for ever. Correct in its effect, wrong in its reason, and noisy.
  const restrictionCache = new Map<string, { restriction: string[] | null; bufferRouted: boolean }>()
  const destinationRestriction = async (
    connectionId: string | null,
  ): Promise<{ ok: true; restriction: string[] | null; bufferRouted: boolean } | { ok: false; reason: string }> => {
    // A TikTok row with no connection id has no destination row to be restricted by, so this is
    // "unrestricted". That is still the shape of most TikTok posts, not because of how the token
    // resolves — it resolves per connection now — but because connection_id is assigned when a
    // post is scheduled or manually targeted, and an untargeted draft carries none.
    if (!connectionId) return { ok: true, restriction: null, bufferRouted: false }
    const hit = restrictionCache.get(connectionId)
    if (hit) return { ok: true, ...hit }
    const { data, error } = await supabaseAdmin
      .from("social_connections")
      .select("market_restriction, buffer_account_id, buffer_channel_id")
      .eq("id", connectionId)
      .maybeSingle()
    // FAIL CLOSED, non-destructively: the caller leaves the post untouched and still due rather
    // than publishing on an unknown restriction or failing it over a transient read.
    if (error) return { ok: false, reason: `could not read destination market restriction: ${error.message.slice(0, 160)}` }
    const entry = {
      restriction: parseMarketRestriction((data as { market_restriction?: unknown } | null)?.market_restriction),
      bufferRouted: isBufferRouted(data),
    }
    restrictionCache.set(connectionId, entry)
    return { ok: true, ...entry }
  }

  // ── THE TOKEN BELONGS TO THE DESTINATION, NOT TO THE OWNER ────────────────────────────────
  // This used to resolve ONE token for the owner, before the loop, and use it for every row. With
  // two TikTok destinations under one owner that token named no particular account: the RPC behind
  // it ended in an unordered `limit 1`, so the worker would have published one brand's video from
  // whichever account the database happened to return. Nothing downstream could detect it — the
  // upload succeeds, TikTok reports PUBLISH_COMPLETE, and the video is simply on the wrong account.
  //
  // Resolved per ROW from its own connection_id instead, and memoised for the run so N posts to one
  // destination still cost one resolution (and at most one refresh). Mirrors what the Instagram
  // worker has always done through resolveDestination.
  //
  // The connection row's posting_paused comes back with the token, and it IS acted on — see the
  // due loop and the stranded sweep below. Planning already excludes a paused destination
  // (computeAutopilotPlan's `enabled`), so a pause keeps NEW posts off its queue; these guards are
  // what stop the posts ALREADY on it from going out, which planning cannot reach.
  const tokenCache = new Map<string, TikTokConnectionToken | null>()
  const tokenFor = async (connectionId: string | null): Promise<TikTokConnectionToken | null> => {
    // No destination on the row means there is no credential to choose. The owner-level fallback
    // this replaced is exactly the ambiguity being removed, so a null connection is refused rather
    // than guessed at.
    if (!connectionId) return null
    if (tokenCache.has(connectionId)) return tokenCache.get(connectionId) ?? null
    const tok = await getValidTikTokAccessTokenForConnection(connectionId)
    tokenCache.set(connectionId, tok)
    return tok
  }

  // The worker is still inert when no TikTok destination exists at all — the same early return as
  // before, asked of the table rather than of one resolved token.
  const { count: ttConnections } = await supabaseAdmin
    .from("social_connections")
    .select("id", { count: "exact", head: true })
    .eq("provider", "tiktok")
  if (!ttConnections) {
    return NextResponse.json({ ok: true, inert: true, reason: "tiktok not connected", ...result })
  }

  // ── 0) RECONCILE first — observe, never re-post ───────────────────────────────────────────
  // Rows that were claimed for init but carry no publish id. TikTok may or may not have created
  // the post. We cannot ask "did a post exist for this upload?" without a publish_id, so there is
  // nothing to observe and nothing safe to retry: the row is failed with a reason a human can act
  // on. Re-posting here is exactly how a duplicate would be created.
  const { data: strandedRows } = await supabaseAdmin
    .from("social_posts")
    .select("id, media_publish_claimed_at, updated_at, connection_id")
    .eq("destination", "tiktok_video")
    .eq("status", "publishing")
    .not("media_publish_claimed_at", "is", null)
    .is("external_post_id", null)
    .order("updated_at", { ascending: true })
    .limit(MAX_PER_RUN)
  for (const r of (strandedRows ?? []) as Row[]) {
    // A PAUSED DESTINATION'S ROW IS DEFERRED, NOT FAILED. This sweep cannot publish — it has no
    // publish_id to act on — but it does move the row to needs_attention, which is terminal for
    // automation. Doing that to an account the operator has deliberately paused would turn a pause
    // into a cleared queue. The row keeps its claim and is swept on the first run after a resume,
    // which is also when the operator can act on it. Same choice the Instagram worker makes when a
    // paused account meets its reconcile sweep.
    // A Buffer-routed row's reconciliation belongs to social-buffer-publish, which holds the
    // Buffer post id and the key to ask about it. Asked before the token, which a Buffer
    // destination does not have.
    const strandedRoute = await destinationRestriction((r.connection_id as string | null) ?? null)
    if (strandedRoute.ok && strandedRoute.bufferRouted) {
      result.skippedBufferRouted++
      continue
    }
    const strandedTok = await tokenFor((r.connection_id as string | null) ?? null)
    if (strandedTok?.postingPaused) {
      result.reconcileSkippedPaused++
      continue
    }
    await markFailed(String(r.id), "claimed for TikTok init but no publish_id recorded — needs manual check in TikTok before retrying")
    result.reconciled++
  }

  // Rows that DID get a publish id but never completed. These are safe to observe: the publish_id
  // is the handle, and Status Fetch is a read.
  //
  // A PAUSE DOES NOT APPLY HERE, deliberately. This path cannot initiate a publish — the post was
  // already handed to TikTok and exists there — so all it does is record what happened. Refusing to
  // record it because the account was paused afterwards would leave a live video showing as
  // 'publishing' for ever, which is worse than the pause being briefly inconsistent with reality.
  // The pause stops NEW publishing, which is the due loop and the stranded sweep above.
  const { data: pendingRows } = await supabaseAdmin
    .from("social_posts")
    .select("id, external_post_id, connection_id")
    .eq("destination", "tiktok_video")
    .eq("status", "publishing")
    .not("external_post_id", "is", null)
    .limit(MAX_PER_RUN)
  for (const r of (pendingRows ?? []) as Row[]) {
    try {
      // THIS ROW'S destination. A publish_id belongs to the account that created it, so asking
      // with another account's token is not merely wrong, it would report a stranger's post or
      // nothing at all. Unresolvable → left pending for the next run, never guessed at.
      // Same partition check as the stranded sweep, and before the token for the same reason.
      const pendingRoute = await destinationRestriction((r.connection_id as string | null) ?? null)
      if (pendingRoute.ok && pendingRoute.bufferRouted) {
        result.skippedBufferRouted++
        continue
      }
      const rowTok = await tokenFor((r.connection_id as string | null) ?? null)
      if (!rowTok) { result.pending++; continue }
      const status = await fetchTikTokPostStatus(rowTok.accessToken, String(r.external_post_id))
      if (status.status === "PUBLISH_COMPLETE") {
        await supabaseAdmin.from("social_posts").update({
          status: "published",
          published_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }).eq("id", r.id as string)
        result.reconciled++
      } else if (status.status === "FAILED") {
        await markFailed(String(r.id), status.fail_reason ?? "TikTok reported FAILED")
        result.reconciled++
      } else {
        result.pending++
      }
    } catch {
      result.pending++ // transient: leave it for the next run rather than failing a live post
    }
  }

  // ── 1) DUE POSTS ──────────────────────────────────────────────────────────────────────────
  // Same three conditions the Instagram worker uses, for the same reasons: render_status is
  // checked because the overlay only exists in the rendered derivative, and a TikTok render is
  // not interchangeable with an Instagram one.
  const nowIso = new Date().toISOString()
  const { data: due, error: dueErr } = await supabaseAdmin
    .from("social_posts")
    .select("id, destination, platform, status, scheduled_at, approved_at, needs_review_at, render_status, rendered_storage_path, caption, hashtags, social_special, source_content_id, overlay_template, connection_id, tiktok_privacy_level, tiktok_allowed_interactions, tiktok_disclosure, source:source_content_id(market, property_type, special, budget_range, amenities, available_to_agents, personal_agent_user_id), destination_connection:connection_id(agent_user_id, owner_user_id), render:render_id(identity_state, identity_owner_user_id)")
    .eq("destination", "tiktok_video")
    .eq("status", "scheduled")
    .lte("scheduled_at", nowIso)
    .is("external_post_id", null)
    .order("scheduled_at", { ascending: true })
    .limit(MAX_PER_RUN)
  if (dueErr) {
    console.error("[tiktok-worker] due query failed:", dueErr.message)
    return NextResponse.json({ error: "query_failed" }, { status: 500 })
  }

  for (const row of (due ?? []) as Row[]) {
    const postId = String(row.id)
    try {
      // ── GATE 4 — the audit gate ───────────────────────────────────────────────────────────
      // Declared on the destination, enforced the same way by every publish path. While
      // tiktok_video is "awaiting_approval" this refuses every row, which is why the worker is
      // safe to deploy before TikTok approves the app.
      const destination = isSocialDestination(row.destination) ? row.destination : null
      if (!destination || DESTINATIONS[destination].provider !== "tiktok") {
        result.notPublishableDestination++
        continue
      }
      if (DESTINATIONS[destination].publish !== "supported") {
        result.notPublishableDestination++
        continue // untouched: no claim, no status change, still scheduled
      }

      const rowConn = joinedOne(row.destination_connection)
      const rowSrc = joinedOne(row.source)
      // Absent on every pre-Phase-B render, which the predicate reads as 'unknown'.
      const rowRender = joinedOne((row as Record<string, unknown>).render)
      const holdDecision = publishHoldDecision({
        isAgentOwned: isAgentOwnedPost(row as { connection_id?: string | null }, rowConn),
        needsReviewAt: row.needs_review_at as string | null,
        // WHOSE PERSONAL VIDEO IT IS, so the withdrawal rule cannot read an ASSIGNMENT as a
        // withdrawal. An assigned personal video is stored as available_to_agents = false plus a
        // named person; without these two fields that false held the agent's own video forever.
        availableToAgents: (rowSrc?.available_to_agents as boolean | null | undefined) ?? undefined,
        personalAgentUserId: (rowSrc?.personal_agent_user_id as string | null | undefined) ?? null,
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

      // ── THE DESTINATION'S MARKET RESTRICTION — THE SECOND ENFORCEMENT POINT ───────────────
      // The planner filters each destination's pool before selection, so a restricted account is
      // never offered another market. This is the independent check at the publishing end, for the
      // paths that never consult a plan: a destination chosen by hand in the editor, a duplicated
      // post, an autoschedule, a SQL statement. Checked BEFORE the claim so a refused post keeps
      // its slot, and recorded as a FAULT because nothing in normal operation produces it — a post
      // that reaches here is on the wrong brand and needs a human to move it.
      const restriction = await destinationRestriction(row.connection_id as string | null)
      if (!restriction.ok) {
        console.warn("[tiktok-worker]", postId, restriction.reason)
        result.skippedDestinationUnreadable++
        continue // untouched: no claim, no status change, still scheduled
      }
      // NOT OURS. Untouched — no claim, no status change, still scheduled — so
      // social-buffer-publish finds the row exactly as it was. Checked here, before the token
      // resolution below, because that resolution would answer null for a Buffer-routed
      // destination and the row would be logged as a broken token rather than another worker's.
      if (restriction.bufferRouted) {
        result.skippedBufferRouted++
        continue
      }
      const marketViolation = marketRestrictionViolation(restriction.restriction, (rowSrc?.market as string | null) ?? null)
      if (marketViolation) {
        await markFailed(postId, marketViolation)
        result.blockedByMarketRestriction++
        result.failed++
        continue
      }

      // ── CHECKPOINT 3 of 3: WHOSE FACE IS IN THIS, AND WHOSE ACCOUNT IS THIS ──────────────
      // The same question the Instagram worker asks at the same point, from the same module, so
      // the two networks cannot disagree about whether a video is safe to publish. Before the
      // claim, and needs_attention rather than a skip: an unsafe post must stop and be seen, not
      // be retried every five minutes.
      const identityRefusal = renderRefusalFor({
        render: {
          identityState: (rowRender?.identity_state as RenderIdentityState | null) ?? null,
          identityOwnerUserId: (rowRender?.identity_owner_user_id as string | null) ?? null,
        },
        // See the Instagram sibling: an assigned personal video needs its owner named here,
        // or the identity rule refuses it at the only account it is allowed to reach.
        source: {
          availableToAgents: (rowSrc?.available_to_agents as boolean | null) ?? null,
          personalAgentUserId: (rowSrc?.personal_agent_user_id as string | null) ?? null,
        },
        destination: { connectionId: (row.connection_id as string | null) ?? null, ...(rowConn ?? {}) },
      })
      if (identityRefusal) {
        await markFailed(postId, REFUSAL_MESSAGE[identityRefusal])
        result.blockedByIdentity++
        result.failed++
        continue
      }

      // ── THIS POST'S OWN DESTINATION TOKEN, RESOLVED BEFORE THE CLAIM ────────────────────
      // Every TikTok call below — Creator Info, init, upload, status — speaks as the account this
      // post was actually scheduled to, never as "the owner's TikTok account".
      //
      // BEFORE the claim, for the reason the Instagram worker gives at the same point: a claim
      // moves the row out of 'scheduled', and needs_attention has no route back to publishable, so
      // claiming first would let a condition the post can recover from burn its slot. The two
      // outcomes are therefore kept apart, exactly as resolveDestination keeps paused apart from
      // fault:
      //
      //   no connection_id   a real configuration error — nothing can choose an account for it, so
      //                      it is FAILED with a reason naming what to do. A human reassigns it.
      //   no usable token    disconnected, or a refresh that did not come back. The post is left
      //                      EXACTLY as it is — still scheduled, still due, nothing claimed — and
      //                      publishes on the next run once the account is reconnected. A transient
      //                      refresh hiccup must not permanently sideline an approved post.
      const postTok = await tokenFor((row.connection_id as string | null) ?? null)
      if (!postTok) {
        if (!row.connection_id) {
          await markFailed(postId, "this post has no TikTok publishing destination selected — assign one and re-approve")
          result.noDestinationToken++
        } else {
          console.warn("[tiktok-worker]", postId, "destination has no usable token — left scheduled")
          result.destinationTokenUnusable++
        }
        continue
      }

      // ── THIS DESTINATION'S OWN PAUSE SWITCH ─────────────────────────────────────────────
      // posting_paused is per DESTINATION; Auto Posting (gate 3 above) is per OWNER. Pausing
      // @locatorbeast must stop @locatorbeast and nothing else, and the owner-wide switch cannot
      // express that. Read off the same row as the token, so there is no second query to disagree.
      //
      // Treated exactly as the Instagram worker treats it, and for the same reason: a pause is the
      // operator's deliberate choice, not a fault, so the post is left EXACTLY as it is — still
      // scheduled, still due, nothing claimed, no slot burned — and publishes the moment the
      // account is resumed. Checked BEFORE the claim, because a claim moves the row out of
      // 'scheduled' and needs_attention has no route back to publishable.
      if (postTok.postingPaused) {
        result.skippedDestinationPaused++
        continue
      }

      // ── CLAIM 1 — before anything external happens ────────────────────────────────────────
      const { data: claimed } = await supabaseAdmin
        .from("social_posts")
        .update({ status: "publishing", publish_attempted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("id", postId)
        .eq("status", "scheduled")
        .is("external_post_id", null)
        .select("id")
      if (!claimed || claimed.length === 0) continue // another worker won it
      result.claimed++

      // ── THE CREATOR'S OWN DECISION, OR NOTHING ────────────────────────────────────────────
      // No defaults are invented here. A post without a complete saved decision is not published;
      // it is sent for review. The scheduling gate already refuses to schedule such a post, so
      // reaching this is unexpected — which is exactly why it is checked rather than assumed.
      const saved = readSavedSettings(row)
      if (!saved) {
        await markFailed(postId, "no saved TikTok publishing settings — open Post to TikTok, choose privacy, interactions and disclosure, then re-approve")
        result.missingSettings++
        continue
      }

      // Creator Info immediately before the post, as the guidelines require.
      const info = await fetchTikTokCreatorInfo(postTok.accessToken)

      // RE-VALIDATE, DO NOT CLAMP. resolveDirectPostSelection silently narrows a requested
      // interaction to what the creator currently allows — correct for a human looking at a
      // greyed-out control, wrong here: unattended, narrowing means publishing something other
      // than what was approved with nobody told. So an interaction or privacy level that is no
      // longer permitted STOPS the post and asks for review.
      const check = validateAgainstCreatorInfo(saved, info, { unaudited: UNAUDITED })
      if (!check.ok) {
        await markFailed(postId, check.detail)
        result.settingsNoLongerValid++
        continue
      }

      const flags = interactionsToDisableFlags(saved.allowedInteractions)
      // Passed through resolveDirectPostSelection as well, so the one place that encodes TikTok's
      // rules still has the final word. After the check above it can only agree.
      const selection = resolveDirectPostSelection(
        info,
        { privacyLevel: saved.privacyLevel, ...flags },
        { unaudited: UNAUDITED },
      )
      const d = disclosureToToggles(saved.disclosure)
      const disclosure = resolveContentDisclosure(
        { on: saved.disclosure !== "none", yourBrand: d.yourBrand, brandedContent: d.brandedContent },
        selection.privacyLevel,
      )

      const caption = buildTikTokCaptionPayload({
        caption: row.caption as string | null,
        socialSpecial: row.social_special as string | null,
        sourceContentId: row.source_content_id as string | null,
        overlayTemplate: isOverlayTemplate(row.overlay_template) ? row.overlay_template : null,
        source: rowSrc as never,
      })
      const title = truncateToRunes(caption, 2200)

      const { data: blob, error: dlErr } = await supabaseAdmin.storage
        .from("social-media")
        .download(row.rendered_storage_path as string)
      if (dlErr || !blob) {
        await markFailed(postId, "render download failed")
        result.failed++
        continue
      }
      const bytes = await blob.arrayBuffer()
      const chunk = planSingleChunk(bytes.byteLength)

      const durationSeconds = mp4DurationSeconds(bytes)
      if (!withinCreatorDuration(durationSeconds, info.max_video_post_duration_sec)) {
        await markFailed(postId, `video is ${Math.round(durationSeconds ?? 0)}s, over this account's ${info.max_video_post_duration_sec}s limit`)
        result.tooLong++
        continue
      }

      // ── CLAIM 2 — immediately before init ─────────────────────────────────────────────────
      // After this, TikTok may have been asked to create a post. A null claim proves it was not.
      const { data: claimed2 } = await supabaseAdmin
        .from("social_posts")
        .update({ media_publish_claimed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("id", postId)
        .is("media_publish_claimed_at", null)
        .select("id")
      if (!claimed2 || claimed2.length === 0) continue

      const { publishId, uploadUrl } = await initTikTokDirectPost(postTok.accessToken, {
        title,
        privacyLevel: selection.privacyLevel,
        disableComment: selection.disableComment,
        disableDuet: selection.disableDuet,
        disableStitch: selection.disableStitch,
        brandOrganicToggle: disclosure.brandOrganicToggle,
        brandContentToggle: disclosure.brandContentToggle,
        videoSize: bytes.byteLength,
        chunkSize: chunk.chunkSize,
        totalChunkCount: chunk.totalChunkCount,
      })
      // PERSIST THE PUBLISH ID BEFORE UPLOADING. It is the reconciliation key if this process
      // dies mid-upload, and it is what makes claim 1's `external_post_id IS NULL` guard mean
      // something on the next run.
      await supabaseAdmin
        .from("social_posts")
        .update({ external_post_id: publishId, updated_at: new Date().toISOString() })
        .eq("id", postId)

      await uploadTikTokVideoSingleChunk(uploadUrl, bytes)
      const status = await fetchTikTokPostStatus(postTok.accessToken, publishId)
      if (status.status === "PUBLISH_COMPLETE") {
        await supabaseAdmin.from("social_posts").update({
          status: "published",
          published_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }).eq("id", postId)
        result.published++
      } else if (status.status === "FAILED") {
        await markFailed(postId, status.fail_reason ?? "TikTok reported FAILED")
        result.failed++
      } else {
        // Still processing. Left at status='publishing' WITH its publish id, which the reconcile
        // sweep at the top of the next run resolves. Not an error and not a loss.
        result.pending++
      }
    } catch (e) {
      await markFailed(postId, e instanceof Error ? e.message.slice(0, 300) : "tiktok publish error")
      result.failed++
    }
  }

  return NextResponse.json({ ok: true, enabled: true, ...result })
}

// RELEASING THE IN-FLIGHT CLAIM IS PART OF FAILING.
//
// media_publish_claimed_at asserts "a publish call is in flight". markFailed used to leave it
// set, and that made a failed row UNRECOVERABLE BY EVERY ROUTE. The second claim is
// `.is("media_publish_claimed_at", null)`, so once the column held a stale timestamp the worker
// took the row, failed that claim, skipped it silently, and the stranded sweep failed it again
// three minutes later — for ever. Lisette's debut sat in exactly that loop on 24 Nov: claimed at
// 15:05, failed, and then every later attempt skipped it without ever calling Buffer, while the
// error message said to check Buffer's queue for a post that was never created.
//
// Clearing it here is safe on every path that reaches markFailed. Either the row already has an
// external_post_id — in which case the first claim's `external_post_id IS NULL` is what prevents
// a resend, not this column — or it has none, and nothing is in flight to protect.
async function markFailed(postId: string, reason: string) {
  await supabaseAdmin
    .from("social_posts")
    .update({ status: "needs_attention", error_message: reason, media_publish_claimed_at: null, updated_at: new Date().toISOString() })
    .eq("id", postId)
}

/**
 * ── HOW THIS STAYS COMPLIANT WITHOUT A CREATOR PRESENT ──────────────────────────────────────
 *
 * TikTok's Content Sharing Guidelines put privacy, interaction settings and commercial disclosure
 * in the creator's hands: privacy chosen manually with no default, toggles starting unchecked,
 * disclosure starting off. A cron job has no creator present, so it cannot satisfy those rules by
 * choosing. It satisfies them by REPLAYING a choice a person made — in the same dialog, under the
 * same deployed controls — and recorded against this specific post.
 *
 * The three rules that make the replay honest rather than a loophole:
 *
 *   1. NO DECISION, NO POST. A row without complete saved settings is sent for review, never
 *      published with assumed values. The scheduling gate refuses it earlier; this refuses it
 *      again, because a safety property enforced in one place is one edit from being gone.
 *   2. CHANGING THE DECISION UN-APPROVES THE POST. Approval is of "this video, posted this way",
 *      so editing privacy, interactions or disclosure clears approved_at (route + database
 *      trigger) and the post cannot be scheduled again until a human re-approves. It does NOT
 *      invalidate the render: changing privacy changes no pixels.
 *   3. STALE DECISIONS STOP, THEY DO NOT DEGRADE. Creator Info is fetched immediately before
 *      posting and the saved decision is validated against it. A privacy level no longer offered,
 *      or an interaction the creator has since switched off in the TikTok app, fails the post with
 *      a reason. It is never quietly narrowed to something that would be accepted — publishing
 *      something other than what was approved, with nobody told, is the failure this prevents.
 *
 * WHAT REMAINS GATED. None of the above makes public posting available: UNAUDITED forces
 * SELF_ONLY, and gate 4 refuses every row while tiktok_video is "awaiting_approval". Both flip
 * only after TikTok approves the app, and the env flag is armed last.
 */
