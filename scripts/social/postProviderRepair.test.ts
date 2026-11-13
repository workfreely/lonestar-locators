// A POST'S NETWORK IS ITS DESTINATION'S, NOT A SECOND COLUMN'S.
//
// ── THE DEFECT ──────────────────────────────────────────────────────────────────────────────
// social_posts carries both `destination` (the surface, which resolves the safe area and so the
// geometry) and `platform` (the legacy network column). The editor's destination control wrote
// `destination` and deliberately left `platform` alone, on the stated grounds that every GEOMETRY
// path reads the destination once one exists.
//
// That was true, and the conclusion was still wrong: the PLANNER is not a geometry path. It
// grouped by `platform`, so a post pointed at TikTok stayed in the Instagram rotation, was
// assigned to an Instagram connection, and was then refused by the Instagram worker at its
// publishability gate — tiktok_video is `awaiting_approval` — and failed to needs_attention.
//
// Production carries SIX such rows, created 2026-10-12 to 2026-11-09: the MAJORITY of
// TikTok-destined posts (six against four consistent). It is what the destination control
// produces, not an accident that happened once.
//
// ── THREE FIXES, EACH DOING A DIFFERENT JOB ─────────────────────────────────────────────────
//   providerOf          the planner derives the network from the destination → the mismatch is
//                       HARMLESS, including for rows nobody repairs
//   the destination PATCH writes the provider alongside the destination → the mismatch is
//                       IMPOSSIBLE to create again
//   20261115000004      the six existing rows are repaired → the mismatch is GONE
//
// Run: npx tsx scripts/social/postProviderRepair.test.ts
import { readFileSync } from "node:fs"
import { execSync } from "node:child_process"
import { providerOf, ineligibleReason, isEligible } from "@/lib/social/autopilotEligibility"
import { planAutopilot, type AutopilotRule, type PoolPost } from "@/lib/social/autopilotPlanner"
import { DESTINATIONS, isSocialDestination, type SocialDestination } from "@/lib/social/destinations"
import { dailyTimesForPostsPerDay, BASELINE_DAILY_TIMES } from "@/lib/social/autopilotDestination"
import { wallClockToUtcISO, DEFAULT_TIMEZONE } from "@/lib/social/recurrence"

let pass = 0, fail = 0
const ok = (what: string, cond: boolean, detail = "") => {
  if (cond) { pass++; console.log(`  ✓ ${what}`) } else { fail++; console.log(`  ✗ ${what}${detail ? ` — ${detail}` : ""}`) }
}
const eq = (what: string, got: unknown, want: unknown) =>
  ok(what, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`)

const read = (p: string) => readFileSync(`${process.cwd()}/${p}`, "utf8")
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1")
const sqlOf = (s: string) => s.replace(/--[^\n]*/g, "")

const PREPARED = "supabase/prepared"
const REPAIR = "20261115000004_post_provider_matches_destination"
const ELIG = code(read("lib/social/autopilotEligibility.ts"))
const PATCH = code(read("app/api/admin/social-autopilot/posts/[id]/route.ts"))
const PLAN_RUN = code(read("lib/social/autopilotPlanRun.ts"))

// ── 1. WHICH NETWORK A POST BELONGS TO ────────────────────────────────────────────────────────
console.log("providerOf — the destination decides, and the registry is the source:")
{
  eq("instagram_reel → instagram", providerOf({ platform: "instagram", destination: "instagram_reel" }), "instagram")
  eq("instagram_story → instagram", providerOf({ platform: "instagram", destination: "instagram_story" }), "instagram")
  eq("tiktok_video → tiktok", providerOf({ platform: "tiktok", destination: "tiktok_video" }), "tiktok")
  eq("tiktok_story → tiktok", providerOf({ platform: "tiktok", destination: "tiktok_story" }), "tiktok")

  // THE DEFECT, as a test: the destination wins over a stale platform column.
  eq("tiktok_video with platform=instagram → TIKTOK, not instagram",
    providerOf({ platform: "instagram", destination: "tiktok_video" }), "tiktok")
  eq("…and the reverse, for symmetry",
    providerOf({ platform: "tiktok", destination: "instagram_reel" }), "instagram")

  // LEGACY ROWS ARE UNMOVED. A null destination falls back exactly as every other
  // destination-aware path in the codebase does, so nothing about those rows changes.
  eq("a null destination falls back to the platform", providerOf({ platform: "tiktok", destination: null }), "tiktok")
  eq("…and to instagram for an instagram row", providerOf({ platform: "instagram", destination: null }), "instagram")
  eq("…and an absent destination behaves the same", providerOf({ platform: "tiktok" }), "tiktok")
  eq("an unrecognised destination falls back to the platform too",
    providerOf({ platform: "tiktok", destination: "youtube_short" }), "tiktok")
  eq("…and a null platform with no destination is instagram, the historical default",
    providerOf({ platform: null, destination: null }), "instagram")

  // EVERY destination in the registry agrees with the registry — no hand-written mapping.
  for (const d of Object.keys(DESTINATIONS) as SocialDestination[]) {
    eq(`${d} resolves to its registered provider`,
      providerOf({ platform: "whatever", destination: d }), DESTINATIONS[d].provider)
  }
  ok("the predicate reads providerOf rather than comparing platform directly",
    /if \(providerOf\(p\) !== platform\) return "wrong_platform"/.test(ELIG)
    && !/p\.platform !== platform/.test(ELIG))
}

console.log("\n…and the eligibility predicate places a post by it:")
{
  const base = {
    status: "ready", renderStatus: "ready", renderedStoragePath: "p/x.mp4", scheduledAt: null,
    publishedAt: null, externalPostId: null, connectionId: null, approvedAt: "2026-10-01T00:00:00Z",
  }
  const mismatched = { ...base, platform: "instagram", destination: "tiktok_video" }
  eq("the mismatched post is WRONG for the instagram group", ineligibleReason(mismatched, "instagram"), "wrong_platform")
  eq("…and ELIGIBLE for the tiktok group", ineligibleReason(mismatched, "tiktok"), null)
  ok("…which is the opposite of what it used to be", isEligible(mismatched, "tiktok") && !isEligible(mismatched, "instagram"))
  const normal = { ...base, platform: "instagram", destination: "instagram_reel" }
  eq("a normal Instagram post is unchanged — eligible for instagram", ineligibleReason(normal, "instagram"), null)
  eq("…and wrong for tiktok", ineligibleReason(normal, "tiktok"), "wrong_platform")
  const legacy = { ...base, platform: "instagram", destination: null }
  eq("a legacy row with no destination is still an Instagram row", ineligibleReason(legacy, "instagram"), null)
}

// ── 2. THE PLANNER ROUTES IT TO THE RIGHT ROTATION ───────────────────────────────────────────
console.log("\nTHE PLANNER — a mismatched post now joins the TikTok rotation:")
{
  const READY = {
    status: "ready", renderStatus: "ready", renderedStoragePath: "p/x.mp4", scheduledAt: null,
    publishedAt: null, externalPostId: null, connectionId: null, approvedAt: "2026-10-01T00:00:00Z",
  }
  const post = (id: string, platform: string, destination: string | null): PoolPost =>
    ({ id, sourceContentId: `src-${id}`, placeId: `place-${id}`, market: "Dallas", propertyName: id, ...READY, platform, destination })

  const rule = (connectionId: string, platform: string): AutopilotRule => ({
    connectionId, platform, enabled: true, timezone: DEFAULT_TIMEZONE,
    dailyTimes: dailyTimesForPostsPerDay(2), postsPerDay: 2, marketWeights: {},
    allowedMarkets: null, marketRotationSeed: null, staggerOffsetMinutes: 0, startIndex: 0,
  })

  const pool = [
    post("ig-1", "instagram", "instagram_reel"),
    post("ig-2", "instagram", "instagram_reel"),
    // THE DRAKE WHITE ROCK's shape: pointed at TikTok, platform never updated.
    post("mismatched", "instagram", "tiktok_video"),
    post("tt-1", "tiktok", "tiktok_video"),
  ]
  const p = planAutopilot({
    rules: [rule("conn-ig", "instagram"), rule("conn-tt", "tiktok")],
    pool, startDateKey: "2026-11-16", wallClockToUtc: wallClockToUtcISO, maxDays: 2,
  })
  const on = (id: string) => p.planned.filter((x) => x.connectionId === id).map((x) => x.postId)
  ok("the mismatched post is scheduled on the TIKTOK connection", on("conn-tt").includes("mismatched"),
    JSON.stringify(on("conn-tt")))
  ok("…and never on the Instagram connection", !on("conn-ig").includes("mismatched"),
    JSON.stringify(on("conn-ig")))
  ok("the Instagram connection still gets its own posts", on("conn-ig").some((id) => id.startsWith("ig-")))
  ok("…and only its own", on("conn-ig").every((id) => id.startsWith("ig-")))
  ok("the TikTok connection gets only TikTok-destined posts",
    on("conn-tt").every((id) => id === "mismatched" || id.startsWith("tt-")))
  eq("nothing was excluded as wrong_platform overall, because both groups exist",
    p.excluded.filter((e) => e.reason === "wrong_platform"), [])

  // And the pool query has to fetch the column the predicate now reads, or every post looks legacy.
  ok("the pool query selects destination", /POOL_SELECT =\s*\n?\s*"id, platform, destination,/.test(PLAN_RUN))
  ok("…the pool mapper carries it", /destination: \(r\.destination as string \| null\) \?\? null/.test(PLAN_RUN))
  ok("…and the pre-claim re-read carries it too, so the claim sees the same post",
    /connection_id, platform, destination, approved_at/.test(PLAN_RUN)
    && /destination: r\.destination as string \| null/.test(PLAN_RUN))
}

// ── 3. IT CANNOT BE CREATED AGAIN ────────────────────────────────────────────────────────────
console.log("\nTHE DESTINATION CONTROL — the provider now follows the destination:")
{
  ok("the PATCH writes the provider from the registry",
    /patch\.platform = DESTINATIONS\[body\.destination\]\.provider/.test(PATCH))
  ok("…in the same branch as the destination, so they cannot be written apart",
    /patch\.destination = body\.destination[\s\S]{0,1400}patch\.platform = DESTINATIONS\[body\.destination\]\.provider/.test(PATCH))
  ok("…still refused on a published post, as before", /!isPublished/.test(PATCH))
  ok("…and still only for a recognised destination", /isSocialDestination\(body\.destination\)/.test(PATCH))
  // RENDER INVALIDATION IS UNCHANGED: destination is render-affecting and platform is not, so
  // adding the platform write cannot invalidate a render that the destination change did not
  // already invalidate.
  const inval = read("lib/social/renderInvalidation.ts")
  ok("destination is still render-affecting", /"destination",/.test(inval))
  ok("…and platform still is not, so nothing new invalidates a render", !/"platform",/.test(inval))
}

// ── 4. THE REPAIR ────────────────────────────────────────────────────────────────────────────
console.log("\nTHE REPAIR — one column, unpublished rows only:")
{
  const sql = sqlOf(read(`${PREPARED}/${REPAIR}.sql`))
  // The migration's destination→provider table must agree with the registry, or it would silently
  // skip rows for a surface it has not heard of.
  const rows = [...sql.matchAll(/\('([a-z_]+)',\s*'([a-z]+)'\)/g)].map((m) => [m[1], m[2]] as const)
  eq("the migration's mapping covers every destination in the registry",
    rows.map(([d]) => d).sort(), Object.keys(DESTINATIONS).sort())
  for (const [d, provider] of rows) {
    ok(`…and maps ${d} to the registry's provider`,
      isSocialDestination(d) && DESTINATIONS[d].provider === provider)
  }

  ok("it writes platform and updated_at, and nothing else",
    /set platform = d\.provider,\s*\n\s*updated_at = now\(\)/.test(sql))
  // Scoped to the SET LIST — everything between `set` and the `from` that follows it. The join
  // predicate below legitimately names `destination`, which an "anywhere after set" test counts.
  const setList = sql.slice(sql.indexOf("set platform = d.provider"), sql.indexOf("from _dest_provider d"))
  ok("the SET list was located", setList.includes("platform") && setList.length < 200)
  for (const col of ["caption", "hashtags", "overlay_", "rendered_storage_path", "render_status",
    "scheduled_at", "approved_at", "connection_id", "source_content_id", "destination"]) {
    ok(`the SET list never assigns ${col}`, !setList.includes(col))
  }
  // PUBLISHED ROWS ARE HISTORY.
  ok("it excludes published rows, both ways of being published",
    /published_at is null/.test(sql) && /external_post_id is null/.test(sql))
  ok("it is idempotent — the WHERE clause is the condition it corrects",
    /platform is distinct from d\.provider/.test(sql))
  ok("it runs in one transaction", /^begin;/m.test(sql) && /^commit;/m.test(sql))
  ok("it reports what it changed", /_repaired/.test(sql) && /rows_repaired/.test(sql))
  ok("…in a TEMPORARY table, so it creates no permanent object",
    /create temporary table _repaired/.test(sql) && /on commit drop/.test(sql))
  for (const [what, re] of [
    ["no DDL on a real table", /alter table public\.|create table public\.|drop table/i],
    ["no index, policy or trigger", /create (unique )?index|create policy|create (or replace )?trigger/i],
    ["no function is defined", /create or replace function/i],
    ["no row is deleted or inserted into social_posts", /delete from public\.social_posts|insert into public\.social_posts/i],
  ] as const) {
    ok(what, !re.test(sql))
  }

  const verify = sqlOf(read(`${PREPARED}/${REPAIR}.verify.sql`)).replace(/'(?:[^']|'')*'/g, "''")
  ok("the verification writes nothing", !/\b(insert|update|delete|alter|create|drop|grant|revoke)\b/i.test(verify))
  ok("…and checks the destination vocabulary is one it knows, so a new surface is not skipped silently",
    /an unknown destination is in use/.test(read(`${PREPARED}/${REPAIR}.verify.sql`)))

  const rollback = read(`${PREPARED}/ROLLBACK_${REPAIR}.sql`)
  ok("the rollback is honest that there is nothing to roll back to",
    /THERE IS NOTHING TO ROLL BACK TO/.test(rollback))
  ok("…lists the six rows' pre-repair values so an undo is possible at all",
    (rollback.match(/was platform=instagram/g) ?? []).length === 6)
  ok("…and is a no-op as written, so reintroducing the defect takes a deliberate edit",
    /is a no-op as written/.test(rollback) && !/^\s*update public\.social_posts/m.test(rollback))
}

// ── 5. THE DALLAS ENQUEUE TOOL ───────────────────────────────────────────────────────────────
console.log("\nTHE RENDER ENQUEUE TOOL — one market, by id, and it cannot approve:")
{
  const tool = read("scripts/social/dallasRenderEnqueue.ts")
  const toolCode = code(tool)
  ok("dry run is the default; writing takes --confirm", /const CONFIRM = process\.argv\.includes\("--confirm"\)/.test(toolCode))
  ok("the market defaults to Dallas and is validated against the real market list",
    /arg\("market"\) \?\? "Dallas"/.test(toolCode) && /SOCIAL_MARKETS\.some/.test(toolCode))
  ok("it targets only unrendered drafts", /\.eq\("status", "draft"\)/.test(toolCode) && /\.eq\("render_status", "none"\)/.test(toolCode))
  ok("…that are neither published nor scheduled",
    /\.is\("published_at", null\)/.test(toolCode) && /\.is\("scheduled_at", null\)/.test(toolCode))
  ok("it filters to one market, case-insensitively",
    /market \?\? ""\)\.trim\(\)\.toLowerCase\(\) === MARKET\.toLowerCase\(\)/.test(toolCode))
  ok("it has a cap, like the endpoint", /Math\.min\(Number\(arg\("limit"\)\) \|\| 50, 500\)/.test(toolCode))
  // THE REFUSAL is the point: the ids and the check that they are the right ids travel together.
  ok("it re-checks every selected post and REFUSES on any surprise",
    /REFUSING/.test(toolCode) && /process\.exit\(1\)/.test(toolCode))
  ok("…including a post that is already approved", /already approved/.test(tool))
  ok("it says what it is NOT selecting", /NOT selected \(other markets\)/.test(tool))
  ok("it uses the SAME enqueue function the endpoint uses, not a second path",
    /enqueueRenderJobs\(supabaseAdmin, selected/.test(toolCode)
    && /from "\.\.\/\.\.\/lib\/social\/renderJobs"/.test(toolCode))
  // APPROVAL, RENDERING AND PUBLISHING ARE ALL OUT OF BOUNDS. Stated as the ACTIONS it must not
  // take — it reads approved_at, scheduled_at and published_at on purpose, to refuse such posts.
  ok("it never WRITES to social_posts at all", !/\.from\("social_posts"\)[\s\S]{0,400}\.(update|insert|upsert|delete)\(/.test(toolCode))
  for (const forbidden of ["approved_at:", "approved:", "renderPostToStorage", "scheduled_at:",
    "initTikTokDirectPost", "createReelContainer", "finalizeInstagramPublish"]) {
    ok(`…and never calls or sets ${forbidden}`, !toolCode.includes(forbidden))
  }
}

// ── 6. THE TIKTOK SIBLING WORKFLOW, AS VERIFIED ──────────────────────────────────────────────
console.log("\nTHE SIBLING WORKFLOW — what it is, and what blocks it:")
{
  const sib = read("lib/social/tiktokSibling.ts")
  const sibCode = code(sib)
  // It sets BOTH columns correctly, which is why wiring it is the right way to create TikTok
  // inventory rather than switching an Instagram post's destination.
  ok("the sibling sets platform AND destination together",
    /platform: "tiktok",\s*\n\s*destination: "tiktok_video",/.test(sibCode))
  ok("…starts with NO render, because TikTok's geometry differs",
    /rendered_storage_path: null,\s*\n\s*render_status: "none",/.test(sibCode))
  ok("…and starts unapproved, unscheduled and unassigned",
    /approved_at: null,/.test(sibCode) && /scheduled_at: null,/.test(sibCode) && /connection_id: null,/.test(sibCode))
  ok("…is not a Story companion: no follows_post_id", /follows_post_id: null,/.test(sibCode))
  ok("approval is its gate", /if \(!row\.approved_at\) return \{ ok: false, reason: "not_approved" \}/.test(sibCode))
  ok("it refuses a Story, a TikTok row and a non-reel",
    /if \(row\.follows_post_id\)/.test(sibCode) && /spec\.provider === "tiktok"/.test(sibCode) && /spec\.surface !== "reel"/.test(sibCode))
  ok("it touches nothing on the Instagram original", !/update\(/.test(sibCode))

  // IT HAS NO CALLER, and the module says why: its uniqueness index is not applied.
  const callers = execSync(
    `git grep -l -E "ensureTikTokSibling|tiktokSiblingRowFrom|canCreateTikTokSibling" -- app lib components || true`,
    { encoding: "utf8" }).trim().split("\n").filter(Boolean)
  eq("nothing in app/, lib/ or components/ calls it except the module itself",
    callers.filter((f) => f !== "lib/social/tiktokSibling.ts"), [])
  ok("the module states the blocker: its unique index is prepared and not applied",
    /PREPARED AND NOT APPLIED/.test(sib))
  ok("…and that it must not be wired until the index exists",
    /must not be wired to[\s\S]{0,12}an automatic trigger/.test(sib))

  // AND THE PREPARED INDEX CANNOT APPLY AS WRITTEN — production has four tiktok_video rows sharing
  // one source_content_id (three of them published). This is the fact that decides the next step.
  const idx = read("supabase/prepared/20261103000000_tiktok_sibling_unique.sql")
  ok("the prepared index is unique on source_content_id for tiktok_video",
    /unique index[\s\S]{0,160}\(source_content_id\)[\s\S]{0,120}destination = 'tiktok_video'/.test(idx))
  ok("…and does NOT exclude published rows, which is why it cannot be created today",
    !/published_at is null/.test(idx))
}

// ── 7. RELEASE SCOPE ─────────────────────────────────────────────────────────────────────────
console.log("\nRELEASE SCOPE:")
{
  const BASELINE = "57b018c"
  // The END of that change, not the working tree — the same pinning every guard before it carries.
  // It was left open-ended while this release WAS the working tree, which made the guard report on
  // whatever came next instead of on the release it describes. Pinned now, so its claim stays true.
  const RELEASE = "11ef126"
  const has = (() => {
    try { execSync(`git cat-file -e ${BASELINE}^{commit}`, { stdio: "ignore" }); return true } catch { return false }
  })()
  if (!has) {
    console.log(`  – skipped: ${BASELINE} is not in this clone`)
  } else {
    const lines = (cmd: string) =>
      execSync(cmd, { encoding: "utf8" }).trim().split("\n").map((l) => l.trim()).filter(Boolean)
    const changed = lines(`git diff --name-only ${BASELINE} ${RELEASE} -- . ':!next-env.d.ts'`).sort()
    const APPROVED = [
      // The network is the destination's.
      "lib/social/autopilotEligibility.ts",
      "lib/social/autopilotPlanRun.ts",
      "app/api/admin/social-autopilot/posts/[id]/route.ts",
      // The six existing rows.
      `${PREPARED}/${REPAIR}.sql`,
      `${PREPARED}/${REPAIR}.verify.sql`,
      `${PREPARED}/ROLLBACK_${REPAIR}.sql`,
      // Dallas rendering.
      "scripts/social/dallasRenderEnqueue.ts",
      // This file.
      "scripts/social/postProviderRepair.test.ts",
      // Three guards restated, each with its claim intact — see the comment at each site.
      // overlayTemplatePersist's is the substantive one: `platform` leaves its protected-column
      // set, narrowed to a single write of the destination's own registered provider.
      "scripts/social/overlayTemplatePersist.test.ts",
      // And two release guards pinned to their own commit ranges, as every earlier one already is.
      "scripts/social/manualTikTokDestination.test.ts",
      "scripts/social/releaseIntegrationAudit.test.ts",
    ].sort()
    eq(`exactly the ${APPROVED.length} approved files changed`, changed, APPROVED)
    ok("the planner itself is untouched — the fix is in the predicate",
      !changed.includes("lib/social/autopilotPlanner.ts"))
    for (const [label, re] of [
      ["the workers", /social-(instagram|tiktok)-publish/],
      ["the token resolver", /tiktokServer|tiktokConnectionChoice/],
      ["the market restriction", /marketRestriction\.ts/],
      ["the schedulers", /autopilotDestination|autopilotRotation|recurrence\.ts|autopilotOccupancy/],
      ["the sibling module", /tiktokSibling/],
      ["the prepared migrations from earlier phases", /2026111500000[23]/],
      ["OAuth, connect and callback", /(tiktok|instagram)\/(connect|callback)\//],
      ["captions, templates and hashtags", /composePost|hashtags\.ts|overlaySpec/],
      ["the accounts screen and the TikTok panel", /PublishingDestinations|TikTokPostConfirm/],
      ["the unrelated failing suites", /scripts\/(leads|tests|auth|share|notifications|companion)\//],
    ] as const) {
      ok(`${label} is untouched`, !changed.some((f) => re.test(f)))
    }
    for (const [f, allowed, why] of [
      ["lib/social/autopilotEligibility.ts", 3, "the platform doc line, the comparison, the isEligible anchor"],
      ["lib/social/autopilotPlanRun.ts", 4, "POOL_SELECT, the platform mapping line, the re-read select, its mapping line"],
      ["app/api/admin/social-autopilot/posts/[id]/route.ts", 10, "the destinations import and the nine-line comment the platform write replaces"],
      ["scripts/social/overlayTemplatePersist.test.ts", 2, "the protected-column assertion"],
      ["scripts/social/manualTikTokDestination.test.ts", 5, "the diff range"],
      ["scripts/social/releaseIntegrationAudit.test.ts", 5, "the audited range"],
    ] as const) {
      const removed = lines(`git diff --unified=0 ${BASELINE} -- ${f}`)
        .filter((l) => l.startsWith("-") && !l.startsWith("---"))
      ok(`${f} removes at most the ${allowed} line(s) it replaces (${why})`, removed.length <= allowed,
        `removed ${removed.length}`)
    }
  }
}

console.log(`\nPost provider repair: ${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
