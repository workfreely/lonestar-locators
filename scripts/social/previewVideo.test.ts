// PRE-PUBLISH PREVIEW VIDEO — the Post Editor's primary action row must offer Preview Video, and it
// must render through the CANONICAL route rather than publishing, scheduling, or approximating the
// mix in the browser. The Post Editor is a large auth-gated client component with no test harness, so
// these are source-level guards: they are cheap, they pin the exact wiring that is easy to break in a
// refactor, and each one is mutation-tested. Run: npx tsx scripts/social/previewVideo.test.ts
import { readFileSync } from "node:fs"
import path from "node:path"

let pass = 0, fail = 0
const ok = (l: string, c: boolean) => { if (c) { pass++; console.log(`  ✓ ${l}`) } else { fail++; console.log(`  ✗ ${l}`) } }

const read = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8")
const stripComments = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "").replace(/(^|[^:])\/\/.*$/gm, "$1")
const editor = stripComments(read("components/crm/social/PostEditor.tsx"))

console.log("action row — Preview Video | Save Draft | Publish:")
{
  const row = /<div className="mt-3 flex items-center justify-end gap-2 flex-wrap">([\s\S]*?)<\/div>/.exec(editor)?.[1] ?? ""
  ok("the primary action row exists", row.length > 0)
  // Labels live inside ternaries ({previewing ? "Rendering…" : "Preview Video"}), so order is read
  // from the click handlers, which is the binding that actually matters anyway.
  const order = [...row.matchAll(/void (previewVideo|saveDraft|publish)\(\)/g)].map((m) => m[1])
  ok(`order is Preview Video → Save Draft → Publish (got ${order.join(" | ")})`,
    order.length === 3 && order[0] === "previewVideo" && order[1] === "saveDraft" && order[2] === "publish")
  ok("Create Variation is NOT in the primary row", !/Create Variation/.test(row))
  // Same secondary surface Create Variation used: the Preview button line carries actionSecondary.
  const previewLine = row.split("\n").find((l) => l.includes("previewVideo()")) ?? ""
  ok("Preview uses the same secondary style Create Variation used", /className=\{actionSecondary\}/.test(previewLine))
  ok("Preview shows a Rendering… state", /previewing \? "Rendering…" : "Preview Video"/.test(row))
  ok("every primary action is disabled while a preview render runs",
    (row.match(/previewing/g) ?? []).length >= 3)
}

console.log("\nPreview Video runs the CANONICAL render and nothing else:")
{
  const fn = /const previewVideo = async \(\) => \{([\s\S]*?)\n  \}/.exec(editor)?.[1] ?? ""
  ok("previewVideo is defined", fn.length > 0)
  ok("it POSTs the existing /render route", /\/render`, \{ method: "POST" \}/.test(fn))
  ok("it persists the editor state first (patchSource + PATCH)", /patchSource\(\)/.test(fn) && /method: "PATCH"/.test(fn))
  ok("it reloads the post so the player picks up the rendered MP4", /await load\(\)/.test(fn))
  ok("it blocks repeat clicks", /setPreviewing\(true\)/.test(fn) && /setPreviewing\(false\)/.test(fn))
  ok("it surfaces the render route's own error (e.g. a Voice Clip problem)", /Couldn't render: \$\{/.test(fn) || /Couldn't render: /.test(fn))
  // The whole point: a preview must never publish, schedule, or change recurrence.
  for (const forbidden of ["/publish", "intent: \"schedule\"", "/recurring", "autoSchedule(", "startRepeat("]) {
    ok(`it never calls ${forbidden}`, !fn.includes(forbidden))
  }
}

console.log("\nRender REUSE goes through the existing invalidation, not a new cache:")
{
  const fn = /const previewVideo = async \(\) => \{([\s\S]*?)\n  \}/.exec(editor)?.[1] ?? ""
  ok("it re-reads the post and checks renderStatus before rendering again", /renderStatus === "ready"/.test(fn))
  ok("a still-valid render is reused instead of re-rendered", /if \(!stillValid\)/.test(fn))
  ok("no new cache/state table is introduced", !/localStorage|sessionStorage|previewCache/.test(fn))
  // The existing gate that swaps the left player to the rendered file is untouched.
  ok("the left player still switches on the EXISTING rendered gate",
    /const rendered = post\.renderStatus === "ready" && !!post\.renderedPreviewUrl && !overlayEdited/.test(editor))
  // Attribute-order independent: the rendered player gained a ref for Reel-cover frame selection,
  // and anchoring on "<video src=" made this fail on attribute position while the actual claim —
  // the rendered player is NOT muted — was still true.
  ok("the rendered MP4 is what plays, with audio (no muted attribute on the rendered player)",
    /<video(?=[^>]*\bsrc=\{post\.renderedPreviewUrl!\})(?=[^>]*\bcontrols\b)(?![^>]*\bmuted\b)[^>]*>/.test(editor))
}

console.log("\nCreate Variation is preserved and still reachable:")
{
  ok("the button still exists in the editor", /Create Variation/.test(editor))
  ok("it still calls clonePost", /clonePost\(\)/.test(editor))
  ok("clonePost still POSTs the /duplicate route", /\/duplicate`, \{ method: "POST" \}/.test(editor))
  const dup = stripComments(read("app/api/admin/social-autopilot/posts/[id]/duplicate/route.ts"))
  ok("the /duplicate route still exists and still copies the voice selections",
    /voice_hook_id:\s*o\.voice_hook_id/.test(dup) && /voice_cta_id:\s*o\.voice_cta_id/.test(dup))
}

console.log("\nThe render path itself is UNCHANGED by this pass:")
{
  const render = stripComments(read("lib/social/renderVideo.ts"))
  ok("duck level 0.2 and ramp 0.25s untouched", /duckLevel: 0\.2, rampSeconds: 0\.25/.test(render))
  ok("amix still normalize=0", /normalize=0/.test(render))
  ok("mix still pinned to the video duration", /apad,atrim=end=/.test(render))
  const route = stripComments(read("app/api/admin/social-autopilot/posts/[id]/render/route.ts"))
  ok("the render route still passes Hook/CTA paths", /hookPath:/.test(route) && /ctaPath:/.test(route))
  ok("the render route publishes nothing", !/instagram|tiktok|youtube/i.test(route))
}

console.log(`\nPreview Video: ${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
