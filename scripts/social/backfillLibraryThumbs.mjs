// BACKFILL — one internal Video Library thumbnail per existing source clip.
//
// SAFETY, stated as behaviour rather than intent:
//   • It only ever WRITES <owner>/<id>/thumb.jpg and social_content.thumb_storage_path. It never
//     writes, renames, re-encodes, replaces or deletes an original, and never touches
//     social_posts, cover_storage_path, overlays, captions, scheduling or publishing.
//   • RESUMABLE + IDEMPOTENT: it skips any row that already has thumb_storage_path, so a rerun
//     after a crash, a timeout or a Ctrl-C costs nothing and changes nothing. Re-running it to
//     completion is a no-op.
//   • BATCHED: --batch rows per pass with a pause between, and --limit to stop early, so it never
//     saturates the connection or the machine.
//   • A failure is per-row and non-fatal: the clip stays usable and simply has no thumbnail, which
//     the grid falls back from. Failures are counted and listed at the end.
//
// It READS each original to decode one frame — unavoidable for any thumbnail — and does so with
// ffmpeg's `-ss` BEFORE `-i`, so it range-requests around the 0.6s mark instead of pulling the
// whole file. Nothing is written back to the source object.
//
// USAGE
//   node scripts/social/backfillLibraryThumbs.mjs --dry-run         # report only, no writes
//   node scripts/social/backfillLibraryThumbs.mjs --limit 5         # prove it on five rows
//   node scripts/social/backfillLibraryThumbs.mjs                   # the rest
import { readFileSync, writeFileSync, unlinkSync, mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { createClient } from "@supabase/supabase-js"
import ffmpegPath from "ffmpeg-static"

const run = promisify(execFile)
const argv = process.argv.slice(2)
const flag = (n, d) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d }
const DRY = argv.includes("--dry-run")
const BATCH = Number(flag("--batch", 10))
const LIMIT = Number(flag("--limit", 0)) || Infinity
const PAUSE_MS = Number(flag("--pause", 750))
const SEEK = 0.6
const MAX_PX = 640

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }),
)
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// RESUMABILITY IS A QUERY, not a state file: "rows without a thumbnail" is the work remaining.
const { data: todo, error } = await db
  .from("social_content")
  .select("id, owner_user_id, storage_path, kind, original_filename, thumb_storage_path")
  .is("thumb_storage_path", null)
  .order("created_at", { ascending: false })
if (error) { console.error("list failed:", error.message); process.exit(1) }

const clips = todo.filter((r) => r.kind !== "image" && r.storage_path)
const { count: total } = await db.from("social_content").select("*", { count: "exact", head: true })
const { count: done0 } = await db.from("social_content").select("*", { count: "exact", head: true }).not("thumb_storage_path", "is", null)
console.log(`library: ${total} rows | already have a thumbnail: ${done0} | missing: ${clips.length}${todo.length - clips.length ? ` (+${todo.length - clips.length} images/pathless, skipped)` : ""}`)
if (DRY) { console.log("\n--dry-run: nothing will be read, written or changed."); process.exit(0) }

const work = clips.slice(0, LIMIT === Infinity ? clips.length : LIMIT)
console.log(`processing ${work.length} in batches of ${BATCH}\n`)

const tmp = mkdtempSync(path.join(tmpdir(), "lbthumb-"))
let ok = 0, failed = 0
const failures = []

for (let i = 0; i < work.length; i += BATCH) {
  const batch = work.slice(i, i + BATCH)
  for (const r of batch) {
    const label = (r.original_filename || r.id).slice(0, 40)
    const out = path.join(tmp, `${r.id}.jpg`)
    try {
      // READ-ONLY signed URL for the original. Short TTL; never stored.
      const { data: signed, error: se } = await db.storage.from("social-media").createSignedUrl(r.storage_path, 600)
      if (se || !signed?.signedUrl) throw new Error("sign failed")
      // -ss BEFORE -i: seek first, so ffmpeg range-requests near 0.6s instead of reading the file.
      // -frames:v 1 → exactly one frame. scale: longest side MAX_PX, aspect preserved.
      await run(ffmpegPath, [
        "-nostdin", "-loglevel", "error", "-y",
        "-ss", String(SEEK), "-i", signed.signedUrl,
        "-frames:v", "1",
        "-vf", `scale=w=${MAX_PX}:h=${MAX_PX}:force_original_aspect_ratio=decrease`,
        "-q:v", "6", out,
      ], { timeout: 120_000, maxBuffer: 8 * 1024 * 1024 })
      const jpg = readFileSync(out)
      if (!jpg.length) throw new Error("empty frame")
      const thumbPath = `${r.owner_user_id}/${r.id}/thumb.jpg`
      // Writes a NEW object beside the source. Never the source path itself.
      if (thumbPath.endsWith("/source") || !thumbPath.endsWith("/thumb.jpg")) throw new Error("refusing a non-thumbnail path")
      const up = await db.storage.from("social-media").upload(thumbPath, jpg, { contentType: "image/jpeg", upsert: true })
      if (up.error) throw new Error(`upload: ${up.error.message}`)
      const { error: ue } = await db.from("social_content").update({ thumb_storage_path: thumbPath }).eq("id", r.id).eq("owner_user_id", r.owner_user_id)
      if (ue) throw new Error(`row: ${ue.message}`)
      ok++
      console.log(`  ✓ ${label.padEnd(42)} ${(jpg.length / 1024).toFixed(0)}KB`)
    } catch (e) {
      failed++
      const msg = e instanceof Error ? e.message.split("\n")[0].slice(0, 120) : String(e)
      failures.push({ id: r.id, file: label, msg })
      console.log(`  ✗ ${label.padEnd(42)} ${msg}`)
    } finally {
      try { unlinkSync(out) } catch { /* already gone */ }
    }
  }
  if (i + BATCH < work.length) await sleep(PAUSE_MS)
}

const { count: doneNow } = await db.from("social_content").select("*", { count: "exact", head: true }).not("thumb_storage_path", "is", null)
console.log(`\ngenerated ${ok}, failed ${failed} | library now has ${doneNow}/${total} thumbnails`)
if (failures.length) {
  console.log("failures (these clips remain fully usable, just without a thumbnail):")
  for (const f of failures) console.log(`  ${f.file} — ${f.msg}`)
}
