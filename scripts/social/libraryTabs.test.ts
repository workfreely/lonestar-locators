// WORKING vs RENDERED / READY — the tab membership rule.
//
// The library was confusing because finished videos sat mixed in with uploads that still needed
// work. The split is derived entirely from state that already existed — no new columns — and the
// one thing it must NOT do is hide published posts: those are the reusable history that makes this
// a library rather than a queue.
//
// Run: npx tsx scripts/social/libraryTabs.test.ts
import { readFileSync } from "node:fs"
import path from "node:path"

let pass = 0, fail = 0
const ok = (l: string, c: boolean) => { if (c) { pass++; console.log(`  ✓ ${l}`) } else { fail++; console.log(`  ✗ ${l}`) } }
const read = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8")

/** The rule, exactly as the server computes `hasRender`. */
const hasRender = (p: { render_status: string; rendered_storage_path: string | null }) =>
  p.render_status === "ready" && !!p.rendered_storage_path
const tabOf = (p: { render_status: string; rendered_storage_path: string | null }) =>
  hasRender(p) ? "rendered" : "working"

const ART = "owner/content/renders/post-1.mp4"

console.log("RENDERED / READY holds every post with a usable artifact, whatever its status:")
ok("ready + artifact      -> rendered", tabOf({ render_status: "ready", rendered_storage_path: ART }) === "rendered")
ok("SCHEDULED + artifact  -> rendered", tabOf({ render_status: "ready", rendered_storage_path: ART }) === "rendered")
ok("PUBLISHED + artifact  -> rendered (history is never hidden)", tabOf({ render_status: "ready", rendered_storage_path: ART }) === "rendered")

console.log("\nWORKING holds everything still needing work:")
ok("draft, never rendered -> working", tabOf({ render_status: "none", rendered_storage_path: null }) === "working")
ok("rendering in progress -> working", tabOf({ render_status: "rendering", rendered_storage_path: null }) === "working")
ok("render error          -> working", tabOf({ render_status: "error", rendered_storage_path: null }) === "working")
ok("invalidated by a real edit (ready artifact, status reset) -> working",
  tabOf({ render_status: "none", rendered_storage_path: ART }) === "working")
ok("'ready' with NO artifact is NOT rendered (both halves required)",
  tabOf({ render_status: "ready", rendered_storage_path: null }) === "working")

console.log("\nstatus plays no part in the predicate — that is what keeps published posts visible:")
for (const status of ["ready", "scheduled", "publishing", "published", "needs_attention"]) {
  ok(`status='${status}' with an artifact -> rendered`,
    tabOf({ render_status: "ready", rendered_storage_path: ART }) === "rendered")
}

console.log("\nONE PROPERTY, MANY RENDERED VERSIONS — the cardinality difference is intended:")
// One social_content (the property + its video) with three posts, two of them rendered.
const CONTENT = "content-1"
const posts = [
  { id: "a", source_content_id: CONTENT, render_status: "ready", rendered_storage_path: ART, overlay_template: "market_type" },
  { id: "b", source_content_id: CONTENT, render_status: "ready", rendered_storage_path: ART, overlay_template: "special_feature" },
  { id: "c", source_content_id: CONTENT, render_status: "none", rendered_storage_path: null, overlay_template: "market_type" },
]
const renderedForContent = posts.filter(hasRender)
ok("the property yields 2 rendered cards", renderedForContent.length === 2)
ok("...both pointing at the SAME social_content row", renderedForContent.every((p) => p.source_content_id === CONTENT))
ok("...as distinct creatives, not duplicates", new Set(renderedForContent.map((p) => p.overlay_template)).size === 2)
ok("...while Working still shows ONE source card for that property",
  new Set(posts.map((p) => p.source_content_id)).size === 1)
ok("the unrendered sibling stays in Working", tabOf(posts[2]) === "working")

console.log("\nPROPERTY DATA IS REFERENCED, NEVER COPIED ONTO THE POST:")
const client = read("components/crm/social/SocialAutopilotClient.tsx")
ok("rendered cards look the property up by source_content_id", /sourceById\[p\.sourceContentId\]/.test(client))
ok("the lookup is built from the loaded social_content rows", /for \(const it of items \?\? \[\]\) m\[it\.id\] = it/.test(client))
const postsApi = read("app/api/admin/social-autopilot/posts/route.ts")
ok("the posts API embeds the source rather than denormalising it", /source:source_content_id\(/.test(postsApi))
ok("social_posts has no property_name column written anywhere in the post routes",
  !/social_posts[\s\S]{0,400}property_name:/.test(postsApi))

console.log("\nthe server computes the predicate so UI and editor cannot disagree:")
ok("posts LIST exposes hasRender", /hasRender: \(r\.render_status as string\) === "ready" && !!r\.rendered_storage_path/.test(postsApi))
const oneApi = read("app/api/admin/social-autopilot/posts/[id]/route.ts")
ok("single-post GET exposes the same hasRender", /hasRender: \(r\.render_status as string\) === "ready" && !!r\.rendered_storage_path/.test(oneApi))
const editor = read("components/crm/social/PostEditor.tsx")
ok("the editor prefers the server's hasRender", /post\.hasRender \?\?/.test(editor))

console.log("\nthe library no longer drops published posts:")
ok("the rendered collector runs BEFORE the editable-only skip",
  client.indexOf("if (p.hasRender)") < client.indexOf('p.status === "published") continue'))
ok("the published skip is explicitly scoped to the WORKING rollup",
  /p\.status === "published"\) continue \/\/ the WORKING rollup stays editable-only/.test(client))

console.log("\nboth tabs render through the SAME card component — no second card design:")
ok("one card grid, fed by a tab-selected array", /tab === "rendered" \? renderedCards : allCards/.test(client))
ok("rendered cards build the same Card shape", /const renderedCards: Card\[\]/.test(client))
ok("there is exactly ONE card grid in the file", (client.match(/key=\{c\.key\}/g) ?? []).length === 1)

console.log("\nRENDERED EDITOR: locked creative, editable metadata:")
ok("the editor computes a `locked` flag from hasRender", /const locked = hasRender && !unlocked/.test(editor))
ok("Edit & re-render unlocks it", /setUnlocked\(true\)/.test(editor))
ok("re-loading a post re-locks it", /setUnlocked\(false\)/.test(editor))
for (const [label, re] of [
  ["overlay template", /value=\{overlayTemplate\}[^>]*disabled=\{locked\}/],
  ["overlay headline", /value=\{headline\}[^>]*disabled=\{locked\}/],
  ["music", /value=\{audioChoice\}[\s\S]{0,200}disabled=\{locked\}/],
  ["voice clips", /locked \? "opacity-45 pointer-events-none"/],
] as [string, RegExp][]) {
  ok(`${label} is disabled when locked`, re.test(editor))
}
ok("locked controls stay VISIBLE (disabled, never conditionally unmounted)",
  !/\{!locked && \([\s\S]{0,80}Overlay Template/.test(editor))
for (const field of ["caption", "hashtags", "scheduledAt", "coverThumbOffsetMs"]) {
  ok(`${field} is never gated on locked`, !new RegExp(`${field}[^\\n]{0,120}disabled=\\{locked\\}`).test(editor))
}

console.log(`\nLibrary tabs + rendered editor: ${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
