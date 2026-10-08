export const runtime = "nodejs"

import { NextResponse, type NextRequest } from "next/server"
import { requirePlatformAdmin } from "@/lib/auth/requirePlatformAdmin"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { enqueueRenderJobs, RENDER_JOB_POST_COLUMNS, isRenderPlatform, type RenderJobPost } from "@/lib/social/renderJobs"

// Create render jobs. IDEMPOTENT: running it twice enqueues nothing the second time, because the
// job key is derived from the post's render inputs and the column is UNIQUE.
//
// It CREATES JOBS ONLY — nothing renders here, and no post is modified. Draining the queue is the
// run endpoint's job, one at a time.
export async function POST(req: NextRequest) {
  const guard = await requirePlatformAdmin()
  if (!guard.ok) return guard.response

  let body: Record<string, unknown> = {}
  try { body = (await req.json()) as Record<string, unknown> } catch { /* defaults below */ }

  const platform = isRenderPlatform(body.platform) ? body.platform : "instagram"
  const ids = Array.isArray(body.postIds) ? body.postIds.filter((x): x is string => typeof x === "string") : null
  // A cap, not a page size: bulk enqueue is a deliberate act and should not silently fan out to
  // the whole table because a filter was forgotten.
  const limit = Math.max(1, Math.min(Number(body.limit) || 50, 500))

  // Service role: this writes a service-role-only table (the queue has RLS on and no policies).
  let q = supabaseAdmin.from("social_posts").select(RENDER_JOB_POST_COLUMNS).eq("platform", platform)
  if (ids?.length) q = q.in("id", ids)
  else q = q.eq("render_status", "none").eq("status", "draft")   // the default bulk target
  const { data, error } = await q.order("created_at", { ascending: true }).limit(limit)
  if (error) return NextResponse.json({ error: "load_failed", detail: error.message }, { status: 500 })

  const report = await enqueueRenderJobs(supabaseAdmin, (data ?? []) as unknown as RenderJobPost[])
  return NextResponse.json({
    platform,
    ...report,
    createdCount: report.created.length,
    dedupedCount: report.deduped.length,
    note: "jobs created only — nothing rendered, no post modified. Drain with /render-jobs/run.",
  })
}
