// STORY FOLLOWS REEL — the delay, the gate, and the idempotency.
// Run: npx tsx scripts/social/storyFollowUp.test.ts
import { readFileSync } from "node:fs"
import path from "node:path"
import {
  storyDelayMinutes, storyDueAt, decideStoryFollowUp,
  DEFAULT_STORY_DELAY_MINUTES, STORY_DELAY_FLAG, MAX_STORY_DELAY_MINUTES,
} from "@/lib/social/storyFollowUp"
import { ineligibleReason } from "@/lib/social/autopilotEligibility"
import { BUFFER_DESTINATIONS, bufferPostTypeFor, isBufferStory } from "@/lib/social/bufferRoute"

let pass = 0, fail = 0
const ok = (l: string, c: boolean) => { if (c) { pass++; console.log(`  ✓ ${l}`) } else { fail++; console.log(`  ✗ ${l}`) } }
const read = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8")
const env = (v?: string) => (v === undefined ? {} : { [STORY_DELAY_FLAG]: v }) as NodeJS.ProcessEnv

const REEL_PUBLISHED = { status: "published", publishedAt: "2026-10-08T14:00:00.000Z", externalPostId: "ig_reel_1" }
const STORY_READY = { id: "s1", status: "ready", publishedAt: null, externalPostId: null, scheduledAt: null, renderStatus: "ready", renderedStoragePath: "r/x.mp4" }

console.log("the delay — 45 minutes by default, configurable:")
ok("default is 45", DEFAULT_STORY_DELAY_MINUTES === 45 && storyDelayMinutes(env()) === 45)
ok("30 / 45 / 60 can all be configured",
  storyDelayMinutes(env("30")) === 30 && storyDelayMinutes(env("45")) === 45 && storyDelayMinutes(env("60")) === 60)
// A misconfigured value must not collapse the delay to zero — that is simultaneous posting, the
// exact thing this exists to prevent.
ok("garbage falls back to the default, never to 0", storyDelayMinutes(env("abc")) === 45)
ok("0 falls back to the default", storyDelayMinutes(env("0")) === 45)
ok("negative falls back to the default", storyDelayMinutes(env("-10")) === 45)
ok("absurdly large is capped, not honoured", storyDelayMinutes(env("999999")) === MAX_STORY_DELAY_MINUTES)

console.log("\nthe delay is measured from the REAL publish time, not the intended slot:")
ok("45 minutes after the actual publish", storyDueAt("2026-10-08T14:00:00.000Z", 45) === "2026-10-08T14:45:00.000Z")
// A Reel that fires 90 minutes late must carry its Story with it. Anchoring on the intended slot
// would make the Story due BEFORE the Reel went out.
const intended = "2026-10-08T12:30:00.000Z", actual = "2026-10-08T14:00:00.000Z"
ok("a late Reel drags its Story later too", storyDueAt(actual, 45) > storyDueAt(intended, 45))
ok("…and the Story is always after the Reel, never before", storyDueAt(actual, 45) > actual)
ok("an unparseable publish time throws rather than guessing", (() => {
  try { storyDueAt("not-a-date", 45); return false } catch { return true }
})())

console.log("\nthe gate — only a genuinely published Reel releases its Story:")
ok("a published Reel releases it", decideStoryFollowUp({ reel: REEL_PUBLISHED, story: STORY_READY }).schedule)
for (const [label, reel] of [
  ["a FAILED Reel", { status: "needs_attention", publishedAt: null, externalPostId: null }],
  ["a Reel still publishing", { status: "publishing", publishedAt: null, externalPostId: null }],
  ["a Reel merely scheduled", { status: "scheduled", publishedAt: null, externalPostId: null }],
  // status alone is not trusted: it round-trips after the media id is written, so a crash between
  // the two would otherwise look published.
  ["status 'published' but NO media id", { status: "published", publishedAt: "2026-10-08T14:00:00.000Z", externalPostId: null }],
  ["a media id but no publish time", { status: "published", publishedAt: null, externalPostId: "ig_1" }],
] as const) {
  const d = decideStoryFollowUp({ reel, story: STORY_READY })
  ok(`${label} does NOT release the Story`, !d.schedule && d.reason === "reel_not_published")
}

console.log("\nidempotency — one Reel, one Story, however many retries:")
ok("an already-PUBLISHED Story is never re-scheduled",
  !decideStoryFollowUp({ reel: REEL_PUBLISHED, story: { ...STORY_READY, publishedAt: "2026-10-08T14:46:00.000Z" } }).schedule)
ok("…nor one that merely has an external id",
  !decideStoryFollowUp({ reel: REEL_PUBLISHED, story: { ...STORY_READY, externalPostId: "ig_story_1" } }).schedule)
ok("an already-SCHEDULED Story is not nudged by a retry", (() => {
  const d = decideStoryFollowUp({ reel: REEL_PUBLISHED, story: { ...STORY_READY, scheduledAt: "2026-10-08T14:45:00.000Z" } })
  return !d.schedule && d.reason === "already_scheduled"
})())
ok("a Reel with no Story is a clean no-op",
  decideStoryFollowUp({ reel: REEL_PUBLISHED, story: null }).reason === "no_story")
ok("an unrendered Story is held, not published blind", (() => {
  const d = decideStoryFollowUp({ reel: REEL_PUBLISHED, story: { ...STORY_READY, renderStatus: "none", renderedStoragePath: null } })
  return !d.schedule && d.reason === "story_not_renderable"
})())
ok("terminal state beats everything — published wins over an unrendered flag",
  decideStoryFollowUp({ reel: REEL_PUBLISHED, story: { ...STORY_READY, publishedAt: "x", renderStatus: "none" } }).reason === "already_published")

console.log("\na Story does not consume a Reel rotation slot:")
// approvedAt included because eligibility now requires explicit human sign-off; this fixture is
// meant to isolate the FOLLOW-UP exclusion, so everything else about it must be eligible.
const base = { status: "ready", renderStatus: "ready", renderedStoragePath: "r/x.mp4", scheduledAt: null,
  publishedAt: null, externalPostId: null, connectionId: null, platform: "instagram",
  approvedAt: "2026-10-01T00:00:00Z" }
ok("a normal post is eligible for the rotation", ineligibleReason(base) === null)
ok("a FOLLOW-UP post is excluded from it", ineligibleReason({ ...base, followsPostId: "reel-1" }) === "follow_up_post")

console.log("\nthe wiring:")
const fin = read("lib/social/instagramFinalize.ts")
const mig = read("supabase/migrations/20261007000007_story_follows_reel.sql")
ok("the finalizer releases the Story on the normal publish path", /releaseStoryForReel/.test(fin))
ok("…and on the recovery path too", (fin.match(/releaseStoryForReel/g) ?? []).length >= 2)
ok("a Story failure can never fail the Reel — it is caught and logged",
  /catch \(storyErr\)[\s\S]{0,180}Reel is unaffected/.test(fin))
ok("the release is conditional on the Story still being unscheduled",
  /\.is\("scheduled_at", null\)/.test(read("lib/social/storyFollowUp.ts")))
ok("the database enforces one Story per Reel",
  /create unique index[\s\S]{0,200}follows_post_id[\s\S]{0,120}destination = 'instagram_story'/i.test(mig))
// The real claim: this module WRITES only to the Story row. The Reel is read and never updated,
// so a Story being scheduled (or failing to be) cannot alter the Reel's status, id or timestamps.
{
  const src = read("lib/social/storyFollowUp.ts")
  const updates = src.match(/\.update\([\s\S]*?\.eq\("id", [a-zA-Z!.?]+\)/g) ?? []
  ok("exactly one UPDATE exists in the module", updates.length === 1)
  // The UPDATE now READS reelRow.connection_id to carry the destination onto the Story, so a
  // bare "mentions reelRow" check no longer distinguishes reading from writing. What matters is
  // the TARGET: the row being updated must be the story's.
  ok("…and it targets the STORY row, never the Reel",
    updates.every((u) => /\.eq\("id", storyRow!\.id\)/.test(u)) && !/\.eq\("id", reelId\)[\s\S]{0,120}\.update\(/.test(src))
  // The select grew when the Story started taking the Reel's CURRENT artifact at release, so
  // pinning its exact text would fail for a reason that has nothing to do with the invariant.
  // The invariant is what is asserted: the Reel is read by id, and never updated by id.
  ok("the Reel is only ever READ, never updated",
    /\.select\("id, status, published_at, external_post_id, connection_id, rendered_storage_path, render_id, render_version"\)/.test(src) &&
    /\.eq\("id", reelId\)\.maybeSingle\(\)/.test(src) &&
    !new RegExp('update\\([^)]*\\)[\\s\\S]{0,80}eq\\("id", reelId').test(src))
  // ── THE STALE-ARTIFACT BUG ────────────────────────────────────────────────────────────────
  // companionRowFrom copies the Reel's rendered file at CREATION, which is approval time. A Reel
  // re-rendered after that leaves its companion pointing at the previous file, and the Story
  // publishes the old video 45 minutes behind a Reel showing the new one. It happened on 24 Nov
  // when the overlay treatment changed, and was caught by hand.
  ok("the Story takes the Reel's CURRENT artifact when it is released",
    /rendered_storage_path: reelArtifact/.test(src) && /render_id: \(reelRow as/.test(src) && /render_version: \(reelRow as/.test(src))
  ok("…and only when the Reel has one, so a null cannot blank the Story's own copy",
    /const artifactPatch = reelArtifact\s*\?\s*\{/.test(src) && /:\s*\{\}/.test(src))
  ok("…in the same statement that gives it its slot, account and approval",
    /\.\.\.artifactPatch,\s*\}\)/.test(src))
  ok("the Story inherits the Reel's connection, so the worker can resolve a destination",
    /connection_id: \(reelRow as \{ connection_id\?: string \| null \}\)\.connection_id/.test(src))
  ok("…and inherits approval from the Reel a human already approved", /approved_at: nowIso/.test(src))
}

// ── ALL THREE INSTAGRAM ACCOUNTS, INCLUDING THE BUFFER-ROUTED ONE ────────────────────────────
//
// The companion was created at approval for every Instagram Reel regardless of transport, and
// released by instagramFinalize — which only the NATIVE path calls. So a Buffer-routed account's
// companion was created and then never scheduled: an unapproved-looking draft that sat for ever.
// The release now happens in both publishers, at the same point in each: the moment the row is
// recorded published.
console.log("\nthe release happens in BOTH publishers, at the moment the Reel is recorded published:")
{
  const native = read("lib/social/instagramFinalize.ts")
  const buffer = read("app/api/cron/social-buffer-publish/route.ts")
  ok("the native finalizer still releases it", /releaseStoryForReel\(/.test(native))
  ok("the Buffer worker releases it too", /releaseStoryForReel\(/.test(buffer))
  ok("…from the same module, not a second implementation",
    /from "@\/lib\/social\/storyFollowUp"/.test(buffer) && (buffer.match(/releaseStoryForReel/g) ?? []).length <= 3)
  // ORDER IS THE WHOLE GATE. decideStoryFollowUp reads published_at and external_post_id off the
  // Reel, so a release called before those are written would see an unpublished Reel and skip.
  const published = buffer.split('status: "published"')[1] ?? ""
  ok("…after published_at is written, never before",
    published.indexOf("releaseStoryForReel") > -1 && published.indexOf("releaseStoryForReel") < 2000)
  ok("and it cannot fail the publish it follows", /try \{[\s\S]{0,400}releaseStoryForReel[\s\S]{0,400}catch/.test(buffer))
  ok("a failed Reel releases nothing — the release is only in the published branch",
    !/markFailed\([\s\S]{0,200}releaseStoryForReel/.test(buffer))
}

// ── WHAT BUFFER WILL AND WILL NOT CARRY ──────────────────────────────────────────────────────
// Read off Buffer's live schema on 24 Nov 2026, not from documentation.
console.log("\nBuffer carries an Instagram Story and asks for the right PostType:")
{
  const route = read("lib/social/bufferRoute.ts")
  ok("instagram_story is carried", BUFFER_DESTINATIONS.includes("instagram_story"))
  ok("instagram_reel still is", BUFFER_DESTINATIONS.includes("instagram_reel"))
  ok("tiktok_video still is", BUFFER_DESTINATIONS.includes("tiktok_video"))
  ok("tiktok_story is NOT — Buffer's TikTok metadata input has no type field at all",
    !BUFFER_DESTINATIONS.includes("tiktok_story"))
  ok("a Story asks Buffer for PostType 'story'", bufferPostTypeFor("instagram_story") === "story")
  ok("a Reel still asks for 'reel'", bufferPostTypeFor("instagram_reel") === "reel")
  ok("TikTok still asks for no type", bufferPostTypeFor("tiktok_video") === null)
  ok("isBufferStory names exactly the one surface",
    isBufferStory("instagram_story") && !isBufferStory("instagram_reel") && !isBufferStory("tiktok_video"))
  ok("the live schema evidence is recorded where the decision is made",
    /TikTokPostMetadataInput\s*\{ isAiGenerated, title \}/.test(route))
  ok("…including why the old exclusion was lifted rather than forgotten",
    /defaultToReminders/.test(route) && /notificationStatus/.test(route))
}

// A Story must send NO TEXT. Text, links and stickers are what push Buffer into reminder
// publishing, which an unattended cron cannot complete — and a Story has no caption anyway.
console.log("\na Story sends no text, and a Reel still sends its caption:")
{
  const buffer = read("app/api/cron/social-buffer-publish/route.ts")
  ok("the publish body branches on the surface",
    /text: isBufferStory\(destination\) \? "" : truncateToRunes\(caption, 2200\)/.test(buffer))
  ok("the caption is still built by the shared builder, for both surfaces",
    /buildInstagramCaptionPayload\(/.test(buffer))
  ok("no link and no stickerFields are ever sent", !/stickerFields/.test(buffer) && !/\blink:/.test(buffer))
}

// ── AND THE GUARANTEES THAT MUST SURVIVE ALL OF THAT ─────────────────────────────────────────
console.log("\nthe four requirements, unchanged by any of this:")
{
  const companion = read("lib/social/storyCompanion.ts")
  ok("same rendered video as the Reel — the artifact is copied, never re-rendered",
    /rendered_storage_path: reel\.rendered_storage_path/.test(companion) && /render_id: reel\.render_id/.test(companion))
  ok("45 minutes after the Reel ACTUALLY publishes", DEFAULT_STORY_DELAY_MINUTES === 45
    && storyDueAt("2026-11-24T13:30:00.000Z") === "2026-11-24T14:15:00.000Z")
  ok("no duplicate Stories — one per Reel, by a unique index on follows_post_id",
    /follows_post_id: reelId/.test(companion))
  ok("a Reel that did not publish releases nothing",
    decideStoryFollowUp({ reel: { status: "needs_attention", publishedAt: null, externalPostId: null }, story: STORY_READY }).schedule === false)
  ok("…and neither does one with an id but no publish time",
    decideStoryFollowUp({ reel: { status: "published", publishedAt: null, externalPostId: "x" }, story: STORY_READY }).schedule === false)
  ok("no extra approval is asked of anyone — the Story inherits the Reel's",
    /approved_at: nowIso/.test(read("lib/social/storyFollowUp.ts")))
}

// ── THE WORKERS NEED A TIME BUDGET ───────────────────────────────────────────────────────────
// A Vercel Node function without maxDuration gets the platform default, which is seconds. The
// Buffer worker makes several round trips per post and allows createPost 30 seconds on its own,
// so on 24 Nov it was killed mid-publish: the row was left claimed with no post id and NO
// error_message, because the catch that records Buffer's own words never ran. The stranded sweep
// then reported a generic message and the real cause was simply missing.
console.log("\nevery publish worker declares a time budget:")
for (const [label, file] of [
  ["Buffer", "app/api/cron/social-buffer-publish/route.ts"],
  ["Instagram", "app/api/cron/social-instagram-publish/route.ts"],
  ["TikTok", "app/api/cron/social-tiktok-publish/route.ts"],
  ["render", "app/api/cron/social-render/route.ts"],
] as const) {
  ok(`the ${label} worker sets maxDuration`, /export const maxDuration = \d+/.test(read(file)))
}
ok("the Buffer worker's budget is at least its own createPost timeout",
  Number(read("app/api/cron/social-buffer-publish/route.ts").match(/maxDuration = (\d+)/)?.[1] ?? 0) >= 60)

// ── THE TRIGGER MUST NOT UNDO THE RELEASE ────────────────────────────────────────────────────
// Copying the Reel's artifact at release looks, to social_posts_agent_review_on_change, exactly
// like "the video was re-rendered after you approved it" — so on an agent-owned companion it
// stamped needs_review_at and cleared the approved_at that releaseStoryForReel had just set, in
// the same statement. The Story came out scheduled, flagged and unapprovable: it could never
// publish. That is what happened to Lisette's debut Story, released for 20:26:47 and arriving
// held. Applied as 20261124000001_agent_review_skips_companions.sql.
console.log("\nthe review trigger leaves companions alone:")
{
  const SQL = read("supabase/migrations/20261124000001_agent_review_skips_companions.sql")
  ok("a row with follows_post_id returns early", /if new\.follows_post_id is not null then\s*\n\s*return new;/.test(SQL))
  ok("…before the approved-or-scheduled test, so a released Story is never reached",
    SQL.indexOf("new.follows_post_id is not null") < SQL.indexOf("new.approved_at is null and new.status is distinct from"))
  ok("an agent's own Reel still loses its approval when its content changes",
    /new\.approved_at := null/.test(SQL) && /The video was re-rendered after you approved it\./.test(SQL))
  ok("admin rows still return early as they always did", /if v_is_agent is not true then/.test(SQL))
  ok("the first-render exemption from the earlier migration is carried forward, not dropped",
    /v_had_render := old\.rendered_storage_path is not null/.test(SQL))
  ok("it refuses to commit unless both halves took effect",
    /raise exception 'companion Stories still blocked/.test(SQL) && /raise exception 'the trigger function was not replaced'/.test(SQL))
  ok("the repair only touches companions whose Reel actually published",
    /and r\.published_at is not null/.test(SQL))
}

console.log(`\nStory follow-up: ${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
