// STORY FOLLOWS REEL — the delay, the gate, and the idempotency.
// Run: npx tsx scripts/social/storyFollowUp.test.ts
import { readFileSync } from "node:fs"
import path from "node:path"
import {
  storyDelayMinutes, storyDueAt, decideStoryFollowUp,
  DEFAULT_STORY_DELAY_MINUTES, STORY_DELAY_FLAG, MAX_STORY_DELAY_MINUTES,
} from "@/lib/social/storyFollowUp"
import { ineligibleReason } from "@/lib/social/autopilotEligibility"

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
  ok("the Reel is only ever READ, never updated",
    /\.select\("id, status, published_at, external_post_id, connection_id"\)\.eq\("id", reelId\)/.test(src) &&
    !new RegExp('update\\([^)]*\\)[\\s\\S]{0,80}eq\\("id", reelId').test(src))
  ok("the Story inherits the Reel's connection, so the worker can resolve a destination",
    /connection_id: \(reelRow as \{ connection_id\?: string \| null \}\)\.connection_id/.test(src))
  ok("…and inherits approval from the Reel a human already approved", /approved_at: nowIso/.test(src))
}

console.log(`\nStory follow-up: ${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
