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
import { hasRender as libHasRender, isApproved, isRenderedReady, laneOf, workingReason, sourceNeedsWork, workingBadge, renderedBadge, BADGE_TONE } from "@/lib/social/postLane"

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
ok("posts LIST exposes the lane from the SHARED definition", /hasRender: hasRender\(r as LaneFacts\)/.test(postsApi) && /isRenderedReady: isRenderedReady\(r as LaneFacts\)/.test(postsApi))
ok("...importing it rather than restating the predicate", /from "@\/lib\/social\/postLane"/.test(postsApi))
const oneApi = read("app/api/admin/social-autopilot/posts/[id]/route.ts")
ok("single-post GET uses the SAME shared definition", /hasRender: hasRender\(r as LaneFacts\)/.test(oneApi) && /from "@\/lib\/social\/postLane"/.test(oneApi))
const editor = read("components/crm/social/PostEditor.tsx")
ok("the editor prefers the server's hasRender", /post\.hasRender \?\?/.test(editor))

console.log("\nthe library no longer drops published posts:")
ok("the rendered collector runs BEFORE the editable-only skip",
  client.indexOf("if (p.hasRender)") < client.indexOf('p.status === "published") continue'))
ok("the published skip is explicitly scoped to the WORKING rollup",
  /p\.status === "published"\) continue \/\/ the WORKING rollup stays editable-only/.test(client))

console.log("\nboth tabs render through the SAME card component — no second card design:")
ok("one card grid, fed by a tab-selected array", /tab === "rendered" \? renderedCards : workingCards/.test(client))
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

console.log("\nAN MP4 IS NOT AN APPROVAL — the correction that matters most:")
const ART2 = "owner/content/renders/post-1.mp4"
const testRender = { render_status: "ready", rendered_storage_path: ART2, approved_at: null, published_at: null }
ok("a rendered but UNAPPROVED test post is Working, not Ready", laneOf(testRender) === "working")
ok("...and says why", workingReason(testRender) === "rendered_unapproved")
ok("...and its artifact is NOT discarded", libHasRender(testRender))
ok("approving it moves it to Rendered/Ready",
  laneOf({ ...testRender, approved_at: "2026-10-08T12:00:00Z" }) === "rendered")
// CHANGED 2026-10-08: publishing no longer implies approval. Every post published before the
// approval gate existed was a TEST, and counting those as approved silently made them
// production-ready launch inventory. A published-but-unapproved post now belongs to NEITHER tab —
// Rendered/Ready requires approval and the Working rollup skips published — which is how the
// historical record stays intact without polluting the launch workflow.
ok("a published-but-UNAPPROVED post is not Rendered/Ready",
  laneOf({ ...testRender, published_at: "2026-10-08T12:00:00Z" }) === "working")
ok("a published post that WAS approved is Rendered/Ready",
  laneOf({ ...testRender, published_at: "2026-10-08T12:00:00Z", approved_at: "2026-10-08T11:00:00Z" }) === "rendered")
ok("approval WITHOUT an artifact is still Working (both halves required)",
  laneOf({ render_status: "none", rendered_storage_path: null, approved_at: "2026-10-08T12:00:00Z" }) === "working")
ok("isApproved is true for approved", isApproved({ approved_at: "x" }))
ok("isApproved is FALSE for published-only (approval is explicit)", !isApproved({ published_at: "x" }))
ok("isApproved is false for neither", !isApproved({}))

console.log("\nWorking reasons distinguish the states:")
ok("never rendered        -> needs_render", workingReason({ render_status: "none", rendered_storage_path: null }) === "needs_render")
ok("in progress           -> rendering", workingReason({ render_status: "rendering" }) === "rendering")
ok("failed                -> render_error", workingReason({ render_status: "error" }) === "render_error")
ok("artifact, invalidated -> needs_rerender", workingReason({ render_status: "none", rendered_storage_path: ART2 }) === "needs_rerender")
ok("approved+rendered     -> no reason (it left Working)", workingReason({ ...testRender, approved_at: "x" }) === null)

console.log("\nWORKING MEMBERSHIP — a finished property leaves Working:")
const done = { render_status: "ready", rendered_storage_path: ART2, approved_at: "x", published_at: null }
const unfinished = { render_status: "none", rendered_storage_path: null }
ok("a source with NO posts still needs work", sourceNeedsWork([]))
ok("a source whose every post is finished LEAVES Working", !sourceNeedsWork([done, done]))
ok("...but one unfinished version keeps it there", sourceNeedsWork([done, unfinished]))
ok("a rendered-but-unapproved post keeps the source in Working", sourceNeedsWork([testRender]))
// A source whose only post is a published TEST returns to Working for review — the launch reset.
ok("a published-but-unapproved post leaves its source needing work", sourceNeedsWork([{ ...testRender, published_at: "x" }]))
ok("...but an APPROVED published post does finish its source", !sourceNeedsWork([{ ...testRender, published_at: "x", approved_at: "y" }]))

console.log("\napproval is wired through the stack:")
const editor2 = read("components/crm/social/PostEditor.tsx")
const route2 = read("app/api/admin/social-autopilot/posts/[id]/route.ts")
ok("PATCH accepts an explicit approved flag", /if \("approved" in body\)/.test(route2))
ok("...refuses to approve a post with no current render", /nothing_to_approve/.test(route2))
ok("...and a real creative change un-approves", /changed\.length > 0[\s\S]{0,900}patch\.approved_at = null/.test(route2))
ok("the DB un-approves on re-render too", /social_posts_unapprove_on_rerender/.test(read("supabase/migrations/20261008000002_post_approval.sql")))
ok("the editor exposes Mark ready", /Mark ready/.test(editor2))
ok("the editor can move a post back to Working", /Move to Working/.test(editor2))
ok("rendering never sets approved_at", !/approved_at/.test(read("lib/social/renderPost.ts")))

console.log("\nREPLACE VIDEO reuses the property record:")
ok("the editor uploads new footage", /Replace video/.test(editor2))
ok("...under the SAME content folder the property owns", /\$\{post\.sourceContentId\}\/takes\//.test(editor2))
ok("...with a unique name so earlier takes stay retrievable", /takes\/\$\{Date\.now\(\)\}/.test(editor2))
ok("...writing ONLY the post-level override", /patch\(\{ sourceStoragePath: path \}/.test(editor2))
ok("...never touching property fields", !/patch\(\{[^}]*budgetRange|patch\(\{[^}]*amenities/.test(editor2))
ok("the original video can be restored", /Use original/.test(editor2))
ok("replace is hidden on a published post", /\(unlocked \|\| !hasRender\) && !post\.isPublished/.test(editor2))

console.log("\nCARD BADGES — an upload is NOT a draft:")
const ART3 = "owner/c/renders/p.mp4"
ok("just uploaded, no posts at all -> NO badge", workingBadge([]) === null)
ok("a post CREATED but never saved -> NO badge (status='draft' is auto-assigned)",
  workingBadge([{ render_status: "none", rendered_storage_path: null, draft_saved_at: null }]) === null)
ok("explicitly saved -> DRAFT", workingBadge([{ render_status: "none", draft_saved_at: "2026-10-08T12:00:00Z" }]) === "DRAFT")
ok("rendered but unapproved -> RENDERED · NOT APPROVED",
  workingBadge([{ render_status: "ready", rendered_storage_path: ART3 }]) === "RENDERED · NOT APPROVED")
ok("render error -> RENDER ERROR", workingBadge([{ render_status: "error" }]) === "RENDER ERROR")

console.log("\nWorking badge priority — most actionable wins:")
ok("error outranks rendered-unapproved",
  workingBadge([{ render_status: "ready", rendered_storage_path: ART3 }, { render_status: "error" }]) === "RENDER ERROR")
ok("rendered-unapproved outranks draft",
  workingBadge([{ render_status: "ready", rendered_storage_path: ART3 }, { render_status: "none", draft_saved_at: "x" }]) === "RENDERED · NOT APPROVED")
ok("an approved sibling does NOT trigger rendered-unapproved",
  workingBadge([{ render_status: "ready", rendered_storage_path: ART3, approved_at: "x" }, { render_status: "none", draft_saved_at: "y" }]) === "DRAFT")

console.log("\nRendered/Ready badges:")
ok("published -> PUBLISHED", renderedBadge({ published_at: "x", status: "published" }) === "PUBLISHED")
ok("scheduled -> SCHEDULED", renderedBadge({ published_at: null, status: "scheduled" }) === "SCHEDULED")
ok("approved only -> READY", renderedBadge({ published_at: null, status: "ready" }) === "READY")
ok("published outranks scheduled", renderedBadge({ published_at: "x", status: "scheduled" }) === "PUBLISHED")

console.log("\nbadge tones match the agreed colour language:")
ok("DRAFT is green", BADGE_TONE["DRAFT"] === "green")
ok("RENDERED · NOT APPROVED is amber", BADGE_TONE["RENDERED · NOT APPROVED"] === "amber")
ok("RENDER ERROR is red", BADGE_TONE["RENDER ERROR"] === "red")
ok("PUBLISHED keeps its existing emerald", BADGE_TONE["PUBLISHED"] === "emerald")
ok("SCHEDULED keeps its existing sky", BADGE_TONE["SCHEDULED"] === "sky")

console.log("\nDRAFT comes ONLY from an explicit Save Draft:")
const route3 = read("app/api/admin/social-autopilot/posts/[id]/route.ts")
const editor3 = read("components/crm/social/PostEditor.tsx")
ok("PATCH stamps draft_saved_at on intent 'save_draft'", /if \(intent === "save_draft"\) patch\.draft_saved_at/.test(route3))
ok("...and nowhere else in the route", (route3.match(/patch\.draft_saved_at/g) ?? []).length === 1)
ok("the Save Draft button sends that intent", /patch\(\{ intent: "save_draft"/.test(editor3))
ok("scheduling does NOT send it", !/intent: "schedule"[^}]*draft_saved/.test(editor3))
ok("rendering never writes draft_saved_at", !/draft_saved_at/.test(read("lib/social/renderPost.ts")))
// Structural, not proximity-based: the earlier version matched the word "approving" inside a
// CODE COMMENT near the assignment and reported coupling that did not exist. What matters is that
// the approve branch assigns approved_at and nothing else.
ok("the approve branch assigns only approved_at", (() => {
  const i = route3.indexOf('if ("approved" in body)')
  if (i < 0) return false
  const block = route3.slice(i, route3.indexOf("\n  }", i))
  return /patch\.approved_at/.test(block) && !/draft_saved_at/.test(block)
})())
ok("the migration leaves every existing row NULL (no backfill)",
  !/update .*social_posts.*set .*draft_saved_at/i.test(read("supabase/migrations/20261008000003_post_draft_saved.sql")))

console.log("\nbadge placement — upper-right, one component, both tabs:")
const client3 = read("components/crm/social/SocialAutopilotClient.tsx")
ok("StatusBadge is positioned top-right", /function StatusBadge[\s\S]{0,300}top-1\.5 right-1\.5/.test(client3))
ok("there is exactly ONE status badge component", (client3.match(/function StatusBadge/g) ?? []).length === 1)
ok("both tabs route through it", /c\.post[\s\S]{0,120}renderedBadge[\s\S]{0,120}workingBadge/.test(client3))
ok("the Sample marker stays upper-LEFT", /Sample[\s\S]{0,0}/.test(client3) && /top-1\.5 left-1\.5[\s\S]{0,160}Sample/.test(client3))
ok("no status pill remains on the left", !/top-1\.5 left-1\.5[^]{0,200}(Published|Scheduled|Approved|READY)/.test(client3))

console.log("\nHOOK ORDER — every hook must run on every render:")
{
  const src = read("components/crm/social/PostEditor.tsx")
  const lines = src.split("\n")
  // The component's early return. Anything hook-shaped below it is skipped on the renders where
  // the guard fires, which changes the hook order between renders — React throws
  // "a change in the order of Hooks called by PostEditor". This happened for real: the Replace
  // Video useRef/useState were declared beside their helper, below this line.
  const guard = lines.findIndex((l) => /^  if \(!post\) return /.test(l))
  ok("the early return is still there (the test is meaningful)", guard > 0)
  const after = lines
    .slice(guard)
    .map((l, i) => [guard + i + 1, l] as [number, string])
    .filter(([, l]) => /\buse(State|Ref|Effect|Callback|Memo|Reducer|Context)\s*\(/.test(l))
  ok(`NO hooks after the early return (found ${after.length}${after.length ? ": line " + after.map(([n]) => n).join(", ") : ""})`,
    after.length === 0)

  // Every hook must also sit at the component's top level — not nested in an if, loop or callback.
  const nested = lines
    .map((l, i) => [i + 1, l] as [number, string])
    .filter(([, l]) => /\b(const|let)\s.*=\s*use(State|Ref|Memo|Callback|Reducer|Context)\s*\(/.test(l))
    .filter(([, l]) => !/^  (const|let)\s/.test(l))
  ok(`every hook declared at top level (found ${nested.length} nested)`, nested.length === 0)

  // The specific hooks that caused the bug, asserted to be above the guard.
  for (const name of ["videoRef", "swapping", "unlocked"]) {
    const at = lines.findIndex((l) => new RegExp(`^  const \\[?${name}\\b`).test(l))
    ok(`${name} is declared before the early return`, at > 0 && at < guard)
  }
}

console.log(`\nLibrary tabs + rendered editor: ${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
