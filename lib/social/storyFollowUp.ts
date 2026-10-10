// STORY FOLLOWS REEL — when the companion Story becomes due, and the rules around it.
//
// A Story is not a second property in the rotation; it is the same creative distributed to the
// other Instagram surface a while after the Reel lands. So it is scheduled BY the Reel's success,
// not by the planner, and it is excluded from the property pool so it cannot consume one of the
// day's two Reel slots.

/** Production default. Configurable so 30 / 45 / 60 can be compared without a code change. */
export const DEFAULT_STORY_DELAY_MINUTES = 45
export const STORY_DELAY_FLAG = "SOCIAL_STORY_FOLLOW_DELAY_MINUTES"

/**
 * How long after its Reel a Story becomes due.
 *
 * Bounded deliberately. 0 would publish both at once, which is the thing this exists to prevent;
 * an unbounded value would silently park a Story days out. Anything unparseable falls back to the
 * default rather than to 0 — a misconfigured env var must not collapse the delay.
 */
export const MIN_STORY_DELAY_MINUTES = 1
export const MAX_STORY_DELAY_MINUTES = 24 * 60

export function storyDelayMinutes(env: NodeJS.ProcessEnv = process.env): number {
  const raw = Number((env[STORY_DELAY_FLAG] ?? "").trim())
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_STORY_DELAY_MINUTES
  return Math.min(MAX_STORY_DELAY_MINUTES, Math.max(MIN_STORY_DELAY_MINUTES, Math.round(raw)))
}

/**
 * When the Story is due, given when the Reel ACTUALLY published.
 *
 * Measured from the real publish time, never from the Reel's intended slot. A Reel that publishes
 * 90 minutes late carries its Story with it — otherwise a backlog would fire the Story first, or
 * immediately after, which is exactly the simultaneous posting the delay exists to avoid.
 */
export function storyDueAt(reelPublishedAtIso: string, delayMinutes = DEFAULT_STORY_DELAY_MINUTES): string {
  const t = Date.parse(reelPublishedAtIso)
  if (Number.isNaN(t)) throw new Error(`storyDueAt: unparseable publish time ${reelPublishedAtIso}`)
  return new Date(t + delayMinutes * 60_000).toISOString()
}

export type StoryFollowUpDecision =
  | { schedule: true; dueAt: string; reason: "reel_published" }
  | { schedule: false; reason: StorySkipReason }

export type StorySkipReason =
  | "reel_not_published"   // the Reel did not succeed — the Story must not go out on its own
  | "no_story"             // this Reel has no companion Story
  | "already_published"    // the Story is already live; never recreate or re-date it
  | "already_scheduled"    // it has its slot; a retry must not move it
  | "story_not_renderable" // no finished artifact to publish

/** What the Reel's publish state and the Story's own state imply. PURE — no clock, no I/O. */
export function decideStoryFollowUp(input: {
  reel: { status: string | null; publishedAt: string | null; externalPostId: string | null }
  story: { id: string; status: string | null; publishedAt: string | null; externalPostId: string | null; scheduledAt: string | null; renderStatus: string | null; renderedStoragePath: string | null } | null
  delayMinutes?: number
}): StoryFollowUpDecision {
  const { reel, story } = input
  if (!story) return { schedule: false, reason: "no_story" }

  // TERMINAL FIRST. A published Story is never recreated, re-dated or re-scheduled, whatever the
  // Reel is doing — a Reel re-publish or a replayed finalizer must not produce a second Story.
  if (story.publishedAt || story.externalPostId || story.status === "published") {
    return { schedule: false, reason: "already_published" }
  }
  // Already placed. A retry of the same Reel publish must be a no-op, not a nudge of the slot.
  if (story.scheduledAt) return { schedule: false, reason: "already_scheduled" }

  // THE GATE: only a genuinely published Reel releases its Story. Checked on the publish FACTS
  // (published_at and external id), not on status alone, because status round-trips after the id
  // is written and a crash in between would otherwise leave a published Reel looking unpublished.
  const reelPublished = !!reel.publishedAt && !!reel.externalPostId
  if (!reelPublished) return { schedule: false, reason: "reel_not_published" }

  if (story.renderStatus !== "ready" || !story.renderedStoragePath) {
    return { schedule: false, reason: "story_not_renderable" }
  }

  return {
    schedule: true,
    dueAt: storyDueAt(reel.publishedAt as string, input.delayMinutes ?? DEFAULT_STORY_DELAY_MINUTES),
    reason: "reel_published",
  }
}

/**
 * Release the companion Story after a Reel publishes. Safe to call repeatedly.
 *
 * The UPDATE is conditional on the Story still being unscheduled and unpublished, so two
 * finalizers racing the same Reel cannot both schedule it — the second matches zero rows. Combined
 * with the unique index on (follows_post_id) for Stories, a Reel can produce exactly one Story
 * however many times publishing is retried.
 *
 * It NEVER touches the Reel. A failure here is reported, not escalated: a Story that could not be
 * scheduled must not call a successful Reel publish into question.
 */
export async function releaseStoryForReel(
  client: FollowUpClient, reelId: string, env: NodeJS.ProcessEnv = process.env,
): Promise<{ scheduled: boolean; storyId?: string; dueAt?: string; reason: string }> {
  const { data: reelRow, error: reelErr } = await client.from("social_posts")
    .select("id, status, published_at, external_post_id, connection_id").eq("id", reelId).maybeSingle()
  if (reelErr || !reelRow) return { scheduled: false, reason: "reel_lookup_failed" }

  const { data: storyRow } = await client.from("social_posts")
    .select("id, status, published_at, external_post_id, scheduled_at, render_status, rendered_storage_path")
    .eq("follows_post_id", reelId).eq("destination", "instagram_story").maybeSingle()

  const decision = decideStoryFollowUp({
    reel: { status: reelRow.status, publishedAt: reelRow.published_at, externalPostId: reelRow.external_post_id },
    story: storyRow?.id ? {
      id: storyRow.id, status: storyRow.status, publishedAt: storyRow.published_at,
      externalPostId: storyRow.external_post_id, scheduledAt: storyRow.scheduled_at,
      renderStatus: storyRow.render_status, renderedStoragePath: storyRow.rendered_storage_path,
    } : null,
    delayMinutes: storyDelayMinutes(env),
  })
  if (!decision.schedule) return { scheduled: false, storyId: storyRow?.id ?? undefined, reason: decision.reason }

  // THE STORY INHERITS ITS REEL'S DESTINATION AND APPROVAL.
  //
  // connection_id: without it the worker cannot resolve a destination and faults the row to
  // needs_attention — a Story that was correctly released would die one step later. It is the same
  // account by definition: a companion Story goes where its Reel went.
  //
  // approved_at: the Reel it follows was explicitly approved, and the Story is the same creative on
  // a second surface. Stamping it here means approval still comes from a human decision — the one
  // made about the Reel — rather than the Story bypassing the gate. Without it the publish worker
  // would correctly refuse to publish the Story at all.
  const nowIso = new Date().toISOString()
  const { data: updated } = await client.from("social_posts")
    .update({
      scheduled_at: decision.dueAt, status: "scheduled", updated_at: nowIso,
      connection_id: (reelRow as { connection_id?: string | null }).connection_id ?? null,
      approved_at: nowIso,
    })
    .eq("id", storyRow!.id)
    .is("scheduled_at", null)          // the race guard: a second finalizer matches nothing
    .is("published_at", null)
    .select("id")
  if (!updated?.length) return { scheduled: false, storyId: storyRow!.id ?? undefined, reason: "already_scheduled" }
  return { scheduled: true, storyId: storyRow!.id ?? undefined, dueAt: decision.dueAt, reason: "reel_published" }
}

/** Minimal client shape — no SDK import, so this is unit-testable without a database. */
type Chain = {
  eq: (c: string, v: unknown) => Chain
  is: (c: string, v: unknown) => Chain
  maybeSingle: () => PromiseLike<{ data: Record<string, string | null> | null; error: { message: string } | null }>
  select: (cols: string) => PromiseLike<{ data: { id: string }[] | null; error: { message: string } | null }>
}
export type FollowUpClient = {
  from: (t: string) => {
    select: (cols: string) => Chain
    update: (v: Record<string, unknown>) => Chain
  }
}
