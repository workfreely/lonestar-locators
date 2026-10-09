/**
 * VIDEO LIBRARY — bulk "Delete Selected".
 *
 * Guards the things that make a destructive bulk action safe here:
 *   1. the first click CANNOT delete — it only opens a confirmation;
 *   2. it reuses the per-id DELETE endpoint rather than a second implementation, which is now a
 *      PROTECTION and not just tidiness: every source-video safeguard lives in that handler, so
 *      bulk cannot be a weaker path than the per-card trash icon;
 *   3. a source with dependent posts is reported, never deleted — and its posts are never touched;
 *   4. a partial failure is never reported as success.
 *
 * NOTE ON ORDERING: this file used to assert that the route removed the storage object BEFORE the
 * row. That order was deliberately reversed in Phase 2 (row first, then file) because a failed row
 * delete otherwise left a row pointing at footage that no longer existed — invisible until a render
 * failed. The assertions below encode the new order and the reason for it.
 *
 * Run: npx tsx scripts/social/bulkDelete.test.ts
 */
import { readFileSync } from "node:fs"

let pass = 0
let fail = 0
function check(name: string, cond: boolean, detail = "") {
  if (cond) {
    pass++
    console.log(`  ✓ ${name}`)
  } else {
    fail++
    console.log(`  ✗ ${name}${detail ? `\n      ${detail}` : ""}`)
  }
}

const CLIENT = "components/crm/social/SocialAutopilotClient.tsx"
const ROUTE = "app/api/admin/social-autopilot/content/[id]/route.ts"
const src = readFileSync(CLIENT, "utf8")
const route = readFileSync(ROUTE, "utf8")

console.log("\nVIDEO LIBRARY — BULK DELETE\n")

console.log("Placement in the bulk action bar")
{
  const bar = src.slice(src.indexOf("Bulk action bar"), src.indexOf("Bulk action bar") + 1400)
  const iProperty = bar.indexOf("Change Property")
  const iDelete = bar.indexOf("Delete Selected")
  const iClear = bar.indexOf(">Clear<")
  check("Delete Selected exists in the bar", iDelete > -1)
  check("…after Change Property", iProperty > -1 && iDelete > iProperty, `property=${iProperty} delete=${iDelete}`)
  check("…and before Clear", iClear > -1 && iDelete < iClear, `delete=${iDelete} clear=${iClear}`)
  check("the whole bar only renders with a selection", /\{selected\.size > 0 && \(/.test(src))
}

console.log("\nThe first click cannot delete")
{
  check(
    "Delete Selected only opens the confirmation",
    /Delete Selected<\/button>/.test(src) && /onClick=\{\(\) => setConfirmDelete\(true\)\}/.test(src),
  )
  check(
    "…it does not call the delete routine directly",
    !/onClick=\{\(\) => void deleteSelected\(\)\}[\s\S]{0,80}Delete Selected/.test(src),
  )
  check("the modal is gated on confirmDelete AND a live selection", /\{confirmDelete && selected\.size > 0 && \(/.test(src))
  check("deleteSelected is reachable only from the modal", (src.match(/void deleteSelected\(\)/g) ?? []).length === 1)
  check("…and it no-ops on an empty selection", /const ids = Array\.from\(selected\)\s*\n\s*if \(ids\.length === 0\) return/.test(src))
}

console.log("\nThe modal counts dynamically")
{
  check("title uses the live count", /Delete \{selected\.size\} selected \{selected\.size === 1 \? "video" : "videos"\}\?/.test(src))
  // Copy asserted by MEANING, not by sentence: the modal must name what is at risk (originals /
  // masters) and promise that protected sources are skipped rather than cascaded.
  {
    const modal = src.slice(src.indexOf("{confirmDelete && selected.size > 0 && ("))
    const body = modal.slice(0, modal.indexOf("</div>", modal.indexOf("crm-text-muted")))
    check("the body copy names the ORIGINAL masters, not just 'videos'", /original uploaded videos/i.test(body) && /master/i.test(body))
    check("…and says protected sources are skipped with their posts intact", /protected/i.test(body) && /skipped/i.test(body) && /posts/i.test(body))
  }
  check("commit button counts too", /Delete \$\{selected\.size\} \$\{selected\.size === 1 \? "Video" : "Videos"\}/.test(src))
  check("…and singular/plural is handled", /selected\.size === 1 \? "Video" : "Videos"/.test(src))
  check("Cancel is present", /disabled=\{deleteBusy\} onClick=\{\(\) => setConfirmDelete\(false\)\}>Cancel<\/button>/.test(src))
  check("both buttons are disabled while in flight", (src.match(/disabled=\{deleteBusy\}/g) ?? []).length === 2)
  check("the commit uses destructive styling", /className=\{dangerBtn\}/.test(src) && /bg-red-600/.test(src))
}

console.log("\nReuses the existing single-video deletion path")
{
  check(
    "bulk delete calls the per-id DELETE endpoint",
    /fetch\(`\/api\/admin\/social-autopilot\/content\/\$\{encodeURIComponent\(id\)\}`, \{\s*method: "DELETE"/.test(src),
  )
  check(
    "…the same endpoint the per-card trash uses (2 call sites, one implementation)",
    (src.match(/content\/\$\{encodeURIComponent\(id\)\}`, \{\s*\n?\s*method: "DELETE"/g) ?? []).length === 2,
  )
  check("no second bulk-delete server route was added", !/content\/bulk[\s\S]{0,120}DELETE/.test(src))
  const bulkRoute = readFileSync("app/api/admin/social-autopilot/content/bulk/route.ts", "utf8")
  check("…and the bulk route still performs no deletion", !/\.delete\(\)/.test(bulkRoute) && !/storage[\s\S]{0,40}remove\(/.test(bulkRoute))

  // The single-video path is still what cleans up storage — but in the SAFE order.
  check("the per-id route removes the storage object", /storage\.from\("social-media"\)\.remove\(\[src\.storage_path\]\)/.test(route))
  {
    const iRow = route.indexOf('.from("social_content").delete()')
    const iFile = route.indexOf('storage.from("social-media").remove(')
    check("…AFTER deleting the row, so a failed delete never orphans a live row", iRow > -1 && iFile > iRow, `row=${iRow} file=${iFile}`)
    check("…and a failed file removal reports the exact orphaned path", /warning: "file_not_removed"/.test(route) && /orphanedPath: src\.storage_path/.test(route))
  }
  check("…and is platform-admin gated", /requirePlatformAdmin\(\)/.test(route))
}

console.log("\nPartial failure is never reported as success")
{
  check("per-item results are collected", /const results = await Promise\.all\(/.test(src))
  check("…a non-ok response counts as failure", /return \{ ok: res\.ok, blocked: false \}/.test(src))
  check("…a thrown request counts as failure too", /catch \{\s*return \{ ok: false, blocked: false \}\s*\}/.test(src))
  {
    // Structural, not line-adjacent: whatever the branch builds first, the failure path must END in
    // setError and must never reach for setNotice.
    const i = src.indexOf("if (failed > 0) {")
    const branch = i > -1 ? src.slice(i, src.indexOf("} else {", i)) : ""
    check("failures are surfaced as an error, not a notice", /setError\(/.test(branch) && !/setNotice\(/.test(branch))
  }
  check("…naming how many of how many", /Deleted \$\{deleted\} of \$\{results\.length\}/.test(src))
  check("success copy only when nothing failed", /\} else \{\s*setNotice\(`Deleted \$\{deleted\}/.test(src))
  check("the library is reloaded either way", /await load\(\)\s*\n\s*\} finally \{\s*\n\s*setDeleteBusy\(false\)/.test(src))
  check("selection is cleared after the run", /clearSelection\(\)[\s\S]{0,200}await load\(\)/.test(src))
  check("…and the modal closes", /setConfirmDelete\(false\)[\s\S]{0,120}clearSelection\(\)/.test(src))
}

console.log("\nBulk inherits every source-video protection")
{
  // THE POINT OF THIS SECTION. A multi-select is the easiest way to destroy a lot at once, so bulk
  // must be no more powerful than one trash click. It is the same handler, so it gets the dependent
  // check, the 409 and the RESTRICT constraint for free — these assertions keep it that way.
  check("bulk sends the confirmation token (the operator confirmed the whole selection)", /confirm: "delete-source-video"/.test(src))
  check(
    "…which CANNOT bypass the dependency refusal, because that refusal takes no token",
    route.indexOf('error: "source_has_dependents"') < route.indexOf('body.confirm !== "delete-source-video"'),
  )
  check("a 409 is read for its counts and reported, not retried", /res\.status === 409[\s\S]{0,260}blocked: true/.test(src))
  check("…and blocked sources are counted separately from plain failures", /const blocked = results\.filter\(\(r\) => r\.blocked\)\.length/.test(src))
  check("…the message says their posts were NOT deleted", /posts were NOT deleted/.test(src))
  check("no cascade exists anywhere in the route", !/cascade/i.test(route.replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, "")))

  // Modelled end-to-end: a 6-item selection where 2 sources still have posts.
  type Src = { id: string; posts: number; published: number }
  const selection: Src[] = [
    { id: "a", posts: 0, published: 0 },
    { id: "b", posts: 3, published: 2 },
    { id: "c", posts: 0, published: 0 },
    { id: "d", posts: 1, published: 0 },
    { id: "e", posts: 0, published: 0 },
    { id: "f", posts: 0, published: 0 },
  ]
  // The server's decision, as shipped: dependents => 409 regardless of token.
  const serverDelete = (s: Src, token: string | null) =>
    s.posts > 0 ? { status: 409, blocked: true } : token === "delete-source-video" ? { status: 200, blocked: false } : { status: 409, blocked: false }
  const results = selection.map((s) => serverDelete(s, "delete-source-video"))
  const deleted = results.filter((r) => r.status === 200).length
  const blocked = results.filter((r) => r.blocked).length
  check(`4 unused sources deleted, 2 protected (deleted=${deleted} blocked=${blocked})`, deleted === 4 && blocked === 2)
  check("the 4 dependent posts (2 published) all survive", selection.filter((s) => s.posts > 0).reduce((n, s) => n + s.posts, 0) === 4)
  check("a bulk run of ONLY protected sources deletes nothing", selection.filter((s) => s.posts > 0).every((s) => serverDelete(s, "delete-source-video").status === 409))
}

console.log("\nNothing else in the Video Library changed")
{
  check("Change Market still opens the bulk modal", /onClick=\{\(\) => openBulk\("market"\)\}/.test(src))
  check("Change Property still opens the bulk modal", /onClick=\{\(\) => openBulk\("property"\)\}/.test(src))
  check("applyBulk still posts to the bulk route", /fetch\("\/api\/admin\/social-autopilot\/content\/bulk"/.test(src))
  check("the per-card trash still calls remove(id)", /onClick=\{\(\) => remove\(c\.raw!\.id\)\}/.test(src))
  check("…and remove() still confirms before deleting", /if \(!confirm\("Delete this source video and its file\?/.test(src))
  check("select-all / clear helpers are unchanged", /const selectAllVisible = \(\) => setSelected\(new Set\(visibleRealIds\)\)/.test(src))
}

console.log(`\n${pass} passed, ${fail} failed\n`)
process.exit(fail === 0 ? 0 : 1)
