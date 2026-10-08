export const runtime = "nodejs"
export const maxDuration = 300 // one FFmpeg render per invocation (Vercel Fluid / Pro)

import { NextResponse, type NextRequest } from "next/server"
import { requirePlatformAdmin } from "@/lib/auth/requirePlatformAdmin"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { renderPostToStorage } from "@/lib/social/renderPost"
import { CLAIM_LEASE_SECONDS } from "@/lib/social/renderJobs"

// Drain EXACTLY ONE job, then return.
//
// One per invocation is the whole design. Bulk rendering inside a single request is what exhausted
// Vercel's /tmp; this way every render gets a clean work dir and a fresh execution budget, and a
// crash costs one job instead of a batch. Call it repeatedly to drain the queue.
//
// CLAIM SAFETY is the database's: lb_claim_render_job takes the job with FOR UPDATE SKIP LOCKED
// and stamps a lease, so two concurrent invocations can never take the same job, and a worker that
// dies mid-render frees its job once the lease expires rather than wedging the queue.
export async function POST(_req: NextRequest) {
  const guard = await requirePlatformAdmin()
  if (!guard.ok) return guard.response
  const { userId } = guard

  const worker = `vercel-${Math.random().toString(36).slice(2, 10)}`
  const { data: claimed, error: claimErr } = await supabaseAdmin
    .rpc("lb_claim_render_job", { p_worker: worker, p_lease_seconds: CLAIM_LEASE_SECONDS })
  if (claimErr) return NextResponse.json({ error: "claim_failed", detail: claimErr.message }, { status: 500 })

  const job = (Array.isArray(claimed) ? claimed[0] : claimed) as
    | { id: string; post_id: string; platform: string; attempt_count: number; max_attempts: number }
    | undefined
  if (!job) return NextResponse.json({ claimed: false, note: "queue empty — nothing to render" })

  // renderPostToStorage owns the temp work dir and removes it in its own finally, so cleanup
  // happens on success, on failure, and on throw. Nothing is left behind between invocations.
  const result = await renderPostToStorage({ supabase: supabaseAdmin, id: job.post_id, userId })

  if (result.ok) {
    // The job records the platform it was rendered for; a mismatch here would mean the queue and
    // the post disagree, which is worth seeing rather than silently accepting.
    const mismatch = result.platform !== job.platform
    await supabaseAdmin.rpc("lb_finish_render_job", {
      p_id: job.id, p_ok: true, p_output_path: result.outputPath,
      p_metrics: { renderVersion: result.renderVersion, platform: result.platform, worker },
      p_error: mismatch ? `platform mismatch: job ${job.platform}, post ${result.platform}` : null,
      p_detail: null,
    })
    return NextResponse.json({
      claimed: true, jobId: job.id, postId: job.post_id, platform: job.platform,
      status: "succeeded", renderVersion: result.renderVersion, outputPath: result.outputPath,
      attempt: job.attempt_count, platformMismatch: mismatch,
    })
  }

  // RETRYABLE BY DEFAULT. attempt_count was incremented by the claim, so a job that keeps failing
  // stops on its own at max_attempts rather than looping forever. A failure never touches the
  // post's existing artifact — renderPostToStorage only writes render_error.
  await supabaseAdmin.rpc("lb_finish_render_job", {
    p_id: job.id, p_ok: false, p_output_path: null, p_metrics: null,
    p_error: result.message.slice(0, 400), p_detail: { code: result.code, worker },
  })
  return NextResponse.json({
    claimed: true, jobId: job.id, postId: job.post_id, platform: job.platform,
    status: "failed", error: result.code, detail: result.message,
    attempt: job.attempt_count, maxAttempts: job.max_attempts,
    retryable: job.attempt_count < job.max_attempts,
  }, { status: 200 })
}
