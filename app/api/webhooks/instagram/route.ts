export const runtime = "nodejs"
export const dynamic = "force-dynamic"

import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase/admin"
import {
  verifyMetaSignature, verifyHandshake, parseInstagramCommentWebhook, dedupeIncoming,
} from "@/lib/social/commentWebhook"
import { featureGate, type EnvLike } from "@/lib/social/commentSendPolicy"
import { createCommentStore } from "@/lib/social/commentStore"
import { liveSender } from "@/lib/social/commentSender"
import { processBatch, type PendingComment } from "@/lib/social/commentRunner"

/**
 * SOCIAL BEAST — the Instagram comment webhook.
 *
 * THIS ENDPOINT IS PUBLIC. It has no session, no CRON_SECRET and no allow-list, because Meta calls
 * it from addresses we do not control. The HMAC signature over the raw body IS the authentication,
 * and nothing in the body is parsed, read or stored until it verifies.
 *
 * ── WHY WEBHOOK-FIRST ───────────────────────────────────────────────────────────────────────
 * The comments webhook payload carries `from` { id, username } — the Instagram-scoped commenter id.
 * The comments EDGE does not document it. That id is what makes "one DM per person, ever"
 * enforceable, and the DM is refused without it. So this route is the only intake that can produce
 * a DM-eligible comment; the poller exists to reconcile deliveries this route never received.
 *
 * ── WHAT THE STATUS CODE MEANS TO META ──────────────────────────────────────────────────────
 * Meta retries on a non-2xx. That is a tool, not a nuisance:
 *   200  we have taken responsibility for this delivery — including when every comment was
 *        refused by a gate, which is a decision, not a failure.
 *   403  the signature did not verify. Never retried, and correctly so.
 *   500  WE broke (the database was unreachable). We WANT the retry, because the alternative is
 *        a comment silently lost.
 */

/** Meta's subscription handshake. Echoes the challenge only on an exact verify-token match. */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const result = verifyHandshake({
    mode: url.searchParams.get("hub.mode"),
    token: url.searchParams.get("hub.verify_token"),
    challenge: url.searchParams.get("hub.challenge"),
    expectedToken: process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN,
  })
  if (!result.ok) {
    // The reason is logged, never returned: telling an anonymous caller "bad_token" rather than
    // "not_configured" confirms the secret exists and is worth guessing.
    console.error("[webhooks/instagram] handshake refused:", result.reason)
    return new NextResponse("Forbidden", { status: 403 })
  }
  // Meta requires the bare challenge string as the body, not JSON.
  return new NextResponse(result.challenge, {
    status: 200,
    headers: { "content-type": "text/plain" },
  })
}

export async function POST(request: Request) {
  // RAW BODY FIRST, AND ONLY ONCE. Re-serialising parsed JSON changes the bytes and the HMAC no
  // longer matches what Meta signed, so the text must be read before anything parses it.
  const rawBody = await request.text()

  const sig = verifyMetaSignature({
    rawBody,
    header: request.headers.get("x-hub-signature-256"),
    appSecret: process.env.INSTAGRAM_APP_SECRET,
  })
  if (!sig.ok) {
    console.error("[webhooks/instagram] signature refused:", sig.reason)
    return new NextResponse("Forbidden", { status: 403 })
  }

  // ── THE KILL SWITCH, CHECKED AFTER VERIFICATION AND BEFORE ANY WORK ───────────────────────
  // 200 rather than an error: the delivery was genuine and we are deliberately ignoring it, so
  // Meta must not retry it for hours. Flipping the switch off makes this route a verified no-op.
  const feature = featureGate(process.env as EnvLike)
  if (!feature.active) {
    return NextResponse.json({ ok: true, inert: true, reason: feature.reason, processed: 0 })
  }

  let body: unknown
  try { body = JSON.parse(rawBody) } catch {
    // A verified body that is not JSON is Meta's problem, not a transient fault. 200 so it is not
    // retried forever; logged so it is not invisible.
    console.error("[webhooks/instagram] verified body was not JSON")
    return NextResponse.json({ ok: true, processed: 0, reason: "unparseable_body" })
  }

  const parsed = parseInstagramCommentWebhook(body)
  const comments = dedupeIncoming(parsed.comments)
  if (comments.length === 0) {
    return NextResponse.json({ ok: true, processed: 0, ignored: parsed.ignored })
  }

  const pending: PendingComment[] = comments.map((c) => ({ ...c, intake: "webhook" as const }))

  try {
    const store = createCommentStore(supabaseAdmin)
    const outcomes = await processBatch(pending, store, liveSender)
    return NextResponse.json({
      ok: true,
      processed: outcomes.length,
      ignored: parsed.ignored,
      // The full decision trail, so a delivery can be explained from the response alone while this
      // is being verified in staging.
      outcomes: outcomes.map((o) => ({
        comment: o.externalCommentId,
        result: o.result,
        reason: o.reason,
        keyword: o.matchedKeyword,
        dm: o.dm,
        publicReply: o.publicReply,
      })),
    })
  } catch (e) {
    // OUR failure, so we ask for the retry. A lost comment cannot be recovered any other way —
    // the webhook is not replayable on demand.
    console.error("[webhooks/instagram] processing failed:", (e as Error).message)
    return NextResponse.json({ ok: false, error: "processing_failed" }, { status: 500 })
  }
}
