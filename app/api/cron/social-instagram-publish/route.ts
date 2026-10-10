export const runtime = "nodejs"
export const dynamic = "force-dynamic"

import { shouldHoldForReview, publishHoldEnabled } from "@/lib/social/publishHold"
import { NextResponse, type NextRequest } from "next/server"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { instagramConfigured, createReelContainer, createStoryContainer } from "@/lib/social/instagram"
import { buildInstagramCaptionPayload, isOverlayTemplate } from "@/lib/social/composePost"
import { finalizeInstagramPublish } from "@/lib/social/instagramFinalize"
import { chooseCover, resolveReelCover } from "@/lib/social/reelCover"
import {
  readAutoPosting, isEligibleAfterResume, isWithinLatenessWindow,
  AUTO_POSTING_FALLBACK, type AutoPostingSettings,
} from "@/lib/social/autoPosting"
import { DESTINATIONS, isSocialDestination, destinationFromLegacyPlatform } from "@/lib/social/destinations"

/**
 * SOCIAL BEAST — the Instagram due-post worker.
 *
 * Publishes scheduled Instagram posts whose time has come. INSTAGRAM ONLY: the selection is
 * filtered on platform='instagram' and the only publish calls it can reach are the Instagram Graph
 * helpers. No TikTok code path is imported or reachable from this file.
 *
 * ── WHAT MAKES A POST DUE ────────────────────────────────────────────────────────────────────
 *   status='scheduled'  AND  scheduled_at <= now()  AND  render_status='ready'
 *
 * All three, every run. render_status is checked because the overlay only exists in the rendered
 * derivative — a scheduled post with no current render must NOT fall back to the raw source, which
 * would publish overlay-less, unvalidated footage. Such a post is left scheduled and reported, not
 * published and not failed.
 *
 * ── WHY NOT status='ready' ───────────────────────────────────────────────────────────────────
 * 'ready' means "rendered, publishable NOW" and is what the manual publish button claims. A
 * scheduled post deliberately stays 'scheduled' through rendering so its scheduled_at still
 * governs; this worker is the only thing that may act on that time.
 *
 * ── DUPLICATE SAFETY ─────────────────────────────────────────────────────────────────────────
 * Two independent claims, both atomic conditional UPDATEs, both BEFORE any Meta call:
 *   1. scheduled → publishing, guarded on status='scheduled' AND external_post_id IS NULL.
 *      Of N concurrent workers exactly one wins a given post; the losers see 0 rows and skip.
 *   2. media_publish_claimed_at NULL → now(), inside finalizeInstagramPublish, immediately before
 *      media_publish.
 * A crash between claim 2 and Meta's response is reconciled, never retried blindly — see the
 * unacknowledged sweep below and the comments in lib/social/instagramFinalize.ts.
 *
 * One post's failure never blocks the rest: every post runs inside its own try/catch and a failure
 * is recorded on that row only.
 */

/** Hard ceiling per invocation, so one run cannot hold a serverless function open indefinitely or
 *  empty a backlog into Instagram in one burst. Remaining due posts are picked up next run. */
const MAX_PER_RUN = 5

/**
 * LAUNCH GATE — the environment kill switch, separate from and in addition to CRON_SECRET.
 *
 * CRON_SECRET answers "is this caller allowed to invoke the worker?". This answers "is the worker
 * allowed to publish at all?". They are different questions, and the second one is the one that
 * lets this route be deployed and verified in production while real Instagram publishing stays
 * off.
 *
 * FAIL CLOSED, and deliberately strict: only the exact string "true" arms it. Missing, empty,
 * "false", "1", "yes", "TRUE " with a stray space — every one of those is OFF. A typo in a Vercel
 * env var must never be the thing that starts posting to a real account.
 */
function autopublishEnabled(): boolean {
  return (process.env.SOCIAL_INSTAGRAM_AUTOPUBLISH_ENABLED ?? "").trim() === "true"
}
/** How long to wait for Meta to finish transcoding a Reel container before giving up for this run.
 *  The post stays claimed as 'publishing' with its container id and is reconciled next run. */
const CONTAINER_WAIT_MS = 55_000
const CONTAINER_POLL_MS = 5_000

type Row = Record<string, unknown>

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export async function POST(req: NextRequest) {
  return run(req)
}
export async function GET(req: NextRequest) {
  return run(req)
}

async function run(req: NextRequest) {
  // FAIL CLOSED. A missing CRON_SECRET locks the route rather than opening it — same shape as
  // every other cron in this app (see app/api/cron/followup-tick).
  const cronSecret = process.env.CRON_SECRET
  const auth = req.headers.get("authorization")
  if (!cronSecret || auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  // The gate sits BEFORE every read and every write. When it is off this route authenticates and
  // reports, and does nothing else: no due query, no reconcile sweep, no claim, no render, no
  // container, no publish. Returning here rather than inside the loop is the point — a guard
  // further down could still have claimed a row before deciding not to publish it.
  if (!autopublishEnabled()) {
    return NextResponse.json({
      ok: true,
      enabled: false,
      inert: true,
      reason: "SOCIAL_INSTAGRAM_AUTOPUBLISH_ENABLED is not 'true' — worker is deployed but disarmed",
      published: 0,
      claimed: 0,
    })
  }

  if (!instagramConfigured()) return NextResponse.json({ ok: true, skipped: "not_configured" })

  // ── GATE 2: the operator's master switch ──────────────────────────────────────────────────
  // Read BEFORE any claim or write, same as the env flag. Fail closed: a missing row, an
  // unreadable row, or an unrecognised value all resolve to paused, and `unreadable` is reported
  // so a database problem is never presented as a confident "paused".
  const owner = process.env.SOCIAL_AUTOPOST_OWNER_USER_ID ?? null
  const settings = owner
    ? await readAutoPosting(supabaseAdmin, owner)
    : await readAutoPostingForSoleOwner()
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

  const now = new Date().toISOString()
  const result = { reconciled: 0, published: 0, pending: 0, failed: 0, skippedNoRender: 0, skippedNotApproved: 0, claimed: 0, missedWhilePaused: 0, tooLate: 0, skippedDestinationPaused: 0, flaggedForReview: 0, heldForReview: 0 }

  // ── 0) RECONCILE unacknowledged publishes FIRST ────────────────────────────────────────────
  // Rows whose media_publish call was claimed but never acknowledged locally. These are the crash
  // set. They are checked against Meta — never republished — before any new work, so a duplicate
  // can never be created by this run.
  const { data: unacked } = await supabaseAdmin
    .from("social_posts")
    .select("id, ig_container_id, connection_id")
    .eq("platform", "instagram")
    .not("media_publish_claimed_at", "is", null)
    .is("external_post_id", null)
    .limit(MAX_PER_RUN)
  for (const r of (unacked ?? []) as Row[]) {
    try {
      const dest = await resolveDestination(r.connection_id as string | null)
      // Any unusable destination — paused included — is skipped here, because the paused result
      // deliberately carries no token and reconciliation needs one to ask Meta anything. That
      // DEFERS reconciliation rather than losing it: the row keeps its claim and its container id,
      // and the next run after the account is resumed reconciles it. Nothing publishes either way,
      // and a deferred reconcile cannot become a duplicate.
      if (!dest.ok || !r.ig_container_id) continue
      const outcome = await finalizeInstagramPublish({
        db: supabaseAdmin,
        postId: r.id as string,
        containerId: r.ig_container_id as string,
        igUserId: dest.externalAccountId,
        token: dest.token,
        reconcileOnly: true, // recovery may observe, never publish
      })
      if (outcome.state === "published") result.reconciled++
    } catch (e) {
      console.error("[ig-worker] reconcile failed", r.id, e instanceof Error ? e.message : e)
    }
  }

  // ── 1) SELECT due posts ────────────────────────────────────────────────────────────────────
  const { data: due, error: dueErr } = await supabaseAdmin
    .from("social_posts")
    .select("id, destination, follows_post_id, needs_review_at, owner_user_id, connection_id, scheduled_at, approved_at, caption, hashtags, social_special, overlay_template, cover_thumb_offset_ms, cover_storage_path, render_status, rendered_storage_path, render_version, source_content_id, source:source_content_id(market, property_type, special, budget_range, amenities)")
    .eq("platform", "instagram")
    .eq("status", "scheduled")
    .lte("scheduled_at", now)
    .is("external_post_id", null)
    // APPROVAL. The last line of defence and the broadest: whatever route put a row into
    // status='scheduled' — the editor, auto-placement, a recurring rule, the autopilot, or a hand
    // -written SQL statement — an unapproved post is never even READ here.
    .not("approved_at", "is", null)
    // REVIEW HOLD. The price or special this post shows changed after it was scheduled, so its
    // burned-in overlay and caption may now state something untrue. It stays SCHEDULED and keeps
    // its slot — held, not cancelled, not reverted, not deleted — and publishes normally once the
    // review state is cleared by a re-render or an explicit review. Change-driven, never
    // age-driven: nothing here looks at how old a post or its source data is.
    .order("scheduled_at", { ascending: true })
    .limit(MAX_PER_RUN)
  // A filtered-out post would otherwise vanish from every signal this worker produces, so the held
  // count is gathered explicitly and surfaced in the run result.
  const { count: heldForReview } = await supabaseAdmin
    .from("social_posts")
    .select("id", { count: "exact", head: true })
    .eq("platform", "instagram").eq("status", "scheduled")
    .lte("scheduled_at", now).is("external_post_id", null)
    .not("needs_review_at", "is", null)
  // ALWAYS COUNTED, whether or not the hold is armed — this number is the evidence that tells us
  // later whether the flag is trustworthy enough to start blocking on.
  result.flaggedForReview = heldForReview ?? 0
  if (heldForReview) {
    console.warn(`[ig-worker] ${heldForReview} due post(s) flagged for review (price/special changed after scheduling)`
      + (publishHoldEnabled() ? " — HELD, not publishing" : " — publishing anyway, hold is OFF"))
  }
  if (dueErr) {
    console.error("[ig-worker] due query failed:", dueErr.message)
    return NextResponse.json({ error: "query_failed" }, { status: 500 })
  }

  for (const row of (due ?? []) as Row[]) {
    const postId = row.id as string
    try {
      // ── THE BACKLOG RULE ────────────────────────────────────────────────────────────────
      // This post is due, but "due" is not the same as "should publish now". A post whose time
      // passed while Auto Posting was paused is NOT a catch-up candidate: pausing for two days at
      // 9am/7pm leaves four due posts, and publishing them back to back is exactly the burst this
      // must prevent. It keeps its row, keeps its scheduled_at, and is COUNTED as missed — nothing
      // is deleted and no date is rewritten. A human reschedules it.
      // THE HOLD, when armed. Applied per row rather than in the query so the post keeps its slot
      // and still appears in this run's accounting instead of vanishing from it silently.
      if (shouldHoldForReview(row.needs_review_at as string | null)) { result.heldForReview++; continue }
      if (!isEligibleAfterResume(row.scheduled_at as string | null, settings)) {
        result.missedWhilePaused++
        continue
      }
      // Same hazard, different cause: a cron outage or long deploy gap can also leave a post hours
      // or days overdue with no pause involved. Invisible in normal operation (the worker runs
      // every 5 minutes); it only ever catches a burst that should not happen.
      if (!isWithinLatenessWindow(row.scheduled_at as string | null)) {
        result.tooLate++
        continue
      }

      // PER-ROW APPROVAL GUARD. The due query already filtered on approval and the claim
      // re-asserts it, so reaching this with a null is not expected — it exists so the run RESULT
      // can report a skip rather than the row silently never appearing. A safety property nobody
      // can observe is one nobody notices breaking.
      if (!row.approved_at) {
        result.skippedNotApproved++
        continue
      }

      // A scheduled post with no current render is NOT publishable and must not fall back to the
      // raw source. Left scheduled so a render makes it eligible on a later run.
      if (row.render_status !== "ready" || !row.rendered_storage_path) {
        result.skippedNoRender++
        continue
      }

      // ── DESTINATION STATE — resolved BEFORE the claim ──────────────────────────────────────
      // Order matters. This used to run AFTER the claim, so a paused account turned every due
      // post into needs_attention: already moved out of 'scheduled', and needs_attention has no
      // route back to publishable. Pausing an account quietly burned its queue.
      //
      // The two outcomes are genuinely different and must not be collapsed:
      //   paused → the operator's deliberate choice. Not a fault, not this post's problem. The
      //            post is left EXACTLY as it was — still scheduled, still due, publishable the
      //            moment the account is resumed. Nothing is claimed, so no slot is burned.
      //   fault  → disconnected, missing, or an expired token. A real problem that must be seen,
      //            so the post goes to needs_attention carrying the specific reason.
      //
      // Paused is checked first inside resolveDestination: when an account is both paused and
      // expired, the pause is what the operator asked for, and the expiry surfaces on resume.
      const dest = await resolveDestination(row.connection_id as string | null)
      if (!dest.ok) {
        if (dest.kind === "paused") {
          result.skippedDestinationPaused++
          continue // untouched: status, scheduled_at and claim all unchanged
        }
        // A fault is worth a claim: moving it out of 'scheduled' is what makes it visible and
        // stops the worker retrying a broken destination every five minutes.
        await fail(postId, dest.reason)
        result.failed++
        continue
      }

      // ── CLAIM 1: scheduled → publishing, before anything external happens ──────────────────
      const { data: claimed } = await supabaseAdmin
        .from("social_posts")
        .update({ status: "publishing", publish_attempted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("id", postId)
        .eq("status", "scheduled")
        .is("external_post_id", null)
        // RE-ASSERTED IN THE CLAIM. The due query read this row moments ago, but approval can be
        // revoked in between — a re-render clears approved_at via trigger. Because the claim is a
        // conditional UPDATE, a row un-approved in that window simply does not match and is left
        // alone, with no partial state.
        .not("approved_at", "is", null)
        .select("id")
        .maybeSingle()
      if (!claimed) continue // another worker took it, or approval was revoked mid-flight
      result.claimed++

      const { data: signed, error: signErr } = await supabaseAdmin.storage
        .from("social-media")
        .createSignedUrl(row.rendered_storage_path as string, 3600)
      if (signErr || !signed?.signedUrl) {
        await fail(postId, "could not sign rendered video")
        result.failed++
        continue
      }

      const src = Array.isArray(row.source) ? row.source[0] : row.source
      const caption = buildInstagramCaptionPayload({
        caption: row.caption as string | null,
        hashtags: row.hashtags as string[] | null,
        socialSpecial: row.social_special as string | null,
        sourceContentId: row.source_content_id as string | null,
        overlayTemplate: isOverlayTemplate(row.overlay_template) ? row.overlay_template : null,
        source: src as never,
      })

      // Same shared chooser as the manual route and the dry run — one answer to "which cover?".
      const choice = chooseCover(row.cover_storage_path as string | null, row.cover_thumb_offset_ms as number | null)
      const cover = await resolveReelCover(choice, async (path) => {
        const { data } = await supabaseAdmin.storage.from("social-media").createSignedUrl(path, 3600)
        return data?.signedUrl ?? null
      })
      if (choice.kind === "custom" && !cover) {
        await fail(postId, "custom cover could not be signed")
        result.failed++
        continue
      }

      // ── SURFACE BRANCH ──────────────────────────────────────────────────────────────────────
      // Until now this worker called createReelContainer unconditionally. A Story row reaching it
      // would therefore have gone out as a captioned REEL — the same property, the same footage,
      // 45 minutes after the real Reel: a visible duplicate post. Nothing created Story rows yet,
      // so the bug was latent; it had to be closed BEFORE anything started creating them.
      //
      // The manual route already branches this way. Same shape here, deliberately: a Story takes
      // neither a caption nor a cover, so they are not sent rather than passed and ignored.
      const destination = isSocialDestination(row.destination) ? row.destination : destinationFromLegacyPlatform("instagram")
      const spec = DESTINATIONS[destination]
      if (spec.publish !== "supported") {
        await fail(postId, `destination ${destination} is not publishable`)
        result.failed++
        continue
      }
      const containerId = spec.surface === "story"
        ? await createStoryContainer(dest.externalAccountId, signed.signedUrl, dest.token)
        : await createReelContainer(dest.externalAccountId, signed.signedUrl, caption, dest.token, cover)
      // Persist the container id BEFORE media_publish — it is the reconciliation key if this
      // process dies during the publish call.
      await supabaseAdmin
        .from("social_posts")
        .update({ ig_container_id: containerId, published_render_version: row.render_version, updated_at: new Date().toISOString() })
        .eq("id", postId)

      // Meta transcodes asynchronously; there is no browser here to poll, so wait briefly in-process.
      const deadline = Date.now() + CONTAINER_WAIT_MS
      let outcome = await finalizeInstagramPublish({ db: supabaseAdmin, postId, containerId, igUserId: dest.externalAccountId, token: dest.token })
      while (outcome.state === "pending" && Date.now() < deadline) {
        await sleep(CONTAINER_POLL_MS)
        outcome = await finalizeInstagramPublish({ db: supabaseAdmin, postId, containerId, igUserId: dest.externalAccountId, token: dest.token })
      }

      if (outcome.state === "published") result.published++
      else if (outcome.state === "failed") result.failed++
      else result.pending++ // still transcoding — stays 'publishing' with its container id
    } catch (e) {
      // One post's failure must never stop the loop.
      const message = e instanceof Error ? e.message.slice(0, 400) : "worker error"
      console.error("[ig-worker] publish failed", postId, message)
      await fail(postId, message)
      result.failed++
    }
  }

  return NextResponse.json({ ok: true, ...result })
}

/**
 * Social Beast is a single-operator internal tool today: one platform admin owns every post. Rather
 * than require an env var naming them, resolve the owner from the settings table itself when
 * exactly one row exists. Zero rows → paused (nobody has turned it on). More than one owner → also
 * paused, because "which account's switch governs?" has no safe default; set
 * SOCIAL_AUTOPOST_OWNER_USER_ID to disambiguate when that day comes.
 */
async function readAutoPostingForSoleOwner(): Promise<AutoPostingSettings> {
  try {
    const { data, error } = await supabaseAdmin
      .from("social_settings")
      .select("owner_user_id, auto_posting, auto_posting_resumed_at")
      .limit(2)
    if (error) return { ...AUTO_POSTING_FALLBACK, unreadable: true }
    const rows = (data ?? []) as { owner_user_id: string }[]
    if (rows.length !== 1) return AUTO_POSTING_FALLBACK
    return readAutoPosting(supabaseAdmin, rows[0].owner_user_id)
  } catch {
    return { ...AUTO_POSTING_FALLBACK, unreadable: true }
  }
}

/**
 * Why a destination cannot be published to — not just THAT it cannot.
 *
 * The caller has to choose between leaving a post untouched and marking it needs_attention, and
 * those are opposite decisions. A single `null` forced the worker to guess, and it guessed
 * "failure" for every case, including a deliberate pause.
 */
type DestinationResult =
  | { ok: true; token: string; externalAccountId: string }
  /** The operator paused this account on purpose. Not a fault. */
  | { ok: false; kind: "paused" }
  /** Disconnected, missing, or an unusable token — a real problem that must be surfaced. */
  | { ok: false; kind: "fault"; reason: string }

/** Resolve the Instagram destination for one connection, server-side. The RPC is provider-scoped
 *  to Instagram, so a connection id pointing at any other provider resolves to nothing. */
async function resolveDestination(connectionId: string | null): Promise<DestinationResult> {
  if (!connectionId) return { ok: false, kind: "fault", reason: "no publishing destination selected for this post" }

  const { data, error } = await supabaseAdmin.rpc("sa_get_instagram_token_by_connection", { p_connection_id: connectionId })
  if (error) return { ok: false, kind: "fault", reason: `could not read destination: ${error.message.slice(0, 200)}` }

  const d = (Array.isArray(data) ? data[0] : data) as
    | { token: string | null; external_account_id: string | null; status?: string | null; posting_paused?: boolean | null; token_expires_at?: string | null }
    | null
  if (!d) return { ok: false, kind: "fault", reason: "publishing destination not found (disconnected or removed)" }

  // PAUSED IS CHECKED FIRST, deliberately. An account that is both paused and expired is one the
  // operator already told us to stop using; treating it as a fault would move a post out of
  // 'scheduled' over a condition they chose. The expiry still surfaces — on the first run after
  // they resume, which is exactly when they can act on it.
  if (d.posting_paused) return { ok: false, kind: "paused" }

  if (d.status && d.status !== "connected") {
    return { ok: false, kind: "fault", reason: `publishing destination is ${d.status} — reconnect it to resume posting` }
  }
  if (d.token_expires_at && new Date(d.token_expires_at).getTime() < Date.now()) {
    return { ok: false, kind: "fault", reason: "Instagram access token expired — reconnect the destination" }
  }
  if (!d.token || !d.external_account_id) {
    return { ok: false, kind: "fault", reason: "publishing destination is missing its Instagram credentials" }
  }
  return { ok: true, token: d.token, externalAccountId: d.external_account_id }
}

/** Record a failure on ONE post. needs_attention keeps it visible and recoverable rather than
 *  silently dropped; the claim is released so a fix can re-schedule it. */
async function fail(postId: string, message: string) {
  await supabaseAdmin
    .from("social_posts")
    .update({ status: "needs_attention", error_message: message.slice(0, 400), updated_at: new Date().toISOString() })
    .eq("id", postId)
}
