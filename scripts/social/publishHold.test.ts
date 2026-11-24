// NEEDS-REVIEW: detection and surfacing are always live; the PUBLISH HOLD is flag-gated and OFF.
//
// The behaviour that matters most here is the default. A flag that silently defaults to blocking
// would stall the queue the first time a routine edit fired the trigger, and a stalled queue is
// much harder to notice than an extra post. So: fail-OPEN, and asserted from several directions.
//
// Run: npx tsx scripts/social/publishHold.test.ts
import { readFileSync } from "node:fs"
import path from "node:path"
import { publishHoldEnabled, shouldHoldForReview, publishHoldDecision, PUBLISH_HOLD_FLAG } from "@/lib/social/publishHold"

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
// The shared helper is now publishHoldDecision, which answers for BOTH regimes: admin rows keep
// the env-gated flag, agent rows hold unconditionally. Asserted as "the decision comes from the
// shared function with the row's flag as an input", which is what this ever meant to protect —
// the previous literal named a helper that no longer makes the decision.
ok("the hold is applied per row, through the shared helper",
  /publishHoldDecision\(\{/.test(cron) && /needsReviewAt: row\.needs_review_at/.test(cron))
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
// The render body now lives in the shared module both the admin route and the queue worker call,
// so the assertion follows it there — and this way it covers the BULK path too, not just the
// interactive one.
ok("a finished re-render clears it automatically, on both render paths",
  /needs_review_at: null/.test(read("lib/social/renderPost.ts")))
ok("the admin route delegates to that shared implementation",
  /renderPostToStorage/.test(read("app/api/admin/social-autopilot/posts/[id]/render/route.ts")))
ok("and so does the queue worker",
  /renderPostToStorage/.test(read("app/api/admin/social-autopilot/render-jobs/run/route.ts")))

// ── AN ASSIGNED PERSONAL VIDEO IS NOT A WITHDRAWN ONE ────────────────────────────────────────
//
// The three ownership states are stored across TWO columns, and the middle and last share a
// value: available_to_agents = false means "the operator's personal video" when nobody is named
// and "that person's personal video" when somebody is. The agent withdrawal rule predates the
// second column and read the false on its own, so an agent's OWN personal video was held with
// `withdrawn_from_agents` — and the hold is unconditional, with no flag to turn it off.
//
// It was Lisette's debut. A debut gates every other post on its account, so one unreadable column
// took her whole account offline, and the refusal told the operator to make the video available to
// agents again — the one thing that would un-assign it.
const HER = "27d7bde4-00f0-433c-b32b-b243623ad20a"
const HIM = "c567c077-d3f4-4532-8807-a54795f753f5"

console.log("\nan assigned personal video, at the account it is assigned to:")
ok("is NOT withdrawn, even though available_to_agents is false",
  publishHoldDecision({ isAgentOwned: true, availableToAgents: false, personalAgentUserId: HER, agentUserId: HER }, env()).hold === false)
ok("…and the same row at somebody else's agent account IS withdrawn",
  publishHoldDecision({ isAgentOwned: true, availableToAgents: false, personalAgentUserId: HER, agentUserId: HIM }, env()) .hold === true)

console.log("\nnothing else about the rule moved:")
ok("an UNASSIGNED un-shared video is still withdrawn from an agent",
  publishHoldDecision({ isAgentOwned: true, availableToAgents: false, personalAgentUserId: null, agentUserId: HER }, env()).hold === true)
ok("…and names that as the reason, not review",
  publishHoldDecision({ isAgentOwned: true, availableToAgents: false, agentUserId: HER }, env()).hold === true)
ok("a shared video is not withdrawn",
  publishHoldDecision({ isAgentOwned: true, availableToAgents: true, agentUserId: HER }, env()).hold === false)
ok("an unread availability does not withhold",
  publishHoldDecision({ isAgentOwned: true, agentUserId: HER }, env()).hold === false)
ok("the review flag still holds an agent row unconditionally, flag off",
  publishHoldDecision({ isAgentOwned: true, availableToAgents: false, personalAgentUserId: HER, agentUserId: HER, needsReviewAt: FLAGGED }, env()).hold === true)
ok("…and an ADMIN row is still governed only by the flag",
  publishHoldDecision({ isAgentOwned: false, availableToAgents: false, needsReviewAt: FLAGGED }, env()).hold === false
  && publishHoldDecision({ isAgentOwned: false, availableToAgents: false, needsReviewAt: FLAGGED }, env("true")).hold === true)
ok("the withdrawal reason is only ever reached by a row that names nobody here",
  (publishHoldDecision({ isAgentOwned: true, availableToAgents: false, agentUserId: HER }, env()) as { reason?: string }).reason === "withdrawn_from_agents")

// ── AND EVERY CALLER PASSES IT ───────────────────────────────────────────────────────────────
// A correct rule reached through four call sites that do not feed it the assignment is still the
// old bug. Each publish path is checked for both fields.
console.log("\nevery publish path feeds the rule the assignment:")
for (const [label, file] of [
  ["the Buffer worker", "app/api/cron/social-buffer-publish/route.ts"],
  ["the Instagram worker", "app/api/cron/social-instagram-publish/route.ts"],
  ["the TikTok worker", "app/api/cron/social-tiktok-publish/route.ts"],
  ["the manual Publish button", "app/api/admin/social-autopilot/posts/[id]/publish/route.ts"],
] as const) {
  const src = read(file)
  const call = src.split("publishHoldDecision({")[1]?.split("})")[0] ?? ""
  ok(`${label} passes personalAgentUserId`, /personalAgentUserId:/.test(call))
  ok(`${label} passes the destination's own agent`, /agentUserId: effectiveAgent\(/.test(call))
}

// ── AND THE TRIGGER BEHIND THE FLAG ──────────────────────────────────────────────────────────
// The database writes needs_review_at, so the rule above is only half the story. The trigger used
// to stamp it on a post's FIRST render, which is not a re-render: there was no earlier artifact to
// invalidate. Applied as 20261124000000_agent_review_not_on_first_render.sql.
console.log("\nthe trigger does not call a first render a re-render:")
const TRIGGER = read("supabase/migrations/20261124000000_agent_review_not_on_first_render.sql")
ok("it decides from the row's PREVIOUS artifact, not the new one",
  /v_had_render := old\.rendered_storage_path is not null or coalesce\(old\.render_version, 0\) > 0/.test(TRIGGER))
ok("a first render yields no reason at all",
  /then case when v_had_render then 'The video was re-rendered after you approved it\.' else null end/.test(TRIGGER))
ok("caption and hashtag changes are still judged before the render, so they are unaffected",
  TRIGGER.indexOf("new.caption  is distinct from old.caption") < TRIGGER.indexOf("v_had_render then"))
ok("a genuine re-render still clears the approval",
  /new\.approved_at := null/.test(TRIGGER))
ok("admin rows still return before any of it",
  /if v_is_agent is not true then\s*\n\s*return new;/.test(TRIGGER))
ok("the migration refuses to commit unless both halves took effect",
  /raise exception 'first-render review flags remain/.test(TRIGGER)
  && /raise exception 'the trigger function was not replaced'/.test(TRIGGER))

console.log(`\nPublish hold: ${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
