// Social Beast — the FINALIZE half of Instagram publishing, in one place.
//
// The container is created elsewhere (the publish route, or the worker). This module owns the one
// step that actually puts a Reel on Instagram — media_publish — and therefore owns the only place
// a duplicate Reel could ever come from. The manual route and the cron worker both call it, so
// there is exactly one implementation of "is it safe to publish this container?".
//
// ── WHY status IS NOT THE CLAIM ──────────────────────────────────────────────────────────────
// The original finalize claimed by writing status='published' BEFORE calling Meta, because status
// was the only column to claim on. A crash in that window left a row asserting "published" with no
// media id, which was both unrecoverable and untrue. The claim is now
// media_publish_claimed_at — a column that asserts a call is IN FLIGHT, not that it succeeded.
// status becomes 'published' only in the same statement that writes external_post_id.
//
// ── WHY `external_post_id IS NULL` IS NOT A RETRY CONDITION ──────────────────────────────────
// On exactly the crash row above it is true while the Reel is already live. Retrying on it
// double-posts. A claimed-but-unacknowledged row is instead RECONCILED against Meta: the container
// id was persisted before the call, and a container whose status_code is PUBLISHED proves the Reel
// exists, so that row is marked published rather than published again.

import type { SupabaseClient } from "@supabase/supabase-js"
import * as ig from "@/lib/social/instagram"

/** The Meta calls this module makes, as an injectable surface. */
export type MetaApi = {
  getContainerStatus: typeof ig.getContainerStatus
  publishReelContainer: typeof ig.publishReelContainer
  getMediaPermalink: typeof ig.getMediaPermalink
}
const defaultApi: MetaApi = {
  getContainerStatus: ig.getContainerStatus,
  publishReelContainer: ig.publishReelContainer,
  getMediaPermalink: ig.getMediaPermalink,
}

/** The project has no generated DB types, so both callers pass an untyped client (the guard's
 *  RLS-scoped one, or the service-role one in the worker). Typed loosely on purpose rather than
 *  inventing a schema type that would drift from the real table. */
type Db = SupabaseClient<any, "public", any>

export type FinalizeOutcome =
  | { state: "published"; mediaId: string | null; url: string | null; recovered?: true }
  | { state: "pending"; containerStatus: string }
  | { state: "failed"; reason: string }
  | { state: "not_claimed" }

/**
 * Finalize one post whose container already exists.
 *
 * `igUserId`/`token` are resolved by the caller (server-side, from Vault). `containerId` must be
 * the value already persisted on the row — never a fresh one — because it is the reconciliation
 * key if this process dies.
 */
export async function finalizeInstagramPublish(args: {
  db: Db
  postId: string
  containerId: string
  igUserId: string
  token: string
  /** Already-claimed rows are being RECOVERED, not published: a claim exists from a previous
   *  attempt, so this call must never issue a second media_publish. */
  reconcileOnly?: boolean
  /** The three Meta calls, injectable so the duplicate-publish tests can COUNT media_publish
   *  invocations. Production never passes this. */
  api?: Partial<MetaApi>
}): Promise<FinalizeOutcome> {
  const { db, postId, containerId, igUserId, token, reconcileOnly } = args
  const getContainerStatus = args.api?.getContainerStatus ?? defaultApi.getContainerStatus
  const publishReelContainer = args.api?.publishReelContainer ?? defaultApi.publishReelContainer
  const getMediaPermalink = args.api?.getMediaPermalink ?? defaultApi.getMediaPermalink
  const now = () => new Date().toISOString()

  let containerStatus: string
  try {
    containerStatus = await getContainerStatus(containerId, token)
  } catch (e) {
    const reason = e instanceof Error ? e.message.slice(0, 400) : "status error"
    await db.from("social_posts").update({ status: "needs_attention", error_message: reason, updated_at: now() }).eq("id", postId)
    return { state: "failed", reason }
  }

  // The Reel is already on Instagram. This is the crash path: a previous attempt called
  // media_publish, Meta succeeded, and the acknowledgement never landed locally. Publishing again
  // would post the same Reel twice, so this records the fact instead.
  if (containerStatus === "PUBLISHED") {
    const url = await getMediaPermalink(containerId, token) // best-effort; usually null for a container
    await db
      .from("social_posts")
      .update({
        status: "published",
        published_at: now(),
        external_post_url: url,
        // Deliberately explicit rather than silent: the Reel is live but its media id was lost
        // with the crashed process, so History cannot deep-link it. Visible, not pretended.
        error_message: "recovered: Instagram reports this container already published; media id unavailable",
        updated_at: now(),
      })
      .eq("id", postId)
      .is("external_post_id", null)
    return { state: "published", mediaId: null, url, recovered: true }
  }

  if (containerStatus === "IN_PROGRESS" || containerStatus === "UNKNOWN") {
    return { state: "pending", containerStatus }
  }
  if (containerStatus === "ERROR" || containerStatus === "EXPIRED") {
    const reason = `container ${containerStatus}`
    await db.from("social_posts").update({ status: "needs_attention", error_message: reason, updated_at: now() }).eq("id", postId)
    return { state: "failed", reason }
  }

  // FINISHED. A claimed-but-unacknowledged row that is merely FINISHED means the crash happened
  // BEFORE Meta published, so there is nothing live to duplicate — but we still refuse to publish
  // under reconcileOnly and let the normal path re-claim it, so recovery can never be the thing
  // that issues a publish.
  if (reconcileOnly) return { state: "not_claimed" }

  // THE CLAIM. Atomic and exactly-once: the row is only claimable while
  // media_publish_claimed_at is null, so of two concurrent callers exactly one proceeds to Meta.
  const { data: claim } = await db
    .from("social_posts")
    .update({ media_publish_claimed_at: now(), updated_at: now() })
    .eq("id", postId)
    .is("media_publish_claimed_at", null)
    .is("external_post_id", null)
    .select("id")
    .maybeSingle()
  if (!claim) return { state: "not_claimed" }

  try {
    const mediaId = await publishReelContainer(igUserId, containerId, token)
    const url = await getMediaPermalink(mediaId, token)
    // status and external_post_id move together — "published" can never outrun the media id.
    await db
      .from("social_posts")
      .update({
        status: "published",
        external_post_id: mediaId,
        external_post_url: url,
        published_at: now(),
        error_message: null,
        updated_at: now(),
      })
      .eq("id", postId)
    return { state: "published", mediaId, url }
  } catch (e) {
    const reason = e instanceof Error ? e.message.slice(0, 400) : "publish error"
    // Meta rejected the call. Release the claim so the post is retryable, and surface the reason.
    // Safe to release precisely because Meta did NOT publish — had it succeeded, the container
    // would read PUBLISHED on the next pass and take the recovery branch above.
    await db
      .from("social_posts")
      .update({ status: "needs_attention", error_message: reason, media_publish_claimed_at: null, updated_at: now() })
      .eq("id", postId)
    return { state: "failed", reason }
  }
}
