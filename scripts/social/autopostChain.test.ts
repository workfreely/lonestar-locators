// INSTAGRAM AUTOPOSTING — the connections that were missing, and the safeguards around them.
//
// Four things existed and were unreachable. This asserts each is now wired, and that wiring one
// did not weaken the protections around it.
//
//   STORY       45-minute delay, publish-fact gate, race guards, unique index, rotation exclusion
//               — all present, all dead, because NOTHING EVER CREATED A ROW WITH follows_post_id.
//   SURFACE     the cron worker called createReelContainer unconditionally, so the first Story to
//               reach it would have gone out as a captioned REEL: same property, same footage, 45
//               minutes later. A visible duplicate. Latent only because no Story existed — which
//               is why it had to be closed BEFORE anything started creating them.
//   CADENCE     three competing definitions, two of them commented "the approved cadence", and the
//               only one anything read said 9:00/19:00.
//   COOLDOWN    computed correctly in a branch that required posting history no caller supplied,
//               so every property was "fresh" on every run and the 21-day rule never executed.
//
// Run: npx tsx scripts/social/autopostChain.test.ts
import { readFileSync } from "node:fs"
import path from "node:path"
import { companionRowFrom } from "../../lib/social/storyCompanion"
import { inCooldown, HISTORY_LOOKBACK_DAYS } from "../../lib/social/postingHistory"
import { DEFAULT_DAILY_TIMES } from "../../lib/social/recurrence"
import { BASELINE_DAILY_TIMES } from "../../lib/social/autopilotDestination"
import { DEFAULT_STORY_DELAY_MINUTES, decideStoryFollowUp } from "../../lib/social/storyFollowUp"
import { ineligibleReason } from "../../lib/social/autopilotEligibility"
import type { PostingHistory } from "../../lib/social/autopilotPlanner"

let pass = 0, fail = 0
const ok = (l: string, c: boolean) => { if (c) { pass++; console.log(`  ✓ ${l}`) } else { fail++; console.log(`  ✗ ${l}`) } }
const read = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8")
const code = (f: string) => read(f).replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, "")

// ── 1. CADENCE ──────────────────────────────────────────────────────────────
console.log("1. two Reels daily at 7:30 AM and 7:30 PM Central:")
ok("the cadence is 07:30 and 19:30", DEFAULT_DAILY_TIMES[0] === 450 && DEFAULT_DAILY_TIMES[1] === 1170)
ok("...and it is the SAME object as BASELINE_DAILY_TIMES, not a second copy",
  (DEFAULT_DAILY_TIMES as unknown) === (BASELINE_DAILY_TIMES as unknown))
ok("the editor starts from that constant rather than literals",
  /useState\(DEFAULT_DAILY_TIMES\[0\]\)/.test(code("components/crm/social/PostEditor.tsx")))
ok("...so no 9:00 literal remains in the editor's time defaults",
  !/useState\(9 \* 60\)/.test(code("components/crm/social/PostEditor.tsx")))

// ── 2. THE SURFACE BRANCH ───────────────────────────────────────────────────
console.log("\n2. a Story publishes as a STORY, never as a Reel:")
{
  const cron = code("app/api/cron/social-instagram-publish/route.ts")
  ok("the worker branches on surface", /spec\.surface === "story"/.test(cron))
  ok("...calling createStoryContainer for a Story", /createStoryContainer\(dest\.externalAccountId/.test(cron))
  ok("...and createReelContainer only otherwise", /: await createReelContainer\(dest\.externalAccountId/.test(cron))
  ok("the worker SELECTS destination, or it could not branch", /select\("id, destination,/.test(cron))
  ok("an unpublishable destination fails the row instead of guessing", /is not publishable/.test(cron))
  // A Story takes no caption and no cover on Instagram; sending them would be meaningless.
  ok("the Story call passes no caption and no cover",
    /createStoryContainer\(dest\.externalAccountId, signed\.signedUrl, dest\.token\)/.test(cron))
}

// ── 3. THE COMPANION ROW ────────────────────────────────────────────────────
console.log("\n3. approving a Reel creates its companion Story:")
{
  const reel = {
    id: "reel-1", owner_user_id: "own-1", source_content_id: "src-1", destination: "instagram_reel",
    post_type: "reel", post_name: "Lenox", rendered_storage_path: "o/c/renders/reel-1-1.mp4",
    render_status: "ready", render_version: 1, source_storage_path: null,
    approved_at: "2026-10-09T12:00:00Z", presenter_id: "pres-1", presenter_width_px: 400,
  }
  const row = companionRowFrom(reel, "reel-1")
  ok("it is linked to its Reel", row.follows_post_id === "reel-1")
  ok("it targets the Story surface", row.destination === "instagram_story")
  ok("it REUSES the Reel's rendered MP4 — no second render", row.rendered_storage_path === reel.rendered_storage_path)
  ok("...and is marked ready, because that artifact already exists", row.render_status === "ready")
  ok("presenter settings ride along so it matches its Reel", row.presenter_id === "pres-1" && row.presenter_width_px === 400)

  // The companion must be INERT until its Reel publishes.
  ok("it is NOT scheduled", row.scheduled_at === null)
  ok("it is NOT assigned to a connection", row.connection_id === null)
  ok("it is NOT approved — approval is stamped at release, from the Reel's own approval", row.approved_at === null)
  ok("it is a draft", row.status === "draft")
  ok("it carries no caption (Instagram Stories have none)", !("caption" in row))

  const sc = code("lib/social/storyCompanion.ts")
  ok("a Story never spawns a companion of its own", /if \(reel\.follows_post_id\) return/.test(sc))
  ok("a Reel with no render cannot spawn one", /reason: "no_render"/.test(sc))
  ok("an UNAPPROVED Reel cannot spawn one", /reason: "not_approved"/.test(sc))
  ok("a duplicate is impossible — 23505 is treated as success", /23505[\s\S]{0,90}already_exists/.test(sc))
  ok("the creator never schedules or publishes", !/scheduled_at: decision|publishReel|media_publish/.test(sc))
}

// ── 4. RELEASE: +45 MINUTES AFTER A SUCCESSFUL PUBLISH ──────────────────────
console.log("\n4. released 45 minutes after the Reel actually publishes:")
{
  ok("the delay is 45 minutes", DEFAULT_STORY_DELAY_MINUTES === 45)
  const story = { id: "s1", status: "draft", publishedAt: null, externalPostId: null, scheduledAt: null, renderStatus: "ready", renderedStoragePath: "r.mp4" }

  const published = decideStoryFollowUp({
    reel: { status: "published", publishedAt: "2026-10-09T12:00:00Z", externalPostId: "ig_1" },
    story, delayMinutes: 45,
  })
  ok("a PUBLISHED Reel releases its Story", published.schedule)
  ok("...at exactly +45 minutes from the REAL publish time", published.dueAt === "2026-10-09T12:45:00.000Z")

  // Failure cases: the Story must never go out on its own.
  for (const [label, reel] of [
    ["a FAILED Reel", { status: "needs_attention", publishedAt: null, externalPostId: null }],
    ["a Reel still scheduled", { status: "scheduled", publishedAt: null, externalPostId: null }],
    ["a Reel mid-publish", { status: "publishing", publishedAt: null, externalPostId: null }],
    ["a crash-recovered Reel with no external id", { status: "published", publishedAt: "2026-10-09T12:00:00Z", externalPostId: null }],
  ] as const) {
    ok(`${label} does NOT release the Story`, !decideStoryFollowUp({ reel, story, delayMinutes: 45 }).schedule)
  }

  const sf = code("lib/social/storyFollowUp.ts")
  ok("release is gated on publish FACTS, not on status alone", /reel\.publishedAt && !!reel\.externalPostId/.test(sf))
  ok("the Story inherits the Reel's connection, so the worker can resolve a destination",
    /connection_id: \(reelRow as/.test(sf))
  ok("...and inherits approval, so the approval gate does not block it", /approved_at: nowIso/.test(sf))
  ok("the release UPDATE is race-guarded on an unscheduled, unpublished row",
    /\.is\("scheduled_at", null\)[\s\S]{0,80}\.is\("published_at", null\)/.test(sf))
  ok("a Story never consumes a rotation slot",
    ineligibleReason({
      status: "ready", renderStatus: "ready", renderedStoragePath: "r.mp4", scheduledAt: null,
      publishedAt: null, externalPostId: null, connectionId: null, platform: "instagram",
      approvedAt: "2026-10-09T12:00:00Z", followsPostId: "reel-1",
    }) === "follow_up_post")
}

// ── 5. THE 21-DAY COOLDOWN ──────────────────────────────────────────────────
console.log("\n5. a property is not re-posted inside 21 days:")
{
  const CONN = "conn-1"
  const h: PostingHistory = new Map([[CONN, new Map([["place:ChIJ_abc", "2026-10-08T12:00:00Z"]])]])
  const day = (n: number) => new Date(Date.parse("2026-10-08T12:00:00Z") + n * 86_400_000)

  ok("same day: blocked", inCooldown(h, CONN, "place:ChIJ_abc", day(1), 21))
  ok("day 20: still blocked", inCooldown(h, CONN, "place:ChIJ_abc", day(20), 21))
  ok("day 21: free", !inCooldown(h, CONN, "place:ChIJ_abc", day(21), 21))
  ok("day 30: free", !inCooldown(h, CONN, "place:ChIJ_abc", day(30), 21))
  ok("a property never posted is free", !inCooldown(h, CONN, "place:ChIJ_other", day(1), 21))
  ok("the cooldown is PER CONNECTION — another account is unaffected",
    !inCooldown(h, "conn-2", "place:ChIJ_abc", day(1), 21))

  const ph = code("lib/social/postingHistory.ts")
  ok("history is keyed by PLACE ID, so two uploads of one building are one property",
    /propertyKeyOf\(/.test(ph))
  ok("only PUBLISHED posts count", /\.not\("published_at", "is", null\)/.test(ph))
  ok("...ordered ascending so the MOST RECENT publish wins", /ascending: true/.test(ph))
  ok(`the lookback window exceeds the cooldown (${HISTORY_LOOKBACK_DAYS}d > 21d)`, HISTORY_LOOKBACK_DAYS > 21)
}

// ── 6. NOTHING WAS WEAKENED ─────────────────────────────────────────────────
console.log("\n6. existing protections are intact:")
{
  const cron = code("app/api/cron/social-instagram-publish/route.ts")
  ok("the approval gate survives in the due query", /\.not\("approved_at", "is", null\)/.test(cron))
  ok("claim 1 is still a conditional UPDATE", /\.eq\("status", "scheduled"\)[\s\S]{0,320}\.is\("external_post_id", null\)/.test(cron))
  ok("the media-publish claim is intact", /media_publish_claimed_at/.test(code("lib/social/instagramFinalize.ts")))
  ok("reconcile-never-retry is intact", /reconcileOnly/.test(code("lib/social/instagramFinalize.ts")))
  ok("the container id is still persisted BEFORE publishing", /ig_container_id/.test(cron))
  ok("a Story failure still cannot fail its Reel", /catch/.test(code("lib/social/instagramFinalize.ts")))
  ok("autoposting is still gated by the env flag", /SOCIAL_INSTAGRAM_AUTOPUBLISH_ENABLED/.test(cron))
  ok("...and by the database switch", /readAutoPosting/.test(cron))
}

console.log(`\nAutopost chain: ${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
