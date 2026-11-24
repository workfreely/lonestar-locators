// BUFFER PUBLISHING API — server-side only, one GraphQL endpoint, verified against the live schema.
//
// Buffer exposes a single POST endpoint that takes a GraphQL document. The three operations this
// module needs were introspected against the production schema on 22 Nov 2026, and the create
// mutation below is the EXACT shape that produced a real automatic TikTok publish (dueAt
// 22:36:04Z → sentAt 22:36:46Z, notificationStatus null throughout).
//
// ── THE KEY IS AN ARGUMENT, ALWAYS ──────────────────────────────────────────────────────────
// Every function takes the API key as a parameter and never reads it from the environment, a file
// or a module-level cache. That is what makes two Buffer accounts safe to use from one process:
// there is no ambient "the" key to pick up by accident, so a call either names the account it
// means or does not compile. The caller resolves it through lib/social/bufferServer.ts.
//
// The key is NEVER logged, never interpolated into a message, and never returned. The error paths
// below carry Buffer's own message and an HTTP status; the one thing they will not carry is the
// credential, so a thrown error is always safe to write into social_posts.error_message, where a
// human reads it.
//
// ── WHY MEDIA IS A URL AND NOT BYTES ────────────────────────────────────────────────────────
// Buffer's VideoAssetInput takes `url` and fetches the media itself. That is the opposite of our
// TikTok direct-post path, which uploads raw bytes because TikTok requires a verified domain for
// pull-from-URL and *.supabase.co is not one. Buffer imposes no such requirement — the verified
// publish above was fed a Supabase SIGNED url and ingested it without complaint — so the bytes
// never leave storage and the worker needs no public media route. See BUFFER_SIGN_TTL_SECONDS in
// bufferRoute.ts for the expiry margin that makes this safe.
import "server-only"
import { classifyReadFailure, type BufferPostStatus } from "@/lib/social/bufferRoute"

const BUFFER_API = "https://api.buffer.com"

/** Buffer's own request timeout. Generous for a media-fetching publish, short enough to not pin a
 *  cron invocation for ever. */
const TIMEOUT_MS = 30_000

export class BufferApiError extends Error {
  readonly httpStatus: number | null
  constructor(message: string, httpStatus: number | null) {
    // Truncated here rather than at the call site: this message is written into a database column
    // a person reads, and Buffer's rawError can be long.
    super(message.slice(0, 400))
    this.name = "BufferApiError"
    this.httpStatus = httpStatus
  }
}

type GraphQLResponse = {
  data?: Record<string, unknown> | null
  errors?: { message?: string }[] | null
}

/**
 * One GraphQL round trip.
 *
 * Throws BufferApiError on anything that is not a clean 200-with-data. The thrown message is
 * Buffer's, so an operator reading social_posts.error_message sees what Buffer actually said
 * rather than a code of ours.
 */
async function gql(
  apiKey: string,
  query: string,
  variables: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  let res: Response
  try {
    res = await fetch(BUFFER_API, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ query, variables }),
      signal: controller.signal,
    })
  } catch (e) {
    // Network-shaped: no HTTP status exists, so the caller's retry policy decides. The message is
    // ours and names no credential.
    throw new BufferApiError(
      e instanceof Error ? `buffer request failed: ${e.message}` : "buffer request failed",
      null,
    )
  } finally {
    clearTimeout(timer)
  }

  let json: GraphQLResponse
  try {
    json = (await res.json()) as GraphQLResponse
  } catch {
    throw new BufferApiError(`buffer returned a non-JSON response (HTTP ${res.status})`, res.status)
  }

  if (json.errors?.length) {
    const first = json.errors.map((e) => e?.message).filter(Boolean).join("; ")
    throw new BufferApiError(first || `buffer returned an error (HTTP ${res.status})`, res.status)
  }
  if (!res.ok || !json.data) {
    throw new BufferApiError(`buffer returned HTTP ${res.status} with no data`, res.status)
  }
  return json.data
}

// ── THE ONE WRITE ───────────────────────────────────────────────────────────────────────────
// Deliberately the only mutation in this module. `publishPostNow`, `editPost` and `deletePost`
// exist on Buffer's schema and are NOT wrapped here: nothing in the worker needs them, and a
// mutation that exists is a mutation that can be called by mistake.
//
// mode: shareNow and schedulingType: automatic are both REQUIRED for this to publish rather than
// queue or notify, and they are not parameters — see the note on each.
const CREATE_POST = `
mutation CreatePost($input: CreatePostInput!) {
  createPost(input: $input) {
    __typename
    ... on PostActionSuccess { post { id status dueAt } }
    ... on MutationError { message }
  }
}`

export type CreateBufferPostInput = {
  channelId: string
  /** The caption. Buffer applies the network's own limit; we pre-truncate upstream. */
  text: string
  /** A fetchable media URL. A short-lived signed URL is correct and expected here. */
  videoUrl: string
  /** Which frame Buffer should offer as the cover, in milliseconds. */
  thumbnailOffsetMs: number
  /**
   * Buffer's PostType for Instagram (`reel`). Null for TikTok, whose metadata input has no type
   * field — a TikTok post is a video and Buffer infers it from the asset.
   */
  postType: "reel" | "post" | "story" | null
  /** Instagram only: whether a Reel is also pushed to the main feed. */
  shouldShareToFeed?: boolean
  /** Declared on both networks when the content is AI-assisted. */
  isAiGenerated?: boolean
}

export type CreatedBufferPost = { id: string; status: BufferPostStatus | string }

/**
 * Create and immediately publish one post.
 *
 * ── THE TWO FIELDS THAT DECIDE AUTOMATIC vs NOTIFICATION ────────────────────────────────────
 * schedulingType: "automatic" asks Buffer to publish through the network's API. The alternative,
 * "notification", sends a push to a phone and publishes nothing — which for an unattended cron is
 * indistinguishable from silently not working. It is hard-coded rather than a parameter because
 * there is no caller for whom "notification" would be correct.
 *
 * mode: "shareNow" is hard-coded for a different and sharper reason: our media URL expires. Any
 * mode that parks the post in Buffer's queue (addToQueue, customScheduled, shareNext) means Buffer
 * fetches the media at a time we did not choose, possibly after the signed URL has died — and the
 * resulting failure looks like a corrupt video rather than an expired link. shareNow also keeps
 * the free plan's 10-scheduled-posts-per-channel cap entirely out of play: a shareNow publish was
 * measured not to consume queue depth (scheduled: 0, sent: 1 afterwards).
 *
 * THROWS on a MutationError, carrying Buffer's own message. It does NOT retry — see the retry
 * policy in bufferRoute.ts. A createPost that fails ambiguously may still have created a post, so
 * the caller reconciles by asking, never by sending again.
 */
export async function createBufferPost(
  apiKey: string,
  input: CreateBufferPostInput,
): Promise<CreatedBufferPost> {
  const metadata: Record<string, unknown> = {}
  if (input.postType) metadata.type = input.postType
  if (input.shouldShareToFeed !== undefined) metadata.shouldShareToFeed = input.shouldShareToFeed
  if (input.isAiGenerated !== undefined) metadata.isAiGenerated = input.isAiGenerated

  const data = await gql(apiKey, CREATE_POST, {
    input: {
      channelId: input.channelId,
      mode: "shareNow",
      schedulingType: "automatic",
      text: input.text,
      assets: [
        {
          video: {
            url: input.videoUrl,
            // thumbnailUrl is deliberately NOT sent. It is a second URL Buffer must fetch, with a
            // second chance to expire, for a cover frame Buffer derives from thumbnailOffset anyway.
            metadata: { thumbnailOffset: input.thumbnailOffsetMs },
          },
        },
      ],
      ...(Object.keys(metadata).length ? { metadata: { [metadataKeyFor(input.postType)]: metadata } } : {}),
    },
  })

  const payload = data.createPost as Record<string, unknown> | null
  const typename = payload?.__typename
  if (typename === "MutationError") {
    const msg = typeof payload?.message === "string" ? payload.message : "buffer refused the post"
    throw new BufferApiError(`buffer refused the post: ${msg}`, null)
  }
  const post = payload?.post as Record<string, unknown> | null
  const id = typeof post?.id === "string" ? post.id : null
  if (!id) {
    throw new BufferApiError("buffer accepted the post but returned no post id", null)
  }
  return { id, status: typeof post?.status === "string" ? post.status : "sending" }
}

/**
 * Which key the per-network metadata hangs off.
 *
 * Buffer's PostInputMetaData is keyed by network. Instagram-shaped metadata (type, shouldShareToFeed)
 * goes under `instagram`; a TikTok post carries only isAiGenerated, under `tiktok`. A null postType
 * means TikTok, which is the only network here that takes no type.
 */
function metadataKeyFor(postType: CreateBufferPostInput["postType"]): string {
  return postType === null ? "tiktok" : "instagram"
}

// ── THE READ, AND THE ONLY THING THAT IS RETRIED ────────────────────────────────────────────
const READ_POST = `
query Post($input: PostInput!) {
  post(input: $input) {
    id
    status
    sentAt
    notificationStatus
    externalLink
    error { message }
  }
}`

export type BufferPostSnapshot = {
  id: string
  status: BufferPostStatus | string
  sentAt: string | null
  /** Non-null means Buffer treated this as a reminder, not an API publish. The worker treats that
   *  as a fault, because nothing will tap the notification. */
  notificationStatus: string | null
  externalLink: string | null
  errorMessage: string | null
}

/**
 * Read one post's current state, retrying transient failures.
 *
 * SAFE TO RETRY because it is a read: asking twice tells us the same thing and changes nothing.
 * This is the asymmetry the module comment sets out — the mutation above is never retried, this
 * is, and the difference is the whole of the duplicate-safety story on the Buffer side.
 *
 * `attempts` is small on purpose. This runs inside a cron invocation that also has other rows to
 * process, and a status that cannot be read now is read on the next run five minutes later with
 * no loss: the post keeps its id, and the id is the handle.
 */
export async function fetchBufferPost(
  apiKey: string,
  postId: string,
  attempts = 3,
): Promise<BufferPostSnapshot> {
  let lastError: BufferApiError | null = null
  for (let i = 0; i < attempts; i++) {
    try {
      const data = await gql(apiKey, READ_POST, { input: { id: postId } })
      const p = data.post as Record<string, unknown> | null
      if (!p) throw new BufferApiError(`buffer has no post ${postId}`, null)
      const err = p.error as Record<string, unknown> | null
      return {
        id: typeof p.id === "string" ? p.id : postId,
        status: typeof p.status === "string" ? p.status : "unknown",
        sentAt: typeof p.sentAt === "string" ? p.sentAt : null,
        notificationStatus: typeof p.notificationStatus === "string" ? p.notificationStatus : null,
        externalLink: typeof p.externalLink === "string" ? p.externalLink : null,
        errorMessage: typeof err?.message === "string" ? err.message : null,
      }
    } catch (e) {
      const apiErr = e instanceof BufferApiError ? e : new BufferApiError(String(e), null)
      lastError = apiErr
      // A terminal failure is not made less terminal by asking again. Stop immediately so the
      // caller sees the real reason instead of three copies of it a second apart.
      if (classifyReadFailure(apiErr.httpStatus, apiErr.message) === "terminal") break
      if (i < attempts - 1) await new Promise((r) => setTimeout(r, 400 * (i + 1)))
    }
  }
  throw lastError ?? new BufferApiError("buffer post read failed", null)
}

/**
 * Confirm a channel is still usable before publishing to it.
 *
 * Cheap, and it catches the one failure mode that would otherwise look like a mystery: a channel
 * disconnected or locked inside Buffer still has a valid id and a valid API key, so createPost
 * fails with a message about the channel rather than about the credential. Asking first lets the
 * worker report "reconnect this channel in Buffer" instead.
 */
const READ_CHANNEL = `
query Channel($input: ChannelInput!) {
  channel(input: $input) {
    id
    name
    service
    isDisconnected
    isLocked
    metadata { __typename ... on InstagramMetadata { defaultToReminders } }
  }
}`

export type BufferChannelSnapshot = {
  id: string
  name: string | null
  service: string | null
  isDisconnected: boolean
  isLocked: boolean
  /** Instagram only. TRUE means Buffer would send a phone reminder rather than publish. */
  defaultToReminders: boolean | null
}

export async function fetchBufferChannel(apiKey: string, channelId: string): Promise<BufferChannelSnapshot> {
  const data = await gql(apiKey, READ_CHANNEL, { input: { id: channelId } })
  const c = data.channel as Record<string, unknown> | null
  if (!c) throw new BufferApiError(`buffer has no channel ${channelId}`, null)
  const meta = c.metadata as Record<string, unknown> | null
  return {
    id: typeof c.id === "string" ? c.id : channelId,
    name: typeof c.name === "string" ? c.name : null,
    service: typeof c.service === "string" ? c.service : null,
    isDisconnected: c.isDisconnected === true,
    isLocked: c.isLocked === true,
    defaultToReminders:
      typeof meta?.defaultToReminders === "boolean" ? (meta.defaultToReminders as boolean) : null,
  }
}
