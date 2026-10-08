// RENDER JOB QUEUE — enqueue, claim, finish.
//
// Vercel is the control plane: it creates jobs and executes them one per invocation. The render
// itself is the existing, proven FFmpeg path via renderPostToStorage — this module never renders,
// it only decides WHICH post to render and records what happened.
//
// ONE JOB PER INVOCATION, deliberately. Bulk rendering inside a single request is what exhausted
// Vercel's /tmp before; a queue drained one item at a time gives every render a clean work dir and
// a fresh execution budget, and a crash costs one job rather than a batch.
import { createHash } from "node:crypto"

export const RENDER_PLATFORMS = ["instagram", "tiktok"] as const
export type RenderPlatform = (typeof RENDER_PLATFORMS)[number]
export const isRenderPlatform = (v: unknown): v is RenderPlatform =>
  typeof v === "string" && (RENDER_PLATFORMS as readonly string[]).includes(v)

/** Default lease. Long enough for a slow render, short enough that a dead worker frees the job
 *  within one cron tick rather than wedging the queue. */
export const CLAIM_LEASE_SECONDS = 600

/**
 * THE IDEMPOTENCY KEY — what makes "render this post" the same request twice.
 *
 * It covers the post, the PLATFORM, and everything that changes the output: template, overlay mode,
 * headline, subheadline, audio and voice selections. So:
 *
 *   * a double-clicked button, a retried HTTP request, a re-run of the bulk enqueue — all collapse
 *     onto the ONE existing job, because every input is identical
 *   * editing the headline, swapping the template, or changing the audio produces a DIFFERENT key,
 *     which is correct: that is a genuinely different video and deserves its own job
 *   * the same post for Instagram and for TikTok are two keys, never one — the overlay is fitted to
 *     the platform's safe area, so they are different artifacts
 *
 * DELIBERATELY NOT render_version. The version is an OUTPUT of a render, so including it would make
 * every retry of a failed job look like new work and defeat the whole mechanism.
 */
export function renderJobKey(input: {
  postId: string
  platform: RenderPlatform
  overlayMode: string | null
  overlayTemplate: string | null
  headline: string | null
  subheadline: string | null
  audioChoice: string | null
  voiceHookId: string | null
  voiceCtaId: string | null
}): string {
  const canonical = JSON.stringify([
    input.postId, input.platform, input.overlayMode ?? "", input.overlayTemplate ?? "",
    input.headline ?? "", input.subheadline ?? "", input.audioChoice ?? "",
    input.voiceHookId ?? "", input.voiceCtaId ?? "",
  ])
  // Hashed rather than concatenated: headlines contain arbitrary text, and the column is unique —
  // a raw key would be unbounded and awkward to read in logs.
  return `rj1_${createHash("sha256").update(canonical).digest("hex").slice(0, 48)}`
}

/** The post columns the key needs. Exported so the enqueue query and the key cannot drift apart. */
export const RENDER_JOB_POST_COLUMNS =
  "id, platform, status, render_status, rendered_storage_path, overlay_mode, overlay_template, overlay_headline, overlay_subheadline, audio_choice, voice_hook_id, voice_cta_id, source_content_id"

export type RenderJobPost = {
  id: string
  platform: string | null
  status: string | null
  render_status: string | null
  rendered_storage_path: string | null
  overlay_mode: string | null
  overlay_template: string | null
  overlay_headline: string | null
  overlay_subheadline: string | null
  audio_choice: string | null
  voice_hook_id: string | null
  voice_cta_id: string | null
  source_content_id: string | null
}

export type EnqueueSkip =
  | "already_rendered"     // a finished artifact already exists for these exact inputs
  | "no_source"            // nothing to render from
  | "unknown_platform"     // platform missing or not one we render for
  | "post_in_flight"       // publishing/published — never re-render underneath a live post

/**
 * Should this post be enqueued, and under what key?
 *
 * PURE, so the policy is testable without a database. "Already rendered" is judged against the
 * key's inputs, not against render_status alone: a post that was rendered and then had its headline
 * edited has render_status 'ready' and a stale artifact, and must be rendered again.
 */
export function evaluateForEnqueue(post: RenderJobPost): { enqueue: true; key: string; platform: RenderPlatform } | { enqueue: false; skip: EnqueueSkip } {
  if (!post.source_content_id) return { enqueue: false, skip: "no_source" }
  if (!isRenderPlatform(post.platform)) return { enqueue: false, skip: "unknown_platform" }
  // EXISTING ARTIFACTS ARE NEVER DISTURBED. A post mid-publish or already published keeps its MP4:
  // re-rendering underneath it would swap the video out from under a live or in-flight post.
  if (post.status === "publishing" || post.status === "published") return { enqueue: false, skip: "post_in_flight" }

  const key = renderJobKey({
    postId: post.id, platform: post.platform,
    overlayMode: post.overlay_mode, overlayTemplate: post.overlay_template,
    headline: post.overlay_headline, subheadline: post.overlay_subheadline,
    audioChoice: post.audio_choice, voiceHookId: post.voice_hook_id, voiceCtaId: post.voice_cta_id,
  })
  // A ready render WITH an artifact means these inputs already produced a video. The unique index
  // on idempotency_key is the real guarantee; this is the cheap check that avoids the round trip.
  if (post.render_status === "ready" && post.rendered_storage_path) return { enqueue: false, skip: "already_rendered" }
  return { enqueue: true, key, platform: post.platform }
}

export type EnqueueOutcome = { postId: string; created: boolean; key: string; platform: RenderPlatform }
export type EnqueueReport = {
  considered: number
  created: EnqueueOutcome[]
  /** Already had a job with this exact key — the idempotent no-op, not an error. */
  deduped: EnqueueOutcome[]
  skipped: { postId: string; reason: EnqueueSkip }[]
  errors: { postId: string; message: string }[]
}

/**
 * Create jobs for a set of posts. Safe to run repeatedly: re-running enqueues nothing new.
 *
 * Insertion relies on the UNIQUE(idempotency_key) index rather than a read-then-write check, so two
 * concurrent enqueues cannot both create a job — one inserts, the other gets 23505 and is counted
 * as deduped.
 */
export async function enqueueRenderJobs(
  client: JobClient, posts: readonly RenderJobPost[], opts: { maxAttempts?: number } = {},
): Promise<EnqueueReport> {
  const report: EnqueueReport = { considered: posts.length, created: [], deduped: [], skipped: [], errors: [] }
  for (const post of posts) {
    const verdict = evaluateForEnqueue(post)
    if (!verdict.enqueue) { report.skipped.push({ postId: post.id, reason: verdict.skip }); continue }
    const row = {
      post_id: post.id, platform: verdict.platform, idempotency_key: verdict.key,
      status: "queued", ...(opts.maxAttempts ? { max_attempts: opts.maxAttempts } : {}),
    }
    const { data, error } = await client.from("social_render_jobs").insert(row).select("id")
    if (error) {
      if ((error as { code?: string }).code === "23505") {
        report.deduped.push({ postId: post.id, created: false, key: verdict.key, platform: verdict.platform })
      } else report.errors.push({ postId: post.id, message: error.message })
      continue
    }
    if ((data?.length ?? 0) > 0) report.created.push({ postId: post.id, created: true, key: verdict.key, platform: verdict.platform })
    else report.deduped.push({ postId: post.id, created: false, key: verdict.key, platform: verdict.platform })
  }
  return report
}

/** Minimal client shape, so this module imports no SDK and tests need no database. */
export type JobClient = {
  from: (t: string) => {
    insert: (row: Record<string, unknown>) => {
      select: (cols: string) => PromiseLike<{ data: { id: string }[] | null; error: { message: string; code?: string } | null }>
    }
  }
}
