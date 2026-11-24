// DELETE ONE SOURCE VIDEO, following the DELETE route's discipline exactly.
//
// Run: node scripts/delete-source-video.mjs --id <content-uuid-prefix> [--apply]
// Without --apply it prints what it would do and writes nothing.
//
// This exists because the operator cannot reach the fixed route until it is deployed, and the
// video he wants gone is the wrong cut of a video he is about to re-upload. It is NOT a shortcut
// around the protections — it reproduces every one of them, in the same order, against the same
// tables:
//
//   1. the row is READ first, and the storage path comes from the database, never from an argument
//   2. every dependent post is classified; a published, approved or non-draft post ABORTS
//   3. the deletion is JOURNALLED to social_source_deletions as 'pending' BEFORE anything is
//      destroyed, so an original can never become an untracked file
//   4. plain drafts go first (the FK is ON DELETE RESTRICT, so the row cannot go before them)
//   5. the ROW goes before the FILE, because the surviving failure mode must be the recoverable
//      one — bytes with a journalled path, not a row pointing at footage that is gone
//   6. the journal is marked 'row_deleted', then 'completed' or 'orphaned'
import { createClient } from "@supabase/supabase-js"
import { readFileSync } from "node:fs"

const APPLY = process.argv.includes("--apply")
const arg = (n) => { const i = process.argv.indexOf(`--${n}`); return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : null }
const idPrefix = arg("id")
if (!idPrefix) { console.error("usage: node scripts/delete-source-video.mjs --id <uuid-or-prefix> [--apply]"); process.exit(2) }

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "")
}
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

// ── 1. THE ROW, AND THE PATH FROM THE DATABASE ──────────────────────────────────────────────
// A prefix is matched client-side: `like` against a uuid column is rejected by Postgres
// ("operator does not exist: uuid ~~ unknown"), and casting it in the query would mean building
// SQL by hand for no gain. The exact id is then used for every read and write below.
const { data: all, error: readErr } = await db
  .from("social_content")
  .select("id, storage_path, property_name, display_name, owner_user_id, created_at")
if (readErr) { console.error("read failed:", readErr.message); process.exit(1) }
const rows = (all ?? []).filter((r) => String(r.id).startsWith(idPrefix))
if (!rows || rows.length === 0) { console.error(`no social_content row matches ${idPrefix}`); process.exit(1) }
if (rows.length > 1) { console.error(`${idPrefix} matches ${rows.length} rows — refusing to guess`); process.exit(1) }
const src = rows[0]

console.log("TARGET")
console.log(`  id            ${src.id}`)
console.log(`  uploaded      ${src.created_at}`)
console.log(`  property      ${src.property_name}`)
console.log(`  display name  ${src.display_name}`)
console.log(`  storage_path  ${src.storage_path ?? "(none)"}`)

// ── 2. CLASSIFY EVERY DEPENDENT ─────────────────────────────────────────────────────────────
const { data: deps, error: depErr } = await db
  .from("social_posts")
  .select("id, platform, status, published_at, external_post_id, approved_at, rendered_storage_path")
  .eq("source_content_id", src.id)
if (depErr) { console.error("dependency read failed:", depErr.message); process.exit(1) }
const posts = deps ?? []
const blocking = posts.filter((p) => p.published_at || p.external_post_id || p.approved_at || (p.status ?? "") !== "draft")
const drafts = posts.filter((p) => !blocking.includes(p))

console.log(`\nDEPENDENTS (${posts.length})`)
for (const p of posts) {
  const why = blocking.includes(p)
    ? `BLOCKING (${p.published_at ? "published" : p.external_post_id ? "has external id" : p.approved_at ? "approved" : `status ${p.status}`})`
    : "plain unpublished draft — removable"
  console.log(`  ${p.id.slice(0, 8)}  ${String(p.platform).padEnd(10)} ${String(p.status).padEnd(10)} ${why}`)
}
if (blocking.length > 0) {
  console.error(`\nABORT: ${blocking.length} dependent post(s) cannot be removed with this source. Nothing was touched.`)
  process.exit(1)
}

if (!APPLY) {
  console.log(`\nWould remove: ${drafts.length} draft post(s), the social_content row, and the storage object.`)
  console.log("Nothing was written. Re-run with --apply.")
  process.exit(0)
}

// ── 3. JOURNAL BEFORE DESTROY ───────────────────────────────────────────────────────────────
const { data: journal, error: jErr } = await db
  .from("social_source_deletions")
  .insert({
    source_content_id: src.id,
    storage_path: src.storage_path ?? "",
    property_name: src.property_name ?? null,
    requested_by: src.owner_user_id,
    status: "pending",
  })
  .select("id")
  .maybeSingle()
if (jErr || !journal) {
  console.error("refusing to delete without a journal entry:", jErr?.message)
  process.exit(1)
}
const journalId = journal.id
const mark = (patch) => db.from("social_source_deletions").update(patch).eq("id", journalId)
console.log(`\njournalled  ${journalId}  status=pending`)

// ── 4. DRAFTS FIRST — the FK is RESTRICT, so the row cannot go before them ───────────────────
// Every condition is re-asserted on the WRITE: a post approved since the read above must survive,
// and then RESTRICT stops the source delete rather than this script deciding to proceed anyway.
if (drafts.length > 0) {
  const { data: gone, error: dErr } = await db
    .from("social_posts")
    .delete()
    .in("id", drafts.map((p) => p.id))
    .is("published_at", null)
    .is("external_post_id", null)
    .is("approved_at", null)
    .eq("status", "draft")
    .select("id")
  if (dErr) {
    await mark({ status: "aborted", failure_reason: `draft_delete_failed: ${dErr.message}` })
    console.error("draft delete failed, nothing else touched:", dErr.message)
    process.exit(1)
  }
  console.log(`drafts removed  ${(gone ?? []).length} of ${drafts.length}`)
}

// ── 5. ROW BEFORE FILE ──────────────────────────────────────────────────────────────────────
const { error: rowErr } = await db.from("social_content").delete().eq("id", src.id)
if (rowErr) {
  await mark({ status: "aborted", failure_reason: `row_delete_failed: ${rowErr.message}` })
  console.error("row delete failed; the video was not touched:", rowErr.message)
  process.exit(1)
}
await mark({ status: "row_deleted", row_deleted_at: new Date().toISOString() })
console.log("row removed")

// ── 6. THE FILE ─────────────────────────────────────────────────────────────────────────────
if (src.storage_path) {
  const { error: rmErr } = await db.storage.from("social-media").remove([src.storage_path])
  if (rmErr) {
    await mark({ status: "orphaned", failure_reason: `file_remove_failed: ${rmErr.message}` })
    console.error(`row deleted but the file remains at ${src.storage_path}: ${rmErr.message}`)
    process.exit(1)
  }
  console.log("file removed")
}
await mark({ status: "completed", file_removed_at: new Date().toISOString() })
console.log(`\ndone. journal ${journalId} status=completed`)
