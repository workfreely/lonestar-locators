// THE BUFFER PUBLISHING ROUTE.
//
// A third publishing worker is the most dangerous kind of change this system can take: two workers
// that both believe they own a post publish it twice, and a duplicate on a client-facing account
// cannot be taken back. So the claims here are mostly about SEPARATION and REFUSAL — who owns a
// row, what stops a send, and what is never retried — rather than about a successful publish.
//
// Reads source and exercises pure functions. Contacts nothing: no database, no Buffer, no network.
// Run: npx tsx scripts/social/bufferPublish.test.ts
import { readFileSync } from "node:fs"
import path from "node:path"
import {
  bufferRoutingFor, isBufferRouted, bufferDestinationRefusal, bufferPostTypeFor,
  bufferOutcomeFor, classifyReadFailure, signTtlCoversIngest,
  BUFFER_DESTINATIONS, BUFFER_SIGN_TTL_SECONDS, BUFFER_OBSERVED_INGEST_SECONDS,
  BUFFER_REFUSAL_MESSAGE,
} from "../../lib/social/bufferRoute"
import { DESTINATIONS } from "../../lib/social/destinations"
import { bufferAutopublishEnabled } from "../../lib/social/bufferGate"
import { marketRestrictionViolation } from "../../lib/social/marketRestriction"

let pass = 0, fail = 0
const ok = (l: string, c: boolean, d = "") => { if (c) { pass++; console.log(`  ✓ ${l}`) } else { fail++; console.log(`  ✗ ${l}${d ? `  — ${d}` : ""}`) } }
const read = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8")
/** Comments stripped, so prose can never satisfy an assertion. */
const code = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1").replace(/\{\/\*[\s\S]*?\*\/\}/g, "")

const WORKER = code(read("app/api/cron/social-buffer-publish/route.ts"))
/** The worker WITH its comments, for assertions about recorded reasoning. */
const ROUTE_FILE = read("app/api/cron/social-buffer-publish/route.ts")
const IG_WORKER = code(read("app/api/cron/social-instagram-publish/route.ts"))
const TT_WORKER = code(read("app/api/cron/social-tiktok-publish/route.ts"))
const CLIENT = code(read("lib/social/buffer.ts"))
const SERVER = code(read("lib/social/bufferServer.ts"))
const ROUTE = code(read("lib/social/bufferRoute.ts"))

// ── 1. BOTH COLUMNS OR NEITHER ───────────────────────────────────────────────────────────────
// A half-configured row must stay with the native worker, which already knows how to report its
// own problems. Handing it to a worker that cannot publish it would turn a typo into a dead post.
console.log("a destination is Buffer-routed only when BOTH columns are present:")

ok("both present ⇒ routed",
  isBufferRouted({ buffer_account_id: "acc", buffer_channel_id: "chan" }))
ok("account without channel ⇒ NOT routed",
  !isBufferRouted({ buffer_account_id: "acc", buffer_channel_id: null }))
ok("channel without account ⇒ NOT routed",
  !isBufferRouted({ buffer_account_id: null, buffer_channel_id: "chan" }))
ok("neither ⇒ NOT routed", !isBufferRouted({}))
ok("null row ⇒ NOT routed", !isBufferRouted(null))
ok("whitespace is not a value",
  !isBufferRouted({ buffer_account_id: "   ", buffer_channel_id: "chan" }))
ok("a non-string column cannot route a destination",
  !isBufferRouted({ buffer_account_id: 7, buffer_channel_id: "chan" }))
ok("routing returns the trimmed pair",
  JSON.stringify(bufferRoutingFor({ buffer_account_id: " acc ", buffer_channel_id: " chan " }))
    === JSON.stringify({ accountId: "acc", channelId: "chan" }))

// ── 2. THE PARTITION — ONE PREDICATE, THREE WORKERS ──────────────────────────────────────────
// This is the duplicate-publish guarantee. If any worker stopped asking, a post could be claimed
// by two of them.
console.log("\nall three workers decide ownership with the SAME predicate:")

for (const [name, src] of [["buffer", WORKER], ["instagram", IG_WORKER], ["tiktok", TT_WORKER]] as const) {
  ok(`the ${name} worker imports isBufferRouted from the one module`,
    /import\s*\{[^}]*isBufferRouted[^}]*\}\s*from\s*"@\/lib\/social\/bufferRoute"/.test(src))
  ok(`…and actually calls it`, /isBufferRouted\(/.test(src))
}
ok("neither native worker re-implements the predicate locally",
  !/buffer_channel_id\s*&&\s*buffer_account_id/.test(IG_WORKER + TT_WORKER))

// ── 3. REQUIREMENT 4 — A BUFFER DESTINATION NEEDS NO OAUTH TOKEN OF OURS ─────────────────────
// Both native workers must ask about the ROUTE before they try to resolve a credential. The
// Instagram token RPC inner-joins the Vault secret, so a Buffer row (token_secret_id NULL) returns
// nothing and would otherwise be reported as "disconnected or removed" — failing a healthy post.
console.log("\nthe route is checked BEFORE a token is resolved:")

const igRouteIdx = IG_WORKER.indexOf("isBufferRouted")
const igRpcIdx = IG_WORKER.indexOf("sa_get_instagram_token_by_connection")
ok("instagram: the routing check precedes the token RPC",
  igRouteIdx > -1 && igRpcIdx > -1 && igRouteIdx < igRpcIdx,
  `isBufferRouted@${igRouteIdx} rpc@${igRpcIdx}`)
ok("instagram: a buffer_routed result is its own kind, not a fault",
  /kind:\s*"buffer_routed"/.test(IG_WORKER))
ok("instagram: a buffer_routed row is skipped, never failed",
  /dest\.kind === "buffer_routed"[\s\S]{0,220}?continue/.test(IG_WORKER))

const ttRouteIdx = TT_WORKER.indexOf("bufferRouted")
const ttTokenIdx = TT_WORKER.indexOf("const postTok = await tokenFor")
ok("tiktok: the routing check precedes this row's token resolution",
  ttRouteIdx > -1 && ttTokenIdx > -1 && ttRouteIdx < ttTokenIdx,
  `bufferRouted@${ttRouteIdx} tokenFor@${ttTokenIdx}`)
ok("tiktok: a Buffer-routed row is skipped, never failed",
  /restriction\.bufferRouted[\s\S]{0,200}?continue/.test(TT_WORKER))
ok("tiktok: the stranded sweep checks the route too",
  /strandedRoute[\s\S]{0,200}?bufferRouted[\s\S]{0,120}?continue/.test(TT_WORKER))
ok("tiktok: the pending sweep checks the route too",
  /pendingRoute[\s\S]{0,200}?bufferRouted[\s\S]{0,120}?continue/.test(TT_WORKER))

// ── 4. WHICH SURFACES BUFFER MAY CARRY ───────────────────────────────────────────────────────
console.log("\nonly the surfaces Buffer can publish automatically are carried:")

ok("instagram_reel is carried", BUFFER_DESTINATIONS.includes("instagram_reel"))
ok("tiktok_video is carried", BUFFER_DESTINATIONS.includes("tiktok_video"))
// instagram_story IS now carried, and these two assertions used to say the opposite. The reason
// they gave was real — text, links or stickers on a Story push Buffer into reminder publishing,
// which an unattended cron cannot complete — so the change is recorded with what settled it
// rather than simply flipped:
//
//   * Buffer's live schema (24 Nov 2026) has InstagramPostMetadataInput.type: PostType, and
//     PostType includes `story`. The surface is expressible.
//   * our Story carries no text, no link and no stickerFields — asserted below, so the
//     reminder condition cannot be met by accident rather than merely not being met today.
//   * the channel reports defaultToReminders = false.
//   * and a reminder is no longer silent: recordOutcome fails the row on any notificationStatus,
//     and bufferOutcomeFor fails it on every non-`sent` status. The failure the exclusion stood
//     in for is now reported.
ok("instagram_story IS carried, now that a reminder cannot be silent",
  BUFFER_DESTINATIONS.includes("instagram_story"))
ok("…and it asks Buffer for PostType 'story'", bufferPostTypeFor("instagram_story") === "story")
ok("…and sends no text, which is what would force a reminder",
  /text: isBufferStory\(destination\) \? "" : /.test(WORKER))
ok("…with no link and no stickerFields anywhere in the worker",
  !/stickerFields/.test(WORKER) && !/\blink:/.test(WORKER))
ok("…and a notificationStatus of any kind still fails the row",
  /if \(snap\.notificationStatus\)[\s\S]{0,200}markFailed/.test(WORKER))
ok("tiktok_story is NOT carried — Buffer's TikTok metadata input has no type field at all",
  !BUFFER_DESTINATIONS.includes("tiktok_story"))

ok("instagram_reel passes the refusal check", bufferDestinationRefusal("instagram_reel") === null)
ok("instagram_story passes it too", bufferDestinationRefusal("instagram_story") === null)
ok("tiktok_story is still refused as not carried",
  bufferDestinationRefusal("tiktok_story") === "not_carried_by_buffer")
ok("an unknown destination is refused", bufferDestinationRefusal("facebook_post") === "not_a_destination")
ok("null is refused", bufferDestinationRefusal(null) === "not_a_destination")
// THE AUDIT GATE WAS REPLACED, NOT REMOVED — and this is the before/after.
//
// It used to refuse tiktok_video because DESTINATIONS.tiktok_video.publish is 'awaiting_approval'.
// That field records whether WE may call TikTok's Content Posting API with OUR developer app; this
// route makes no such call, so the field was answering a question it does not govern. What it DID
// provide — a per-surface clearance, so Instagram can be live while TikTok is not — is now
// `routeEnabled`, which the worker supplies from SOCIAL_BUFFER_TIKTOK_ENABLED. So the clearance is
// still required; it is simply the operator's decision about this route rather than a statement
// about an unrelated audit.
ok("tiktok_video is refused while THIS ROUTE is not switched on",
  bufferDestinationRefusal("tiktok_video", false) === "route_not_enabled")
ok("…and the default stays refused-by-nothing-having-been-decided for a caller that asks nothing",
  bufferDestinationRefusal("tiktok_video") === null)
ok("tiktok_video passes once the route is switched on",
  bufferDestinationRefusal("tiktok_video", true) === null)
ok("instagram_reel does NOT need the TikTok switch",
  bufferDestinationRefusal("instagram_reel", false) === "route_not_enabled"
  && bufferDestinationRefusal("instagram_reel", true) === null)
// The one kind of refusal that survives every switch, because it is a fact about the NETWORK and
// not about anybody's clearance: TikTok documents no Story endpoint at all.
ok("a surface the provider has no API for is refused however the switches are set",
  DESTINATIONS.tiktok_story.publish === "unsupported_by_provider")
ok("…and tiktok_story cannot reach the check anyway, being uncarried",
  bufferDestinationRefusal("tiktok_story", true) === "not_carried_by_buffer")
ok("the refusal message for an unswitched route names the tradeoff being accepted",
  /Buffer, not we, chooses the TikTok privacy level/.test(BUFFER_REFUSAL_MESSAGE.route_not_enabled))

// ── FAILING A POST MUST RELEASE ITS IN-FLIGHT CLAIM ──────────────────────────────────────────
// media_publish_claimed_at asserts "a publish call is in flight", and the SECOND claim is
// `.is("media_publish_claimed_at", null)`. markFailed used to leave the column set, so a failed
// row could never be claimed again by anything: the worker took it, failed claim 2, skipped it
// in silence, and the stranded sweep failed it again three minutes later, for ever. Lisette's
// debut sat in that loop for four and a half hours on 24 Nov while its error message advised
// checking Buffer's queue for a post that had never been created.
{
  const mf = WORKER.split("async function markFailed")[1]?.split("}")[0] ?? ""
  ok("markFailed clears the in-flight claim", /media_publish_claimed_at: null/.test(mf))
  ok("…in the same statement that fails the row", /status: "needs_attention"[\s\S]{0,160}media_publish_claimed_at: null/.test(mf))
  ok("the second claim is still what guards an in-flight send",
    /\.is\("media_publish_claimed_at", null\)/.test(WORKER))
  ok("…and a resend is still prevented by the FIRST claim's external_post_id guard",
    /\.is\("external_post_id", null\)/.test(WORKER))
  ok("the TikTok sibling releases it too",
    /media_publish_claimed_at: null/.test(code(read("app/api/cron/social-tiktok-publish/route.ts")).split("async function markFailed")[1]?.split("}")[0] ?? ""))
}

// ── BUFFER'S TWO REQUIRED INSTAGRAM FIELDS ───────────────────────────────────────────────────
// InstagramPostMetadataInput declares shouldShareToFeed: Boolean! and type: PostType!. The client
// used to send shouldShareToFeed only when a caller passed one, and no caller ever did, so every
// Buffer-routed Instagram post was rejected by GraphQL validation before it reached the network.
// Invisible while the only Buffer traffic was TikTok, whose metadata input has no required field;
// the first Instagram Reel through the route failed on it in production on 24 Nov 2026.
{
  const client = read("lib/social/buffer.ts")
  ok("shouldShareToFeed is sent whenever a PostType is sent, not only when a caller asks",
    /if \(input\.postType\) \{[\s\S]{0,200}metadata\.shouldShareToFeed = input\.shouldShareToFeed \?\? input\.postType !== "story"/.test(client))
  ok("…and it is never sent for TikTok, whose input has no such field",
    /\} else if \(input\.shouldShareToFeed !== undefined\)/.test(client))
  ok("the requirement is recorded where the code is, so it cannot be dropped again",
    /shouldShareToFeed: Boolean!/.test(client) && /type: PostType!/.test(client))
  // The per-surface default, evaluated rather than matched: a Reel goes to the feed as Instagram
  // itself defaults and as the native Graph path already produces; a Story cannot.
  const shareFor = (postType: string | null, override?: boolean) =>
    postType ? (override ?? postType !== "story") : undefined
  ok("a Reel shares to the feed", shareFor("reel") === true)
  ok("a Story does not", shareFor("story") === false)
  ok("an explicit value from the caller still wins", shareFor("reel", false) === false)
  ok("TikTok sends nothing", shareFor(null) === undefined)
}

ok("instagram_reel maps to Buffer's `reel` PostType", bufferPostTypeFor("instagram_reel") === "reel")
ok("tiktok_video sends no PostType — Buffer's TikTok metadata has no type field",
  bufferPostTypeFor("tiktok_video") === null)

// ── 5. WHAT BUFFER'S STATUS MEANS FOR THE ROW ────────────────────────────────────────────────
// The counter-intuitive half: `scheduled` and `draft` are FAILURES, because the worker asked for
// shareNow. Treating them as pending would reconcile for ever while Buffer published unattended.
console.log("\nBuffer's six statuses map onto exactly three outcomes:")

ok("sent ⇒ published", bufferOutcomeFor("sent").kind === "published")
ok("sending ⇒ pending", bufferOutcomeFor("sending").kind === "pending")
ok("error ⇒ failed", bufferOutcomeFor("error").kind === "failed")
ok("needs_approval ⇒ failed", bufferOutcomeFor("needs_approval").kind === "failed")
ok("scheduled ⇒ failed (we asked for shareNow; a queued post is not a published one)",
  bufferOutcomeFor("scheduled").kind === "failed")
ok("draft ⇒ failed", bufferOutcomeFor("draft").kind === "failed")
ok("an unrecognised status ⇒ failed, never silently published",
  bufferOutcomeFor("something_new").kind === "failed")
ok("Buffer's own error text reaches the row",
  bufferOutcomeFor("error", "media download failed").kind === "failed" &&
  /media download failed/.test((bufferOutcomeFor("error", "media download failed") as { detail: string }).detail))
ok("a queued post's message warns that Buffer may still send it",
  /may send it later/.test((bufferOutcomeFor("scheduled") as { detail: string }).detail))

// ── 6. REQUIREMENT 7 — THE SIGNED URL OUTLIVES BUFFER'S INGEST ───────────────────────────────
// Measured, not assumed: a 3600s request produced a JWT whose exp was 3591s out and a HEAD
// returned 200 video/mp4; the one real publish went dueAt → sentAt in 42 seconds.
console.log("\nthe signed media URL outlives Buffer's measured ingest by a wide margin:")

ok("the TTL is two hours", BUFFER_SIGN_TTL_SECONDS === 7200)
ok("the observed ingest is recorded as 42s", BUFFER_OBSERVED_INGEST_SECONDS === 42)
ok("the TTL covers the observed ingest with at least a 10× margin", signTtlCoversIngest())
ok("…and the guard would FAIL if the TTL were cut to the ingest time",
  !signTtlCoversIngest(42, 42))
ok("…and would fail at 5 minutes, which is the kind of edit this guard exists to catch",
  !signTtlCoversIngest(300, 42))
ok("the worker signs with the shared constant, not a literal",
  /createSignedUrl\([^)]*BUFFER_SIGN_TTL_SECONDS/.test(WORKER))
ok("the signed URL is minted AFTER the claim, so its clock starts as late as possible",
  WORKER.indexOf("status: \"publishing\"") < WORKER.indexOf("createSignedUrl"))
ok("the signed URL is never written to a column",
  !/signedUrl[^\n]*update\(/.test(WORKER) && !/external_post_id:\s*signed/.test(WORKER))

// ── 7. REQUIREMENT 6 — DUPLICATE PROTECTION ──────────────────────────────────────────────────
console.log("\nduplicate protection: two claims, and the send is never retried:")

ok("claim 1 moves scheduled → publishing",
  /update\(\{\s*status: "publishing"/.test(WORKER))
ok("claim 1 is guarded on status still being 'scheduled'",
  /\.eq\("status", "scheduled"\)/.test(WORKER))
ok("claim 1 is guarded on no external_post_id yet",
  /\.is\("external_post_id", null\)/.test(WORKER))
ok("claim 1 is also guarded on approval not having been revoked mid-flight",
  /\.not\("approved_at", "is", null\)/.test(WORKER))
ok("claim 2 is guarded on media_publish_claimed_at being null",
  /media_publish_claimed_at[\s\S]{0,400}?\.is\("media_publish_claimed_at", null\)/.test(WORKER))
const claim2Idx = WORKER.indexOf('.is("media_publish_claimed_at", null)')
const createIdx = WORKER.indexOf("createBufferPost(")
ok("claim 2 is the last thing before the send",
  claim2Idx > -1 && createIdx > -1 && claim2Idx < createIdx,
  `claim2@${claim2Idx} create@${createIdx}`)
ok("the Buffer post id is persisted immediately after the send",
  /external_post_id:\s*created\.id/.test(WORKER))
ok("the stranded sweep FAILS a row rather than re-sending it",
  /is\("external_post_id", null\)[\s\S]{0,1600}?markFailed/.test(WORKER))
// A row claimed seconds ago is a publish in flight, not a crash. Without this, two overlapping
// invocations would let one of them mark the other's in-flight post needs_attention.
ok("the stranded sweep ignores claims younger than the staleness window",
  /\.lt\("media_publish_claimed_at", new Date\(Date\.now\(\) - STRANDED_AFTER_MS\)/.test(WORKER))
ok("the staleness window is longer than the measured publish and shorter than the cron interval",
  /const STRANDED_AFTER_MS = 3 \* 60 \* 1000/.test(WORKER))
ok("the worker never calls createBufferPost twice",
  (WORKER.match(/createBufferPost\(/g) ?? []).length === 1)
ok("createBufferPost has no retry loop of its own",
  !/for\s*\([^)]*\)\s*\{[\s\S]{0,300}?createBufferPost/.test(CLIENT + WORKER))
ok("the client retries the READ only",
  /export async function fetchBufferPost[\s\S]{0,900}?for\s*\(let i = 0/.test(CLIENT))
ok("…and createBufferPost is not inside any retry",
  !/for\s*\(let i[\s\S]{0,600}?createBufferPost/.test(CLIENT))

// ── 8. REQUIREMENT 5 — MARKET RESTRICTION, TWICE, THE SECOND TIME AT THE LAST MOMENT ─────────
console.log("\nthe market restriction is enforced twice, the second time immediately before the send:")

ok("the worker uses the shared restriction module",
  /from "@\/lib\/social\/marketRestriction"/.test(WORKER))
ok("it does not re-implement the comparison",
  !/toLowerCase\(\)\s*===\s*.*market/i.test(WORKER))
const firstCheck = WORKER.indexOf("preClaimViolation")
const freshCheck = WORKER.indexOf("freshRestriction(")
ok("there is a pre-claim check", firstCheck > -1)
ok("there is a second, freshly-read check", freshCheck > -1)
ok("the second check happens after the first", firstCheck < freshCheck)
ok("the second check re-reads the database rather than trusting the cached value",
  /async function freshRestriction[\s\S]{0,400}?from\("social_connections"\)[\s\S]{0,200}?market_restriction/.test(WORKER))
const lateIdx = WORKER.indexOf("lateViolation")
ok("the second check sits between claim 1 and the send",
  lateIdx > -1 && lateIdx < createIdx && lateIdx > firstCheck)
ok("a restriction that cannot be re-read releases the claim instead of publishing",
  /releaseClaim\(postId\)/.test(WORKER))
ok("releaseClaim can only act on a row that was never sent",
  /async function releaseClaim[\s\S]{0,400}?\.is\("media_publish_claimed_at", null\)[\s\S]{0,120}?\.is\("external_post_id", null\)/.test(WORKER))

// The restriction itself, on her actual configuration.
const HERS = ["San Antonio", "Austin"]
console.log("\nLisette's restriction, applied to real market labels:")
ok("San Antonio is allowed", marketRestrictionViolation(HERS, "San Antonio") === null)
ok("Austin is allowed", marketRestrictionViolation(HERS, "Austin") === null)
ok("Dallas is refused", marketRestrictionViolation(HERS, "Dallas") !== null)
ok("Houston is refused", marketRestrictionViolation(HERS, "Houston") !== null)
ok("DFW is refused — it is a distinct label, not a spelling of Dallas",
  marketRestrictionViolation(HERS, "DFW") !== null)
ok("a blank market is refused under a restriction",
  marketRestrictionViolation(HERS, "") !== null)
ok("a null market is refused under a restriction",
  marketRestrictionViolation(HERS, null) !== null)
ok("case and padding do not defeat the allow-list",
  marketRestrictionViolation(HERS, "  san antonio ") === null)
ok("the refusal names the market and the restriction, for a human to read",
  /San Antonio, Austin/.test(String(marketRestrictionViolation(HERS, "Dallas"))) &&
  /Dallas/.test(String(marketRestrictionViolation(HERS, "Dallas"))))

// ── 9. THE FIVE GATES ────────────────────────────────────────────────────────────────────────
console.log("\nfive independent gates, each failing closed:")

ok("gate 1: CRON_SECRET", /CRON_SECRET[\s\S]{0,200}?status: 401/.test(WORKER))
ok("gate 2: the arm switch, checked before any read or write",
  WORKER.indexOf("bufferAutopublishEnabled()") < WORKER.indexOf("from(\"social_posts\")"))
ok("gate 3: the owner-wide Auto Posting switch", /readAutoPosting\(/.test(WORKER))
ok("gate 3 fails closed on an unreadable switch", /settings\.state !== "on"/.test(WORKER))
ok("gate 4: the per-destination audit gate", /bufferDestinationRefusal\(/.test(WORKER))
ok("gate 5: the per-destination pause", /dest\.postingPaused/.test(WORKER))
ok("a paused destination is skipped untouched, not failed",
  /dest\.postingPaused[\s\S]{0,160}?continue/.test(WORKER))

console.log("\nthe arm switch is strict:")
ok("exactly 'true' arms it", bufferAutopublishEnabled({ SOCIAL_BUFFER_AUTOPUBLISH_ENABLED: "true" } as NodeJS.ProcessEnv))
ok("trailing whitespace still arms it (an operator did say true)",
  bufferAutopublishEnabled({ SOCIAL_BUFFER_AUTOPUBLISH_ENABLED: "true\n" } as NodeJS.ProcessEnv))
for (const v of ["TRUE", "True", "1", "yes", "", " "]) {
  ok(`${JSON.stringify(v)} does NOT arm it`,
    !bufferAutopublishEnabled({ SOCIAL_BUFFER_AUTOPUBLISH_ENABLED: v } as NodeJS.ProcessEnv))
}
ok("missing does NOT arm it", !bufferAutopublishEnabled({} as NodeJS.ProcessEnv))
ok("it is a different variable from TikTok's, so the two arm independently",
  /SOCIAL_BUFFER_AUTOPUBLISH_ENABLED/.test(read("lib/social/bufferGate.ts")) &&
  !/SOCIAL_TIKTOK_AUTOPUBLISH_ENABLED/.test(code(read("lib/social/bufferGate.ts"))))

// ── 10. REQUIREMENT 9 — NOTHING CAN POST YET ─────────────────────────────────────────────────
//
// WHAT CHANGED, AND WHY THIS SECTION NOW ASSERTS SOMETHING DIFFERENT. The Buffer worker used to be
// unreachable because nothing could invoke it: there was no cron entry. It has one now, at the
// operator's request, so "unreachable" is no longer true and asserting it would be asserting a
// fiction. The guarantee is not weaker, it has MOVED — from "no caller exists" to "every caller is
// refused". So this section stops measuring the cron's absence and starts measuring the switches,
// which is where the protection actually lives and where it will stay once this is live.
//
// Three independent gates now stand between a five-minute cron tick and a public post, and all
// three are operator state, not code:
//
//   SOCIAL_BUFFER_AUTOPUBLISH_ENABLED   unset        → the worker returns before reading a row
//   social_settings.auto_posting        'paused'     → the owner-wide switch refuses every post
//   social_connections.posting_paused   per row      → the destination refuses its own posts
//
// What IS asserted about the cron is that it is the schedule that was approved and that it did not
// disturb the three workers already there.
console.log("\nthe worker can be invoked, and every invocation is still refused:")

const VERCEL = read("vercel.json")
const VERCEL_CRONS = (JSON.parse(VERCEL) as { crons: { path: string; schedule: string }[] }).crons
const bufferCron = VERCEL_CRONS.filter((c) => c.path === "/api/cron/social-buffer-publish")
ok("the Buffer worker has exactly one cron entry", bufferCron.length === 1,
  `found ${bufferCron.length}; two entries would double every run and halve the duplicate protection's margin`)
ok("…on the same five-minute schedule as the two native publish workers",
  bufferCron[0]?.schedule === "*/5 * * * *", bufferCron[0]?.schedule)
ok("the existing cron entries are untouched",
  /social-instagram-publish/.test(VERCEL) && /social-tiktok-publish/.test(VERCEL) &&
  /social-comment-poll/.test(VERCEL))
ok("…and none of them was rescheduled",
  VERCEL_CRONS.filter((c) => ["/api/cron/social-instagram-publish", "/api/cron/social-tiktok-publish",
    "/api/cron/social-comment-poll"].includes(c.path)).every((c) => c.schedule === "*/5 * * * *"))
ok("the autopilot planner still runs hourly, unchanged",
  VERCEL_CRONS.find((c) => c.path === "/api/cron/social-autopilot-plan")?.schedule === "0 * * * *")

// THE GATE THAT REPLACED THE MISSING CRON. A cron tick with no arm switch set must get no further
// than the gate — so the gate is read BEFORE anything is claimed, which is what makes a tick free.
ok("the arm switch is checked before any row is read",
  WORKER.indexOf("bufferAutopublishEnabled") < WORKER.indexOf("social_posts"),
  "a worker that claims rows and then refuses them has already taken a lock it did not need")
ok("the arm switch is not set in any committed env file",
  !/SOCIAL_BUFFER_AUTOPUBLISH_ENABLED\s*=\s*true/.test(read(".env.example")),
  "arming must be a deliberate act in the hosting dashboard, not a value that ships with the repo")
ok("neither is the TikTok route clearance",
  !/SOCIAL_BUFFER_TIKTOK_ENABLED\s*=\s*true/.test(read(".env.example")))
ok("the owner-wide Auto Posting switch is still the operator's to flip, not the code's",
  !/auto_posting['"]?\s*:\s*['"]on/.test(WORKER))
ok("…and the worker only ever READS it",
  !/from\("social_settings"\)[\s\S]{0,200}?\.(update|upsert|insert)\(/.test(WORKER))
ok("the worker never clears a destination's own pause flag",
  !/posting_paused\s*:\s*false/.test(WORKER))

// ── 11. REQUIREMENT 1 — THE CREDENTIAL NEVER LEAKS, AND NEVER CROSSES ACCOUNTS ───────────────
console.log("\nthe API key is an argument, is never logged, and cannot cross accounts:")

ok("the client is server-only", /^import "server-only"/m.test(read("lib/social/buffer.ts")))
ok("the resolver is server-only", /^import "server-only"/m.test(read("lib/social/bufferServer.ts")))
ok("every client function takes the key as a parameter",
  /createBufferPost\(\s*\n?\s*apiKey: string/.test(CLIENT) &&
  /fetchBufferPost\(\s*\n?\s*apiKey: string/.test(CLIENT) &&
  /fetchBufferChannel\(apiKey: string/.test(CLIENT))
ok("the client reads no key from the environment",
  !/process\.env/.test(CLIENT))
ok("the client reads no key from a file",
  !/readFileSync|homedir/.test(CLIENT))
ok("no module-level key cache exists in the client",
  !/^const\s+\w*[kK]ey\s*=/m.test(CLIENT))
// The key IS interpolated once, into the Authorization header, which is the only place it belongs.
// The property worth asserting is that it appears nowhere else — not in a thrown message, not in a
// URL, not in a log line. So: every interpolation of it sits on the Authorization line.
ok("the key is interpolated exactly once, and only into the Authorization header",
  CLIENT.split("\n").filter((l) => l.includes("${apiKey}")).every((l) => /Authorization/.test(l)) &&
  (CLIENT.match(/\$\{apiKey\}/g) ?? []).length === 1)
ok("no thrown BufferApiError mentions the key",
  !/BufferApiError\([^)]*apiKey/.test(CLIENT))
ok("the key is never logged anywhere in the route or the client",
  !/console\.(log|warn|error)\([^)]*apiKey/.test(CLIENT + SERVER + WORKER))
ok("the key is never put in a URL",
  !/\?.*apiKey|apiKey.*=\s*`/.test(CLIENT))
ok("the resolver returns a discriminated result, not null-or-value",
  /kind: "misconfigured"/.test(SERVER) && /kind: "unreadable"/.test(SERVER))
ok("the credential cache is per-call, never module state",
  /export function bufferDestinationCache/.test(SERVER) &&
  !/^const cache = new Map/m.test(SERVER))
ok("an unreadable resolution is NOT cached, so one hiccup does not condemn later rows",
  /res\.ok \|\| res\.kind === "misconfigured"/.test(SERVER))
ok("the worker holds no key in a variable that outlives the row",
  !/^let\s+\w*apiKey/m.test(WORKER))

// ── 12. THE SEND ITSELF ──────────────────────────────────────────────────────────────────────
console.log("\nthe send asks Buffer to publish now, automatically:")

ok("mode is shareNow", /mode:\s*"shareNow"/.test(CLIENT))
ok("schedulingType is automatic", /schedulingType:\s*"automatic"/.test(CLIENT))
ok("neither is a parameter — there is no caller for whom the other value is correct",
  !/mode:\s*input\./.test(CLIENT) && !/schedulingType:\s*input\./.test(CLIENT))
ok("no queueing mode appears anywhere",
  !/addToQueue|customScheduled|shareNext/.test(CLIENT))
ok("thumbnailUrl is not sent — a second URL is a second chance to expire",
  !/thumbnailUrl:/.test(CLIENT.replace(/thumbnailUrl\?*:\s*string/g, "")))
ok("the only mutation in the client is createPost",
  !/publishPostNow|deletePost|editPost|updatePost/.test(CLIENT))
ok("a reminder-published post is treated as a FAULT, not a success",
  /notificationStatus[\s\S]{0,400}?markFailed/.test(WORKER))
ok("a channel set to reminder publishing is refused before the send",
  /defaultToReminders === true[\s\S]{0,300}?return/.test(WORKER))
ok("a disconnected or locked Buffer channel is refused with an actionable reason",
  /isDisconnected[\s\S]{0,200}?reconnect it in Buffer/.test(WORKER) &&
  /isLocked[\s\S]{0,200}?channel limit/.test(WORKER))
ok("a channel whose service does not match the destination is refused",
  /dest\.provider !== channel\.service/.test(WORKER))

// ── 13. CAPTIONS AND CREATOR DECISIONS ARE NOT RE-INVENTED BY THE NEW ROUTE ──────────────────
// A post must read the same however it was carried, and TikTok's "no decision, no post" rule must
// not become optional because a different worker picked the row up.
console.log("\nthe route borrows the shared rules rather than restating them:")

ok("Instagram captions come from the shared builder",
  /buildInstagramCaptionPayload\(/.test(WORKER))
ok("TikTok captions come from the shared builder",
  /buildTikTokCaptionPayload\(/.test(WORKER))
ok("the worker builds no caption text of its own",
  !/hashtags\.map|#\$\{/.test(WORKER))
ok("the hold gate is the shared one", /publishHoldDecision\(/.test(WORKER))
ok("the identity refusal is the shared one", /renderRefusalFor\(/.test(WORKER))
ok("the lateness and resume windows are the shared ones",
  /isWithinLatenessWindow\(/.test(WORKER) && /isEligibleAfterResume\(/.test(WORKER))
ok("approval is still required", /row\.approved_at/.test(WORKER))
ok("a rendered asset is still required",
  /render_status !== "ready"/.test(WORKER))
// ── THE DISCLOSURE GATE WAS REMOVED, AND THIS IS WHY ──────────────────────────────────────
// It used to refuse every tiktok_video post with no saved `tiktok_disclosure`. That column does
// not exist in production, so the refusal was TOTAL: the gate's measured effect was "TikTok never
// publishes", not "TikTok publishes safely".
//
// It fell to the argument this file already makes about privacy and interactions — requiring a
// value HERE that Buffer cannot transmit "would refuse posts while enforcing nothing, which is a
// gate that only looks like a safeguard". Buffer's TikTokPostMetadataInput has `title` and an
// OPTIONAL `isAiGenerated`, and nothing else.
//
// It was also mis-wired: isAiGenerated was derived as `disclosure !== "none"`, reading a COMMERCIAL
// disclosure (your brand / branded content) as an AI-GENERATED label. That mislabels in both
// directions, so the derivation is gone rather than moved.
ok("the worker no longer refuses a TikTok post for want of a saved disclosure",
  !/readSavedDisclosure/.test(WORKER),
  "a gate on a column that does not exist is not a safeguard, it is an outage")
ok("…and it no longer imports the disclosure reader at all",
  !/tiktokPublishSettings/.test(WORKER))
ok("…and isAiGenerated is never derived from a commercial disclosure",
  !/isAiGenerated\s*=\s*disclosure/.test(WORKER),
  "the disclosure enum is about commercial content; isAiGenerated is about synthetic media")
ok("…and nothing is sent to Buffer under that key, rather than a guessed false",
  !/isAiGenerated:/.test(WORKER) && !/isAiGenerated \}/.test(WORKER),
  "unset is honest for a library of real footage and real recorded voice; false is a claim")
ok("…and the file records what compliance actually requires, and where each part is met",
  /COMMERCIAL content to be DISCLOSED/.test(ROUTE_FILE) &&
  /disclosed in the caption/.test(ROUTE_FILE) &&
  /AI-generated realistic content to be LABELLED/.test(ROUTE_FILE),
  "the next reader has to find the reasoning here, not re-derive it from Buffer's schema")
ok("…and the removal is recorded in the file, so it cannot look like an oversight",
  /THIS ROUTE USED TO REFUSE EVERY TIKTOK POST/.test(ROUTE_FILE))
ok("the worker still asks for none of the two values it cannot transmit",
  !/readSavedSettings/.test(WORKER))

// The gates that DO protect something are untouched by that removal. Asserted together here so a
// future edit cannot quietly take one of them out alongside a disclosure change.
ok("approval, render and the arm switches all still gate TikTok",
  /row\.approved_at/.test(WORKER) &&
  /render_status !== "ready"/.test(WORKER) &&
  /bufferTikTokEnabled\(/.test(WORKER) &&
  /bufferAutopublishEnabled\(/.test(WORKER))
ok("TikTok needs its OWN switch on top of the worker's master switch",
  /destination === "tiktok_video" \? bufferTikTokEnabled\(\) : true/.test(WORKER))
ok("…and that switch is strict-true, missing meaning no",
  /SOCIAL_BUFFER_TIKTOK_ENABLED \?\? ""\)\.trim\(\) === "true"/.test(code(read("lib/social/bufferGate.ts"))))

// ── 14. READ-FAILURE CLASSIFICATION ──────────────────────────────────────────────────────────
console.log("\nonly transient read failures are retried:")

ok("429 is retryable", classifyReadFailure(429, null) === "retryable")
ok("500 is retryable", classifyReadFailure(500, null) === "retryable")
ok("503 is retryable", classifyReadFailure(503, null) === "retryable")
ok("401 is terminal", classifyReadFailure(401, null) === "terminal")
ok("404 is terminal", classifyReadFailure(404, null) === "terminal")
ok("a timeout with no status is retryable", classifyReadFailure(null, "fetch failed: timeout") === "retryable")
ok("ECONNRESET is retryable", classifyReadFailure(null, "read ECONNRESET") === "retryable")
ok("an unknown-field error is terminal", classifyReadFailure(null, 'Unknown field "foo"') === "terminal")
ok("an empty message is unknown, not silently retryable", classifyReadFailure(null, "") === "unknown")

// ── 15. THE MODULE BOUNDARY ──────────────────────────────────────────────────────────────────
// bufferRoute is the decisions; it must stay free of I/O so every assertion above can run with no
// database, no network and no key.
console.log("\nthe decision module stays pure:")

ok("bufferRoute imports no supabase client", !/supabase/i.test(ROUTE))
ok("bufferRoute performs no fetch", !/fetch\(/.test(ROUTE))
ok("bufferRoute reads no environment", !/process\.env/.test(ROUTE))
ok("bufferRoute is not server-only, so it stays unit-testable",
  !/^import "server-only"/m.test(read("lib/social/bufferRoute.ts")))
ok("the gate module reads only the environment",
  !/supabase|fetch\(/i.test(code(read("lib/social/bufferGate.ts"))))

// ── 16. THE PREPARED SQL IS PREPARED, NOT APPLIED ────────────────────────────────────────────
// Requirement 10: nothing of Jay's changes without the change being shown first. These files are
// the showing. They must live in supabase/prepared, never in supabase/migrations, so no apply step
// can pick them up by accident.
console.log("\nthe schema and configuration changes are staged, not applied:")

// Each file states its own applied state, and this asserts the state it states. A blanket
// "every file says NOT APPLIED" check passed for a day after the route migration was applied,
// because the file still carried the old header — the assertion was true of the prose and false
// of the database. Tracking it per file is what makes the header worth reading.
const prepared = [
  "supabase/prepared/20261122000000_buffer_publish_route.sql",
  "supabase/prepared/20261122000001_lisette_buffer_destinations.sql",
  "supabase/prepared/20261122000002_jay_tiktok_via_buffer.sql",
]
const APPLIED = new Set([
  "20261122000000_buffer_publish_route.sql",            // Step 1, approved and applied 23 Nov 2026
  "20261123000002_buffer_accounts_grant_hardening.sql", // the grant revoke, approved and applied 23 Nov 2026
  "20261122000002_jay_tiktok_via_buffer.sql",           // Step 3, the channel mapping, applied 23 Nov 2026
  "20261122000001_lisette_buffer_destinations.sql",     // the launch release, applied 23 Nov 2026
])
for (const p of prepared) {
  let body = ""
  try { body = read(p) } catch { /* reported below */ }
  const base = path.basename(p)
  ok(`${base} exists`, body.length > 0)
  if (APPLIED.has(base)) {
    ok(`…and records that it IS applied, with a date`,
      /^-- APPLIED \d{1,2} \w+ 20\d\d/m.test(body) && !/prepared, not applied/i.test(body),
      "an applied file that still claims to be prepared is a lie the next reader will act on")
  } else {
    ok(`…and says it is not applied`, /NOT APPLIED/.test(body))
  }
}
const ROUTE_SQL = (() => { try { return read(prepared[0]) } catch { return "" } })()
const LISETTE_SQL = (() => { try { return read(prepared[1]) } catch { return "" } })()
const JAY_SQL = (() => { try { return read(prepared[2]) } catch { return "" } })()
/** SQL with `--` comments stripped. The files document the CURRENT state in their comments
 *  ("posting_paused = false"), so a check for what a file CHANGES must look at statements only. */
const sql = (s: string) => s.replace(/--.*$/gm, "")

// A Buffer API key is a bare 43-character alphanumeric token. SQL identifiers are long too, but
// they carry underscores and dots, so a word-boundary match on letters-and-digits only picks out
// the shape of a credential and nothing else.
ok("no prepared file contains anything shaped like an API key",
  ![ROUTE_SQL, LISETTE_SQL, JAY_SQL].some((s) => /\b[A-Za-z0-9]{40,}\b/.test(
    s.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, "")
     .replace(/\b[0-9a-f]{24}\b/g, ""))))
ok("the key is stored through a bind parameter, never inlined in SQL",
  /sa_set_buffer_api_key/.test(ROUTE_SQL) && /\$1/.test(LISETTE_SQL + JAY_SQL))
ok("the key column is a Vault pointer, not a text key",
  /key_secret_id\s+uuid/.test(ROUTE_SQL) && !/api_key\s+text\s+not null/.test(ROUTE_SQL))
ok("the read RPC is service-role only",
  /revoke all on function public\.sa_get_buffer_destination\(uuid\) from public, anon, authenticated/.test(ROUTE_SQL))
ok("the write RPC is service-role only",
  /revoke all on function public\.sa_set_buffer_api_key\(uuid, uuid, text, text, text\) from public, anon, authenticated/.test(ROUTE_SQL))
// THE DEFECT THIS PAIR EXISTS FOR, found before the file was applied. The function was granted to
// service_role ALONE while its body read auth.uid() and called is_platform_admin() — so it could
// never have run: the service role has no session, and `authenticated`, the only role that has
// one, is revoked. The key could not have been stored by anybody. The owner is now an explicit
// parameter, which is the convention every other service-role function here follows.
ok("the write RPC does not depend on a session it cannot have",
  !/auth\.uid\(\)/.test(ROUTE_SQL.slice(ROUTE_SQL.indexOf("function public.sa_set_buffer_api_key"),
    ROUTE_SQL.indexOf("revoke all on function public.sa_set_buffer_api_key"))),
  "a service-role-only function that reads auth.uid() can never succeed")
ok("…and still refuses an owner who is not a platform admin",
  /from public\.platform_admins a where a\.user_id = v_uid/.test(ROUTE_SQL),
  "dropping the session check must not drop the authorization check with it")
ok("the read RPC is route-scoped in the database, not only in the worker",
  /buffer_channel_id is not null/.test(ROUTE_SQL))
ok("a Buffer channel can back only one destination",
  /unique index[\s\S]{0,200}?social_connections_buffer_channel_key/.test(ROUTE_SQL))
ok("deleting a Buffer account that destinations still use is refused",
  /on delete restrict/.test(ROUTE_SQL))

ok("Lisette's file restricts her to San Antonio and Austin",
  /array\['San Antonio','Austin'\]/.test(LISETTE_SQL))
ok("Lisette's destinations start paused",
  /posting_paused/.test(LISETTE_SQL) && /true, 2, 0/.test(LISETTE_SQL))
ok("Lisette's file contains no UPDATE of an existing row",
  !/^\s*update\s+public\.social_connections/mi.test(LISETTE_SQL))
ok("Lisette's file names none of Jay's connection ids",
  !/1b5e4878|ebf475cf|5ea0e810|671b758b/.test(LISETTE_SQL))
ok("Lisette's file is idempotent",
  /where not exists/i.test(LISETTE_SQL))

// ── THE CHANNEL MAPPING: CONFIRMED, AND CONFIRMED BY A HUMAN ───────────────────────────────
// This used to assert that the file WARNED the mapping was unverified. The operator has since read
// the handles against the accounts and stated the mapping, so the warning is gone and the warning's
// assertion goes with it. What replaces it is the thing that now matters: that the file records WHO
// established the mapping and WHEN, because nobody auditing this later can re-derive it from the
// database — a TikTok open_id is scoped to the app that issued it, so our external_account_id and
// Buffer's serviceId for the same account are different strings by design.
ok("Jay's file records that the mapping was confirmed by a person, with a date",
  /CONFIRMED BY THE OPERATOR, 23 Nov 2026/.test(JAY_SQL))
ok("…and names the handle for each connection id, not a display name",
  /6b02190aece6dfde5f4c0fd6.*@locator\.beast/.test(JAY_SQL) &&
  /6b021ecdece6dfde5f4c40bf.*@realestatepro_tx/.test(JAY_SQL))
ok("…and no longer claims the mapping is unverified",
  !/COULD NOT BE VERIFIED BY MACHINE/.test(JAY_SQL))

// A SILENT NO-OP IS THE MOST LIKELY WAY TO RUN THIS FILE AND BELIEVE IT WORKED. The UPDATE joins to
// social_buffer_accounts; if the key has not been stored yet that join matches nothing and Postgres
// reports UPDATE 0 without error.
ok("Jay's file fails loudly when the Buffer account does not exist yet",
  /raise exception[\s\S]{0,160}?No Buffer account row labelled/.test(JAY_SQL))
ok("…and refuses a half-applied mapping",
  /Expected exactly 2 Buffer-mapped TikTok destinations/.test(JAY_SQL))
ok("…and refuses two destinations sharing one channel",
  /share a Buffer channel id/.test(JAY_SQL))
ok("Jay's file has a rollback beside it",
  (() => { try { return read("supabase/prepared/ROLLBACK_20261122000002_jay_tiktok_via_buffer.sql").includes("buffer_channel_id = null") } catch { return false } })())
ok("Jay's file touches only TikTok rows",
  /sc\.provider = 'tiktok'/.test(JAY_SQL))
ok("Jay's file does not clear the native TikTok tokens",
  !/token_secret_id\s*=\s*null/.test(JAY_SQL))
ok("Jay's file does not alter a market restriction",
  !/market_restriction\s*=/.test(sql(JAY_SQL)))
ok("Jay's file does not alter a pause flag",
  !/posting_paused\s*=/.test(sql(JAY_SQL)))
ok("Jay's file sets only the two Buffer columns",
  (sql(JAY_SQL).match(/^\s*(set|)\s*\w+\s*=/gm) ?? []).join(" ").replace(/\s+/g, " ").trim()
    .split(/\s*=\s*/).length - 1 <= 3,
  sql(JAY_SQL).match(/\w+\s*=\s*/g)?.join("|"))
ok("the autopilot-rules investigation records that nothing reads the table",
  /read by nothing/.test((() => { try { return read("supabase/prepared/20261007000002_social_autopilot_rules.INVESTIGATION.sql") } catch { return "" } })()))

// ── 13b. THE DEPLOYMENT ORDER, AND WHAT HAPPENS IF IT IS GOT WRONG ───────────────────────────
//
// Both native workers now ask isBufferRouted() about a row before publishing it, and to ask they
// must SELECT the two new columns. PostgREST fails the WHOLE query when a select names a column
// that does not exist — so this code deployed against an un-migrated database makes that read
// error for every row.
//
// That is survivable only because both workers FAIL CLOSED on it: the post is left untouched and
// still due, never published on an unknown route and never marked failed. The queue stops draining
// until the migration lands, which is a stall rather than a loss. The alternative — failing the
// post, or treating an unreadable route as "not Buffer-routed" and publishing it natively — would
// turn a missed migration into either dead posts or a post leaving through the wrong network.
//
// So the direction of the failure is the property, and it is asserted here rather than left to the
// deployment order being remembered. docs/TIKTOK_VIA_BUFFER_ACTIVATION.md states the order.
console.log("\na missing migration stalls the native workers, it does not misroute them:")

// THE ASSERTION THAT MATTERS, and it has to be anchored per worker: each reads the two columns in
// its own place, and a loose search for `if (error)` finds an unrelated one earlier in the file.
// The shape asserted is select → error check → isBufferRouted, in that order, with no gap in which
// a null row could reach the predicate. isBufferRouted(null) is FALSE — "not Buffer-routed" — so a
// failed read falling through to it would hand a Buffer destination to the native publisher.
for (const [label, src, selectAnchor, errAnchor, routeAnchor] of [
  ["instagram", IG_WORKER,
    '.select("buffer_account_id, buffer_channel_id")', "if (routingErr)", "isBufferRouted(routing)"],
  ["tiktok", TT_WORKER,
    '.select("market_restriction, buffer_account_id, buffer_channel_id")', "if (error) return { ok: false, reason:", "bufferRouted: isBufferRouted(data)"],
] as const) {
  const iSel = src.indexOf(selectAnchor)
  const iErr = src.indexOf(errAnchor, iSel)
  const iRoute = src.indexOf(routeAnchor, iSel)
  ok(`the ${label} worker reads the two route columns`, iSel > 0, selectAnchor)
  ok(`…and checks the read for an error before consulting isBufferRouted`,
    iSel > 0 && iErr > iSel && iRoute > iErr,
    `select@${iSel} err@${iErr} route@${iRoute}`)
}
ok("the instagram worker leaves such a post untouched rather than failing it",
  /kind: "unreadable"/.test(IG_WORKER) &&
  /could not read publishing route/.test(IG_WORKER))
ok("the tiktok worker does the same",
  /could not read destination market restriction/.test(TT_WORKER))
ok("the activation runbook states that the migration precedes the deploy",
  (() => {
    try {
      const doc = read("docs/TIKTOK_VIA_BUFFER_ACTIVATION.md")
      return /Step 1 must happen before step 6/.test(doc) && /PostgREST fails the whole query/i.test(doc)
    } catch { return false }
  })())

// ── 14. AN ACCOUNT IS ITS IDS, NEVER ITS NAME ────────────────────────────────────────────────
//
// THE EVENT THIS SECTION EXISTS FOR. On 23 Nov 2026 the operator renamed the display name on his
// Dallas Instagram and Dallas TikTok to "Jay | Dallas Apt Locator". The accounts did not change —
// only what they are called. A rename is the cheapest possible thing for a person to do and the
// most expensive thing for a routing layer to depend on, and the failure it produces is the worst
// shape there is: a post that succeeds, on the wrong account, with nothing anywhere reporting a
// problem. Buffer accepts it, TikTok accepts it, the row records published.
//
// So the property asserted here is that no name is consulted ANYWHERE between an approved row and
// Buffer's API. Three identities carry the routing, and all three are issued, not typed:
//
//   social_connections.id    a uuid we issued
//   buffer_account_id        a uuid we issued   ─┐ together, the route predicate
//   buffer_channel_id        a string Buffer issued ─┘
//
// social_connections.username still holds the name as it was at CONNECT time, so the Dallas row
// reads the old 'Jay Morris | Dallas Locator'. That staleness is harmless BECAUSE of what is
// asserted below, and it is deliberately not corrected: the only way to re-read a display name
// from TikTok is a reconnect, and a reconnect is exactly what must not happen to these accounts.
console.log("\nrouting reads ids, never a display name:")

ok("the route predicate is the two id columns and nothing else",
  /buffer_account_id/.test(ROUTE) && /buffer_channel_id/.test(ROUTE) &&
  !/username|display_name|\blabel\b/.test(ROUTE),
  "bufferRoutingFor decides which worker owns a row; a name in it would make a rename re-route a post")

// The resolver DOES carry `username` — it is returned for logging, which is legitimate and useful.
// What must not happen is the resolver, or the worker, deciding anything with it. So: it may be
// read off the row and returned, and it may not appear in a filter or a comparison.
ok("the resolver looks a destination up by connection id",
  /sa_get_buffer_destination", \{ p_connection_id: connectionId \}/.test(SERVER))
ok("…and never filters or branches on a name",
  !/\.eq\(\s*"(username|display_name|label)"/.test(SERVER) &&
  !/username\s*===|username\s*==|username\s*\?\s*\?/.test(SERVER),
  "username is carried for logging only; a comparison on it would be a routing decision")
ok("the worker never filters on a name either",
  !/\.eq\(\s*"(username|display_name|label)"/.test(WORKER) &&
  !/\.(ilike|like)\(/.test(WORKER))
ok("the worker never writes username, so a rename cannot be 'fixed' into a reconnect",
  !/username\s*:/.test(WORKER))
ok("the Buffer client addresses a channel by its id",
  /channelId/.test(CLIENT) && !/channelName|displayName/.test(CLIENT))

// THE SQL SIDE. The mapping file joins on uuid; the RPC keys on connection id. A WHERE clause on a
// username anywhere in either would be the same defect in a different language.
ok("the mapping joins connection id to channel id, by uuid cast",
  /\(values[\s\S]{0,400}?::uuid, '6b0/.test(JAY_SQL))
ok("no prepared Buffer file filters a connection by its username",
  !/username\s*=\s*'/.test(sql(ROUTE_SQL + LISETTE_SQL + JAY_SQL)))
ok("…and none of them writes username",
  !/set[\s\S]{0,200}?username\s*=/.test(sql(JAY_SQL)) && !/username\s*=/.test(sql(JAY_SQL)))
ok("the destination RPC takes a connection id, not a name",
  /sa_get_buffer_destination\(\s*p_connection_id uuid/.test(ROUTE_SQL))

// The ONE name-keyed lookup in the whole route is the Buffer ACCOUNT label — 'Jay', 'Lisette' —
// which is a word WE chose for a row we created, unique per owner by index, and never read from
// any platform. It is asserted here rather than left to look like an exception somebody forgot.
ok("the only name-keyed lookup is our own Buffer account label, and it is unique per owner",
  /lower\(btrim\(label\)\) = 'jay'/.test(JAY_SQL) &&
  /unique index[\s\S]{0,200}?lower\(btrim\(label\)\)/.test(ROUTE_SQL),
  "a label collision would point one owner's destinations at another's credential")
ok("…and that label is never a platform display name",
  /OUR OWN name for the account row, not a platform display name/.test(JAY_SQL))
ok("Jay's file records the rename, so the next reader knows the stale username is intentional",
  /Jay \| Dallas Apt Locator/.test(JAY_SQL) && /did NOT|does NOT refresh/i.test(JAY_SQL))

// ── 15. THE ACCOUNTS TABLE IS SERVICE-ROLE ONLY IN GRANTS, NOT ONLY IN EFFECT ────────────────
// 20261122000000 created social_buffer_accounts and its comments call it service-role only. That
// was true in EFFECT — RLS on, zero policies, neither browser role holding BYPASSRLS — but not in
// GRANTS: CREATE TABLE inherited Supabase's defaults, so anon and authenticated each held the full
// privilege set on a row that points at a Vault secret. Nothing was exposed, because every one of
// those privileges resolved to zero rows. The exposure was conditional on a future permissive
// policy, which would have turned an accident of defaults into a readable secret pointer in the
// same commit. 20261123000002 removes them.
console.log("\nthe Buffer accounts table is unreachable by the browser roles:")

const HARDEN = (() => { try { return read("supabase/prepared/20261123000002_buffer_accounts_grant_hardening.sql") } catch { return "" } })()
const HARDEN_ROLLBACK = (() => { try { return read("supabase/prepared/ROLLBACK_20261123000002_buffer_accounts_grant_hardening.sql") } catch { return "" } })()

ok("the hardening migration exists", HARDEN.length > 0)
ok("…and revokes everything from BOTH browser roles in one statement",
  /revoke all on public\.social_buffer_accounts from anon, authenticated;/.test(sql(HARDEN)),
  "revoking from one role and not the other leaves the same hole under a different name")
ok("…and names no other role, so service_role's grants cannot be stripped by it",
  !/revoke[\s\S]{0,120}?service_role/.test(sql(HARDEN)) &&
  !/revoke[\s\S]{0,120}?\bpostgres\b/.test(sql(HARDEN)))
ok("…and proves the outcome inside the transaction rather than after it",
  /raise exception[\s\S]{0,120}?still hold/.test(sql(HARDEN)) &&
  /service_role holds only/.test(sql(HARDEN)),
  "a revoke that reports success without checking is how the original defaults survived review")
ok("…and the guard requires service_role to keep all seven privileges",
  /v_service < 7/.test(sql(HARDEN)))
ok("…and it touches no schema, no data and no routing",
  !/\b(create|drop|alter|insert|update|delete|truncate)\b/i.test(sql(HARDEN).replace(/revoke[^;]*;/gi, "")),
  "hardening that also changes a column is not hardening, it is two changes in one approval")
ok("…and it is reversible", /grant select, insert, update, delete, truncate, references, trigger/.test(sql(HARDEN_ROLLBACK)))
ok("…and the rollback says why you would not want it",
  /almost certainly do not want this/i.test(HARDEN_ROLLBACK))

// The revoke is only safe because nothing reads the table directly. If a route or component ever
// selects from it with the browser client, this assertion fails and the revoke becomes a bug.
const APP_SOURCES = [WORKER, IG_WORKER, TT_WORKER, CLIENT, SERVER, ROUTE].join("\n")
ok("no application code selects from social_buffer_accounts",
  !/from\(\s*"social_buffer_accounts"/.test(APP_SOURCES),
  "the revoke assumes the only readers are the definer functions; a direct select would break")
ok("…the key reaches the worker only through the definer RPC",
  /rpc\(\s*"sa_get_buffer_destination"/.test(SERVER))
ok("…and both functions are SECURITY DEFINER, so the caller's table grants are not consulted",
  /create or replace function public\.sa_get_buffer_destination[\s\S]{0,600}?security definer/.test(sql(ROUTE_SQL)) &&
  /create or replace function public\.sa_set_buffer_api_key[\s\S]{0,600}?security definer/.test(sql(ROUTE_SQL)),
  "an invoker-rights function would have stopped working the moment the grants were revoked")

console.log(`\nBuffer publishing route: ${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
