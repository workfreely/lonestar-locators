// Comments — THE ONLY CODE THAT TALKS TO META ABOUT A COMMENT.
//
// Isolated on purpose. Everything else in this feature is pure and testable; the network lives
// here, behind one interface, so the runner can be exercised end to end with a mock and so there is
// exactly one place to audit when asking "what can this feature actually send?".
//
// ── THE SENDING GATE IS INSIDE THE SENDER ───────────────────────────────────────────────────
// sendGate is checked HERE, not only by the caller. A guard in the caller can be bypassed by a new
// caller; a guard in the one function that holds the fetch cannot. With the gate off these methods
// return a `disabled` attempt without opening a socket, so a dry run is genuinely inert rather than
// inert-by-convention.
//
// Endpoints (Meta, Instagram Login / graph.instagram.com):
//   public reply   POST /{ig-comment-id}/replies            message=<text>
//   private reply  POST /{your-ig-user-id}/messages         { recipient: { comment_id }, message: { text } }
//
// The private reply addresses recipient.comment_id — NOT a user id. We can therefore send without
// ever holding the commenter's Instagram-scoped id. We still refuse to, because the id is what
// makes "one DM per person, ever" enforceable; see lib/social/commentIdentity.ts.

import { sendGate, dmGate, type SendAttempt, type EnvLike } from "@/lib/social/commentSendPolicy"
import { parseBucUsage, type BucUsage } from "@/lib/social/commentRateLimit"

const GRAPH = "https://graph.instagram.com/v21.0"

/** How long we wait before treating a send as uncertain. Short, because a hung send blocks a run. */
const SEND_TIMEOUT_MS = 15_000

export type SenderContext = {
  /** The connected account's own Instagram-scoped user id — the private-reply endpoint's subject. */
  igUserId: string
  /** The account's access token. NEVER logged, never returned, never included in an error string. */
  accessToken: string
}

export type SendResult = SendAttempt & {
  /** Rate-limit usage reported on this response, so the runner can back off on real numbers. */
  usage: BucUsage | null
  /** True when the gate refused and no request was made. */
  disabled?: boolean
}

export type CommentSender = {
  sendPublicReply(ctx: SenderContext, externalCommentId: string, text: string): Promise<SendResult>
  sendPrivateReply(ctx: SenderContext, externalCommentId: string, text: string): Promise<SendResult>
}

/** A gate refusal, shaped as an attempt so callers have one type to handle. */
const refused = (): SendResult => ({
  status: null,
  transportError: false,
  disabled: true,
  usage: null,
})

/**
 * POST to Meta and classify the transport, not the meaning.
 *
 * Returns the raw ingredients classifySendAttempt needs and nothing more — this function makes no
 * judgement about whether a message was delivered, because that judgement decides whether a person
 * can be messaged again and belongs in one reviewable place.
 *
 * A thrown fetch (timeout, DNS, socket reset) becomes transportError: true, which classifies as
 * UNCERTAIN rather than failed. That is the correct direction: the request may have been processed.
 */
async function post(
  url: string,
  init: { body: BodyInit; headers: Record<string, string> },
  token: string,
): Promise<SendResult> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { ...init.headers, authorization: `Bearer ${token}` },
      body: init.body,
      signal: controller.signal,
    })
    const usage = parseBucUsage(res.headers.get("x-business-use-case-usage"))
    let parsed: unknown
    let unparseable = false
    try { parsed = await res.json() } catch { unparseable = true }

    const body = (typeof parsed === "object" && parsed !== null ? parsed : {}) as Record<string, unknown>
    const err = (typeof body.error === "object" && body.error !== null ? body.error : {}) as Record<string, unknown>
    const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null)
    const id = typeof body.id === "string" ? body.id : typeof body.message_id === "string" ? body.message_id : null

    return {
      status: res.status,
      externalId: id,
      errorCode: num(err.code),
      errorSubcode: num(err.error_subcode),
      unparseable,
      transportError: false,
      usage,
    }
  } catch {
    // Deliberately swallowing the error object: it can contain the request URL, and the URL has
    // carried a token in other Meta integrations. The distinction that matters is recorded.
    return { status: null, transportError: true, usage: null }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * The live sender. Reads the gate from the process environment on EVERY call, so flipping
 * SOCIAL_COMMENT_SEND_ENABLED takes effect on the next send without a deploy or a restart.
 */
export const liveSender: CommentSender = {
  async sendPublicReply(ctx, externalCommentId, text) {
    if (!sendGate(process.env as EnvLike).active) return refused()
    return post(
      `${GRAPH}/${encodeURIComponent(externalCommentId)}/replies`,
      {
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ message: text }).toString(),
      },
      ctx.accessToken,
    )
  },

  async sendPrivateReply(ctx, externalCommentId, text) {
    // DEFENCE IN DEPTH. The runner already refuses before taking a claim, so reaching here with
    // private replies paused would be a bug — and this is the line that keeps that bug from
    // becoming an HTTP request to Meta. Checked before the send gate because it is the narrower
    // refusal of the two.
    if (!dmGate(process.env as EnvLike).active) return refused()
    if (!sendGate(process.env as EnvLike).active) return refused()
    return post(
      `${GRAPH}/${encodeURIComponent(ctx.igUserId)}/messages`,
      {
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          recipient: { comment_id: externalCommentId },
          message: { text },
        }),
      },
      ctx.accessToken,
    )
  },
}

/**
 * A sender that cannot send. Used by the poller and anywhere a code path must be provably inert.
 * Exported rather than improvised at each call site so "inert" is one reviewable object.
 */
export const inertSender: CommentSender = {
  async sendPublicReply() { return refused() },
  async sendPrivateReply() { return refused() },
}
