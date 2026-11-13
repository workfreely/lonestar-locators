export const runtime = "nodejs"
export const dynamic = "force-dynamic"

import { NextResponse, type NextRequest } from "next/server"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { shouldHoldForReview, publishHoldEnabled, publishHoldDecision } from "@/lib/social/publishHold"
import { isAgentOwnedPost } from "@/lib/social/agentIdentity"
import { readAutoPosting, isEligibleAfterResume, isWithinLatenessWindow } from "@/lib/social/autoPosting"
import { DESTINATIONS, isSocialDestination } from "@/lib/social/destinations"
import { parseMarketRestriction, marketRestrictionViolation } from "@/lib/social/marketRestriction"
import { tiktokConfigured, truncateToRunes } from "@/lib/social/tiktok"
import { tiktokAutopublishEnabled } from "@/lib/social/tiktokGate"
import {
  readSavedSettings, validateAgainstCreatorInfo, interactionsToDisableFlags, disclosureToToggles,
} from "@/lib/social/tiktokPublishSettings"
import { getValidTikTokAccessToken } from "@/lib/social/tiktokServer"
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
    blockedByMarketRestriction: 0, skippedDestinationUnreadable: 0,
    heldReasons: [] as { id: string; reason: string }[],
  }

  // ── THE DESTINATION'S MARKET RESTRICTION, per connection ───────────────────────────────────
  // THE SAME module the Instagram worker and the planner use — one definition of what a
  // restriction means, consulted from three layers, so an Instagram guard and a TikTok guard can
  // never disagree about whether "dallas" is Dallas.
  //
  // Per CONNECTION rather than per owner, deliberately. This worker's TOKEN is still owner-scoped
  // (sa_get_tiktok_token takes p_owner), which is the pre-existing limitation that has to be
  // resolved before a second TikTok account can publish — but the restriction is a property of the
  // DESTINATION, and reading it off the row means this guard is already correct for that second
  // account the moment its row exists. Cached for the run: MAX_PER_RUN is 3, and the value cannot
  // change mid-run in a way we would want to act on.
  const restrictionCache = new Map<string, string[] | null>()
  const destinationRestriction = async (
    connectionId: string | null,
  ): Promise<{ ok: true; restriction: string[] | null } | { ok: false; reason: string }> => {
    // A TikTok row with no connection id has no destination row to be restricted by. That is the
    // shape every TikTok post has today, because the token is resolved from the owner rather than
    // from a connection — so this is "unrestricted", exactly as it behaves now.
    if (!connectionId) return { ok: true, restriction: null }
    if (restrictionCache.has(connectionId)) return { ok: true, restriction: restrictionCache.get(connectionId) ?? null }
    const { data, error } = await supabaseAdmin
      .from("social_connections")
      .select("market_restriction")
      .eq("id", connectionId)
      .maybeSingle()
    // FAIL CLOSED, non-destructively: the caller leaves the post untouched and still due rather
    // than publishing on an unknown restriction or failing it over a transient read.
    if (error) return { ok: false, reason: `could not read destination market restriction: ${error.message.slice(0, 160)}` }
    const parsed = parseMarketRestriction((data as { market_restriction?: unknown } | null)?.market_restriction)
    restrictionCache.set(connectionId, parsed)
    return { ok: true, restriction: parsed }
  }

  const token = await getValidTikTokAccessToken(owner)
  if (!token) {
    return NextResponse.json({ ok: true, inert: true, reason: "tiktok not connected", ...result })
  }

  // ── 0) RECONCILE first — observe, never re-post ───────────────────────────────────────────
  // Rows that were claimed for init but carry no publish id. TikTok may or may not have created
  // the post. We cannot ask "did a post exist for this upload?" without a publish_id, so there is
  // nothing to observe and nothing safe to retry: the row is failed with a reason a human can act
  // on. Re-posting here is exactly how a duplicate would be created.
  const { data: strandedRows } = await supabaseAdmin
    .from("social_posts")
    .select("id, media_publish_claimed_at, updated_at")
    .eq("destination", "tiktok_video")
    .eq("status", "publishing")
    .not("media_publish_claimed_at", "is", null)
    .is("external_post_id", null)
    .order("updated_at", { ascending: true })
    .limit(MAX_PER_RUN)
  for (const r of (strandedRows ?? []) as Row[]) {
    await markFailed(String(r.id), "claimed for TikTok init but no publish_id recorded — needs manual check in TikTok before retrying")
    result.reconciled++
  }

  // Rows that DID get a publish id but never completed. These are safe to observe: the publish_id
  // is the handle, and Status Fetch is a read.
  const { data: pendingRows } = await supabaseAdmin
    .from("social_posts")
    .select("id, external_post_id")
    .eq("destination", "tiktok_video")
    .eq("status", "publishing")
    .not("external_post_id", "is", null)
    .limit(MAX_PER_RUN)
  for (const r of (pendingRows ?? []) as Row[]) {
    try {
      const status = await fetchTikTokPostStatus(token.accessToken, String(r.external_post_id))
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
    .select("id, destination, platform, status, scheduled_at, approved_at, needs_review_at, render_status, rendered_storage_path, caption, hashtags, social_special, source_content_id, overlay_template, connection_id, tiktok_privacy_level, tiktok_allowed_interactions, tiktok_disclosure, source:source_content_id(market, property_type, special, budget_range, amenities, available_to_agents), destination_connection:connection_id(agent_user_id)")
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
      const holdDecision = publishHoldDecision({
        isAgentOwned: isAgentOwnedPost(row as { connection_id?: string | null }, rowConn),
        needsReviewAt: row.needs_review_at as string | null,
        availableToAgents: (rowSrc?.available_to_agents as boolean | null | undefined) ?? undefined,
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
      const marketViolation = marketRestrictionViolation(restriction.restriction, (rowSrc?.market as string | null) ?? null)
      if (marketViolation) {
        await markFailed(postId, marketViolation)
        result.blockedByMarketRestriction++
        result.failed++
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
      const info = await fetchTikTokCreatorInfo(token.accessToken)

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

      const { publishId, uploadUrl } = await initTikTokDirectPost(token.accessToken, {
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
      const status = await fetchTikTokPostStatus(token.accessToken, publishId)
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

async function markFailed(postId: string, reason: string) {
  await supabaseAdmin
    .from("social_posts")
    .update({ status: "needs_attention", error_message: reason, updated_at: new Date().toISOString() })
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
