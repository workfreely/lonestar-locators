// Comments — THE ORCHESTRATOR. One comment in, one decision trail out.
//
// Every rule already exists as a pure function in commentSafety, commentIdentity, commentKeywords
// and commentSendPolicy. This file's only job is to call them IN THE RIGHT ORDER and to persist
// what happened. It holds no rules of its own, so a safeguard can never be weakened by editing
// this file alone — and the order below is itself the design.
//
// ── THE ORDER, AND WHY ──────────────────────────────────────────────────────────────────────
//   1. feature gate        the kill switch. Nothing is read or written when it is off.
//   2. connection          which of our accounts was this delivered for? Unknown ⇒ refuse.
//   3. automation gate     global + account + activation + permissions. Fails closed.
//   4. idempotency         already stored ⇒ stop. Re-delivery and re-polling must be free.
//   5. identity            resolveCommenter. No stable id ⇒ no DM, ever. Stored for display.
//   6. screening           own/old/hostile/spam/negation/nested. Holds reach a human, not a reply.
//   7. keyword             no keyword ⇒ stored and left alone. Praise is not a lead.
//   8. private reply       window → pre-filter → ATOMIC CLAIM → send → classify → resolve.
//   9. public reply        only after the DM outcome is known, because the wording depends on it.
//
// Steps 1–7 can only ever REDUCE what happens. The first refusal wins and is recorded as the
// reason, so a row in the ledger explains itself without anyone re-deriving the logic.
//
// ── DEPENDENCIES ARE INJECTED ───────────────────────────────────────────────────────────────
// The store and the sender are interfaces. The tests pass a fake store and a mock sender and
// exercise every branch — signature rejection, duplicate delivery, a missing commenter id, a 500,
// a 429, an expired comment, a refused private reply, an uncertain send — with no network and no
// database. The production wiring passes the real ones.

import {
  resolveCommenter, shouldSendPrivateReply, resolveDmOutcome, publicReplyKind,
  type CommenterRecord, type CommenterIdentity,
} from "@/lib/social/commentIdentity"
import { screenComment, shouldSendPublicReply, type ScreenReason } from "@/lib/social/commentSafety"
import {
  matchComment, pickVariant, leadFormLink, APPROVED_DM_BODY, APPROVED_PUBLIC_FALLBACK,
} from "@/lib/social/commentKeywords"
import {
  featureGate, sendGate, privateReplyWindow, classifySendAttempt, isOutsideWindowError,
} from "@/lib/social/commentSendPolicy"
import type { CommentSender, SenderContext, SendResult } from "@/lib/social/commentSender"
import type { BucUsage } from "@/lib/social/commentRateLimit"

/** A comment to process, from either intake. Shaped by commentWebhook / the poller. */
export type PendingComment = {
  provider: "instagram"
  externalCommentId: string
  externalMediaId: string | null
  recipientProviderUserId: string | null
  authorProviderUserId: string | null
  authorUsername: string | null
  body: string | null
  commentedAt: string | null
  isNestedReply: boolean
  intake: "webhook" | "poll"
}

export type ConnectionContext = {
  connectionId: string
  /** The account's own Instagram-scoped id — used to recognise our own comments AND to send. */
  ownProviderUserId: string
  username: string
  accessToken: string
  /** Does the connection currently hold instagram_business_manage_comments? */
  permissionsOk: boolean
  /** Our Smart Lead Form origin + slug, for the DM's link. */
  formOrigin: string
  formUsername: string
  formPlatformSlug: string
}

export type GateState = {
  /** False when settings could not be read — accountAutomationGate then refuses. */
  settingsReadOk: boolean
  globalEnabled: boolean | null
  accountEnabled: boolean | null
  activatedAt: string | null
  maxCommentAgeMinutes: number | null
  publicRepliesEnabled: boolean | null
  publicReplyCooldownMinutes: number | null
}

export type ActionKind = "private_reply" | "public_reply"
export type ActionStatus = "sent" | "failed" | "uncertain" | "skipped"

export type CommentStore = {
  /** The connection this delivery belongs to, or null when we do not recognise the account. */
  findConnection(provider: string, recipientProviderUserId: string | null): Promise<ConnectionContext | null>
  readGate(connectionId: string): Promise<GateState>
  /** Non-null when this comment has already been stored — the idempotency check. */
  findComment(provider: string, externalCommentId: string): Promise<{ id: string } | null>
  /** Upsert on (connection_id, provider_user_id). Only called when a stable id exists. */
  upsertCommenter(input: {
    connectionId: string; provider: string; providerUserId: string
    username: string | null; profileUrl: string | null
  }): Promise<{ id: string } & CommenterRecord & { lastPublicReplyAt: string | null }>
  insertComment(input: {
    connectionId: string; provider: string; externalCommentId: string
    externalMediaId: string | null; commenterId: string | null; authorUsername: string | null
    body: string | null; commentedAt: string | null; matchedKeyword: string | null
    holdReason: string | null
  }): Promise<{ id: string }>
  /** The atomic claim — DM_CLAIM_SQL. True only for the single caller that wins. */
  claimDm(commenterId: string): Promise<boolean>
  /** Stamp dm_sent_at and/or clear dm_claimed_at, per resolveDmOutcome. */
  resolveDm(commenterId: string, r: { markSent: boolean; releaseClaim: boolean }): Promise<void>
  touchPublicReply(commenterId: string, atIso: string): Promise<void>
  /** Append to the ledger. The DB's UNIQUE (comment_id, kind) makes a second write a no-op. */
  logAction(input: {
    commentId: string; kind: ActionKind; status: ActionStatus
    reason: string | null; externalId: string | null; error: string | null
  }): Promise<void>
  /** Variations for a keyword's public reply. Empty is normal and handled. */
  publicReplyVariants(connectionId: string, keyword: string): Promise<string[]>
}

export type ProcessOutcome = {
  externalCommentId: string
  /** The first refusal, or "processed". */
  result:
    | "inert" | "unknown_account" | "gate_refused" | "already_processed"
    | "held" | "skipped" | "no_keyword" | "processed"
  reason: string
  stored: boolean
  matchedKeyword: string | null
  dm: { attempted: boolean; status: ActionStatus | null; reason: string } | null
  publicReply: { attempted: boolean; status: ActionStatus | null; reason: string } | null
  /** Rate-limit usage seen on any call this comment caused. */
  usage: BucUsage | null
}

const now = () => Date.now()

/**
 * Process ONE comment.
 *
 * Returns a full decision trail rather than throwing, because a single malformed comment inside a
 * webhook delivery of ten must not abort the other nine — and because "what happened and why" is
 * the thing the operator needs to see.
 */
export async function processComment(
  c: PendingComment,
  store: CommentStore,
  sender: CommentSender,
  opts: { env?: Record<string, string | undefined>; nowMs?: number } = {},
): Promise<ProcessOutcome> {
  const env = opts.env ?? process.env
  const nowMs = opts.nowMs ?? now()
  const base = {
    externalCommentId: c.externalCommentId,
    stored: false,
    matchedKeyword: null,
    dm: null,
    publicReply: null,
    usage: null,
  } as const

  // ── 1. THE KILL SWITCH. Before any read, so "off" means nothing is touched at all. ────────
  const feature = featureGate(env)
  if (!feature.active) return { ...base, result: "inert", reason: feature.reason }

  // ── 2. WHOSE ACCOUNT IS THIS? ─────────────────────────────────────────────────────────────
  // A delivery we cannot attribute is refused rather than attached to the only connection we have.
  // Guessing here would let someone else's webhook drive replies from our account.
  const conn = await store.findConnection(c.provider, c.recipientProviderUserId)
  if (!conn) return { ...base, result: "unknown_account", reason: "no connection matches the recipient id" }

  // ── 3. THE AUTOMATION GATE. Fails closed on an unreadable settings row. ───────────────────
  const gate = await store.readGate(conn.connectionId)
  const { accountAutomationGate } = await import("@/lib/social/commentSafety")
  const active = accountAutomationGate({
    settingsReadOk: gate.settingsReadOk,
    globalEnabled: gate.globalEnabled,
    accountEnabled: gate.accountEnabled,
    activatedAt: gate.activatedAt,
    permissionsOk: conn.permissionsOk,
  })

  // ── 4. IDEMPOTENCY. Checked before any write. ─────────────────────────────────────────────
  const existing = await store.findComment(c.provider, c.externalCommentId)
  if (existing) return { ...base, result: "already_processed", reason: "comment already stored" }

  // ── 5. IDENTITY. The id decides whether a DM is possible at all. ──────────────────────────
  const identity: CommenterIdentity = resolveCommenter(
    c.provider,
    { providerUserId: c.authorProviderUserId, username: c.authorUsername, profileUrl: null },
    conn.ownProviderUserId,
  )

  // ── 6. SCREENING. ─────────────────────────────────────────────────────────────────────────
  const screen = screenComment({
    text: c.body,
    commentedAt: c.commentedAt,
    isOwnAccount: identity.reason === "own_account",
    isNestedReply: c.isNestedReply,
    alreadyProcessed: false,
    activatedAt: gate.activatedAt,
    maxAgeMinutes: gate.maxCommentAgeMinutes ?? undefined,
    nowMs,
  })

  const keyword = matchComment(c.body)

  // A commenter row exists only when there is a stable id to key it on. Without one the comment is
  // still stored with its username for display — it simply can never be messaged.
  let commenter: ({ id: string } & CommenterRecord & { lastPublicReplyAt: string | null }) | null = null
  if (identity.providerUserId && screen.outcome !== "skip") {
    commenter = await store.upsertCommenter({
      connectionId: conn.connectionId,
      provider: c.provider,
      providerUserId: identity.providerUserId,
      username: identity.username,
      profileUrl: identity.profileUrl,
    })
  }

  // Everything that reaches here is stored, so the Inbox shows the whole conversation and not only
  // the comments we acted on.
  const holdReason: ScreenReason | null = screen.outcome === "hold" ? screen.reason : null
  const row = await store.insertComment({
    connectionId: conn.connectionId,
    provider: c.provider,
    externalCommentId: c.externalCommentId,
    externalMediaId: c.externalMediaId,
    commenterId: commenter?.id ?? null,
    authorUsername: identity.username,
    body: c.body,
    commentedAt: c.commentedAt,
    matchedKeyword: keyword?.keyword ?? null,
    holdReason,
  })

  const stored = { ...base, stored: true, matchedKeyword: keyword?.keyword ?? null }

  // A hold is NOT a failure and NOT a refusal — it is a comment a person should read. No action
  // row is written, so nothing can later mistake it for something we tried and failed to do.
  if (screen.outcome === "hold") return { ...stored, result: "held", reason: screen.reason }

  if (screen.outcome === "skip") {
    // Logged so a skip is visible, and so the UNIQUE (comment_id, kind) slot is taken and a later
    // run cannot decide differently about the same comment.
    await store.logAction({ commentId: row.id, kind: "private_reply", status: "skipped", reason: screen.reason, externalId: null, error: null })
    return { ...stored, result: "skipped", reason: screen.reason }
  }

  // The automation gate is applied AFTER storing. Ingesting while switched off is how the operator
  // sees what the feature would be doing before arming it — and no action row means no send.
  if (!active.active) {
    await store.logAction({ commentId: row.id, kind: "private_reply", status: "skipped", reason: active.reason, externalId: null, error: null })
    return { ...stored, result: "gate_refused", reason: active.reason }
  }

  // ── 7. NO KEYWORD, NO ACTION. Praise is not a lead and must not be answered by a machine. ─
  if (!keyword) {
    await store.logAction({ commentId: row.id, kind: "private_reply", status: "skipped", reason: "no_keyword", externalId: null, error: null })
    return { ...stored, result: "no_keyword", reason: "no approved keyword present" }
  }

  // ── 8. THE PRIVATE REPLY ──────────────────────────────────────────────────────────────────
  let usage: BucUsage | null = null
  let dmAccepted = false
  let dm: ProcessOutcome["dm"] = { attempted: false, status: null, reason: "not_attempted" }

  const window = privateReplyWindow({ commentedAt: c.commentedAt, nowMs })
  const pre = shouldSendPrivateReply({
    automationEnabled: true, // the gate above already decided this
    identity,
    existing: commenter,
  })

  if (!window.withinWindow) {
    // Refused BEFORE the claim. Claiming someone for a send that cannot succeed would mark them
    // spoken for, and an unresolved claim is never released — it could lock out a real DM for ever.
    dm = { attempted: false, status: "skipped", reason: `outside_window:${window.reason}` }
    await store.logAction({ commentId: row.id, kind: "private_reply", status: "skipped", reason: dm.reason, externalId: null, error: null })
  } else if (!pre.send) {
    dm = { attempted: false, status: "skipped", reason: pre.reason }
    await store.logAction({ commentId: row.id, kind: "private_reply", status: "skipped", reason: pre.reason, externalId: null, error: null })
  } else if (!sendGate(env).active) {
    // THE DRY RUN. Everything above was evaluated for real and this comment WOULD have been
    // messaged; the ledger says so, and no claim is taken because nothing was attempted.
    dm = { attempted: false, status: "skipped", reason: "sending_disabled" }
    await store.logAction({ commentId: row.id, kind: "private_reply", status: "skipped", reason: "sending_disabled", externalId: null, error: null })
  } else if (!commenter) {
    // Unreachable via pre.send (which requires a stable id, which creates the row), kept because
    // the alternative is a non-null assertion on the thing this feature must never get wrong.
    dm = { attempted: false, status: "skipped", reason: "no_stable_id" }
    await store.logAction({ commentId: row.id, kind: "private_reply", status: "skipped", reason: "no_stable_id", externalId: null, error: null })
  } else {
    // ── THE ATOMIC CLAIM. Only one caller can win it; a loser must not send. ────────────────
    const won = await store.claimDm(commenter.id)
    if (!won) {
      dm = { attempted: false, status: "skipped", reason: "claim_held" }
      await store.logAction({ commentId: row.id, kind: "private_reply", status: "skipped", reason: "claim_held", externalId: null, error: null })
    } else {
      const ctx: SenderContext = { igUserId: conn.ownProviderUserId, accessToken: conn.accessToken }
      const link = leadFormLink({
        origin: conn.formOrigin,
        username: conn.formUsername,
        platformSlug: conn.formPlatformSlug,
        keyword: keyword.keyword,
        mediaId: c.externalMediaId,
      })
      // EXACT APPROVED WORDING, then the link. The sentence is never reworded or appended to.
      const attempt: SendResult = await sender.sendPrivateReply(ctx, c.externalCommentId, `${APPROVED_DM_BODY}\n\n${link}`)
      usage = attempt.usage ?? usage

      const cls = classifySendAttempt(attempt)
      const res = resolveDmOutcome(cls.outcome)
      await store.resolveDm(commenter.id, { markSent: res.markSent, releaseClaim: res.releaseClaim })
      dmAccepted = res.mayClaimDmPublicly

      const reason = isOutsideWindowError(attempt) ? "outside_window" : cls.reason
      dm = { attempted: true, status: res.status, reason }
      await store.logAction({
        commentId: row.id, kind: "private_reply", status: res.status, reason,
        externalId: attempt.externalId ?? null,
        // No provider message is stored: Meta's errors can echo the request, and the request
        // carried a token. The classification is the durable record.
        error: res.status === "sent" ? null : reason,
      })
    }
  }

  // ── 9. THE PUBLIC REPLY — wording depends on what actually happened to the DM ─────────────
  let publicReply: ProcessOutcome["publicReply"] = { attempted: false, status: null, reason: "not_attempted" }
  const pub = shouldSendPublicReply({
    publicRepliesEnabled: gate.publicRepliesEnabled === true,
    alreadyRepliedToComment: false,
    lastPublicReplyAt: commenter?.lastPublicReplyAt ?? null,
    cooldownMinutes: gate.publicReplyCooldownMinutes ?? undefined,
    nowMs,
  })

  if (!pub.send) {
    publicReply = { attempted: false, status: "skipped", reason: pub.reason }
    await store.logAction({ commentId: row.id, kind: "public_reply", status: "skipped", reason: pub.reason, externalId: null, error: null })
  } else if (!sendGate(env).active) {
    publicReply = { attempted: false, status: "skipped", reason: "sending_disabled" }
    await store.logAction({ commentId: row.id, kind: "public_reply", status: "skipped", reason: "sending_disabled", externalId: null, error: null })
  } else {
    // publicReplyKind reads the PLATFORM'S confirmation, not our intention. A queued, failed or
    // uncertain DM is not an acceptance, so all three take the fallback that claims nothing.
    const kind = publicReplyKind(dmAccepted)
    let text = APPROVED_PUBLIC_FALLBACK
    if (kind === "dm_sent") {
      const variants = await store.publicReplyVariants(conn.connectionId, keyword.keyword)
      // NO CONFIGURED VARIANT ⇒ THE FALLBACK. The fallback never claims a DM, so an empty reply
      // bank degrades to something merely less specific rather than to something untrue.
      text = pickVariant(variants, c.externalCommentId) ?? APPROVED_PUBLIC_FALLBACK
    }
    const ctx: SenderContext = { igUserId: conn.ownProviderUserId, accessToken: conn.accessToken }
    const attempt = await sender.sendPublicReply(ctx, c.externalCommentId, text)
    usage = attempt.usage ?? usage

    const cls = classifySendAttempt(attempt)
    // A public reply has no per-person "ever" rule, so an uncertain one is recorded as uncertain
    // and simply not retried. Nothing here may stamp a DM.
    const status: ActionStatus =
      cls.outcome === "accepted" ? "sent" : cls.outcome === "failed" ? "failed" : "uncertain"
    if (status === "sent" && commenter) {
      await store.touchPublicReply(commenter.id, new Date(nowMs).toISOString())
    }
    publicReply = { attempted: true, status, reason: cls.reason }
    await store.logAction({
      commentId: row.id, kind: "public_reply", status, reason: cls.reason,
      externalId: attempt.externalId ?? null,
      error: status === "sent" ? null : cls.reason,
    })
  }

  return { ...stored, result: "processed", reason: "ok", dm, publicReply, usage }
}

/**
 * Process a batch, in order, stopping early only if the kill switch is off.
 *
 * SEQUENTIAL ON PURPOSE. Two comments in one delivery can be from the SAME person; processing them
 * concurrently would have both lose or both win the claim race for no benefit. A webhook delivery
 * is a handful of comments, so there is nothing to gain from parallelism and a duplicate DM to lose.
 */
export async function processBatch(
  comments: readonly PendingComment[],
  store: CommentStore,
  sender: CommentSender,
  opts: { env?: Record<string, string | undefined>; nowMs?: number } = {},
): Promise<ProcessOutcome[]> {
  const out: ProcessOutcome[] = []
  for (const c of comments) {
    try {
      out.push(await processComment(c, store, sender, opts))
    } catch (e) {
      // One bad comment must not abort the rest of the delivery. Recorded, not swallowed.
      out.push({
        externalCommentId: c.externalCommentId, result: "skipped",
        reason: `error:${(e as Error).message}`, stored: false, matchedKeyword: null,
        dm: null, publicReply: null, usage: null,
      })
    }
  }
  return out
}
