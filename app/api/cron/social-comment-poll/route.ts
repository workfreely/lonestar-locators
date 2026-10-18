export const runtime = "nodejs"
export const dynamic = "force-dynamic"

import { NextResponse, type NextRequest } from "next/server"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { featureGate, type EnvLike } from "@/lib/social/commentSendPolicy"
import { createCommentStore } from "@/lib/social/commentStore"
import { liveSender } from "@/lib/social/commentSender"
import { processBatch, type PendingComment } from "@/lib/social/commentRunner"
import {
  parseBucUsage, shouldContinuePolling, planPoll, POLL_WINDOW_DAYS,
  type BucUsage, type MediaSnapshot, type MediaCursor,
} from "@/lib/social/commentRateLimit"
import { INSTAGRAM_COMMENTS_SCOPE } from "@/lib/social/commentScope"

/**
 * SOCIAL BEAST — the comment RECONCILIATION poll.
 *
 * ── THIS IS A SAFETY NET, NOT THE ENGINE ────────────────────────────────────────────────────
 * The webhook is the intake. This exists for the deliveries it never received: a deploy window, a
 * subscription hiccup, an outage. Two consequences follow, and both are deliberate:
 *
 *   1. It is CHEAP. One call lists recent media with comments_count; the comments edge is only
 *      fetched for media whose count changed. In the steady state a run costs a single call.
 *   2. Comments it finds are usually NOT DM-ELIGIBLE. Meta documents `from` on the webhook payload
 *      and does not document it on the comments edge, so a polled comment typically arrives with
 *      no stable commenter id — and resolveCommenter then refuses the DM and the runner records
 *      `no_stable_id`. That is the designed outcome, not a bug to work around. Such a comment is
 *      still stored and still visible in the Inbox.
 *
 * ── THE SEVEN-DAY WINDOW IS THE POLL WINDOW ─────────────────────────────────────────────────
 * A private reply is impossible more than 7 days after a comment, so media older than that is not
 * polled: the calls could not accomplish the thing they would be spent on.
 *
 * ── RATE LIMITS ─────────────────────────────────────────────────────────────────────────────
 * Meta's Instagram budget is 4,800 × impressions per 24h — which means a QUIET account has almost
 * no budget, and that is exactly the state this account is in before advertising restarts. So the
 * budget is never assumed: X-Business-Use-Case-Usage is read from every response and the run stops
 * at 60%, well short of the limit, because Social Beast's publishing shares the same allowance and
 * reconciliation is the least important thing competing for it.
 */

const GRAPH = "https://graph.instagram.com/v21.0"
const FETCH_TIMEOUT_MS = 12_000
/** A hard ceiling on calls per run, independent of the usage header. Belt and braces. */
const MAX_CALLS_PER_RUN = 12

type GetResult = { status: number | null; body: Record<string, unknown>; usage: BucUsage | null }

/** GET with a timeout. The token travels in the Authorization header, never the URL or the logs. */
async function get(path: string, params: Record<string, string>, token: string): Promise<GetResult> {
  const u = new URL(`${GRAPH}/${path}`)
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(u, {
      headers: { authorization: `Bearer ${token}` },
      signal: controller.signal,
    })
    const usage = parseBucUsage(res.headers.get("x-business-use-case-usage"))
    let body: Record<string, unknown> = {}
    try {
      const j = await res.json()
      if (typeof j === "object" && j !== null) body = j as Record<string, unknown>
    } catch { /* leave empty; the status carries the meaning */ }
    return { status: res.status, body, usage }
  } catch {
    return { status: null, body: {}, usage: null }
  } finally {
    clearTimeout(timer)
  }
}

const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
const obj = (v: unknown): Record<string, unknown> | null =>
  typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null)

export async function POST(req: NextRequest) { return run(req) }
export async function GET(req: NextRequest) { return run(req) }

async function run(req: NextRequest) {
  // FAIL CLOSED on the caller check — a missing CRON_SECRET locks the route rather than opening it,
  // the same shape as every other cron in this app.
  const cronSecret = process.env.CRON_SECRET
  const auth = req.headers.get("authorization")
  if (!cronSecret || auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // The kill switch sits before every read and every call, so "off" means this route
  // authenticates, reports and does nothing else.
  const feature = featureGate(process.env as EnvLike)
  if (!feature.active) {
    return NextResponse.json({ ok: true, inert: true, reason: feature.reason, calls: 0, processed: 0 })
  }

  const db = supabaseAdmin
  const { data: conns, error } = await db
    .from("social_connections")
    .select("id, external_account_id, scopes, status")
    .eq("provider", "instagram")
    .eq("status", "connected")
  if (error) return NextResponse.json({ ok: false, error: "connection_read_failed" }, { status: 500 })

  const store = createCommentStore(db)
  const report: Record<string, unknown>[] = []
  let calls = 0
  let processed = 0

  for (const raw of (conns ?? []) as { id: string; external_account_id: string; scopes: string[] | null }[]) {
    // Without the comments scope every call below would 400. Refusing here keeps the log honest
    // and spends nothing — this is the current state of the live account.
    if (!(raw.scopes ?? []).includes(INSTAGRAM_COMMENTS_SCOPE)) {
      report.push({ connection: raw.id, skipped: "missing_comments_scope" })
      continue
    }

    const conn = await store.findConnection("instagram", raw.external_account_id)
    if (!conn) { report.push({ connection: raw.id, skipped: "context_unavailable" }); continue }

    // ── ONE CALL: recent media and their comment counts ─────────────────────────────────────
    const mediaRes = await get("me/media", { fields: "id,timestamp,comments_count", limit: "25" }, conn.accessToken)
    calls++
    if (mediaRes.status !== 200) {
      report.push({ connection: raw.id, skipped: "media_list_failed", status: mediaRes.status })
      continue
    }
    const backoff = shouldContinuePolling(mediaRes.usage)
    if (!backoff.proceed) {
      report.push({ connection: raw.id, skipped: `backoff:${backoff.reason}`, usage: mediaRes.usage })
      continue
    }

    const media: MediaSnapshot[] = arr(mediaRes.body.data).flatMap((m) => {
      const o = obj(m); const id = o ? str(o.id) : null
      if (!o || !id) return []
      return [{
        mediaId: id,
        timestamp: str(o.timestamp),
        commentsCount: typeof o.comments_count === "number" ? o.comments_count : null,
      }]
    })

    // Cursors make the poll cost one call in the steady state. The table that holds them is
    // PREPARED BUT NOT APPLIED (supabase/migrations/…_comment_media_cursors.sql), so this returns
    // [] today and planPoll correctly falls back to fetching every in-window media — at most a
    // handful of calls. Nothing here depends on the migration having been run.
    const cursors: MediaCursor[] = await readCursors(db, conn.connectionId)

    const plan = planPoll({ media, cursors })
    const pending: PendingComment[] = []
    let usage = mediaRes.usage

    for (const mediaId of plan.fetch) {
      if (calls >= MAX_CALLS_PER_RUN) break
      const cont = shouldContinuePolling(usage)
      if (!cont.proceed) break

      // `from` is requested even though Meta does not document it on this edge: if it IS returned,
      // the comment becomes DM-eligible and nothing else has to change. If it is not, the field is
      // simply absent and the comment is held — which is why asking costs nothing to try.
      const res = await get(
        `${encodeURIComponent(mediaId)}/comments`,
        { fields: "id,text,timestamp,username,from,parent_id", limit: "25" },
        conn.accessToken,
      )
      calls++
      usage = res.usage ?? usage
      if (res.status !== 200) continue

      for (const c of arr(res.body.data)) {
        const o = obj(c); const id = o ? str(o.id) : null
        if (!o || !id) continue
        const from = obj(o.from)
        const parent = str(o.parent_id)
        pending.push({
          provider: "instagram",
          externalCommentId: id,
          externalMediaId: mediaId,
          recipientProviderUserId: conn.ownProviderUserId,
          authorProviderUserId: from ? str(from.id) : null,
          authorUsername: (from ? str(from.username) : null) ?? str(o.username),
          body: str(o.text),
          commentedAt: str(o.timestamp),
          isNestedReply: !!parent && parent !== id,
          intake: "poll",
        })
      }
    }

    const outcomes = pending.length ? await processBatch(pending, store, liveSender) : []
    processed += outcomes.length
    await writeCursors(db, conn.connectionId, media)

    report.push({
      connection: raw.id,
      window: `${POLL_WINDOW_DAYS}d`,
      media: media.length,
      fetched: plan.fetch.length,
      skipped: plan.skipped,
      found: pending.length,
      usage,
      outcomes: outcomes.map((o) => ({ comment: o.externalCommentId, result: o.result, reason: o.reason })),
    })
  }

  return NextResponse.json({ ok: true, calls, processed, connections: report })
}

/**
 * Read the per-media comment-count cursors.
 *
 * Returns [] on ANY error, including "table does not exist". That is what makes this safe to ship
 * before its migration is approved: with no cursors planPoll fetches every in-window media, which
 * is correct and merely less frugal. A missing optimisation must never become a missing comment.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function readCursors(db: any, connectionId: string): Promise<MediaCursor[]> {
  try {
    const { data, error } = await db
      .from("comment_media_cursors").select("external_media_id, comments_count")
      .eq("connection_id", connectionId)
    if (error) return []
    return ((data ?? []) as { external_media_id: string; comments_count: number | null }[])
      .map((r) => ({ mediaId: r.external_media_id, lastCommentsCount: r.comments_count }))
  } catch { return [] }
}

/** Record what we saw, so the next run can skip unchanged media. Silently inert without the table. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function writeCursors(db: any, connectionId: string, media: readonly MediaSnapshot[]): Promise<void> {
  const rows = media
    .filter((m) => m.commentsCount !== null)
    .map((m) => ({
      connection_id: connectionId,
      external_media_id: m.mediaId,
      comments_count: m.commentsCount,
      seen_at: new Date().toISOString(),
    }))
  if (!rows.length) return
  try {
    await db.from("comment_media_cursors").upsert(rows, { onConflict: "connection_id,external_media_id" })
  } catch { /* the table is not there yet; the poll is simply less frugal */ }
}
