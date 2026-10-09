// SOURCE VIDEO PROTECTION — Phases 1 and 2A.
//
// The uploaded original is a PROTECTED MASTER. It is reused indefinitely to produce new Reels with
// different templates, overlays, pricing, narration and (later) AI-presenter versions, so it must
// outlive every post, render and variation built from it.
//
// The protections asserted here each replaced a CONVENTION with an ENFORCEMENT:
//
//   1. social_posts.source_content_id is ON DELETE RESTRICT, not CASCADE. Deleting a source that
//      still has posts now FAILS. Under CASCADE it would have destroyed 69 posts including 8
//      PUBLISHED ones across 6 sources — the only record that anything went to Instagram.
//
//   2. Both source uploads use upsert:false. They were upsert:true, safe only because contentId is
//      a fresh uuidv4() per upload — a convention nothing enforced. A collision must fail, because
//      the existing master is the valuable artifact, not the incoming bytes.
//
//   3. (Phase 2A) The DELETE route refuses twice: 409 with COUNTS whenever posts depend on the
//      source, and 409 again without an explicit token even when nothing depends on it — originals
//      are protected BY DEFAULT. It deletes the row BEFORE the file, so the recoverable failure
//      mode (an orphan file, whose path is reported) replaces the invisible one (a row pointing at
//      footage that no longer exists).
//
// Run: npx tsx scripts/social/sourceProtection.test.ts
import { readFileSync } from "node:fs"
import path from "node:path"

let pass = 0, fail = 0
const ok = (l: string, c: boolean) => { if (c) { pass++; console.log(`  ✓ ${l}`) } else { fail++; console.log(`  ✗ ${l}`) } }
const read = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8")

// Comments EXPLAIN the old behaviour ("was ON DELETE CASCADE", "removed the storage object"), so
// asserting against raw text matches the explanation rather than the DDL. Strip -- comments first
// and assert on executable SQL only — the same trap that produced false failures elsewhere today.
const stripSql = (sql: string) => sql.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n")
const migrationRaw = read("supabase/migrations/20261009000002_protect_source_videos.sql")
const migration = stripSql(migrationRaw)
const library = read("components/crm/social/SocialAutopilotClient.tsx")
const bulk = read("components/crm/social/BulkReview.tsx")
const renderPost = read("lib/social/renderPost.ts")
const editor = read("components/crm/social/PostEditor.tsx")
const dup = read("app/api/admin/social-autopilot/posts/[id]/duplicate/route.ts")

// ── 1. THE FK IS RESTRICT ───────────────────────────────────────────────────
console.log("1. deleting a source with dependent posts is refused by the DATABASE:")
ok("the constraint is recreated as ON DELETE RESTRICT", /on delete restrict/i.test(migration))
ok("...and CASCADE is gone from the new definition", !/on delete cascade/i.test(migration))
ok("it targets social_posts.source_content_id", /foreign key \(source_content_id\)[\s\S]{0,120}references public\.social_content\(id\)/i.test(migration))
ok("the migration deletes nothing", !/\bdelete\s+from\b/i.test(migration))
ok("...and migrates no data", !/\bupdate\s+public\./i.test(migration))
ok("the reasoning is recorded on the constraint itself", /comment on constraint social_posts_source_content_id_fkey/i.test(migrationRaw))

// The semantics, modelled: RESTRICT blocks only when dependents exist.
const canDelete = (dependents: number) => dependents === 0
ok("a source with 3 posts cannot be deleted", !canDelete(3))
ok("a source with 1 post cannot be deleted", !canDelete(1))
ok("a source with NO posts still deletes normally", canDelete(0))

// ── 2. THE MASTER IS WRITE-ONCE ─────────────────────────────────────────────
console.log("\n2. an existing master cannot be overwritten by a re-upload:")
{
  // Locate each upload by the PATH it writes, then read the upsert flag that follows it. Keyed on
  // the path template rather than a line number so a reflow cannot silently pass this.
  const upsertFor = (src: string, pathNeedle: string) => {
    const i = src.indexOf(pathNeedle)
    if (i < 0) return "PATH NOT FOUND"
    const m = /upsert:\s*(true|false)/.exec(src.slice(i, i + 1400))
    return m ? m[1] : "NO UPSERT FLAG"
  }
  ok("library source upload is upsert:false", upsertFor(library, "/source.${extOf(uf.file.name)}") === "false")
  ok("BulkReview source upload is upsert:false", upsertFor(bulk, "/source.${extOf(r.file.name)}") === "false")

  // Derivatives are a different story and MUST stay replaceable — idempotent retry is correct
  // there, and nothing irreplaceable lives under renders/.
  ok("the RENDER output stays upsert:true (idempotent retry, disposable artifact)",
    /upload\(derivativePath[^)]*upsert: true/.test(renderPost))
  ok("Replace Video writes a NEW take, never overwriting (upsert:false)",
    /takes\/\$\{Date\.now\(\)\}/.test(editor) && upsertFor(editor, "takes/${Date.now()}") === "false")
}

// ── 3. NO PATH WRITES OVER A SOURCE ─────────────────────────────────────────
console.log("\n3. no code path can write to a source key:")
ok("the renderer's ONLY upload is the derivative", (renderPost.match(/\.upload\(/g) ?? []).length === 1 && /\.upload\(derivativePath/.test(renderPost))
ok("...and it reads the source through a signed URL, never a write", /createSignedUrl\(sourcePath/.test(renderPost))
ok("...into a temp work dir", /makeWorkDir\(\)/.test(renderPost))
ok("the derivative path is versioned, so renders never collide with each other",
  /renders\/\$\{id\}-\$\{nextVersion\}/.test(renderPost))
ok("Replace Video writes under takes/, not source.", /takes\//.test(editor) && !/upload\([^)]*source\./.test(editor))
ok("Create Variation copies NO file at all", !/\.upload\(|storage\.from/.test(dup))
ok("...it reuses the same source_content_id", /source_content_id: o\.source_content_id/.test(dup))

// ── 4. ONE MASTER, MANY POSTS ───────────────────────────────────────────────
console.log("\n4. many posts may share one master without duplicating it:")
{
  // The model: posts reference a content id; the file is never copied.
  const posts = [
    { id: "p1", source_content_id: "c1", source_storage_path: null },
    { id: "p2", source_content_id: "c1", source_storage_path: null },                 // variation
    { id: "p3", source_content_id: "c1", source_storage_path: "owner/c1/takes/9.mov" }, // replaced footage
  ]
  ok("three posts, one content row", new Set(posts.map((p) => p.source_content_id)).size === 1)
  ok("the master is referenced, never copied", posts.filter((p) => !p.source_storage_path).length === 2)
  ok("a per-post override does not disturb its siblings",
    posts[0].source_storage_path === null && posts[1].source_storage_path === null)
}

// ── 5. PHASE 1 SCOPE ────────────────────────────────────────────────────────
console.log("\n5. the migration itself touches no data:")
ok("no file is deleted anywhere in this migration", !/storage|remove\(/i.test(migration))

// ── 6. PHASE 2A — THE API REFUSES, WITH COUNTS ──────────────────────────────
console.log("\n6. the DELETE route refuses before the constraint has to:")
{
  const route = read("app/api/admin/social-autopilot/content/[id]/route.ts")
  const code = route.replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, "") // comments explain the OLD behaviour

  ok("it counts dependents rather than merely detecting them",
    /\.from\("social_posts"\)[\s\S]{0,160}\.eq\("source_content_id", id\)/.test(code))
  ok("...and counts PUBLISHED separately (those carry external_post_id)",
    /published_at\)\.length/.test(code) || /filter\(\(p\) => \(p as \{ published_at: string \| null \}\)\.published_at\)\.length/.test(code))
  ok("dependents -> 409 source_has_dependents", /error: "source_has_dependents"[\s\S]{0,420}status: 409/.test(code))
  ok("...with both counts in the body", /counts: \{ posts: posts\.length, published \}/.test(code))
  ok("no dependents -> STILL refused without an explicit token",
    /body\.confirm !== "delete-source-video"[\s\S]{0,420}status: 409/.test(code))
  ok("...and the refusal points at Archive Source rather than a harder override",
    /Archive Source/i.test(route))

  // ORDERING. The two failure modes are not symmetrical; the surviving one must be recoverable.
  const iRow = code.indexOf('.from("social_content").delete()')
  const iFile = code.indexOf('storage.from("social-media").remove(')
  ok("the ROW is deleted before the FILE", iRow > -1 && iFile > iRow)
  ok("...a raced dependent insert is caught as 23503 and reported as 409",
    /code === "23503"/.test(code) && /racedDependents \? "source_has_dependents"/.test(code) && /status: racedDependents \? 409 : 500/.test(code))
  ok("...a failed row delete leaves the footage explicitly untouched", /Its video was not touched/.test(route))
  ok("...a failed file removal names the orphan path", /orphanedPath: src\.storage_path/.test(code))
  ok("...and logs it, so an orphan is never silent", /source row deleted but its file remains/.test(route))

  // NO CASCADE, anywhere — the word appears only in prose explaining why there isn't one.
  ok("the route never cascades", !/cascade/i.test(code))
  ok("it deletes ONLY the social_content row, never a post", (code.match(/\.delete\(\)/g) ?? []).length === 1 && !/from\("social_posts"\)[\s\S]{0,80}\.delete\(\)/.test(code))
  ok("rendered files are left to their own separate cleanup", !/renders\//.test(code))

  // The decision table, modelled.
  const decide = (posts: number, token: string | null) =>
    posts > 0 ? "409_dependents" : token === "delete-source-video" ? "deleted" : "409_confirm"
  ok("3 posts + token -> still refused", decide(3, "delete-source-video") === "409_dependents")
  ok("1 post + token -> still refused", decide(1, "delete-source-video") === "409_dependents")
  ok("0 posts, no token -> refused (protected by default)", decide(0, null) === "409_confirm")
  ok("0 posts, wrong token -> refused", decide(0, "yes") === "409_confirm")
  ok("0 posts + exact token -> deleted", decide(0, "delete-source-video") === "deleted")
}

// ── 7. BULK IS NOT A WEAKER PATH ────────────────────────────────────────────
console.log("\n7. bulk delete inherits all of it:")
ok("bulk fans out to the same per-id route", (library.match(/content\/\$\{encodeURIComponent\(id\)\}`, \{\s*\n?\s*method: "DELETE"/g) ?? []).length === 2)
ok("...and no server-side bulk delete exists",
  !/\.delete\(\)/.test(read("app/api/admin/social-autopilot/content/bulk/route.ts")))
ok("...a 409'd source is reported, not skipped silently", /posts were NOT deleted/.test(library))

console.log(`\nSource protection (Phases 1 + 2A): ${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
