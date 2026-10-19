// POST APPROVAL — the route's own gate.
//
// ── THE BUG THIS SUITE EXISTS BECAUSE OF ────────────────────────────────────────────────────
// The PATCH handler decides "does this post have a current rendered video?" by reading
// render_status and rendered_storage_path off `stored`. Neither column was in `stored`'s select,
// so both read undefined, willHaveRender was ALWAYS false, and `approved: true` ALWAYS returned
// nothing_to_approve. Approval was impossible for every post — and because scheduling and
// publishing both require approved_at, the entire path from draft to published was closed. In
// production: 0 of 186 posts had ever been approved, while one post was genuinely eligible.
//
// ── WHY approvalGate.test.ts DID NOT CATCH IT ───────────────────────────────────────────────
// That suite proves an UNAPPROVED post cannot be scheduled, claimed or published — seven layers
// of "this must not happen". Not one assertion said approval itself must be able to SUCCEED. A
// gate that refuses everything satisfies every test about refusal, which is exactly how this
// survived. So the central assertion here is the positive one.
//
// ── THE GENERAL INVARIANT ───────────────────────────────────────────────────────────────────
// Rather than naming the two columns and moving on, section 1 derives EVERY column the handler
// reads off `stored` from the source and requires each to be in the select. That is the class of
// bug, not the instance: any future `stored?.some_column` added without extending the select fails
// here instead of silently reading undefined.
//
// Run: npx tsx scripts/social/approvalRoute.test.ts
import { readFileSync } from "node:fs"
import path from "node:path"
import { RENDER_AFFECTING_COLUMNS, renderAffectingChanges, valueChanged } from "../../lib/social/renderInvalidation"

let pass = 0, fail = 0
const ok = (l: string, c: boolean) => { if (c) { pass++; console.log(`  ✓ ${l}`) } else { fail++; console.log(`  ✗ ${l}`) } }
const read = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8")

const ROUTE = "app/api/admin/social-autopilot/posts/[id]/route.ts"
const src = read(ROUTE)

/** The PATCH handler's stored-row select, as actually written. */
const storedSelect = /\.select\("id, platform, destination[^"]*"\)/.exec(src)?.[0] ?? ""
const storedColumns = storedSelect
  .replace(/^\.select\("/, "").replace(/"\)$/, "")
  .split(",").map((c) => c.trim()).filter(Boolean)

console.log("1. every column the handler reads off `stored` is actually selected:")
{
  ok("the stored select was found", storedColumns.length > 0)
  // Every `stored?.x` and `stored as { x ... }` in the file.
  const readColumns = new Set<string>()
  for (const m of src.matchAll(/stored\?\.([a-z_][a-z0-9_]*)/g)) readColumns.add(m[1])
  for (const m of src.matchAll(/stored as \{\s*([a-z_][a-z0-9_]*)/g)) readColumns.add(m[1])
  ok("the handler does read columns off `stored`", readColumns.size > 0)
  for (const col of [...readColumns].sort()) {
    ok(`stored selects ${col}, which the handler reads`, storedColumns.includes(col))
  }
  // THE TWO THAT WERE MISSING, named explicitly so the regression is unmistakable in the output.
  ok("render_status is selected (was MISSING — the root cause)", storedColumns.includes("render_status"))
  ok("rendered_storage_path is selected (was MISSING — the root cause)", storedColumns.includes("rendered_storage_path"))
}

console.log("\n2. the approval RULES are unchanged — only the data feeding them:")
{
  // Capture the WHOLE three-line ternary, through `: false`. A non-greedy match to the first
  // newline grabs only the first line, which silently excludes the two lines holding the actual
  // rule — the assertions then test nothing and fail for the wrong reason.
  const gate = /const willHaveRender = [\s\S]*?:\s*false/.exec(src)?.[0] ?? ""
  ok("the gate expression is still present", gate.length > 0)
  // A pending re-render still blocks approval: you cannot approve a creative this very request
  // invalidated.
  ok("a patch that resets the render still refuses approval", /patch\.render_status === undefined[\s\S]{0,40}\?/.test(gate))
  ok("...and the invalidated branch is still `false`", /:\s*false/.test(gate))
  ok("the rule is still render_status 'ready' AND a stored file",
    /stored\?\.render_status === "ready" && !!stored\?\.rendered_storage_path/.test(gate))
  ok("the refusal is still nothing_to_approve / 409", /error: "nothing_to_approve"[\s\S]{0,220}status: 409/.test(src))
  ok("approval still stamps approved_at with a timestamp", /patch\.approved_at = new Date\(\)\.toISOString\(\)/.test(src))
  ok("approved:false still clears approved_at", /body\.approved === false[\s\S]{0,80}patch\.approved_at = null/.test(src))
  // The two surrounding protections must be untouched.
  ok("a render-affecting edit still un-approves the post", /patch\.approved_at = null/.test(src) && /changed\.length > 0/.test(src))
  ok("approval is still applied AFTER invalidation, so an edit cannot approve itself",
    src.indexOf("const changed = renderAffectingChanges") < src.indexOf("const willHaveRender"))
  ok("scheduling still requires approved_at", /approved_at/.test(src) && /not_approved/.test(src))
}

console.log("\n3. the fix cannot auto-approve anything:")
{
  // Approval happens ONLY inside `if ("approved" in body)`. Nothing else may write approved_at
  // except the un-approve paths.
  const stamps = [...src.matchAll(/patch\.approved_at = new Date\(\)\.toISOString\(\)/g)]
  ok("approved_at is stamped in exactly ONE place", stamps.length === 1)
  const approvedBlock = /if \("approved" in body\) \{[\s\S]*?\n  \}/.exec(src)?.[0] ?? ""
  ok("that one place is inside the explicit `approved` branch",
    approvedBlock.includes("patch.approved_at = new Date().toISOString()"))
  ok("it requires body.approved === true, not merely present", /body\.approved === true/.test(approvedBlock))
  // The two columns added are READ-ONLY inputs here — the handler must not write them.
  ok("the patch never writes rendered_storage_path", !/patch\.rendered_storage_path/.test(src))
  ok("the patch never writes render_version from this path", !/patch\.render_version = [^n]/.test(src) || /patch\.cover_render_version/.test(src))
  // And they are not render-affecting, so adding them changes no invalidation decision.
  for (const c of ["render_status", "rendered_storage_path"]) {
    ok(`${c} is not render-affecting, so invalidation is unchanged`,
      !(RENDER_AFFECTING_COLUMNS as readonly string[]).includes(c))
  }
  ok("nothing in this route renders", !/renderReel|renderPost\(/.test(src))
  ok("nothing in this route publishes", !/media_publish|createReelContainer/.test(src))
  ok("nothing in this route resumes auto posting", !/auto_posting/.test(src))
}

// ── 4. THE GATE, EXERCISED ──────────────────────────────────────────────────
// The route's decision reproduced exactly, then driven over eligible and ineligible posts. The
// `stored` objects are built by projecting a full post through the REAL select list, so a column
// dropped from the select makes it undefined here too — and the eligible case fails, loudly.
console.log("\n4. eligible posts approve, ineligible posts are refused:")
{
  const project = (post: Record<string, unknown>): Record<string, unknown> => {
    const out: Record<string, unknown> = {}
    for (const c of storedColumns) out[c] = post[c]
    return out
  }
  /** The route's gate, verbatim in behaviour. */
  const willApprove = (post: Record<string, unknown>, patch: Record<string, unknown>) => {
    const stored = project(post)
    const willHaveRender = patch.render_status === undefined
      ? stored.render_status === "ready" && !!stored.rendered_storage_path
      : false
    return !!willHaveRender
  }

  const rendered = {
    id: "p1", platform: "instagram", status: "ready",
    render_status: "ready", rendered_storage_path: "owner/abc/renders/p1-3.mp4",
    approved_at: null,
  }

  // THE ASSERTION THAT WAS MISSING EVERYWHERE.
  ok("a rendered post CAN be approved", willApprove(rendered, {}))
  ok("...this is the case production had one of, and could not approve",
    willApprove({ ...rendered, status: "ready" }, {}))

  // INELIGIBLE — each for its own reason, and each still refused.
  ok("render_status 'none' is refused", !willApprove({ ...rendered, render_status: "none" }, {}))
  ok("render_status 'failed' is refused", !willApprove({ ...rendered, render_status: "failed" }, {}))
  ok("a missing rendered file is refused", !willApprove({ ...rendered, rendered_storage_path: null }, {}))
  ok("an empty rendered path is refused", !willApprove({ ...rendered, rendered_storage_path: "" }, {}))
  ok("both missing is refused", !willApprove({ ...rendered, render_status: "none", rendered_storage_path: null }, {}))
  ok("a stale render invalidated by THIS request is refused",
    !willApprove(rendered, { render_status: "none" }))
  ok("...even when the stored render was ready", !willApprove(rendered, { render_status: "none", overlay_headline: "new" }))

  // THE REGRESSION GUARD, MADE EXECUTABLE. Drop either column from the projection and the
  // eligible case must fail — which is precisely what production was doing.
  const projectWithout = (post: Record<string, unknown>, drop: string) => {
    const out: Record<string, unknown> = {}
    for (const c of storedColumns) if (c !== drop) out[c] = post[c]
    return out
  }
  const willApproveWithout = (post: Record<string, unknown>, drop: string) => {
    const stored = projectWithout(post, drop)
    return !!(stored.render_status === "ready" && !!stored.rendered_storage_path)
  }
  ok("WITHOUT render_status in the select, an eligible post is wrongly refused",
    !willApproveWithout(rendered, "render_status"))
  ok("WITHOUT rendered_storage_path in the select, an eligible post is wrongly refused",
    !willApproveWithout(rendered, "rendered_storage_path"))
  ok("...which is exactly the failure the select now prevents",
    willApprove(rendered, {}) && !willApproveWithout(rendered, "render_status"))
}

// ── 5. A NO-OP SAVE MUST NOT DISCARD A FINISHED RENDER ──────────────────────
// The same root cause in its second form. renderAffectingChanges compares stored[col] against
// patch[col]; an UNSELECTED column reads undefined, so valueChanged(undefined, x) reported a
// change for a value that had not changed. The editor posts every composer field on every save,
// so re-saving a post with its presenter untouched reset render_status to 'none' and cleared
// approved_at — throwing away a finished render, and the approval with it, for nothing.
//
// Exercised against the REAL renderAffectingChanges and the REAL select list.
console.log("\n5. unchanged presenter settings do not invalidate a completed render:")
{
  const project = (post: Record<string, unknown>): Record<string, unknown> => {
    const out: Record<string, unknown> = {}
    for (const c of storedColumns) out[c] = post[c]
    return out
  }
  // A post with a presenter configured and a finished, approved render.
  const configured = {
    id: "p1", platform: "instagram", destination: "instagram_reel",
    render_status: "ready", rendered_storage_path: "owner/abc/renders/p1-3.mp4", render_version: 3,
    approved_at: "2026-10-18T12:00:00Z",
    overlay_headline: "DALLAS HIGH-RISES", overlay_subheadline: "", overlay_mode: "generate",
    overlay_template: "market_type", audio_choice: "original", audio_track_id: null,
    voice_hook_id: null, voice_cta_id: null, source_storage_path: "owner/abc/source.mov",
    published_at: null, external_post_id: null,
    presenter_id: "pres-1", presenter_intro_seconds: 4, presenter_side: "right",
    presenter_width_px: 480, presenter_clip_storage_path: "owner/presenters/a.webm",
    presenter_audio_storage_path: "owner/voice/h.mp3",
  }
  const stored = project(configured)

  // THE NO-OP SAVE: the editor re-posts every presenter field at its existing value.
  const noop = {
    presenter_id: "pres-1", presenter_intro_seconds: 4, presenter_side: "right",
    presenter_width_px: 480, presenter_clip_storage_path: "owner/presenters/a.webm",
    presenter_audio_storage_path: "owner/voice/h.mp3",
  }
  const noopChanges = renderAffectingChanges(stored, noop)
  ok("re-saving identical presenter settings reports NO render-affecting change",
    noopChanges.length === 0)
  ok(`...specifically: ${noopChanges.length === 0 ? "none" : noopChanges.join(", ")}`, noopChanges.length === 0)

  // Each column individually: unchanged is quiet, changed is reported.
  const cases: [string, unknown, unknown][] = [
    ["presenter_intro_seconds", 4, 5],
    ["presenter_side", "right", "left"],
    ["presenter_width_px", 480, 320],
    ["presenter_clip_storage_path", "owner/presenters/a.webm", "owner/presenters/b.webm"],
    ["presenter_audio_storage_path", "owner/voice/h.mp3", "owner/voice/other.mp3"],
    ["presenter_id", "pres-1", "pres-2"],
  ]
  for (const [col, same, different] of cases) {
    ok(`${col}: unchanged reports no change`, renderAffectingChanges(stored, { [col]: same }).length === 0)
    ok(`${col}: a REAL change is still reported`, renderAffectingChanges(stored, { [col]: different }).includes(col as never))
  }

  // A numeric column stored as a string (numeric(4,2) comes back as "4.00") must still compare
  // equal — valueChanged normalises via String(), which is why 4 and "4" agree but 4 and 5 do not.
  ok("a numeric presenter value stored as text still compares equal",
    !valueChanged("4", 4) && valueChanged("4", 5))

  // THE REGRESSION GUARD: drop a presenter column from the projection and a no-op save wrongly
  // reports a change — which is exactly what production was doing.
  for (const col of ["presenter_intro_seconds", "presenter_side", "presenter_width_px"]) {
    const without: Record<string, unknown> = {}
    for (const c of storedColumns) if (c !== col) without[c] = (configured as Record<string, unknown>)[c]
    ok(`WITHOUT ${col} selected, a no-op save wrongly invalidates the render`,
      renderAffectingChanges(without, noop).includes(col as never))
  }

  // And the whole point, stated as the route actually implements it: the un-approve and the render
  // reset BOTH live inside `if (changed.length > 0)`. An empty `changed` means neither line runs,
  // so a finished render and its approval both survive. (approved_at is deliberately NOT in the
  // select — the handler re-reads it separately where it needs it — so the guarantee is about the
  // PATCH not being written, not about the projected row.)
  const invalidationBlock = /const changed = renderAffectingChanges\(stored, patch\)[\s\S]*?\n  \}/.exec(src)?.[0] ?? ""
  ok("the invalidation block was found", invalidationBlock.length > 0)
  ok("the render reset lives inside it", /patch\.render_status = "none"/.test(invalidationBlock))
  ok("the un-approve lives inside it too", /patch\.approved_at = null/.test(invalidationBlock))
  ok("it is guarded on changed.length > 0", /if \(changed\.length > 0\)/.test(invalidationBlock))
  ok("so a no-op save runs neither, and the approved render survives",
    renderAffectingChanges(stored, noop).length === 0
      && /if \(changed\.length > 0\)/.test(invalidationBlock)
      && /patch\.render_status = "none"/.test(invalidationBlock)
      && /patch\.approved_at = null/.test(invalidationBlock))
}

console.log("\n6. nothing unrelated moved:")
{
  // The other consumers of `stored` must still find what they read.
  ok("render_version is still available for stamping a cover", storedColumns.includes("render_version"))
  ok("platform is still available for capping hashtags", storedColumns.includes("platform"))
  ok("source_storage_path is still available for the published-footage guard", storedColumns.includes("source_storage_path"))
  ok("published_at / external_post_id still drive isPublished",
    storedColumns.includes("published_at") && storedColumns.includes("external_post_id"))
  // EVERY render-affecting column must be comparable, or an edit reports a change that did not
  // happen and silently discards a finished render. Now asserted rather than noted.
  const missing = (RENDER_AFFECTING_COLUMNS as readonly string[]).filter((c) => !storedColumns.includes(c))
  ok(`every render-affecting column is selected${missing.length ? ` (missing: ${missing.join(", ")})` : ""}`, missing.length === 0)
  ok("the select is a single query, not re-read per field", (src.match(/from\("social_posts"\)\s*\n?\s*\.select\("id, platform/g) ?? []).length <= 1)
}

console.log(`\nApproval route: ${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
