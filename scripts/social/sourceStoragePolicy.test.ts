// SOURCE VIDEO PROTECTION — Phase 2B: path-aware storage permissions.
//
// One bucket holds things of completely different value — irreplaceable original masters next to
// disposable renders — and the only thing distinguishing them is the key. Before this, one policy
// governed the whole bucket: correct about WHO (a platform admin, in their own folder) and silent
// about WHAT. A browser session could delete or overwrite a master as easily as a render.
//
// Two RESTRICTIVE policies on storage.objects now remove DELETE and UPDATE from source.* keys for
// ordinary client sessions. Restrictive because same-command policies are OR'd: an additional
// permissive policy can only ever widen access, so there is no way to subtract with one.
//
// VERIFIED AGAINST PRODUCTION as the `authenticated` role, with a decoy object at a content id that
// is not one of the real sources — no original was ever a test target. Each result below came with
// a control proving the test could discriminate at all:
//
//   DELETE a source.* decoy                      0 rows      <- blocked
//   DELETE a renders/ decoy (control)             1 row       <- still works, so commits do happen
//   UPDATE a source.* decoy                      0 rows      <- blocked
//   UPDATE a renders/ decoy (control)             1 row       <- still works
//   INSERT a source.*                            1 row       <- UPLOAD STILL WORKS
//   INSERT a renders/ object                     1 row       <- RENDER WRITES STILL WORK
//   INSERT into another user's folder            refused      <- ownership still enforced
//   RENAME a render onto a source.* key          refused      <- "social-media source is
//                                                                update-protected" by name
//
// The first attempt at the DELETE test was invalid and is recorded here so it is not repeated:
// storage.protect_delete() rejects ALL direct SQL deletes from storage.objects, which killed the
// control as well as the subject, so it proved nothing. The trigger has a session-level bypass
// (storage.allow_delete_query) that does not touch RLS; with it set, the subject/control split
// above is a real result.
//
// Run: npx tsx scripts/social/sourceStoragePolicy.test.ts
import { readFileSync } from "node:fs"
import path from "node:path"
import { isSourceObjectPath, storageFilename, assertDisposablePath, assertAllDisposable } from "../../lib/social/storagePaths"

let pass = 0, fail = 0
const ok = (l: string, c: boolean) => { if (c) { pass++; console.log(`  ✓ ${l}`) } else { fail++; console.log(`  ✗ ${l}`) } }
const read = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8")
const stripSql = (sql: string) => sql.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n")

const policyRaw = read("supabase/migrations/20261009000003_protect_source_storage_objects.sql")
const policy = stripSql(policyRaw)
const journalRaw = read("supabase/migrations/20261009000004_source_deletion_journal.sql")
const journal = stripSql(journalRaw)
const route = read("app/api/admin/social-autopilot/content/[id]/route.ts")
// SCOPE TO THE DELETE HANDLER. Asserting ordering against the whole file is a false signal: the
// `supabaseAdmin` import sits on line 3, so every "X comes before the service-role client" check
// passes trivially, and PATCH legitimately reads body fields that DELETE must not.
const deleteHandler = route.slice(route.indexOf("export async function DELETE"))
const routeCode = deleteHandler.replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, "")
const voice = read("app/api/admin/social-autopilot/voice-clips/route.ts")

// ── 1. THE PREDICATE, IN BOTH LANGUAGES ─────────────────────────────────────
// The policy and the application must agree on what "a source video" is. A divergence means the app
// believes it may delete something the database refuses — or, far worse, the reverse.
console.log("1. the SQL predicate and its TypeScript twin agree:")
{
  // The SQL, as applied: storage.filename(name) like 'source.%'
  const sqlPredicate = (key: string) => storageFilename(key).startsWith("source.")
  const OWNER = "c567c077-d3f4-4532-8807-a54795f753f5"
  const CID = "0f7a58ec-aef1-47d4-bfd8-3d96ddc4e1f4"
  const cases: Array<[string, boolean]> = [
    [`${OWNER}/${CID}/source.mov`, true],                       // the real shape — 81 of these
    [`${OWNER}/${CID}/source.mp4`, true],
    [`${OWNER}/${CID}/source.MOV`, true],                       // the case difference is in the EXTENSION; the prefix still matches
    [`${OWNER}/${CID}/Source.mov`, false],                      // LIKE *is* case-sensitive, so a capitalised PREFIX escapes.
                                                                // Not an exposure: the prefix is a hardcoded literal in both
                                                                // upload paths (`/source.${extOf(...)}`), so no key can be
                                                                // written this way — but it is the one shape that would slip.
    [`${OWNER}/${CID}/renders/abc-3.mp4`, false],               // disposable
    [`${OWNER}/${CID}/takes/1760000000000.mov`, false],          // Replace Video
    [`${OWNER}/${CID}/covers/cover.jpg`, false],                // Reel cover
    [`${OWNER}/voice/7081b2cd.mp3`, false],                     // voice clip
    [`${OWNER}/${CID}/render-e2e-proof-muy4sxeq.mp4`, false],    // a render-pipeline e2e artifact; the object itself was
                                                                // deleted 2026-10-09, but the SHAPE still has to classify as
                                                                // disposable — it sat in the same folder as a source.mov
    [`${OWNER}/${CID}/sources.mov`, false],                     // not the prefix
    [`${OWNER}/${CID}/my-source.mov`, false],                    // filename must START with it
    [`${OWNER}/${CID}/renders/source.mp4`, true],               // protected at ANY depth, by design
    [`source.mp4`, true],                                        // no folder at all
  ]
  for (const [key, expected] of cases) {
    ok(`${expected ? "PROTECTED" : "disposable"}: ${key.replace(OWNER, "{owner}").replace(CID, "{cid}")}`,
      isSourceObjectPath(key) === expected && sqlPredicate(key) === expected)
  }
  ok("null / undefined / empty are never treated as a source", !isSourceObjectPath(null) && !isSourceObjectPath(undefined) && !isSourceObjectPath(""))
}

// ── 2. THE POLICIES THEMSELVES ──────────────────────────────────────────────
console.log("\n2. the migration subtracts, and only from two verbs:")
ok("both policies are AS RESTRICTIVE (permissive could only widen access)", (policy.match(/as restrictive/gi) ?? []).length === 2)
ok("one governs DELETE", /create policy "social-media source is delete-protected"[\s\S]{0,200}for delete/i.test(policy))
ok("one governs UPDATE", /create policy "social-media source is update-protected"[\s\S]{0,200}for update/i.test(policy))
ok("NEITHER governs SELECT or INSERT — reading and uploading a source must keep working",
  !/for select/i.test(policy) && !/for insert/i.test(policy))
ok("...and neither is `for all`, which would have AND'd against those too", !/as restrictive\s+for all/i.test(policy))
ok("the predicate is the filename form", (policy.match(/storage\.filename\(name\) not like 'source\.%'/g) ?? []).length === 3)
ok("...and it passes through for every other bucket", (policy.match(/bucket_id <> 'social-media'/g) ?? []).length === 3)
ok("UPDATE carries WITH CHECK too, so a RENAME cannot land on a master", /for update[\s\S]{0,400}with check/i.test(policy))
ok("the existing admin policy is NOT touched", !/social-media admin all/.test(policy.replace(/comment[\s\S]*?;/g, "")))
ok("no object is deleted, moved or migrated", !/\bdelete\s+from\b/i.test(policy) && !/\bupdate\s+storage\./i.test(policy) && !/\binsert\s+into\b/i.test(policy))
ok("the measured blast radius is recorded in the migration", /106 objects/.test(policyRaw) && /matches 76/.test(policyRaw))

// ── 3. THE JOURNAL ──────────────────────────────────────────────────────────
// The remaining weakness of row-first ordering was that a failed storage call left bytes nothing
// referenced. Writing the path down BEFORE anything is destroyed closes it.
console.log("\n3. nothing is destroyed before it is written down:")
ok("a journal table exists", /create table if not exists public\.social_source_deletions/.test(journal))
ok("it records the path, so an orphan is never untracked", /storage_path text not null/.test(journal))
ok("...and the context that dies with the row", /property_name text/.test(journal) && /source_content_id uuid not null/.test(journal))
ok("...and who asked", /requested_by uuid not null references auth\.users\(id\)/.test(journal))
ok("every incomplete or failed state is representable", ["pending", "row_deleted", "completed", "aborted", "orphaned"].every((s) => new RegExp(`'${s}'`).test(journal)))
ok("NO foreign key to social_content (the row it names is being deleted)", !/references public\.social_content/.test(journal))
ok("RLS is on", /enable row level security/.test(journal))
ok("clients may READ their own entries", /for select[\s\S]{0,160}requested_by = auth\.uid\(\)/.test(journal))
ok("...and have NO write policy at all — an editable audit log is not an audit log",
  !/for (insert|update|delete)/i.test(journal.replace(/for select[\s\S]*/i, "")))

// ── 4. THE ROUTE'S SERVICE-ROLE PATH ────────────────────────────────────────
console.log("\n4. the one audited path that may remove a master:")
ok("the file removal uses the service-role client", /supabaseAdmin\.storage\.from\("social-media"\)\.remove\(\[src\.storage_path\]\)/.test(routeCode))
ok("...and it is the ONLY storage removal in the route", (routeCode.match(/storage\.from\("social-media"\)\.remove\(/g) ?? []).length === 1)
ok("the path is read FROM THE DATABASE, never from the request body", /\.select\("id, storage_path, property_name, owner_user_id"\)/.test(routeCode))
ok("...and the body contributes only a confirmation token", (routeCode.match(/body\.\w+/g) ?? []).every((m) => m === "body.confirm"))
ok("platform-admin is verified first", routeCode.indexOf("requirePlatformAdmin()") < routeCode.indexOf("supabaseAdmin"))
ok("ownership is asserted explicitly, because the service role bypasses RLS",
  /src\.owner_user_id !== guard\.userId/.test(routeCode) && routeCode.indexOf("owner_user_id !== guard.userId") < routeCode.indexOf("supabaseAdmin"))
ok("...against the SESSION identity, not the body", /guard\.userId/.test(routeCode) && !/body\.userId|body\.owner/.test(routeCode))

// Ordering of the gates, read off the file. Each must precede the first service-role call.
{
  const iAdmin = routeCode.indexOf("requirePlatformAdmin()")
  const iOwner = routeCode.indexOf("owner_user_id !== guard.userId")
  const iDeps = routeCode.indexOf('error: "source_has_dependents"')
  const iConfirm = routeCode.indexOf('body.confirm !== "delete-source-video"')
  const iJournal = routeCode.indexOf('.from("social_source_deletions")')
  const iRowDel = routeCode.indexOf('.from("social_content").delete()')
  const iFileDel = routeCode.indexOf("supabaseAdmin.storage")
  ok("order: admin -> ownership -> dependents -> confirmation -> journal -> row -> file",
    iAdmin < iOwner && iOwner < iDeps && iDeps < iConfirm && iConfirm < iJournal && iJournal < iRowDel && iRowDel < iFileDel,
    )
  ok("the row delete stays on the RLS client (least privilege, re-checked at write time)",
    /await supabase\.from\("social_content"\)\.delete\(\)/.test(routeCode))
  ok("a journal failure ABORTS instead of deleting untracked", /if \(journalErr \|\| !journal\)[\s\S]{0,320}status: 500/.test(routeCode))
  ok("...and says the video is untouched", /Your video is untouched/.test(route))
}
ok("each outcome is recorded: row_deleted / completed / aborted / orphaned",
  ["row_deleted", "completed", "aborted", "orphaned"].every((s) => new RegExp(`status: "${s}"`).test(routeCode)))
ok("the orphan case still names the path to the operator", /orphanedPath: src\.storage_path/.test(routeCode) && /journalId/.test(routeCode))

// ── 5. CLEANUP CAN NEVER REACH A MASTER ─────────────────────────────────────
// Rendered-file cleanup and source deletion must stay separate operations. Cleanup runs over lists
// of keys, often in bulk, often from a query — exactly the shape of thing that one day contains a
// key it should not.
console.log("\n5. a disposable-file cleanup cannot delete a master:")
{
  let threw = false
  try { assertDisposablePath("owner/cid/source.mov") } catch { threw = true }
  ok("assertDisposablePath THROWS on a source key", threw)
  ok("...and passes a render through unchanged", assertDisposablePath("owner/cid/renders/p-2.mp4") === "owner/cid/renders/p-2.mp4")

  let bulkThrew = false
  try { assertAllDisposable(["owner/cid/renders/a.mp4", "owner/cid/source.mov", "owner/cid/renders/b.mp4"]) } catch { bulkThrew = true }
  ok("a MIXED batch throws, so none of it is deleted", bulkThrew)
  ok("...a clean batch passes", assertAllDisposable(["owner/cid/renders/a.mp4"]).length === 1)

  // It throws rather than filtering on purpose: silently skipping a master would hide the fact that
  // something asked to delete one.
  ok("the guard throws rather than filtering", /throw new Error/.test(read("lib/social/storagePaths.ts")) && !/\.filter\(\(p\) => !isSourceObjectPath/.test(read("lib/social/storagePaths.ts")))

  // Live wiring: the only other code path that removes from this bucket is guarded.
  ok("the voice-clip cleanup is guarded", /remove\(\[assertDisposablePath\(/.test(voice))
  ok("...and imports the shared guard", /from "@\/lib\/social\/storagePaths"/.test(voice))
}

// Every social-media removal in the codebase is either the audited source route or guarded.
console.log("\n   every removal site in the bucket, enumerated:")
{
  const FILES = [
    "app/api/admin/social-autopilot/content/[id]/route.ts",
    "app/api/admin/social-autopilot/voice-clips/route.ts",
  ]
  const sites: Array<{ file: string; guarded: boolean }> = []
  for (const f of FILES) {
    const body = read(f).replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, "")
    for (const m of body.matchAll(/storage\.from\("social-media"\)\.remove\(\[([^\]]*)\]/g)) {
      sites.push({ file: f, guarded: m[1].includes("assertDisposablePath") || m[1] === "src.storage_path" })
    }
  }
  ok(`${sites.length} removal site(s) found, all accounted for`, sites.length === 2 && sites.every((s) => s.guarded))
}

// ── 6. WHAT MUST STILL WORK ─────────────────────────────────────────────────
// Source INSERT alone is sufficient for uploads ONLY because Phase 1 made both of them
// upsert:false. An upsert would have needed UPDATE, which these policies remove.
console.log("\n6. the workflows the policies must not break:")
{
  const library = read("components/crm/social/SocialAutopilotClient.tsx")
  const bulk = read("components/crm/social/BulkReview.tsx")
  const renderPost = read("lib/social/renderPost.ts")
  const editor = read("components/crm/social/PostEditor.tsx")
  const cover = read("components/crm/social/ReelCoverControl.tsx")

  ok("source uploads need INSERT only (upsert:false, from Phase 1)",
    /source\.\$\{extOf\(uf\.file\.name\)\}/.test(library) && /source\.\$\{extOf\(r\.file\.name\)\}/.test(bulk))
  ok("the renderer READS the source (SELECT), never writes it", /createSignedUrl\(sourcePath/.test(renderPost) && !/upload\([^)]*source\./.test(renderPost))
  ok("render output goes to renders/ — not matched by either policy", /renders\/\$\{id\}-\$\{nextVersion\}/.test(renderPost))
  ok("Replace Video goes to takes/ — not matched", /takes\/\$\{Date\.now\(\)\}/.test(editor))
  ok("Reel covers go to covers/ — not matched", /covers\//.test(cover))
  ok("voice clips live under voice/ — not matched", /\$\{uid\}\/voice\//.test(read("components/crm/social/VoiceClipsControl.tsx")))
  ok("the migration enumerates each surviving workflow", /WHAT STILL WORKS, UNCHANGED/.test(policyRaw))
}

// ── 7. SERVICE CREDENTIALS STAY ON THE SERVER ───────────────────────────────
console.log("\n7. no service credential reaches a client:")
{
  const admin = read("lib/supabase/admin.ts")
  ok("the key is SUPABASE_SERVICE_ROLE_KEY, not a NEXT_PUBLIC_* var", /process\.env\.SUPABASE_SERVICE_ROLE_KEY/.test(admin) && !/NEXT_PUBLIC[A-Z_]*SERVICE/.test(admin))
  ok("the delete route is a server route (no \"use client\")", !/^["']use client["']/m.test(route))
  ok("...and never returns the key or a service token in its response", !/SERVICE_ROLE/.test(routeCode))
  ok("the journal id it DOES return is an audit handle, not a credential", /journalId/.test(routeCode))
}

console.log(`\nSource storage policy (Phase 2B): ${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
