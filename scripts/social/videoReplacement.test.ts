// REPLACE VIDEO — the editor must PLAY the footage it renders.
//
// Run: npx tsx scripts/social/videoReplacement.test.ts   (pure — reads source, no database)
//
// The bug: Replace Video uploads a new take and writes social_posts.source_storage_path, and
// renderPost honours it — but the editor's GET route signed social_content.storage_path
// unconditionally. So the replacement was stored, recorded and renderable, and the player showed
// the original. One rule, applied by one of its two callers.
import { readFileSync } from "node:fs"
import { resolveSourcePath } from "@/lib/social/sourcePath"

let pass = 0, fail = 0
const ok = (label: string, cond: boolean, detail = "") => {
  if (cond) { pass++; console.log(`  ✓ ${label}`) } else { fail++; console.log(`  ✗ ${label}${detail ? `\n      ${detail}` : ""}`) }
}
// Comments here name the very paths under test, so absence assertions read comment-stripped source.
// Block comments are stripped only where one opens at the start of a line: a /* inside an
// attribute (accept="video/*") must never open one.
const codeOnly = (src: string) =>
  src.replace(/\{\/\*[\s\S]*?\*\/\}/g, " ").replace(/^[ \t]*\/\*[\s\S]*?\*\//gm, " ").replace(/^\s*\/\/.*$/gm, " ")

console.log("\nthe rule itself")
ok("the post's own footage wins", resolveSourcePath("takes/new.mov", "source.mov") === "takes/new.mov")
ok("the property's footage is the fallback", resolveSourcePath(null, "source.mov") === "source.mov")
ok("blank and whitespace overrides fall through", resolveSourcePath("", "source.mov") === "source.mov" && resolveSourcePath("   ", "source.mov") === "source.mov")
ok("neither present → null", resolveSourcePath(null, null) === null)
ok("it is never a merge — the override is the whole answer",
  resolveSourcePath("takes/new.mov", "source.mov")!.includes("takes/") &&
  !resolveSourcePath("takes/new.mov", "source.mov")!.includes("source.mov"))

console.log("\nboth callers apply it")
const route = codeOnly(readFileSync("app/api/admin/social-autopilot/posts/[id]/route.ts", "utf8"))
const render = codeOnly(readFileSync("lib/social/renderPost.ts", "utf8"))
ok("the renderer resolves the override", /resolveSourcePath\(\s*p\.source_storage_path/.test(render))
ok("the EDITOR'S PREVIEW resolves the override — the whole bug",
  /signMedia\(supabase,\s*resolveSourcePath\(\s*r\.source_storage_path/.test(route))
// The regression in one line: signing the content path with no resolution at all.
ok("the preview never signs src.storage_path unconditionally again",
  !/signMedia\(supabase,\s*src\?\.storage_path\s*\?\?\s*null/.test(route))
ok("the GET projection still selects source_storage_path", /source_storage_path/.test(route))

console.log("\nwhat replacement must NOT do")
const editor = codeOnly(readFileSync("components/crm/social/PostEditor.tsx", "utf8"))
ok("a take is uploaded under the property's OWN folder, keyed by time",
  /takes\/\$\{Date\.now\(\)\}/.test(readFileSync("components/crm/social/PostEditor.tsx", "utf8")))
ok("upsert is false — a replacement never overwrites footage a render was made from",
  /upsert:\s*false/.test(editor))
ok("replacement writes ONLY sourceStoragePath on the post",
  /patch\(\{\s*sourceStoragePath:\s*path\s*\}/.test(editor))
ok("it never writes social_content.storage_path", !/storage_path:\s*path/.test(editor))
ok("the source player is keyed on the URL, so a new path genuinely remounts",
  /key=\{post\.previewUrl\}/.test(editor))
ok("a published post's footage is protected", /isPublished && valueChanged\(stored\?\.source_storage_path/.test(route))

console.log(`\n${pass} passed, ${fail} failed\n`)
process.exit(fail === 0 ? 0 : 1)
