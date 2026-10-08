// NEEDS-REVIEW: detection and surfacing are always live; the PUBLISH HOLD is flag-gated and OFF.
//
// The behaviour that matters most here is the default. A flag that silently defaults to blocking
// would stall the queue the first time a routine edit fired the trigger, and a stalled queue is
// much harder to notice than an extra post. So: fail-OPEN, and asserted from several directions.
//
// Run: npx tsx scripts/social/publishHold.test.ts
import { readFileSync } from "node:fs"
import path from "node:path"
import { publishHoldEnabled, shouldHoldForReview, PUBLISH_HOLD_FLAG } from "@/lib/social/publishHold"

let pass = 0, fail = 0
const ok = (l: string, c: boolean) => { if (c) { pass++; console.log(`  ✓ ${l}`) } else { fail++; console.log(`  ✗ ${l}`) } }
const read = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8")
const env = (v?: string) => (v === undefined ? {} : { [PUBLISH_HOLD_FLAG]: v }) as NodeJS.ProcessEnv
const FLAGGED = "2026-10-08T12:00:00.000Z"

console.log("the flag is OFF unless set to exactly 'true':")
ok("unset  -> off", !publishHoldEnabled(env()))
ok("empty  -> off", !publishHoldEnabled(env("")))
ok("'TRUE' -> off (case matters)", !publishHoldEnabled(env("TRUE")))
ok("'1'    -> off", !publishHoldEnabled(env("1")))
ok("'yes'  -> off", !publishHoldEnabled(env("yes")))
ok("'false'-> off", !publishHoldEnabled(env("false")))
ok("'true' -> ON", publishHoldEnabled(env("true")))
ok("' true ' (padded) -> ON, trimmed", publishHoldEnabled(env(" true ")))

console.log("\nwith the hold OFF — the default — a flagged post still publishes:")
ok("a flagged post is NOT held", !shouldHoldForReview(FLAGGED, env()))
ok("an unflagged post is not held either", !shouldHoldForReview(null, env()))
ok("undefined review state is not held", !shouldHoldForReview(undefined, env()))

console.log("\nwith the hold ON, only a FLAGGED post is held:")
ok("flagged -> held", shouldHoldForReview(FLAGGED, env("true")))
ok("unflagged -> publishes", !shouldHoldForReview(null, env("true")))
ok("empty string review state -> publishes", !shouldHoldForReview("", env("true")))

console.log("\nboth publish paths consult the same gate — the manual button is not a way around it:")
const cron = read("app/api/cron/social-instagram-publish/route.ts")
const manual = read("app/api/admin/social-autopilot/posts/[id]/publish/route.ts")
ok("the cron worker imports the shared gate", /from "@\/lib\/social\/publishHold"/.test(cron))
ok("the manual publish route imports it too", /from "@\/lib\/social\/publishHold"/.test(manual))
ok("neither reimplements the env check", !/SOCIAL_PUBLISH_HOLD_ON_REVIEW_ENABLED/.test(cron) && !/SOCIAL_PUBLISH_HOLD_ON_REVIEW_ENABLED/.test(manual))
// The due query must NOT filter on the column: a query-level filter would hold unconditionally,
// ignoring the flag, and would also drop the post from the run's accounting.
ok("the due query does NOT filter rows out by review state",
  !/\.is\("needs_review_at", null\)/.test(cron))
ok("the hold is applied per row, through the shared helper", /shouldHoldForReview\(row\.needs_review_at/.test(cron))
ok("held rows are counted rather than vanishing", /result\.heldForReview\+\+/.test(cron))
ok("flagged rows are counted even when the hold is off", /result\.flaggedForReview = /.test(cron))
ok("the log says which mode it is in", /hold is OFF/.test(cron) && /HELD, not publishing/.test(cron))

console.log("\nnothing is time-based:")
for (const [label, f] of [["publishHold", "lib/social/publishHold.ts"], ["cron worker", "app/api/cron/social-instagram-publish/route.ts"]] as const) {
  const src = read(f)
  ok(`${label} never compares against updated_at`, !/updated_at\s*[<>]/.test(src))
  // Narrow on purpose: the worker legitimately discusses EXPIRED TOKENS, which is unrelated to
  // content freshness. What must not exist is an age threshold applied to posts or source data.
  ok(`${label} has no content-age threshold constant`,
    !/MAX_AGE_DAYS|STALE_AFTER|CONTENT_EXPIR|FRESHNESS_|MAX_CONTENT_AGE/i.test(src))
}
const mig = read("supabase/migrations/20261007000005_scheduled_post_needs_review.sql")
ok("the trigger fires on CHANGE, not on age", /is distinct from/.test(mig) && !/interval/.test(mig))
ok("only price/special/label changes are considered",
  /new\.budget_range/.test(mig) && /new\.special/.test(mig) && /new\.price_label_mode/.test(mig))
ok("evergreen posts are excluded by the overlay/caption test",
  /overlay_subheadline/.test(mig) && /position\(old\.special in p\.caption\)/.test(mig))
ok("only scheduled, unpublished rows are flagged",
  /p\.status = 'scheduled'/.test(mig) && /p\.published_at is null/.test(mig))

console.log("\nthe review state is visible and clearable:")
const editor = read("components/crm/social/PostEditor.tsx")
const patchRoute = read("app/api/admin/social-autopilot/posts/[id]/route.ts")
ok("the editor renders a review notice", /Needs review — source data changed after scheduling/.test(editor))
ok("it shows the stored reason", /needsReview\.reason/.test(editor))
ok("it says publishing is NOT blocked today", /will still publish/.test(editor))
ok("it offers a Clear review action", /intent: "clear_review"/.test(editor))
ok("the API accepts that intent", /intent === "clear_review"/.test(patchRoute))
ok("clearing touches ONLY the review columns — never status or schedule",
  /intent === "clear_review"[\s\S]{0,320}?patch\.needs_review_reason = null/.test(patchRoute)
  && !/intent === "clear_review"[\s\S]{0,320}?patch\.status/.test(patchRoute))
ok("the GET exposes the flag so the editor can show it", /needsReviewAt: r\.needs_review_at/.test(patchRoute))
ok("a finished re-render clears it automatically",
  /needs_review_at: null/.test(read("app/api/admin/social-autopilot/posts/[id]/render/route.ts")))

console.log(`\nPublish hold: ${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
