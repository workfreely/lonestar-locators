// APPROVAL ENFORCEMENT — no unapproved post may be scheduled or published.
//
// ── THE HOLE THIS CLOSES ────────────────────────────────────────────────────────────────────
// The automation's entire notion of human intent was `status='ready'`. But renderPost SETS that
// automatically when a render succeeds, so it is a MACHINE fact that every rendered post carries.
// The Video Library knew better and painted such posts amber with "RENDERED · NOT APPROVED" — yet
// the same post sat in the autopilot's eligible pool. The UI and the automation used two different
// definitions of "ready", and the automation used the weaker one.
//
// approved_at is the only column in social_posts a human sets deliberately.
//
// ── WHY FOUR LAYERS AND NOT ONE ─────────────────────────────────────────────────────────────
// Each catches a different failure:
//   predicate   the planner never proposes an unapproved post
//   claim       a post un-approved BETWEEN planning and claiming does not match the UPDATE
//   endpoints   a hand-written HTTP request cannot set a date on an unapproved post
//   worker      whatever route created the row — including SQL run by hand — it is never read
// The worker gate is the broadest and would alone prevent publication; the others exist so the
// failure surfaces early and legibly instead of as a post that silently never goes out.
//
// Run: npx tsx scripts/social/approvalGate.test.ts
import { readFileSync } from "node:fs"
import path from "node:path"
import { ineligibleReason, isEligible, ELIGIBLE_POOL_NOT_NULL, type EligibilityInput } from "../../lib/social/autopilotEligibility"
import { CLAIM_REQUIRED_NOT_NULLS } from "../../lib/social/autopilotWrite"

let pass = 0, fail = 0
const ok = (l: string, c: boolean) => { if (c) { pass++; console.log(`  ✓ ${l}`) } else { fail++; console.log(`  ✗ ${l}`) } }
const read = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8")
const code = (f: string) => read(f).replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, "")

/** A post that is perfect in every way EXCEPT approval. */
const RENDERED_UNAPPROVED: EligibilityInput = {
  status: "ready", renderStatus: "ready", renderedStoragePath: "o/c/renders/p-1.mp4",
  scheduledAt: null, publishedAt: null, externalPostId: null, connectionId: null,
  platform: "instagram", followsPostId: null, approvedAt: null,
}
const APPROVED: EligibilityInput = { ...RENDERED_UNAPPROVED, approvedAt: "2026-10-09T12:00:00Z" }

// ── 1. THE PREDICATE ────────────────────────────────────────────────────────
console.log("1. the planner will not propose an unapproved post:")
ok("a rendered-but-unapproved post is INELIGIBLE", !isEligible(RENDERED_UNAPPROVED))
ok("...and the reason names approval", ineligibleReason(RENDERED_UNAPPROVED) === "not_approved")
ok("the SAME post with approved_at set IS eligible", isEligible(APPROVED))
ok("...which proves approval is the only thing that differed", ineligibleReason(APPROVED) === null)
ok("an empty-string approved_at does not count as approval", !isEligible({ ...RENDERED_UNAPPROVED, approvedAt: "" }))
ok("an absent approvedAt field does not count either",
  !isEligible({ ...RENDERED_UNAPPROVED, approvedAt: undefined }))

// Approval does not OVERRIDE the other exclusions — it is one more gate, not a bypass.
console.log("\n   approval is an extra gate, never a bypass:")
for (const [label, patch, expect] of [
  ["an approved post with no render", { renderStatus: "none", renderedStoragePath: null }, "no_rendered_artifact"],
  ["an approved post already scheduled", { scheduledAt: "2026-10-10T12:00:00Z" }, "already_scheduled"],
  ["an approved post already published", { publishedAt: "2026-10-01T12:00:00Z" }, "already_published"],
  ["an approved post needing attention", { status: "needs_attention" }, "needs_attention"],
  ["an approved companion Story", { followsPostId: "reel-1" }, "follow_up_post"],
] as const) {
  ok(`${label} is still excluded (${expect})`, ineligibleReason({ ...APPROVED, ...patch }) === expect)
}

// ── 2. THE SERVER-SIDE POOL FILTER ──────────────────────────────────────────
console.log("\n2. the database narrows on approval too:")
ok("approved_at is in the NOT NULL pool filter", (ELIGIBLE_POOL_NOT_NULL as readonly string[]).includes("approved_at"))
{
  const route = code("app/api/admin/social-autopilot/autopilot/plan/route.ts")
  ok("the plan route's re-read SELECTS approved_at", /approved_at/.test(route))
  ok("...and maps it into the eligibility input", /approvedAt: r\.approved_at/.test(route))
}

// ── 3. THE ATOMIC CLAIM ─────────────────────────────────────────────────────
console.log("\n3. the claim re-asserts approval at the moment of the write:")
{
  const w = code("lib/social/autopilotWrite.ts")
  ok("approved_at is in CLAIM_REQUIRED_NOT_NULLS", (CLAIM_REQUIRED_NOT_NULLS as readonly string[]).includes("approved_at"))
  ok("the executor emits a NOT NULL condition", /\.not\(col, "is", null\)/.test(w))
  ok("...driven by the request, not hardcoded", /requireNotNullColumns/.test(w))
  ok("the claim is still a CONDITIONAL UPDATE, so a race is a no-match rather than a partial write",
    /\.update\(\{[\s\S]{0,260}\}\)\s*\n?\s*\.eq\("id", req\.postId\)/.test(w))
}

// ── 4. THE SCHEDULING ENDPOINTS ─────────────────────────────────────────────
console.log("\n4. no HTTP route can set a date on an unapproved post:")
{
  const post = code("app/api/admin/social-autopilot/posts/[id]/route.ts")
  const auto = code("app/api/admin/social-autopilot/posts/[id]/autoschedule/route.ts")
  const pub = code("app/api/admin/social-autopilot/posts/[id]/publish/route.ts")

  ok("intent:'schedule' checks approval", /intent === "schedule"[\s\S]{0,700}not_approved/.test(post))
  ok("...reading it FRESH rather than trusting the earlier row",
    /intent === "schedule"[\s\S]{0,600}select\("approved_at"\)/.test(post))
  ok("the bare scheduledAt path checks it too", (post.match(/not_approved/g) ?? []).length >= 2)
  ok("auto-placement checks it", /not_approved/.test(auto) && /approved_at/.test(auto))
  ok("the MANUAL publish button checks it as well — no exempt door", /not_approved/.test(pub))
  ok("...and selects the column it checks", /destination, approved_at,/.test(pub))

  // UNSCHEDULING must stay open: it only ever removes risk.
  ok("clearing a date is NOT gated", /patch\.scheduled_at = null/.test(post))
  ok("...and unschedule still exists", /intent === "unschedule"/.test(post))
}

// ── 5. THE WORKER ───────────────────────────────────────────────────────────
console.log("\n5. the publish worker never even reads an unapproved post:")
{
  const cron = code("app/api/cron/social-instagram-publish/route.ts")
  ok("the DUE QUERY filters on approval", /\.lte\("scheduled_at", now\)[\s\S]{0,200}\.not\("approved_at", "is", null\)/.test(cron))
  ok("...and selects the column", /select\("id, needs_review_at[^"]*approved_at/.test(cron))
  ok("the CLAIM re-asserts it", /\.eq\("status", "scheduled"\)[\s\S]{0,220}\.not\("approved_at", "is", null\)/.test(cron))
  ok("a per-row guard reports the skip", /if \(!row\.approved_at\)[\s\S]{0,120}skippedNotApproved\+\+/.test(cron))
  ok("...and the counter is in the run result", /skippedNotApproved: 0/.test(cron))
}

// ── 6. NOTHING ELSE CHANGED ─────────────────────────────────────────────────
console.log("\n6. duplicate prevention, retries and history are untouched:")
{
  const cron = code("app/api/cron/social-instagram-publish/route.ts")
  ok("claim 1 still guards on status + null external id", /\.eq\("status", "scheduled"\)[\s\S]{0,300}\.is\("external_post_id", null\)/.test(cron))
  ok("the media-publish claim still exists", /media_publish_claimed_at/.test(code("lib/social/instagramFinalize.ts")))
  ok("reconcile-never-retry is intact", /reconcileOnly/.test(code("lib/social/instagramFinalize.ts")))
  ok("the review hold is untouched", /shouldHoldForReview|publishHold/.test(cron))
  {
    // The eligibility module is PURE: it decides, it never writes. `published_at: null` appears in
    // it as a read FILTER (exclude already-published posts), which an earlier version of this
    // assertion wrongly flagged as a write — the check now looks for writes, not for the column.
    const elig = code("lib/social/autopilotEligibility.ts")
    ok("the eligibility module performs no writes at all",
      !/\.update\(|\.insert\(|\.upsert\(|\.delete\(/.test(elig))
    ok("...and it still EXCLUDES already-published posts from the pool", /published_at: null/.test(elig))
  }
}

// ── 7. END TO END, MODELLED ─────────────────────────────────────────────────
console.log("\n7. the gauntlet: an unapproved post against every layer:")
{
  type Row = { status: string; renderStatus: string; approvedAt: string | null; scheduledAt: string | null }
  const unapproved: Row = { status: "ready", renderStatus: "ready", approvedAt: null, scheduledAt: null }

  const planner = (r: Row) => isEligible({ ...RENDERED_UNAPPROVED, approvedAt: r.approvedAt })
  const scheduleEndpoint = (r: Row) => !!r.approvedAt
  const claim = (r: Row) => r.status === "ready" && !!r.approvedAt
  const dueQuery = (r: Row) => r.status === "scheduled" && !!r.approvedAt
  const workerRow = (r: Row) => !!r.approvedAt

  ok("planner refuses it", !planner(unapproved))
  ok("schedule endpoint refuses it", !scheduleEndpoint(unapproved))
  ok("claim refuses it", !claim(unapproved))
  ok("due query never returns it", !dueQuery({ ...unapproved, status: "scheduled" }))
  ok("worker row guard refuses it", !workerRow(unapproved))

  // The nastiest case: approval revoked AFTER scheduling (a re-render clears approved_at).
  const scheduledThenRevoked: Row = { status: "scheduled", renderStatus: "ready", approvedAt: null, scheduledAt: "2026-10-10T12:00:00Z" }
  ok("a post scheduled while approved, then UN-approved, is dropped by the due query",
    !dueQuery(scheduledThenRevoked))
  ok("...and by the claim even if it were read", !claim({ ...scheduledThenRevoked, status: "ready" }))

  // And the happy path still works end to end.
  const good: Row = { status: "ready", renderStatus: "ready", approvedAt: "2026-10-09T12:00:00Z", scheduledAt: null }
  ok("an APPROVED post passes every layer",
    planner(good) && scheduleEndpoint(good) && claim(good) && dueQuery({ ...good, status: "scheduled" }) && workerRow(good))
}

console.log(`\nApproval gate: ${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
