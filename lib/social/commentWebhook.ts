// Comments — WEBHOOK INTAKE: is this request really from Meta, and what did it say?
//
// Pure and dependency-free apart from node:crypto, so every branch below is unit-testable without
// a server, a network or a database. The route is a thin shell around these functions.
//
// ── WHY WEBHOOKS ARE THE PRIMARY INTAKE ─────────────────────────────────────────────────────
// Meta documents `from` { id, username } on the comments WEBHOOK payload. It is NOT shown on the
// comments EDGE (GET /{media}/comments returns timestamp, text, id). `from.id` is the Instagram-
// scoped id, and our one-DM-per-person rule REFUSES to send without it. So the webhook is not an
// optimisation — it is the only documented intake that makes the DM half of this feature possible.
// Polling exists to reconcile missed deliveries, and a poll-discovered comment with no stable id
// is held rather than messaged. See lib/social/commentIdentity.ts.
//
// ── THE ENDPOINT IS PUBLIC, SO THE SIGNATURE IS THE GATE ────────────────────────────────────
// Anyone on the internet can POST here. Nothing in the body is trusted until the HMAC verifies
// against the app secret, which is why verification takes the RAW body: re-serialising parsed JSON
// changes the bytes and the digest no longer matches what Meta signed. The route must therefore
// read request.text() and must never JSON.parse before verifying.

import crypto from "node:crypto"

export type SignatureResult = {
  ok: boolean
  reason: "ok" | "not_configured" | "missing_header" | "malformed_header" | "mismatch"
}

/**
 * Verify Meta's `X-Hub-Signature-256` over the raw request body.
 *
 * FAIL CLOSED on every uncertainty: no secret configured, no header, a header we cannot parse, or
 * a digest that does not match are all rejections. There is no branch that accepts on missing
 * information — an unverified body is indistinguishable from an attacker's body.
 *
 * TIMING-SAFE COMPARISON. A plain `===` on a hex digest leaks, byte by byte, how much of a guess
 * was correct, which is enough to forge a signature given enough attempts. timingSafeEqual needs
 * equal-length buffers, so the length is checked first — and that check is safe to leak, because
 * the length of a SHA-256 digest is public knowledge.
 */
export function verifyMetaSignature(input: {
  rawBody: string
  header: string | null | undefined
  appSecret: string | null | undefined
}): SignatureResult {
  const secret = (input.appSecret ?? "").trim()
  if (!secret) return { ok: false, reason: "not_configured" }

  const header = (input.header ?? "").trim()
  if (!header) return { ok: false, reason: "missing_header" }

  // Meta's format is exactly `sha256=<hex>`. We do not accept a bare hex digest or the older sha1
  // form: accepting a weaker or unlabelled algorithm would let a caller choose the algorithm.
  const m = /^sha256=([0-9a-f]{64})$/i.exec(header)
  if (!m) return { ok: false, reason: "malformed_header" }

  const expected = crypto.createHmac("sha256", secret).update(input.rawBody, "utf8").digest()
  const given = Buffer.from(m[1].toLowerCase(), "hex")
  if (given.length !== expected.length) return { ok: false, reason: "mismatch" }
  return crypto.timingSafeEqual(given, expected)
    ? { ok: true, reason: "ok" }
    : { ok: false, reason: "mismatch" }
}

export type HandshakeResult =
  | { ok: true; challenge: string }
  | { ok: false; reason: "not_configured" | "bad_mode" | "bad_token" | "no_challenge" }

/**
 * Meta's subscription handshake: GET ?hub.mode=subscribe&hub.verify_token=…&hub.challenge=…
 *
 * The challenge is echoed ONLY when the verify token matches ours exactly. Compared timing-safely
 * for the same reason as the signature — this value is a shared secret, and the handshake endpoint
 * is as public as the delivery one.
 */
export function verifyHandshake(input: {
  mode: string | null | undefined
  token: string | null | undefined
  challenge: string | null | undefined
  expectedToken: string | null | undefined
}): HandshakeResult {
  const expected = (input.expectedToken ?? "").trim()
  if (!expected) return { ok: false, reason: "not_configured" }
  if ((input.mode ?? "").trim() !== "subscribe") return { ok: false, reason: "bad_mode" }

  const given = (input.token ?? "").trim()
  const a = Buffer.from(given, "utf8")
  const b = Buffer.from(expected, "utf8")
  const match = a.length === b.length && crypto.timingSafeEqual(a, b)
  if (!match) return { ok: false, reason: "bad_token" }

  const challenge = (input.challenge ?? "").trim()
  if (!challenge) return { ok: false, reason: "no_challenge" }
  return { ok: true, challenge }
}

// ── PAYLOAD NORMALISATION ───────────────────────────────────────────────────────────────────

/** One comment, in the shape the rest of the pipeline understands. Provider-agnostic on purpose. */
export type IncomingComment = {
  provider: "instagram"
  externalCommentId: string
  externalMediaId: string | null
  /** The recipient IG account the event was delivered for — maps to our connection. */
  recipientProviderUserId: string | null
  authorProviderUserId: string | null
  authorUsername: string | null
  body: string | null
  /** ISO. See the note on provenance below. */
  commentedAt: string | null
  /** True when this is a reply beneath another comment. screenComment HOLDS these. */
  isNestedReply: boolean
  /** Where the comment came from, carried into the action log so a row explains itself. */
  intake: "webhook"
}

export type ParseResult = {
  comments: IncomingComment[]
  /** Changes we deliberately ignored, with the reason — reported, never silently dropped. */
  ignored: { field: string; reason: string }[]
}

const str = (v: unknown): string | null => {
  if (typeof v === "string") { const t = v.trim(); return t.length ? t : null }
  if (typeof v === "number" && Number.isFinite(v)) return String(v)
  return null
}
const obj = (v: unknown): Record<string, unknown> | null =>
  typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])

/**
 * Turn a verified Meta webhook body into comments we can process.
 *
 * ── live_comments ARE NOT PROCESSED ───────────────────────────────────────────────────────
 * Meta delivers `comments` and `live_comments` through the same subscription. A private reply to a
 * live comment is only possible DURING the broadcast, and live chat arrives at a volume that would
 * exhaust the rate budget. They are counted in `ignored` so the decision is visible rather than
 * looking like a parser bug.
 *
 * ── TIMESTAMP PROVENANCE, STATED HONESTLY ─────────────────────────────────────────────────
 * The comments webhook value carries no comment timestamp. `entry.time` is the time Meta emitted
 * the event, which for a comment notification is within seconds of the comment itself, and it is
 * what we record. It is an upper bound on the comment's age, so using it can only ever make a
 * comment look NEWER than it is by a second or two — never older, which is the direction that
 * would matter for the freshness gate. A missing entry.time yields null, and screenComment HOLDS a
 * comment it cannot date rather than guessing.
 */
export function parseInstagramCommentWebhook(body: unknown): ParseResult {
  const out: IncomingComment[] = []
  const ignored: { field: string; reason: string }[] = []
  const root = obj(body)
  if (!root) return { comments: out, ignored: [{ field: "(root)", reason: "body is not an object" }] }

  // The `object` discriminator must be instagram. A payload for another product is not ours to
  // interpret, even if its shape happens to fit.
  const object = str(root.object)
  if (object !== "instagram") {
    return { comments: out, ignored: [{ field: String(object ?? "(none)"), reason: "object is not 'instagram'" }] }
  }

  for (const rawEntry of arr(root.entry)) {
    const entry = obj(rawEntry)
    if (!entry) { ignored.push({ field: "entry", reason: "entry is not an object" }); continue }

    // entry.id is the IG account the event belongs to. Needed to pick the connection, and a
    // delivery we cannot attribute to an account must not be guessed into one.
    const recipient = str(entry.id)
    const t = entry.time
    const commentedAt =
      typeof t === "number" && Number.isFinite(t) ? new Date(t * 1000).toISOString() : null

    for (const rawChange of arr(entry.changes)) {
      const change = obj(rawChange)
      if (!change) { ignored.push({ field: "changes", reason: "change is not an object" }); continue }
      const field = str(change.field) ?? "(none)"

      if (field === "live_comments") {
        ignored.push({ field, reason: "live comments are not automated — private replies are only possible during the broadcast" })
        continue
      }
      if (field !== "comments") {
        ignored.push({ field, reason: "not a comment event" })
        continue
      }

      const value = obj(change.value)
      if (!value) { ignored.push({ field, reason: "change.value is not an object" }); continue }

      const externalCommentId = str(value.id)
      if (!externalCommentId) {
        // Without the provider's own comment id there is no idempotency key, so this could be
        // processed twice. Refused rather than stored under a surrogate.
        ignored.push({ field, reason: "no comment id — cannot be deduplicated, refused" })
        continue
      }

      const from = obj(value.from)
      const media = obj(value.media)

      out.push({
        provider: "instagram",
        externalCommentId,
        externalMediaId: media ? str(media.id) : null,
        recipientProviderUserId: recipient,
        // THE FIELD THIS WHOLE DESIGN TURNS ON. Absent ⇒ resolveCommenter refuses the DM.
        authorProviderUserId: from ? str(from.id) : null,
        authorUsername: from ? str(from.username) : null,
        body: str(value.text),
        commentedAt,
        // Meta sets parent_id on a reply beneath another comment. Its presence is the signal; a
        // value equal to the comment's own id is not a parent and is treated as top-level.
        isNestedReply: (() => {
          const p = str(value.parent_id)
          return !!p && p !== externalCommentId
        })(),
        intake: "webhook",
      })
    }
  }
  return { comments: out, ignored }
}

/**
 * Drop duplicate comment ids WITHIN one delivery, keeping the first.
 *
 * Meta retries deliveries and can batch several changes into one request; the database's
 * UNIQUE (provider, external_comment_id) is the real guarantee, but collapsing duplicates here
 * means one request cannot produce two action attempts for the same comment before that index is
 * ever consulted.
 */
export function dedupeIncoming(comments: readonly IncomingComment[]): IncomingComment[] {
  const seen = new Set<string>()
  const out: IncomingComment[] = []
  for (const c of comments) {
    const key = `${c.provider}:${c.externalCommentId}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(c)
  }
  return out
}
