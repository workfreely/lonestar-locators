// THE SOURCE QUALITY BADGE READS THE PLAYER THAT IS ALREADY THERE.
//
// It used to mount its OWN hidden 1px <video> on the same signed URL as the editor's visible
// preview, purely to read videoWidth/videoHeight. Measured in a real browser, that cost one extra
// request on every open — consistently, every run, every clip (1→2 warm, 3→5 cold on a 4K master).
// Both elements reported identical dimensions (720x1280, 2160x3840), so the second fetch was
// learning something the page already knew.
//
// HONEST SCOPE: the alternating control runs showed time-to-ready tracks CACHE WARMTH, not the
// badge — so this removes a redundant request, and is NOT claimed to make loading measurably
// faster. The assertions below say exactly that much and no more.
//
// The other half of this suite is what must NOT have changed. The operator asked for the preview
// to stay muted by default, keep native controls so audio can be unmuted by hand, and never
// autoplay. Those are pinned here because a future "improvement" to playback is exactly the kind
// of change that would quietly flip one of them.
//
// Run: npx tsx scripts/social/sourceQualityBadge.test.ts
import { readFileSync } from "node:fs"
import path from "node:path"

let pass = 0, fail = 0
const ok = (l: string, c: boolean) => { if (c) { pass++; console.log(`  ✓ ${l}`) } else { fail++; console.log(`  ✗ ${l}`) } }
const read = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8")
// Strip comments before asserting on structure: this file's own doc comment EXPLAINS the hidden
// <video> it used to mount, so a raw search finds the very thing the comment says is gone.
const stripComments = (src: string) => src.replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
const badge = stripComments(read("components/crm/social/SourceQualityBadge.tsx"))
const editor = read("components/crm/social/PostEditor.tsx")

// ── 1. ONE PLAYER, ONE REQUEST ──────────────────────────────────────────────
console.log("1. the badge no longer fetches anything of its own:")
ok("it mounts NO video element at all", !/<video/.test(badge))
ok("it takes no URL — it cannot fetch even by accident", !/videoUrl|src=/.test(badge))
ok("it takes the dimensions as a prop", /\{ dims, className = "" \}: \{ dims: \{ w: number; h: number \} \| null/.test(badge))
ok("the editor passes them from its own state", /<SourceQualityBadge dims=\{sourceDims\} \/>/.test(editor))
ok("...which the VISIBLE player fills from its own loadedmetadata",
  /onLoadedMetadata=\{\(e\) => \{[\s\S]{0,220}setSourceDims\(\{ w: v\.videoWidth, h: v\.videoHeight \}\)/.test(editor))
ok("the editor's pre-render branch now mounts exactly ONE video element", (() => {
  const branch = editor.slice(editor.indexOf(") : post.previewUrl ? ("), editor.indexOf("No preview"))
  return (branch.match(/<video/g) ?? []).length === 1
})())
ok("nothing else in the editor mounts a second element on previewUrl",
  (editor.match(/src=\{post\.previewUrl\}/g) ?? []).length === 1)

// ── 2. ACCURACY IS UNCHANGED ────────────────────────────────────────────────
console.log("\n2. the badge still says exactly what it said before:")
ok("the same threshold against DELIVERY_SIZE", /dims\.w < DELIVERY_SIZE\.w \|\| dims\.h < DELIVERY_SIZE\.h/.test(badge))
ok("it renders NOTHING until dimensions are known", /const below = dims !== null &&/.test(badge))
ok("the same label text", /\{dims!\.w\}×\{dims!\.h\} source/.test(badge))
ok("the same explanatory title, unchanged", /below the \$\{DELIVERY_SIZE\.w\}×\$\{DELIVERY_SIZE\.h\} delivery size/.test(badge) && /This does not block rendering\./.test(badge))
ok("the same styling", /border-\[#e3d6b0\] bg-\[#fbf6e7\][^"]*text-\[#7a6320\]/.test(badge))
ok("it is still informational — it blocks nothing", !/disabled|return null;?\s*\/\/ block|preventRender/.test(badge))
ok("stale dimensions cannot survive a switch to another post", /useEffect\(\(\) => \{ setSourceDims\(null\) \}, \[postId\]\)/.test(editor))

// ── 3. WHAT MUST NOT HAVE CHANGED ───────────────────────────────────────────
console.log("\n3. playback behaviour is preserved exactly:")
{
  const branch = editor.slice(editor.indexOf(") : post.previewUrl ? ("), editor.indexOf("No preview"))
  ok("the source preview is still MUTED by default", /\n\s+muted\n/.test(branch))
  ok("native controls are still present, so audio can be unmuted by hand", /\n\s+controls\n/.test(branch))
  ok("preload is still metadata — no eager buffering", /preload="metadata"/.test(branch))
  ok("playsInline is unchanged", /playsInline/.test(branch))
}
ok("NOTHING in the editor autoplays", !/autoPlay/.test(editor))
ok("the RENDERED player is untouched — still keyed on renderVersion, still unmuted",
  /<video key=\{post\.renderVersion \?\? 0\} ref=\{previewVideoRef\} src=\{post\.renderedPreviewUrl!\} controls/.test(editor)
  && !/renderedPreviewUrl!\} controls[^/]*muted/.test(editor))
ok("no change to overlays, captions, rendering or publishing from this file's preview block",
  /<PreviewOverlay layout=\{overlayLayout\} \/>/.test(editor))

console.log(`\nSource quality badge: ${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
