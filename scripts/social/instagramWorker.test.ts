/**
 * SOCIAL BEAST — the Instagram due-post worker, the ready transition, and the publish claim.
 *
 * The thing this file exists to prevent is ONE bug: the same scheduled post becoming two Reels on
 * Instagram. Everything else here is supporting detail. So the behavioural half below drives
 * finalizeInstagramPublish against a fake database and a fake Meta, and counts how many times
 * media_publish is actually called — because that number, not a status column, is what the public
 * sees.
 *
 * The four scenarios the implementation was asked to survive:
 *   1. two concurrent workers claim the same post
 *   2. Meta fails the publish
 *   3. Meta succeeds
 *   4. the process dies AFTER Meta succeeds but BEFORE we record it  ← the duplicate-Reel path
 *
 * Run: npx tsx scripts/social/instagramWorker.test.ts
 */
import { readFileSync } from "node:fs"
import path from "node:path"

let pass = 0, fail = 0
const ok = (l: string, c: boolean, d = "") => {
  if (c) { pass++; console.log(`  ✓ ${l}`) } else { fail++; console.log(`  ✗ ${l}${d ? `\n      ${d}` : ""}`) }
}
const read = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8")
const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1")

const WORKER = "app/api/cron/social-instagram-publish/route.ts"
const FINALIZE = "lib/social/instagramFinalize.ts"
// The render body now lives in lib/social/renderPost.ts — ONE implementation shared by the
// interactive admin route and the bulk queue worker. These assertions follow it there, which
// also means they now cover the BULK path, not just the interactive one.
const RENDER = "lib/social/renderPost.ts"
const STATUS = "app/api/admin/social-autopilot/posts/[id]/publish/status/route.ts"

// ── A FAKE DB THAT HONOURS CONDITIONAL UPDATES ────────────────────────────────────────────────
// The claim is a conditional UPDATE, so a fake that ignores the conditions would make every test
// below vacuous. This one evaluates .eq/.is against the row exactly as Postgres would, and returns
// no row when the conditions do not match — which is what "losing the claim" means.
type Row = Record<string, unknown>
function fakeDb(rows: Record<string, Row>) {
  const calls = { updates: 0 }
  const api = (table: string) => {
    if (table !== "social_posts") throw new Error(`unexpected table ${table}`)
    let patch: Row = {}
    const conds: Array<[string, unknown, "eq" | "is"]> = []
    const builder: Record<string, unknown> = {
      update(p: Row) { patch = p; return builder },
      eq(col: string, val: unknown) { conds.push([col, val, "eq"]); return builder },
      is(col: string, val: unknown) { conds.push([col, val, "is"]); return builder },
      select() { return builder },
      async maybeSingle() { return apply() },
      then(res: (v: unknown) => unknown) { return Promise.resolve(apply()).then(res) },
    }
    function apply() {
      const id = conds.find((c) => c[0] === "id")?.[1] as string
      const row = rows[id]
      if (!row) return { data: null }
      for (const [col, val, kind] of conds) {
        if (col === "id") continue
        const actual = row[col] ?? null
        if (kind === "is" && actual !== (val ?? null)) return { data: null }
        if (kind === "eq" && actual !== val) return { data: null }
      }
      calls.updates++
      Object.assign(row, patch)
      return { data: { id } }
    }
    return builder
  }
  return { from: api, _calls: calls }
}

async function main() {
  console.log("\nINSTAGRAM WORKER — READY TRANSITION, CLAIMS, DUPLICATE SAFETY\n")

  const worker = strip(read(WORKER))
  const finalize = strip(read(FINALIZE))
  const render = strip(read(RENDER))
  const status = strip(read(STATUS))

  console.log("THE READY TRANSITION:")
  {
    ok("a finished render promotes a DRAFT to status 'ready'",
      /\.update\(\{ status: "ready"[\s\S]{0,140}\.eq\("status", "draft"\)/.test(render))
    // The whole point: a scheduled post must keep its scheduled_at authority.
    ok("…guarded on status='draft', so a SCHEDULED post is left scheduled",
      /\.eq\("status", "draft"\)/.test(render))
    ok("…and render still writes render_status separately (two axes, not one)",
      /render_status: "ready"/.test(render) && /status: "ready"/.test(render))
    ok("rendering never publishes — no Meta call in the render route",
      !/createReelContainer|publishReelContainer|media_publish/.test(render))
  }

  console.log("\nWHAT THE WORKER SELECTS:")
  {
    ok("platform is pinned to instagram", /\.eq\("platform", "instagram"\)/.test(worker))
    ok("only SCHEDULED posts", /\.eq\("status", "scheduled"\)/.test(worker))
    ok("only posts whose time has come", /\.lte\("scheduled_at", now\)/.test(worker))
    ok("already-published rows are excluded", /\.is\("external_post_id", null\)/.test(worker))
    // A scheduled post with no render must never fall back to the raw source.
    ok("a post without a current render is SKIPPED, not published",
      /render_status !== "ready" \|\| !row\.rendered_storage_path/.test(worker) && /skippedNoRender\+\+/.test(worker))
    // The claim is that the VIDEO handed to Meta is the rendered derivative and never the raw
    // source. Enumerate every signed path rather than grepping for "storage_path", which now also
    // matches the legitimate cover_storage_path.
    const signedArgs = [...worker.matchAll(/createSignedUrl\(\s*([^,]+),/g)].map((m) => m[1].trim())
    ok("the video signed is the rendered derivative",
      signedArgs.some((a) => /rendered_storage_path/.test(a)), signedArgs.join(" | "))
    ok("…and the raw source is NEVER signed",
      signedArgs.every((a) => !/\bsource\b|source\.storage_path/.test(a)), signedArgs.join(" | "))
    ok("…the only other signed path is the optional cover",
      signedArgs.every((a) => /rendered_storage_path|path/.test(a)), signedArgs.join(" | "))
    ok("there is a per-run ceiling", /MAX_PER_RUN/.test(worker) && /\.limit\(MAX_PER_RUN\)/.test(worker))
  }

  console.log("\nTIKTOK IS UNTOUCHED:")
  {
    ok("the worker never mentions TikTok", !/tiktok/i.test(worker))
    ok("…and imports no TikTok module",
      !read(WORKER).split("\n").filter((l) => /^import /.test(l)).join("\n").match(/tiktok/i))
    ok("the shared finalize is Instagram-only", !/tiktok/i.test(read(FINALIZE)))
  }

  console.log("\nFAIL-CLOSED CRON AUTH:")
  {
    ok("a missing CRON_SECRET LOCKS the route (never opens it)",
      /if \(!cronSecret \|\| auth !== `Bearer \$\{cronSecret\}`\)/.test(worker))
    ok("…returning 401", /"Unauthorized" \}, \{ status: 401 \}/.test(worker))
    // Registered so it actually runs.
    const vercel = JSON.parse(read("vercel.json")) as { crons: { path: string; schedule: string }[] }
    const cron = vercel.crons.find((c) => c.path === "/api/cron/social-instagram-publish")
    ok("the cron is registered in vercel.json", !!cron, JSON.stringify(vercel.crons.map((c) => c.path)))
    ok("…and no OTHER social cron was added", vercel.crons.filter((c) => /social/.test(c.path)).length === 1)
  }

  console.log("\nTHE AUTOPUBLISH LAUNCH GATE (deployed but disarmed):")
  {
    ok("the flag is read from SOCIAL_INSTAGRAM_AUTOPUBLISH_ENABLED",
      /process\.env\.SOCIAL_INSTAGRAM_AUTOPUBLISH_ENABLED/.test(worker))
    // Strict equality against the exact string: a typo must not arm a real account.
    ok("ONLY the exact string 'true' arms it",
      /\(process\.env\.SOCIAL_INSTAGRAM_AUTOPUBLISH_ENABLED \?\? ""\)\.trim\(\) === "true"/.test(worker))
    ok("…so missing / empty / 'false' / '1' / 'yes' all read as OFF",
      !/toLowerCase\(\)[\s\S]{0,40}=== "true"/.test(worker) && !/!== "false"/.test(worker))

    // The gate must sit before EVERY read and write. A guard further down could still claim a row
    // before deciding not to publish it, which is exactly what "inert" must not mean.
    const gateAt = worker.indexOf("if (!autopublishEnabled())")
    ok("the gate precedes the due query", gateAt > 0 && gateAt < worker.indexOf('.eq("status", "scheduled")'))
    ok("…precedes the reconcile sweep", gateAt < worker.indexOf("reconcileOnly: true"))
    ok("…precedes any claim", gateAt < worker.indexOf('status: "publishing"'))
    ok("…and precedes any Meta call", gateAt < worker.indexOf("createReelContainer("))

    // It is a SECOND layer, not a replacement: auth still runs first and still fails closed.
    ok("CRON_SECRET auth still runs BEFORE the flag",
      worker.indexOf("Unauthorized") < gateAt)
    ok("a disabled run reports itself clearly rather than silently doing nothing",
      /inert: true/.test(worker) && /enabled: false/.test(worker))
  }

  console.log("\nPAUSED DESTINATION ≠ BROKEN DESTINATION:")
  {
    // The bug: resolveDestination collapsed "paused", "disconnected" and "expired" into null, the
    // check ran AFTER the claim, and every one of them became needs_attention. Pausing an account
    // moved its due posts out of 'scheduled' permanently — needs_attention has no route back.
    ok("the resolver reports WHY, not just that it failed",
      /kind: "paused"/.test(worker) && /kind: "fault"/.test(worker))
    ok("…and never returns a bare null for an unusable destination",
      !/Promise<\{ token: string; externalAccountId: string \} \| null>/.test(worker))

    // Ordering is the whole fix.
    const loop = worker.slice(worker.indexOf("for (const row of (due"))
    // Anchored on CODE, not on a comment: `worker` is comment-stripped, so indexOf("CLAIM 1")
    // returns -1 and every "x < claimAt" check would pass vacuously.
    const destAt = loop.indexOf("const dest = await resolveDestination")
    const claimAt = loop.indexOf('.update({ status: "publishing"')
    ok("the claim marker is found at all (guards against a vacuous -1)", claimAt > 0, `claimAt=${claimAt}`)
    ok("the destination is resolved BEFORE the claim", destAt > 0 && destAt < claimAt, `dest=${destAt} claim=${claimAt}`)

    // Paused: the post must be left completely untouched.
    ok("a PAUSED destination skips without claiming",
      /kind === "paused"\)\s*\{\s*\n\s*result\.skippedDestinationPaused\+\+\s*\n\s*continue/.test(loop))
    ok("…and is counted, not silently dropped", /skippedDestinationPaused: 0/.test(worker))
    // The real claim: the paused branch CONTINUES before any fail() can be reached.
    const pausedBranch = loop.slice(loop.indexOf('kind === "paused"'))
    ok("…and continues out before reaching fail()",
      pausedBranch.indexOf("continue") < pausedBranch.indexOf("await fail("))

    // Faults: must still be surfaced, with the specific reason.
    ok("a FAULT still goes to needs_attention", /await fail\(postId, dest\.reason\)/.test(loop))
    ok("…disconnected is a fault, not a skip", /is \$\{d\.status\} — reconnect it/.test(worker))
    ok("…an expired token is a fault, not a skip", /access token expired/.test(worker))
    ok("…a missing destination is a fault", /destination not found/.test(worker))
    ok("…and an RPC error is a fault rather than a silent null", /could not read destination/.test(worker))

    // Precedence: a deliberate pause wins over an expiry, so a paused account never burns posts.
    const pausedAt = worker.indexOf('if (d.posting_paused) return { ok: false, kind: "paused" }')
    const statusAt = worker.indexOf('d.status && d.status !== "connected"')
    const expiryAt = worker.indexOf("token_expires_at && new Date")
    ok("paused is evaluated BEFORE status and expiry",
      pausedAt > 0 && pausedAt < statusAt && pausedAt < expiryAt)

    // Claim semantics are untouched by this change.
    ok("the claim still guards on status='scheduled' and a null external id",
      /\.eq\("status", "scheduled"\)\s*\n\s*\.is\("external_post_id", null\)/.test(loop))
    ok("…and still precedes every Meta call",
      claimAt > 0 && claimAt < loop.indexOf("createReelContainer("))
  }

  console.log("\nORDERING — EVERY CLAIM HAPPENS BEFORE META:")
  {
    const claimAt = worker.indexOf('.eq("status", "scheduled")')
    const metaAt = worker.indexOf("createReelContainer(")
    ok("the scheduled→publishing claim precedes container creation", claimAt > 0 && metaAt > claimAt)
    ok("the container id is persisted BEFORE finalize can publish",
      worker.indexOf("ig_container_id: containerId") < worker.indexOf("let outcome = await finalizeInstagramPublish("))
    const claim2 = finalize.indexOf('.is("media_publish_claimed_at", null)')
    const pub = finalize.indexOf("publishReelContainer(")
    ok("the media_publish claim precedes media_publish", claim2 > 0 && pub > claim2)
    // The original bug, asserted gone.
    ok("status is NEVER set to 'published' before the Meta call returns",
      !/status: "published"[\s\S]{0,200}publishReelContainer/.test(finalize))
    ok("…published is written together with external_post_id",
      /status: "published",\s*\n\s*external_post_id: mediaId/.test(finalize))
  }

  console.log("\nTHE RETRY CONDITION IS NOT `external_post_id IS NULL` ALONE:")
  {
    // On the crash row that predicate is true while the Reel is already live.
    ok("the unacknowledged sweep ALSO requires a publish claim",
      /\.not\("media_publish_claimed_at", "is", null\)[\s\S]{0,80}\.is\("external_post_id", null\)/.test(worker))
    ok("…and runs in reconcile-only mode", /reconcileOnly: true/.test(worker))
    ok("reconcile-only can never call media_publish",
      /if \(reconcileOnly\) return \{ state: "not_claimed" \}/.test(finalize) &&
      finalize.indexOf("if (reconcileOnly)") < finalize.indexOf("publishReelContainer("))
    ok("a PUBLISHED container is RECOVERED, not published again",
      /containerStatus === "PUBLISHED"/.test(finalize) &&
      finalize.indexOf('containerStatus === "PUBLISHED"') < finalize.indexOf("publishReelContainer("))
  }

  console.log("\nBEHAVIOURAL — media_publish CALL COUNT (the number the public sees):")
  {
    const { finalizeInstagramPublish } = await import("@/lib/social/instagramFinalize")
    // Meta is INJECTED, not monkey-patched: the point of these cases is the media_publish CALL
    // COUNT, so the fake has to be the thing the code actually calls.
    let api: Record<string, unknown> = {}
    const stub = (o: Record<string, unknown>) => { api = o }
    const restore = () => { api = {} }

    // ── SCENARIO 3: Meta succeeds ────────────────────────────────────────────────────────────
    {
      let publishCalls = 0
      stub({
        getContainerStatus: async () => "FINISHED",
        publishReelContainer: async () => { publishCalls++; return "MEDIA_1" },
        getMediaPermalink: async () => "https://instagram.com/reel/abc",
      })
      const rows: Record<string, Row> = { p1: { id: "p1", status: "publishing", media_publish_claimed_at: null, external_post_id: null } }
      const db = fakeDb(rows)
      const out = await finalizeInstagramPublish({ db: db as never, postId: "p1", containerId: "C1", igUserId: "IG", token: "T", api: api as never })
      ok("success → published exactly once", out.state === "published" && publishCalls === 1, `calls=${publishCalls}`)
      ok("…the media id is persisted", rows.p1.external_post_id === "MEDIA_1")
      ok("…status and the media id agree", rows.p1.status === "published" && !!rows.p1.external_post_id)
      ok("…published_at is set", typeof rows.p1.published_at === "string")
    }

    // ── SCENARIO 1: two concurrent workers ───────────────────────────────────────────────────
    {
      let publishCalls = 0
      stub({
        getContainerStatus: async () => "FINISHED",
        publishReelContainer: async () => { publishCalls++; await new Promise((r) => setTimeout(r, 20)); return "MEDIA_2" },
        getMediaPermalink: async () => null,
      })
      const rows: Record<string, Row> = { p2: { id: "p2", status: "publishing", media_publish_claimed_at: null, external_post_id: null } }
      const db = fakeDb(rows)
      const args = { db: db as never, postId: "p2", containerId: "C2", igUserId: "IG", token: "T", api: api as never }
      const [a, b] = await Promise.all([finalizeInstagramPublish(args), finalizeInstagramPublish(args)])
      ok("TWO concurrent finalizers → media_publish called ONCE", publishCalls === 1, `calls=${publishCalls}`)
      const states = [a.state, b.state].sort()
      ok("…exactly one wins the claim, the other reports not_claimed",
        states.join("+") === "not_claimed+published", states.join("+"))
      ok("…and only one media id is stored", rows.p2.external_post_id === "MEDIA_2")
    }

    // ── SCENARIO 2: Meta fails ───────────────────────────────────────────────────────────────
    {
      let publishCalls = 0
      stub({
        getContainerStatus: async () => "FINISHED",
        publishReelContainer: async () => { publishCalls++; throw new Error("publish: (#100) media not ready") },
        getMediaPermalink: async () => null,
      })
      const rows: Record<string, Row> = { p3: { id: "p3", status: "publishing", media_publish_claimed_at: null, external_post_id: null } }
      const db = fakeDb(rows)
      const out = await finalizeInstagramPublish({ db: db as never, postId: "p3", containerId: "C3", igUserId: "IG", token: "T", api: api as never })
      ok("Meta failure → failed, not published", out.state === "failed" && rows.p3.status === "needs_attention")
      ok("…no media id is invented", rows.p3.external_post_id === null)
      ok("…the real Meta message is preserved", String(rows.p3.error_message).includes("#100"))
      // Releasing the claim is safe ONLY because Meta did not publish.
      ok("…the claim is RELEASED so the post stays retryable", rows.p3.media_publish_claimed_at === null)
      ok("…and media_publish was attempted exactly once", publishCalls === 1)
    }

    // ── SCENARIO 4: crash AFTER Meta succeeds — the duplicate-Reel path ──────────────────────
    {
      // The row as a crashed process leaves it: claimed, no media id, Reel already live.
      const rows: Record<string, Row> = {
        p4: { id: "p4", status: "publishing", media_publish_claimed_at: "2026-10-05T00:00:00Z", external_post_id: null, ig_container_id: "C4" },
      }
      let publishCalls = 0
      stub({
        getContainerStatus: async () => "PUBLISHED", // Meta: this container is already live
        publishReelContainer: async () => { publishCalls++; return "MEDIA_DUPLICATE" },
        getMediaPermalink: async () => null,
      })
      const db = fakeDb(rows)
      const out = await finalizeInstagramPublish({ db: db as never, postId: "p4", containerId: "C4", igUserId: "IG", token: "T", reconcileOnly: true, api: api as never })
      ok("crash-after-success → media_publish is NOT called again", publishCalls === 0, `calls=${publishCalls}`)
      ok("…the post is recorded as published", out.state === "published" && rows.p4.status === "published")
      ok("…and flagged as a recovery rather than pretending it was clean",
        out.state === "published" && out.recovered === true && /recovered:/.test(String(rows.p4.error_message)))

      // And the same row must not be re-published by the NORMAL path either.
      publishCalls = 0
      const rows2: Record<string, Row> = {
        p5: { id: "p5", status: "publishing", media_publish_claimed_at: "2026-10-05T00:00:00Z", external_post_id: null, ig_container_id: "C5" },
      }
      const db2 = fakeDb(rows2)
      const out2 = await finalizeInstagramPublish({ db: db2 as never, postId: "p5", containerId: "C5", igUserId: "IG", token: "T", api: api as never })
      ok("…even without reconcileOnly, a PUBLISHED container never republishes", publishCalls === 0 && out2.state === "published")

      // A crash BEFORE Meta published is genuinely retryable — but the claim must still block it
      // until released, so recovery can never be the thing that issues a publish.
      publishCalls = 0
      stub({ getContainerStatus: async () => "FINISHED", publishReelContainer: async () => { publishCalls++; return "M" }, getMediaPermalink: async () => null })
      const rows3: Record<string, Row> = {
        p6: { id: "p6", status: "publishing", media_publish_claimed_at: "2026-10-05T00:00:00Z", external_post_id: null },
      }
      const out3 = await finalizeInstagramPublish({ db: fakeDb(rows3) as never, postId: "p6", containerId: "C6", igUserId: "IG", token: "T", api: api as never })
      ok("a stale claim blocks a fresh publish (no blind retry)", publishCalls === 0 && out3.state === "not_claimed")
    }

    // ── A container still transcoding must not be published or failed ───────────────────────
    {
      let publishCalls = 0
      stub({ getContainerStatus: async () => "IN_PROGRESS", publishReelContainer: async () => { publishCalls++; return "M" }, getMediaPermalink: async () => null })
      const rows: Record<string, Row> = { p7: { id: "p7", status: "publishing", media_publish_claimed_at: null, external_post_id: null } }
      const out = await finalizeInstagramPublish({ db: fakeDb(rows) as never, postId: "p7", containerId: "C7", igUserId: "IG", token: "T", api: api as never })
      ok("IN_PROGRESS → pending, nothing published, status untouched",
        out.state === "pending" && publishCalls === 0 && rows.p7.status === "publishing")
    }

    restore()
  }

  console.log("\nONE FAILURE DOES NOT BLOCK THE REST:")
  {
    ok("each post runs in its own try/catch inside the loop",
      /for \(const row of \(due \?\? \[\]\) as Row\[\]\) \{\s*const postId[\s\S]{0,80}try \{/.test(worker))
    ok("…and a thrown error records needs_attention and continues",
      /catch \(e\) \{[\s\S]{0,400}await fail\(postId, message\)/.test(worker))
    ok("a failed post stays visible and recoverable (never deleted)",
      /status: "needs_attention"/.test(worker) && !/\.delete\(\)/.test(worker))
  }

  console.log("\nTHE MANUAL ROUTE SHARES THE SAME FINALIZE:")
  {
    ok("the status route delegates to finalizeInstagramPublish", /finalizeInstagramPublish\(/.test(status))
    ok("…and no longer calls media_publish itself", !/publishReelContainer/.test(status))
    ok("…so there is exactly ONE media_publish call site in the app",
      ["app/api/admin/social-autopilot/posts/[id]/publish/route.ts", STATUS, WORKER, FINALIZE]
        .map((f) => (read(f).match(/publishReelContainer\(/g) ?? []).length)
        .reduce((a, b) => a + b, 0) === 1)
  }

  console.log(`\n${pass} passed, ${fail} failed\n`)
  if (fail > 0) process.exit(1)
}

void main()
