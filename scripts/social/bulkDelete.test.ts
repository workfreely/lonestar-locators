/**
 * VIDEO LIBRARY — bulk "Delete Selected".
 *
 * Guards the three things that make a destructive bulk action safe here:
 *   1. the first click CANNOT delete — it only opens a confirmation;
 *   2. it reuses the existing per-id DELETE endpoint (the one place that removes
 *      the storage object before the row), rather than a second implementation;
 *   3. a partial failure is never reported as success.
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
  check("…with the specified body copy", /This will permanently remove the selected videos from the Video Library\./.test(src))
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
    /fetch\(`\/api\/admin\/social-autopilot\/content\/\$\{encodeURIComponent\(id\)\}`, \{ method: "DELETE" \}\)/.test(src),
  )
  check(
    "…the same endpoint the per-card trash uses (2 call sites, one implementation)",
    (src.match(/content\/\$\{encodeURIComponent\(id\)\}`, \{ method: "DELETE" \}/g) ?? []).length === 2,
  )
  check("no second bulk-delete server route was added", !/content\/bulk[\s\S]{0,120}DELETE/.test(src))
  const bulkRoute = readFileSync("app/api/admin/social-autopilot/content/bulk/route.ts", "utf8")
  check("…and the bulk route still performs no deletion", !/\.delete\(\)/.test(bulkRoute) && !/storage[\s\S]{0,40}remove\(/.test(bulkRoute))

  // The single-video path is what cleans up storage; keep that true.
  check("the per-id route removes the storage object", /storage\.from\("social-media"\)\.remove\(\[path\]\)/.test(route))
  check("…before deleting the row", route.indexOf("storage") < route.indexOf('.from("social_content").delete()'))
  check("…and is platform-admin gated", /requirePlatformAdmin\(\)/.test(route))
}

console.log("\nPartial failure is never reported as success")
{
  check("per-item results are collected", /const results = await Promise\.all\(/.test(src))
  check("…a non-ok response counts as failure", /return res\.ok/.test(src))
  check("…a thrown request counts as failure too", /catch \{\s*return false\s*\}/.test(src))
  check("failures are surfaced as an error, not a notice", /if \(failed > 0\) \{\s*setError\(/.test(src))
  check("…naming how many of how many", /Deleted \$\{deleted\} of \$\{results\.length\}/.test(src))
  check("success copy only when nothing failed", /\} else \{\s*setNotice\(`Deleted \$\{deleted\}/.test(src))
  check("the library is reloaded either way", /await load\(\)\s*\n\s*\} finally \{\s*\n\s*setDeleteBusy\(false\)/.test(src))
  check("selection is cleared after the run", /clearSelection\(\)[\s\S]{0,200}await load\(\)/.test(src))
  check("…and the modal closes", /setConfirmDelete\(false\)[\s\S]{0,120}clearSelection\(\)/.test(src))
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
