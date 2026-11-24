export const runtime = "nodejs"
export const maxDuration = 300 // one FFmpeg render per invocation, same budget as the admin route

import { NextResponse, type NextRequest } from "next/server"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { renderPostToStorage } from "@/lib/social/renderPost"
import { CLAIM_LEASE_SECONDS } from "@/lib/social/renderJobs"

// ── WHY THIS EXISTS ─────────────────────────────────────────────────────────────────────────
// Approving a video enqueues a render job. Until now the ONLY thing that drained that queue was
// POST /api/admin/social-autopilot/render-jobs/run, behind requirePlatformAdmin — a human pressing
// a button. So an approved video rendered only while somebody was watching, and the publish
// workers, which require `rendered_storage_path is not null`, would find nothing to send at 07:30.
// Automatic publishing cannot be automatic if the step before it is manual.
//
// This route is that same drain on a schedule. It is NOT a second renderer: it claims through the
// same lb_claim_render_job, renders through the same renderPostToStorage, and finishes through the
// same lb_finish_render_job. The admin route keeps working exactly as it does today and is
// deliberately left in place — it is how a single stuck job gets retried by hand.
//
// ── ONE JOB PER INVOCATION ──────────────────────────────────────────────────────────────────
// Kept from the admin route, for its reasons: bulk rendering in one request exhausted Vercel's
// /tmp, so every render gets a clean work dir and a fresh execution budget, and a crash costs one
// job rather than a batch. The cron fires often enough to drain a queue a job at a time.
//
// ── WHOSE IDENTITY RENDERS THE VIDEO ────────────────────────────────────────────────────────
// renderPostToStorage takes a userId and uses it for three things: the storage path prefix, the
// render's ownerUserId, and identityOwnerUserId when a presenter is composited. In the admin route
// that value is the signed-in platform admin, who is also the owner of the post being rendered.
// A cron has nobody signed in, so it reads the POST'S OWN owner_user_id and passes that — which
// is the same value the admin path supplies in practice, rather than a new authority invented
// here. If a post has no owner the job is failed rather than rendered under a guess.
export async function POST(req: NextRequest) {
  return run(req)
}
export async function GET(req: NextRequest) {
  return run(req)
}

async function run(req: NextRequest) {
  // ── GATE 1 — may this caller invoke the worker at all ─────────────────────────────────────
  // Byte-for-byte the check the publish workers use. Nothing below runs, and no job is claimed,
  // until it passes.
  const cronSecret = process.env.CRON_SECRET
  const auth = req.headers.get("authorization")
  if (!cronSecret || auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const worker = `cron-${Math.random().toString(36).slice(2, 10)}`
  const { data: claimed, error: claimErr } = await supabaseAdmin
    .rpc("lb_claim_render_job", { p_worker: worker, p_lease_seconds: CLAIM_LEASE_SECONDS })
  if (claimErr) {
    return NextResponse.json({ error: "claim_failed", detail: claimErr.message }, { status: 500 })
  }

  const job = (Array.isArray(claimed) ? claimed[0] : claimed) as
    | { id: string; post_id: string; platform: string; attempt_count: number; max_attempts: number }
    | undefined
  if (!job) return NextResponse.json({ claimed: false, note: "queue empty — nothing to render" })

  // The post's owner, read after the claim so an empty queue costs no query. See the note above
  // on whose identity renders the video.
  const { data: postRow, error: postErr } = await supabaseAdmin
    .from("social_posts")
    .select("owner_user_id")
    .eq("id", job.post_id)
    .maybeSingle()

  const ownerUserId = (postRow as { owner_user_id?: string | null } | null)?.owner_user_id ?? null
  if (postErr || !ownerUserId) {
    // Fail the job rather than render it under a guessed identity. A render is written to a path
    // derived from this value and stamped with it, so the wrong one is not a cosmetic mistake.
    await supabaseAdmin.rpc("lb_finish_render_job", {
      p_id: job.id,
      p_ok: false,
      p_output_path: null,
      p_metrics: { worker },
      p_error: postErr
        ? `could not read the post's owner: ${postErr.message}`
        : "post has no owner_user_id — refusing to render under a guessed identity",
    })
    return NextResponse.json({ claimed: true, ok: false, reason: "post_owner_unreadable" }, { status: 500 })
  }

  const result = await renderPostToStorage({ supabase: supabaseAdmin, id: job.post_id, userId: ownerUserId })

  if (result.ok) {
    const mismatch = result.platform !== job.platform
    await supabaseAdmin.rpc("lb_finish_render_job", {
      p_id: job.id,
      p_ok: true,
      p_output_path: result.outputPath,
      p_metrics: { renderVersion: result.renderVersion, platform: result.platform, worker },
      p_error: mismatch ? `platform mismatch: job ${job.platform}, post ${result.platform}` : null,
    })
    return NextResponse.json({
      claimed: true,
      ok: true,
      postId: job.post_id,
      platform: result.platform,
      renderVersion: result.renderVersion,
    })
  }

  await supabaseAdmin.rpc("lb_finish_render_job", {
    p_id: job.id,
    p_ok: false,
    p_output_path: null,
    p_metrics: { worker },
    p_error: `${result.code}: ${result.message}`.slice(0, 400),
  })
  return NextResponse.json({ claimed: true, ok: false, postId: job.post_id, code: result.code, error: result.message })
}
