// RESUMING AN IN-FLIGHT PUBLISH.
//
// Creating the container and publishing it are two calls. /publish does the first, /publish/status
// does the second. Nothing else in the product calls the second — the cron would, but it is held
// behind two deliberate kill switches — so whoever started a publish was the only thing that could
// finish it. If that loop ended early (tab closed, navigation, its own cap), the post sat at
// status='publishing' with a container Meta had already FINISHED, one call from live, and nothing
// in the UI could make that call.
//
// These assertions are about the two things that must be true of the fix: it finishes what exists,
// and it cannot start anything new.
import { readFileSync } from "node:fs"

let pass = 0
let fail = 0
function ok(name: string, cond: boolean, detail = "") {
  if (cond) { pass++; console.log(`  ✓ ${name}`) }
  else { fail++; console.log(`  ✗ ${name}${detail ? `  — ${detail}` : ""}`) }
}
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "")
const editor = code(readFileSync("components/crm/social/PostEditor.tsx", "utf8"))
const statusRoute = code(readFileSync("app/api/admin/social-autopilot/posts/[id]/publish/status/route.ts", "utf8"))
const publishRoute = code(readFileSync("app/api/admin/social-autopilot/posts/[id]/publish/route.ts", "utf8"))

console.log("the stripper works (prose cannot satisfy an assertion):")
ok("editor prose is gone", !editor.includes("RESUME ON OPEN"))

// ── IT FINISHES WHAT ALREADY EXISTS ───────────────────────────────────────────────────────────
console.log("\nan in-flight publish is driven to completion:")
ok("the polling loop is factored out for reuse", /const drivePublishToCompletion = async/.test(editor))
ok("…and it polls the status endpoint", /drivePublishToCompletion[\s\S]{0,900}?\/publish\/status/.test(editor))
ok("a post opened at status='publishing' resumes automatically",
  /post\?\.status !== "publishing"[\s\S]{0,400}?drivePublishToCompletion/.test(editor),
  "reopening the post is the recovery")
ok("…guarded so React's double-invoked effects cannot start two loops",
  /resumedRef\.current/.test(editor) && /useRef\(false\)/.test(editor))
ok("a 'not_claimable' claim falls through to finishing, instead of reporting a failure",
  /not_claimable"\s*\)\s*\{\s*await drivePublishToCompletion\(false\)/.test(editor),
  "that error IS what an already-publishing post looks like")
ok("other errors are still surfaced", /setError\(j\.detail \?\? PUBLISH_NOW_ERRORS/.test(editor))
ok("the in-flight state is shown rather than left as a bare pill",
  /post\.status === "publishing"[\s\S]{0,200}?Finishing publication/.test(editor))

// ── IT CANNOT START ANYTHING NEW ──────────────────────────────────────────────────────────────
console.log("\nit creates no container and changes no media:")
const drive = editor.match(/const drivePublishToCompletion[\s\S]*?\n  \}/)?.[0] ?? ""
ok("the resume path exists to inspect", drive.length > 0)
ok("it never POSTs to /publish", !/\/publish['"`],\s*\{\s*method:\s*"POST"/.test(drive))
// This assertion previously read "it issues no POST at all — status is a GET", which was simply
// wrong: /publish/status exports POST because it FINALISES. Asserting the mistake is what let the
// 405 ship. What actually matters is that the ONLY thing it posts to is the finaliser — never
// /publish, which is the call that would create a second container.
{
  const posts = [...drive.matchAll(/fetch\(`([^`]+)`[^)]*method:\s*"POST"/g)].map((m) => m[1])
  ok(`the only POST it issues is to the finaliser (${posts.length})`, posts.length === 1 && /\/publish\/status$/.test(posts[0]), posts.join(", "))
  ok("…and never to /publish, which would create a second container", !posts.some((u) => /\/publish$/.test(u)))
}
ok("it never renders", !/\/render/.test(drive))
ok("it never saves or patches", !/method:\s*"PATCH"/.test(drive) && !/patchSource|save_draft/.test(drive))
ok("it builds no caption, container or media call in the client",
  !/createReelContainer|media_publish|buildInstagramCaptionPayload/.test(editor))
const resumeEffect = editor.match(/useEffect\(\(\) => \{[\s\S]{0,500}?publishing"[\s\S]{0,400?}?\}, \[post\?\.status\]\)/)?.[0] ?? editor
ok("the resume effect calls ONLY the completion driver", !/useEffect[\s\S]{0,400}?\/publish['"`],\s*\{\s*method/.test(resumeEffect))

// ── THE SERVER SIDE IS UNCHANGED AND IDEMPOTENT ───────────────────────────────────────────────
// ── THE METHOD MATCHES THE ROUTE ──────────────────────────────────────────────────────────────
// A bare fetch() defaults to GET. /publish/status exports POST ONLY — it FINALISES, so it is not a
// safe read — and Next.js answers a GET with 405. The polling loop read that as "still processing"
// and waited out its whole budget, which is how a post reached status='publishing' with a FINISHED
// container and never published. Pinned per route, both directions.
console.log("\nthe client's HTTP method matches what each route exports:")
{
  const routes = [
    ["publish", "app/api/admin/social-autopilot/posts/[id]/publish/route.ts"],
    ["publish/status", "app/api/admin/social-autopilot/posts/[id]/publish/status/route.ts"],
  ] as const
  for (const [name, file] of routes) {
    const src = code(readFileSync(file, "utf8"))
    const exported = ["GET", "POST", "PATCH", "PUT", "DELETE"].filter((m) => new RegExp(`export async function ${m}\\b`).test(src))
    ok(`/${name} exports exactly one method (${exported.join(", ")})`, exported.length === 1, exported.join(", "))
    // Every call the editor makes to this exact path must name that method explicitly.
    const calls = [...editor.matchAll(new RegExp(`fetch\\(\`[^\`]*/${name.replace("/", "\\/")}\`([^)]*)\\)`, "g"))].map((m) => m[1])
    ok(`…and the editor calls it ${calls.length} time(s)`, calls.length > 0)
    for (const [i, args] of calls.entries())
      ok(`…call ${i + 1} explicitly uses ${exported[0]}`, new RegExp(`method:\\s*"${exported[0]}"`).test(args),
        args.trim() || "(no options — defaults to GET)")
  }
}

// An unexpected response must be REPORTED, not waited out. Silence was the actual defect.
console.log("\nan unexpected response is surfaced, not read as patience:")
ok("a non-OK response ends the loop with an error", /if \(!sres\.ok \|\| \(sj\.status && sj\.status !== "publishing"\)\)/.test(editor))
ok("…and the message carries the HTTP status so the cause is visible", /sres\.status/.test(editor))

console.log("\nthe endpoint it calls is safe to call again:")
ok("an already-published post returns its url unchanged", /if \(p\.external_post_id\) return NextResponse\.json\(\{ status: "published"/.test(statusRoute))
ok("a post with no container is a no-op", /p\.status !== "publishing" \|\| !p\.ig_container_id/.test(statusRoute))
ok("media_publish stays single-flighted in the shared finaliser", /finalizeInstagramPublish/.test(statusRoute))
ok("the status route still requires a platform admin", /requirePlatformAdmin/.test(statusRoute))
ok("…and still resolves the token server-side", /sa_get_instagram_token_by_connection/.test(statusRoute))
ok("ownership is still checked", /dest\.owner_user_id !== userId/.test(statusRoute))

console.log("\nthe publish route is untouched by this change:")
ok("its claim is still ready|scheduled → publishing", /\.in\(\s*"status",\s*\[\s*"ready",\s*"scheduled"\s*\]\s*\)/.test(publishRoute))
ok("…still guarded on not-yet-published", /\.is\(\s*"external_post_id",\s*null\s*\)/.test(publishRoute))
ok("every pre-claim guard is still there",
  ["already_published", "unsupported_platform", "not_approved", "no_destination", "destination_unavailable"].every((e) => publishRoute.includes(e)))

// ── NOTHING GLOBAL ────────────────────────────────────────────────────────────────────────────
console.log("\nno switch, schedule or permission is involved:")
ok("the client touches no kill switch", !/AUTOPUBLISH|auto_posting/.test(editor))
ok("neither route reads one", !/AUTOPUBLISH_ENABLED/.test(statusRoute) && !/AUTOPUBLISH_ENABLED/.test(publishRoute))
ok("the cron still requires both (unchanged)",
  (() => { const c = code(readFileSync("app/api/cron/social-instagram-publish/route.ts", "utf8"))
           return /AUTOPUBLISH_ENABLED/.test(c) && /readAutoPosting|auto_posting/.test(c) })())
ok("no scheduling intent is sent from the resume path", !/intent:\s*"(schedule|unschedule)"/.test(drive))
ok("the green Publish still schedules", /await\s+autoSchedule\(\)/.test(editor))

console.log(`\nPublish resume: ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
