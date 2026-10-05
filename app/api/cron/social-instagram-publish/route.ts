export const runtime = "nodejs"
export const dynamic = "force-dynamic"

import { NextResponse, type NextRequest } from "next/server"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { instagramConfigured, createReelContainer } from "@/lib/social/instagram"
import { buildInstagramCaptionPayload, isOverlayTemplate } from "@/lib/social/composePost"
import { finalizeInstagramPublish } from "@/lib/social/instagramFinalize"

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

  const now = new Date().toISOString()
  const result = { reconciled: 0, published: 0, pending: 0, failed: 0, skippedNoRender: 0, claimed: 0 }

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
      if (!dest || !r.ig_container_id) continue
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
    .select("id, owner_user_id, connection_id, caption, hashtags, social_special, overlay_template, render_status, rendered_storage_path, render_version, source_content_id, source:source_content_id(market, property_type, special, budget_range, amenities)")
    .eq("platform", "instagram")
    .eq("status", "scheduled")
    .lte("scheduled_at", now)
    .is("external_post_id", null)
    .order("scheduled_at", { ascending: true })
    .limit(MAX_PER_RUN)
  if (dueErr) {
    console.error("[ig-worker] due query failed:", dueErr.message)
    return NextResponse.json({ error: "query_failed" }, { status: 500 })
  }

  for (const row of (due ?? []) as Row[]) {
    const postId = row.id as string
    try {
      // A scheduled post with no current render is NOT publishable and must not fall back to the
      // raw source. Left scheduled so a render makes it eligible on a later run.
      if (row.render_status !== "ready" || !row.rendered_storage_path) {
        result.skippedNoRender++
        continue
      }

      // ── CLAIM 1: scheduled → publishing, before anything external happens ──────────────────
      const { data: claimed } = await supabaseAdmin
        .from("social_posts")
        .update({ status: "publishing", publish_attempted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("id", postId)
        .eq("status", "scheduled")
        .is("external_post_id", null)
        .select("id")
        .maybeSingle()
      if (!claimed) continue // another worker took it
      result.claimed++

      const dest = await resolveDestination(row.connection_id as string | null)
      if (!dest) {
        await fail(postId, "destination unavailable (disconnected, paused, or token expired)")
        result.failed++
        continue
      }

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

      const containerId = await createReelContainer(dest.externalAccountId, signed.signedUrl, caption, dest.token)
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

/** Resolve the Instagram destination for one connection, server-side, and refuse it unless it is
 *  live: connected, not paused, token unexpired. The RPC itself is provider-scoped to Instagram,
 *  so a connection id pointing at any other provider returns nothing. */
async function resolveDestination(connectionId: string | null): Promise<{ token: string; externalAccountId: string } | null> {
  if (!connectionId) return null
  const { data } = await supabaseAdmin.rpc("sa_get_instagram_token_by_connection", { p_connection_id: connectionId })
  const d = (Array.isArray(data) ? data[0] : data) as
    | { token: string | null; external_account_id: string | null; status?: string | null; posting_paused?: boolean | null; token_expires_at?: string | null }
    | null
  if (!d || !d.token || !d.external_account_id) return null
  if (d.status && d.status !== "connected") return null
  if (d.posting_paused) return null
  if (d.token_expires_at && new Date(d.token_expires_at).getTime() < Date.now()) return null
  return { token: d.token, externalAccountId: d.external_account_id }
}

/** Record a failure on ONE post. needs_attention keeps it visible and recoverable rather than
 *  silently dropped; the claim is released so a fix can re-schedule it. */
async function fail(postId: string, message: string) {
  await supabaseAdmin
    .from("social_posts")
    .update({ status: "needs_attention", error_message: message.slice(0, 400), updated_at: new Date().toISOString() })
    .eq("id", postId)
}
