import "server-only"
// CREATING AND RENDERING THE TIKTOK HALF OF A PAIR, AUTOMATICALLY.
//
// A mirrored pair publishes one creative to two platforms, and the two rows cannot share an
// artifact: instagram_reel and tiktok_video have different safe areas, so the TikTok half needs a
// row of its own and a render of its own. Until now both were hand work, which is fine for one
// video and useless for a daily schedule.
//
// ── THE WORK LIST IS NOT "EVERY APPROVED INSTAGRAM POST" ────────────────────────────────────
// That would create a TikTok sibling for the operator's entire library — hundreds of rows and
// hundreds of renders he did not ask for — and it would do it the first time this ran. The
// requirement is narrower than it first sounds: a sibling is needed where a MIRRORED FOLLOWER has
// a slot and no row to put in it.
//
// The mirror already computes exactly that. mirrorSchedule returns a gap per unfillable slot, and
// `no_eligible_row_for_creative` means precisely "the follower has no row for the creative the
// lead chose". So the gap list IS the work list, with three properties that matter:
//
//   • it is self-limiting to destinations that mirror something, so a system with no mirrored pair
//     creates nothing — the operator's own destinations are untouched BY CONSTRUCTION, not by a
//     filter that could be written wrongly;
//   • it is bounded by the number of slots in the plan, not by the size of the library;
//   • it only ever asks for a sibling of a post the planner has already placed, which means
//     approved, rendered and eligible — the same three conditions a human would check.
//
// ── IT IS GATED OFF, AND THE GATE IS NOT ABOUT CAUTION ─────────────────────────────────────
// ensureTikTokSibling's idempotency is read-then-insert, which is not atomic until its unique
// index exists — and the index this needs is prepared and unapplied
// (supabase/prepared/20261123000001_tiktok_sibling_of_post.sql). Two overlapping plan runs could
// otherwise both insert, giving one Instagram post two TikTok siblings and the account two copies
// of the same video. So SOCIAL_TIKTOK_SIBLING_AUTOCREATE must not be set until that index is
// applied, and with it unset this module reads nothing and writes nothing.
//
// ── IT CREATES AND QUEUES; IT NEVER RENDERS ────────────────────────────────────────────────
// enqueueRenderJobs writes queue rows and is idempotent on its own job key. Draining the queue is
// the run endpoint's job, exactly as it is for every other render — so a plan run cannot turn into
// an unbounded ffmpeg session, and a sibling that fails to render fails where renders fail.
import { supabaseAdmin } from "@/lib/supabase/admin"
import { ensureTikTokSibling, type SiblingRefusal } from "@/lib/social/tiktokSibling"
import { enqueueRenderJobs, RENDER_JOB_POST_COLUMNS, type RenderJobPost } from "@/lib/social/renderJobs"
// The switch and the cap live in their own module, with no `server-only`, so their semantics can
// be asserted directly by a test rather than matched in this file's source text.
import { siblingAutoCreateEnabled, MAX_SIBLINGS_PER_RUN } from "@/lib/social/siblingGate"

export { siblingAutoCreateEnabled, MAX_SIBLINGS_PER_RUN }


export type SiblingAutoCreateReport = {
  enabled: boolean
  /** Original post ids considered, in order. */
  considered: string[]
  /** Siblings created by this run. */
  created: { originalPostId: string; siblingPostId: string }[]
  /** Originals that produced no sibling, with the module's own reason. */
  skipped: { originalPostId: string; reason: SiblingRefusal }[]
  /** Render jobs queued for the new siblings. */
  renderJobsQueued: number
  notes: string[]
}

/**
 * Ensure a TikTok sibling exists, and is queued to render, for each original named.
 *
 * `originalPostIds` comes from the mirror's `no_eligible_row_for_creative` gaps — see the header
 * for why that list and not another. Duplicates are collapsed and the order is preserved, so the
 * earliest unfillable slot is served first when the cap bites.
 *
 * Returns a report rather than throwing. A missing sibling is a degraded queue, not a reason to
 * fail the plan run that found it — the plan itself is still correct and still worth persisting.
 */
export async function autoCreateTikTokSiblings(
  originalPostIds: readonly string[],
  client: typeof supabaseAdmin = supabaseAdmin,
): Promise<SiblingAutoCreateReport> {
  const report: SiblingAutoCreateReport = {
    enabled: siblingAutoCreateEnabled(),
    considered: [], created: [], skipped: [], renderJobsQueued: 0, notes: [],
  }
  if (!report.enabled) {
    if (originalPostIds.length > 0) {
      report.notes.push(`${new Set(originalPostIds).size} slot(s) need a TikTok sibling, and automatic creation is off (SOCIAL_TIKTOK_SIBLING_AUTOCREATE). Create them from the editor, or switch it on once the sibling unique index is applied.`)
    }
    return report
  }

  const ids = [...new Set(originalPostIds.map((i) => (i ?? "").trim()).filter(Boolean))]
  report.considered = ids.slice(0, MAX_SIBLINGS_PER_RUN)
  if (ids.length > MAX_SIBLINGS_PER_RUN) {
    report.notes.push(`${ids.length} slot(s) need a TikTok sibling; ${MAX_SIBLINGS_PER_RUN} were created this run and the rest will be created on the next one.`)
  }

  for (const originalPostId of report.considered) {
    const result = await ensureTikTokSibling(client as never, originalPostId)
    if (result.created) report.created.push({ originalPostId, siblingPostId: result.postId })
    else report.skipped.push({ originalPostId, reason: result.reason })
  }

  // ── QUEUE THE RENDERS, FOR THE NEW ROWS ONLY ───────────────────────────────────────────────
  // A sibling that already existed either has its render or has its own queue row; re-enqueueing
  // it would be harmless (the job key is unique) but it would also be a second place that decides
  // what needs rendering, and one is enough.
  const newIds = report.created.map((c) => c.siblingPostId)
  if (newIds.length > 0) {
    const { data, error } = await client
      .from("social_posts")
      .select(RENDER_JOB_POST_COLUMNS)
      .in("id", newIds)
    if (error) {
      report.notes.push(`Created ${newIds.length} TikTok sibling(s) but could not read them back to queue renders (${error.message.slice(0, 120)}). They are drafts with no artifact; enqueue them from the editor.`)
    } else {
      const enqueued = await enqueueRenderJobs(client as never, (data ?? []) as unknown as RenderJobPost[])
      report.renderJobsQueued = enqueued.created.length
      if (enqueued.created.length < newIds.length) {
        report.notes.push(`${newIds.length} sibling(s) created, ${enqueued.created.length} render job(s) queued — the rest were already queued or were not ready to render.`)
      }
    }
  }
  return report
}
