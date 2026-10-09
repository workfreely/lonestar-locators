// OBSOLETE TEST-RENDER CLEANUP — deletes disposable rendered MP4s under renders/ ONLY.
//
// Renders are regenerable from the master in minutes; the master is irreplaceable. This script
// exists so that distinction is enforced mechanically rather than trusted to a careful operator,
// and so the deletion goes through the STORAGE API rather than SQL.
//
// WHY NOT SQL: deleting from storage.objects removes the metadata row and leaves the S3 bytes
// behind — which recovers nothing and creates exactly the untracked file we spent Phase 2 making
// impossible. Supabase says so itself in storage.protect_delete(): "Use the Storage API instead.
// This prevents accidental data loss from orphaned objects."
//
// FIVE GUARDS, all of which must pass before a single byte is removed:
//   1. assertAllDisposable() — the shared Phase 2B guard. Throws on any source.* key, and is
//      all-or-nothing, so one bad path in the batch deletes none of it.
//   2. every path must sit under /renders/ and end in .mp4.
//   3. no path may be live-referenced by any post, source, cover, take or voice clip — re-read
//      from the database at delete time, not taken on trust from an earlier audit.
//   4. the count must match --expect exactly, so a changed inventory stops the run.
//   5. --apply is required; the default is a dry run.
//
// THE LIST COMES FROM storage.objects, NOT FROM A FOLDER WALK. The first version of this script
// derived folders from social_content.storage_path, which silently missed 5 files: renders whose
// source row had already been deleted in an earlier cleanup, so no folder pointed at them. Guard 4
// caught it (20 found vs 25 expected). The authoritative inventory is the bucket itself, read over
// SQL and passed in with --paths.
//
// Run: node --env-file=.env.local --import tsx scripts/social/cleanupObsoleteRenders.ts \
//        --paths <file-with-one-key-per-line> --expect 25 [--apply]
import { readFileSync } from "node:fs"
import { createClient } from "@supabase/supabase-js"
import { assertAllDisposable, isSourceObjectPath } from "@/lib/social/storagePaths"

const BUCKET = "social-media"
const APPLY = process.argv.includes("--apply")
const expectIdx = process.argv.indexOf("--expect")
const EXPECT = expectIdx > -1 ? Number(process.argv[expectIdx + 1]) : NaN
if (!Number.isInteger(EXPECT)) {
  console.error("Refusing to run without an explicit --expect <count>.")
  process.exit(2)
}

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
const mb = (n: number) => `${(n / 1024 / 1024).toFixed(2)} MB`

async function main() {
  // ── INVENTORY ───────────────────────────────────────────────────────────────────────────────
  // Read from the file, which came from storage.objects. Sizes are then re-read per folder from
  // the Storage API so the reported recovery is measured, not carried over from the audit.
  const listFile = process.argv[process.argv.indexOf("--paths") + 1]
  if (!listFile) throw new Error("--paths <file> is required")
  const wanted = readFileSync(listFile, "utf8").split("\n").map((l) => l.trim()).filter(Boolean)
  if (new Set(wanted).size !== wanted.length) throw new Error("the path list contains duplicates")

  // ── GUARDS 1 + 2, FIRST ─────────────────────────────────────────────────────────────────────
  // Run against the SUPPLIED list before anything else reads the bucket. A source key used to be
  // stopped further down by an incidental "not in the bucket" check — the right outcome reached by
  // the wrong route. The dedicated guard must be the first thing that can halt this script.
  assertAllDisposable(wanted) // throws on any source.* — all-or-nothing
  if (wanted.some(isSourceObjectPath)) throw new Error("Refusing: a source key is in the supplied list")
  const badShape = wanted.filter((p) => !p.includes("/renders/") || !p.endsWith(".mp4"))
  if (badShape.length) throw new Error(`Refusing: not renders/*.mp4 -> ${badShape.join(", ")}`)

  // Folders to list for size lookup + post-delete verification, derived from the keys themselves
  // so a render under a deleted source folder is still covered.
  const folders = new Set(wanted.map((p) => p.slice(0, p.lastIndexOf("/renders/"))))
  const sizeOf = new Map<string, number>()
  for (const folder of folders) {
    const { data: objs } = await sb.storage.from(BUCKET).list(`${folder}/renders`, { limit: 1000 })
    for (const o of objs ?? []) {
      if (o.name) sizeOf.set(`${folder}/renders/${o.name}`, (o.metadata as { size?: number } | null)?.size ?? 0)
    }
  }
  const missing = wanted.filter((p) => !sizeOf.has(p))
  if (missing.length) throw new Error(`${missing.length} listed key(s) are not in the bucket: ${missing.join(", ")}`)
  const found = wanted.map((path) => ({ path, bytes: sizeOf.get(path) ?? 0 })).sort((a, b) => a.path.localeCompare(b.path))

  // ── GUARD 3: nothing live may be referenced ─────────────────────────────────────────────────
  // Re-read now rather than trusting the audit: a render created or referenced between the audit
  // and this run must not be swept up.
  const live = new Set<string>()
  const addAll = (rows: unknown[] | null, key: string) => {
    for (const r of rows ?? []) {
      const v = (r as Record<string, unknown>)[key]
      if (typeof v === "string" && v) live.add(v)
    }
  }
  const [posts, srcs, clips] = await Promise.all([
    sb.from("social_posts").select("rendered_storage_path, cover_storage_path, source_storage_path"),
    sb.from("social_content").select("storage_path"),
    sb.from("social_voice_clips").select("storage_path"),
  ])
  if (posts.error || srcs.error || clips.error) throw new Error("reference read failed")
  addAll(posts.data, "rendered_storage_path")
  addAll(posts.data, "cover_storage_path")
  addAll(posts.data, "source_storage_path")
  addAll(srcs.data, "storage_path")
  addAll(clips.data, "storage_path")
  // social_render_jobs.output_path is DELIBERATELY not treated as a live reference: it is an
  // append-only record of a job that already finished, nothing serves a file from it, and
  // rewriting it would be rewriting history. It is reported instead.

  const referenced = found.filter((f) => live.has(f.path))
  const targets = found.filter((f) => !live.has(f.path))

  console.log(`keys supplied from inventory:  ${found.length}`)
  console.log(`still live-referenced (SKIP):  ${referenced.length}`)
  console.log(`obsolete, to delete:           ${targets.length}  (${mb(targets.reduce((n, t) => n + t.bytes, 0))})`)
  for (const r of referenced) console.log(`   SKIP (referenced): ${r.path.split("/renders/")[1]}`)

  // ── GUARDS 1 + 2, RE-ASSERTED ───────────────────────────────────────────────────────────────
  // Deliberately repeated on the final list that will actually be handed to remove(), so no
  // filtering or mapping between here and there can reintroduce a protected key.
  const paths = targets.map((t) => t.path)
  assertAllDisposable(paths)
  if (paths.some(isSourceObjectPath)) throw new Error("Refusing: a source key reached the delete list")
  const shapeViolations = paths.filter((p) => !p.includes("/renders/") || !p.endsWith(".mp4"))
  if (shapeViolations.length) throw new Error(`Refusing: not renders/*.mp4 -> ${shapeViolations.join(", ")}`)

  // ── GUARD 4 ─────────────────────────────────────────────────────────────────────────────────
  if (paths.length !== EXPECT) {
    console.error(`\nSTOP: expected ${EXPECT} obsolete files, found ${paths.length}. Inventory changed — re-audit.`)
    process.exit(3)
  }

  const totalBytes = targets.reduce((n, t) => n + t.bytes, 0)
  if (!APPLY) {
    console.log(`\nDRY RUN — nothing deleted. ${paths.length} files / ${mb(totalBytes)} would be removed.`)
    console.log("Re-run with --apply to delete.")
    return
  }

  // ── DELETE, in batches, via the Storage API ─────────────────────────────────────────────────
  console.log(`\nDeleting ${paths.length} objects…`)
  let removed = 0
  const failures: Array<{ path: string; message: string }> = []
  for (let i = 0; i < paths.length; i += 20) {
    const batch = paths.slice(i, i + 20)
    const { data, error } = await sb.storage.from(BUCKET).remove(batch)
    if (error) {
      for (const p of batch) failures.push({ path: p, message: error.message })
      continue
    }
    removed += (data ?? []).length
  }
  console.log(`storage API reported removed: ${removed}`)
  if (failures.length) {
    console.log(`FAILURES (${failures.length}):`)
    for (const f of failures) console.log(`   ${f.path} -> ${f.message}`)
  }

  // ── VERIFY, by re-listing rather than trusting the response ──────────────────────────────────
  let stillThere = 0
  for (const folder of folders) {
    const { data: objs } = await sb.storage.from(BUCKET).list(`${folder}/renders`, { limit: 1000 })
    for (const o of objs ?? []) if (o.name && paths.includes(`${folder}/renders/${o.name}`)) stillThere++
  }
  console.log(`\nre-listed: ${stillThere} of the ${paths.length} targets still present`)
  console.log(stillThere === 0 ? `DONE — ${paths.length} files, ${mb(totalBytes)} recovered.` : "INCOMPLETE — see above.")
}

main().catch((e) => {
  console.error("ABORTED:", e instanceof Error ? e.message : e)
  process.exit(1)
})
