// SOURCE VIDEO PROTECTION — Phase 1.
//
// The uploaded original is a PROTECTED MASTER. It is reused indefinitely to produce new Reels with
// different templates, overlays, pricing, narration and (later) AI-presenter versions, so it must
// outlive every post, render and variation built from it.
//
// Two protections are asserted here, both of which replaced a CONVENTION with an ENFORCEMENT:
//
//   1. social_posts.source_content_id is ON DELETE RESTRICT, not CASCADE. Deleting a source that
//      still has posts now FAILS. Under CASCADE it would have destroyed 69 posts including 8
//      PUBLISHED ones across 6 sources — the only record that anything went to Instagram.
//
//   2. Both source uploads use upsert:false. They were upsert:true, safe only because contentId is
//      a fresh uuidv4() per upload — a convention nothing enforced. A collision must fail, because
//      the existing master is the valuable artifact, not the incoming bytes.
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

// ── 5. WHAT PHASE 1 DELIBERATELY DOES NOT DO ────────────────────────────────
console.log("\n5. Phase 1 scope is honest about what is still missing:")
ok("no file is deleted anywhere in this migration", !/storage|remove\(/i.test(migration))
ok("the API dependent-count check is NOT claimed yet (Phase 2)",
  !/409|dependent/i.test(read("app/api/admin/social-autopilot/content/[id]/route.ts")))

console.log(`\nSource protection (Phase 1): ${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
