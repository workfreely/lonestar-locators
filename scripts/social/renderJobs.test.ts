// RENDER JOB QUEUE — idempotency, platform isolation, and what must never be re-rendered.
//
// Run: npx tsx scripts/social/renderJobs.test.ts
import { readFileSync } from "node:fs"
import path from "node:path"
import {
  renderJobKey, evaluateForEnqueue, enqueueRenderJobs, isRenderPlatform,
  RENDER_JOB_POST_COLUMNS, CLAIM_LEASE_SECONDS, type RenderJobPost, type JobClient,
} from "@/lib/social/renderJobs"
import { sharesAssetWith } from "@/lib/social/destinations"

let pass = 0, fail = 0
const ok = (l: string, c: boolean) => { if (c) { pass++; console.log(`  ✓ ${l}`) } else { fail++; console.log(`  ✗ ${l}`) } }
const read = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8")

const post = (over: Partial<RenderJobPost> = {}): RenderJobPost => ({
  id: "post-1", platform: "instagram", destination: "instagram_reel", status: "draft", render_status: "none",
  rendered_storage_path: null, overlay_mode: "generate", overlay_template: "market_type",
  overlay_headline: "SAN ANTONIO HIGH-RISES", overlay_subheadline: "Starting at $1,495/month",
  audio_choice: "original", voice_hook_id: null, voice_cta_id: null,
  source_content_id: "content-1", ...over,
})
const keyOf = (p: RenderJobPost) => {
  const v = evaluateForEnqueue(p)
  return v.enqueue ? v.key : null
}

console.log("the idempotency key — same inputs, same job:")
ok("identical posts produce the identical key", keyOf(post()) === keyOf(post()))
ok("the key is namespaced and bounded", /^rj1_[0-9a-f]{48}$/.test(keyOf(post())!))

console.log("\n…and a DIFFERENT video gets a different key:")
for (const [label, over] of [
  ["a different post",      { id: "post-2" }],
  ["a different platform",  { platform: "tiktok", destination: "tiktok_video" }],
  ["a different template",  { overlay_template: "pov_price" }],
  ["a different headline",  { overlay_headline: "DALLAS LOFTS" }],
  ["a different detail",    { overlay_subheadline: "Starting at $2,000/month" }],
  ["a different overlay mode", { overlay_mode: "existing" }],
  ["a different audio",     { audio_choice: "none" }],
  ["a voice hook added",    { voice_hook_id: "hook-1" }],
  ["a voice CTA added",     { voice_cta_id: "cta-1" }],
] as const) ok(`${label} -> different key`, keyOf(post(over as Partial<RenderJobPost>)) !== keyOf(post()))

// THE critical one: the same post for two platforms must never collapse into one job, because the
// overlay is fitted to each platform's safe area and the artifacts genuinely differ.
ok("Instagram and TikTok renders of ONE post are two distinct jobs",
  keyOf(post({ platform: "instagram", destination: "instagram_reel" })) !== keyOf(post({ platform: "tiktok", destination: "tiktok_video" })))

// ── DESTINATION, not just platform ──
// A Reel and a Story share a provider, an account and a token, but NOT a safe area. If the key
// ignored destination they would collapse into one job and the Story would silently never render.
console.log("\ndestination is part of the identity, because geometry is:")
ok("Instagram Reel and Instagram Story are DIFFERENT jobs",
  keyOf(post({ destination: "instagram_reel" })) !== keyOf(post({ destination: "instagram_story" })))
ok("…even though they share a platform and an account",
  post({ destination: "instagram_story" }).platform === post({ destination: "instagram_reel" }).platform)
ok("the enqueue verdict carries the destination", (() => {
  const v = evaluateForEnqueue(post({ destination: "instagram_story" }))
  return v.enqueue && v.destination === "instagram_story"
})())
// The converse: destinations that share GEOMETRY must share one job, or we would render the same
// frames twice and store two identical MP4s.
ok("TikTok video and TikTok Story share geometry, so they share ONE job",
  keyOf(post({ platform: "tiktok", destination: "tiktok_video" })) === keyOf(post({ platform: "tiktok", destination: "tiktok_story" })))
ok("…which is decided by safe area, not by destination name",
  sharesAssetWith("tiktok_video", "tiktok_story") && !sharesAssetWith("instagram_reel", "instagram_story"))
ok("a legacy row with no destination still resolves", (() => {
  const v = evaluateForEnqueue(post({ destination: null }))
  return v.enqueue && v.destination === "instagram_reel"
})())
ok("every job carries its platform", (() => {
  const v = evaluateForEnqueue(post({ platform: "tiktok" }))
  return v.enqueue && v.platform === "tiktok"
})())
ok("an unknown platform is refused rather than defaulted",
  !evaluateForEnqueue(post({ platform: "youtube" })).enqueue
  && !isRenderPlatform("youtube") && !isRenderPlatform(null))

console.log("\nthe key does NOT include render_version:")
// Including it would make every retry of a failed job look like new work and defeat idempotency.
ok("render_version is absent from the key inputs",
  !/render_version|renderVersion/.test(read("lib/social/renderJobs.ts").split("export function renderJobKey")[1].split("}")[0]))

console.log("\nwhat must NOT be enqueued:")
const skipOf = (p: RenderJobPost) => { const v = evaluateForEnqueue(p); return v.enqueue ? null : v.skip }
ok("a post with no source", skipOf(post({ source_content_id: null })) === "no_source")
ok("a PUBLISHING post — never re-render under a live publish", skipOf(post({ status: "publishing" })) === "post_in_flight")
ok("a PUBLISHED post — its artifact is history", skipOf(post({ status: "published" })) === "post_in_flight")
ok("an already-rendered post with an artifact", skipOf(post({ render_status: "ready", rendered_storage_path: "r/x.mp4" })) === "already_rendered")
ok("…but render_status ready with NO artifact IS enqueued (a failed upload must be retryable)",
  evaluateForEnqueue(post({ render_status: "ready", rendered_storage_path: null })).enqueue)
ok("a FAILED render is enqueued again", evaluateForEnqueue(post({ render_status: "error" })).enqueue)
ok("a SCHEDULED post may be re-rendered (it is not in flight)", evaluateForEnqueue(post({ status: "scheduled" })).enqueue)

async function enqueueChecks() {
  console.log("\nenqueue is idempotent against a database that enforces the unique key:")
  // A client that behaves like Postgres: the second insert of a key raises 23505.
  const seen = new Set<string>()
  const client: JobClient = {
    from: () => ({
      insert: (row: Record<string, unknown>) => ({
        select: async () => {
          const k = row.idempotency_key as string
          if (seen.has(k)) return { data: null, error: { message: "duplicate key", code: "23505" } }
          seen.add(k)
          return { data: [{ id: `job-${seen.size}` }], error: null }
        },
      }),
    }),
  }
  const posts = [post({ id: "a" }), post({ id: "b" }), post({ id: "c" })]
  const first = await enqueueRenderJobs(client, posts)
  ok("first run creates one job per post", first.created.length === 3 && first.deduped.length === 0)
  const second = await enqueueRenderJobs(client, posts)
  ok("re-running creates NOTHING", second.created.length === 0)
  ok("…and reports them as deduped, not as errors", second.deduped.length === 3 && second.errors.length === 0)
  ok("jobs total 3, not 6", seen.size === 3)

  // Same post, both platforms -> two jobs. The one case that MUST not dedupe.
  const cross = await enqueueRenderJobs(client, [post({ id: "x", platform: "instagram", destination: "instagram_reel" }), post({ id: "x", platform: "tiktok", destination: "tiktok_video" })])
  ok("one post across two platforms creates TWO jobs", cross.created.length === 2)
  ok("and they carry different platforms",
    new Set(cross.created.map((c) => c.platform)).size === 2)

  // A real error is surfaced, never counted as a successful dedupe.
  const broken: JobClient = { from: () => ({ insert: () => ({ select: async () => ({ data: null, error: { message: "boom", code: "42501" } }) }) }) }
  const err = await enqueueRenderJobs(broken, [post()])
  ok("a non-duplicate error is reported as an error", err.errors.length === 1 && err.created.length === 0 && err.deduped.length === 0)
}


console.log("\nthe wiring is what the endpoints actually use:")
const runRoute = read("app/api/admin/social-autopilot/render-jobs/run/route.ts")
const enqRoute = read("app/api/admin/social-autopilot/render-jobs/enqueue/route.ts")
const jobsSql = read("supabase/migrations/20261007000000_social_render_jobs.sql")
ok("the enqueue query selects exactly the key's inputs", enqRoute.includes("RENDER_JOB_POST_COLUMNS"))
ok("every key input is in that column list",
  ["overlay_mode", "overlay_template", "overlay_headline", "overlay_subheadline", "audio_choice", "voice_hook_id", "voice_cta_id", "platform"]
    .every((c) => RENDER_JOB_POST_COLUMNS.includes(c)))
ok("the runner claims through the RPC, not a hand-rolled update", /lb_claim_render_job/.test(runRoute))
ok("…and that RPC uses FOR UPDATE SKIP LOCKED", /for update skip locked/i.test(jobsSql))
ok("…with a lease so a dead worker's job is reclaimed", /claim_expires_at < now\(\)/.test(jobsSql))
ok("…and refuses a job past max_attempts", /attempt_count < j\.max_attempts/.test(jobsSql))
ok("the runner drains exactly ONE job per invocation", !/for \(|while \(|\.map\(/.test(runRoute.split("lb_claim_render_job")[1] ?? ""))
ok("it renders through the SHARED implementation, not a copy", /renderPostToStorage/.test(runRoute))
ok("temp files are cleaned by that shared implementation",
  /fs\.rm\(work, \{ recursive: true, force: true \}\)/.test(read("lib/social/renderPost.ts")))
ok("cleanup is in a finally, so it runs on failure too",
  /finally \{[\s\S]{0,120}fs\.rm\(work/.test(read("lib/social/renderPost.ts")))
ok("a failure is recorded as failed and reports whether it is retryable",
  /p_ok: false/.test(runRoute) && /retryable: job\.attempt_count < job\.max_attempts/.test(runRoute))
ok("the enqueue endpoint renders nothing itself", !/renderPostToStorage|renderReel/.test(enqRoute))
ok("the queue table is service-role only", /enable row level security/.test(jobsSql) && !/create policy/.test(jobsSql))
ok("the lease is a sane length", CLAIM_LEASE_SECONDS >= 300 && CLAIM_LEASE_SECONDS <= 1800)

enqueueChecks().then(() => {
  console.log(`\nRender jobs: ${pass} passed, ${fail} failed`)
  process.exit(fail === 0 ? 0 : 1)
})
