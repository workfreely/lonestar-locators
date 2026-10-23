// PUBLISH NOW — the control that actually sends a post to Instagram, next to the green Publish
// that hands it to the scheduler.
//
// Two things have to stay true and neither is visible by reading the button:
//   1. The SCHEDULING path is untouched. Publish still means "next available slot".
//   2. A second click cannot produce a second Reel. The guarantee is the claim's WHERE clause, not
//      the disabled prop, so that is what is asserted.
import { readFileSync } from "node:fs"

let pass = 0
let fail = 0
function ok(name: string, cond: boolean, detail = "") {
  if (cond) { pass++; console.log(`  ✓ ${name}`) }
  else { fail++; console.log(`  ✗ ${name}${detail ? `  — ${detail}` : ""}`) }
}
const read = (p: string) => readFileSync(p, "utf8")
/** Source with comments stripped, so no assertion can be satisfied by prose. */
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "")

const ROUTE_PATH = "app/api/admin/social-autopilot/posts/[id]/publish/route.ts"
const STATUS_PATH = "app/api/admin/social-autopilot/posts/[id]/publish/status/route.ts"
const EDITOR_PATH = "components/crm/social/PostEditor.tsx"
const route = code(read(ROUTE_PATH))
const status = code(read(STATUS_PATH))
const editor = code(read(EDITOR_PATH))

console.log("the comment strippers work (prose cannot satisfy an assertion):")
ok("route", !route.includes("WHY 'scheduled' IS ACCEPTED"))
ok("editor", !editor.includes("DOUBLE-CLICK CANNOT DOUBLE-PUBLISH"))

// ── 1. THE SCHEDULING PATH IS UNTOUCHED ───────────────────────────────────────────────────────
console.log("\nthe green Publish still schedules, and nothing else changed about it:")
ok("publish() still ends in autoSchedule()", /await\s+autoSchedule\(\)/.test(editor))
ok("publish() does NOT call the publish endpoint",
  !/const publish = async[\s\S]{0,900}?\/publish['"`]/.test(editor),
  "the scheduling button must never hit the Instagram route")
ok("the autoschedule route is unmodified in this change",
  /intent:\s*"schedule"/.test(editor) && /backToDraft/.test(editor))
ok("Publish Now is a SEPARATE handler", /const publishNow = async/.test(editor))
ok("…calling the existing publish endpoint", /\/publish['"`],\s*\{\s*method:\s*"POST"/.test(editor))
ok("…and polling the existing status endpoint", /\/publish\/status/.test(editor))
ok("it adds no publishing logic of its own — no container/media calls in the client",
  !/createReelContainer|media_publish|graph\.(instagram|facebook)/.test(editor))
// Scoped to the FUNCTION BODY, not to a character window from its name. A fixed window spills past
// the end of the function as soon as anything is added after it and then matches a neighbour's
// perfectly legitimate save — which is exactly what happened when the resume path landed.
const publishNowBody = editor.match(/const publishNow = async[\s\S]*?\n  \}/)?.[0] ?? ""
ok("the publishNow body can be isolated", publishNowBody.length > 0)
ok("it does not save or patch before publishing (a save can invalidate the render)",
  !/patchSource\(\)|intent:\s*"save_draft"|method:\s*"PATCH"|\/render/.test(publishNowBody),
  "a pre-publish save could set render_status to none and trigger a re-render")

// ── 2. DUPLICATE PUBLICATION ──────────────────────────────────────────────────────────────────
console.log("\na second click cannot publish twice:")
const claim = route.match(/\.update\(\{\s*status:\s*"publishing"[\s\S]{0,600}?maybeSingle\(\)/)?.[0] ?? ""
ok("the claim exists", claim.length > 0)
ok("it is conditioned on the status it moves OUT of", /\.in\(\s*"status",\s*\[\s*"ready",\s*"scheduled"\s*\]\s*\)/.test(claim),
  "without this the UPDATE would match an already-publishing row")
ok("…and on not being published yet", /\.is\(\s*"external_post_id",\s*null\s*\)/.test(claim))
ok("a failed claim aborts rather than continuing", /if\s*\(!claimed\)\s*return[^\n]*not_claimable/.test(route))
ok("media_publish is single-flighted by the SHARED finaliser, not re-implemented",
  /finalizeInstagramPublish/.test(status) && !/media_publish/.test(editor))
ok("the button is also disabled while in flight (a courtesy, not the guarantee)",
  /disabled=\{[^}]*publishingNow[^}]*\}[^>]*onClick=\{\(\) => void publishNow\(\)\}/.test(editor))
ok("the handler re-entrancy-guards itself", /if\s*\(busy \|\| publishing \|\| publishingNow \|\| previewing\)\s*return/.test(editor))

// ── 3. THE ROUTE'S SAFEGUARDS ARE ALL STILL THERE ─────────────────────────────────────────────
console.log("\nevery pre-claim guard survives:")
for (const [name, re] of [
  ["platform admin", /requirePlatformAdmin\(\)/],
  ["already published", /already_published/],
  ["instagram only", /unsupported_platform/],
  ["current render", /render_status !== "ready" \|\| !p\.rendered_storage_path/],
  ["approved", /not_approved/],
  ["has a destination", /no_destination/],
  ["publish hold", /decision\.hold/],
  ["destination connected / not paused / token valid", /destination_unavailable/],
  ["ownership", /dest\.owner_user_id !== userId/],
] as [string, RegExp][]) ok(name, re.test(route))
ok("a post that is neither ready nor scheduled is refused", /not_publishable/.test(route))
ok("the token is resolved server-side via the RPC, never in the browser",
  /sa_get_instagram_token_by_connection/.test(route) && !/sa_get_instagram_token/.test(editor))

// ── 4. SCHEDULED → PUBLISHING IS AN EXISTING TRANSITION, NOT A NEW ONE ────────────────────────
console.log("\naccepting a scheduled post is the transition the worker already makes:")
const cron = code(read("app/api/cron/social-instagram-publish/route.ts"))
ok("the cron also claims scheduled → publishing", /"publishing"/.test(cron) && /"scheduled"/.test(cron))
ok("both paths share finalizeInstagramPublish for media_publish",
  /finalizeInstagramPublish/.test(cron) && /finalizeInstagramPublish/.test(status))
ok("the claim clears scheduled_at so a half-finished publish cannot be re-picked later",
  /scheduled_at:\s*null/.test(claim))

// ── 5. THE SAFETY SWITCHES ARE NOT TOUCHED ────────────────────────────────────────────────────
console.log("\nno global switch is read, written or required:")
ok("the publish route still ignores SOCIAL_INSTAGRAM_AUTOPUBLISH_ENABLED", !/AUTOPUBLISH_ENABLED/.test(route))
ok("…and still ignores auto_posting", !/auto_posting|readAutoPosting/.test(route))
ok("the cron still REQUIRES both (unchanged)", /AUTOPUBLISH_ENABLED/.test(cron) && /readAutoPosting|auto_posting/.test(cron))
ok("the client touches no env flag", !/AUTOPUBLISH|auto_posting/.test(editor))

// ── 6. VISIBILITY ─────────────────────────────────────────────────────────────────────────────
console.log("\nthe control only appears when it would actually work:")
const elig = editor.match(/const canPublishNow =[\s\S]{0,400}?externalPostUrl/)?.[0] ?? ""
ok("eligibility is computed", elig.length > 0)
for (const [name, re] of [
  ["instagram only", /platform === "instagram"/],
  ["status ready or scheduled", /status === "ready"[\s\S]{0,40}status === "scheduled"/],
  ["render is current", /renderStatus === "ready"/],
  ["approved", /approvedAt/],
  ["not already published", /!post\?\.externalPostUrl/],
] as [string, RegExp][]) ok(name, re.test(elig))
ok("the button is gated on it", /\{canPublishNow && \(/.test(editor))
ok("it is confirmed before firing", /window\.confirm\(/.test(editor))

console.log(`\nPublish Now: ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
