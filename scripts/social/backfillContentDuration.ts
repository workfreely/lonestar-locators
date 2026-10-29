/**
 * ONE-TIME BACKFILL — social_content.duration_s for footage uploaded before it was captured.
 *
 *   npx tsx scripts/social/backfillContentDuration.ts --dry-run
 *   npx tsx scripts/social/backfillContentDuration.ts
 *
 * New uploads measure themselves in the browser. These rows predate that, so their length has to
 * come from the stored file — and the only way to get it is to read the file's header.
 *
 * ── IT READS THE HEADER, NOT THE FILE ───────────────────────────────────────────────────────
 * ffmpeg is pointed at a signed URL and asked only to probe. For an MP4 that means the moov atom
 * and a handful of range requests, not a download of the clip. Nothing is decoded, re-encoded,
 * written back to storage or renamed: the stored object is opened read-only and left exactly as
 * it was.
 *
 * ── IT ONLY FILLS BLANKS ────────────────────────────────────────────────────────────────────
 * The query asks for `duration_s is null`, and the update is guarded the same way, so a row that
 * already has a length is never touched — including one a person corrected by hand. Run it twice
 * and the second run finds nothing to do.
 *
 * ── IT VERIFIES WHAT IT WROTE ───────────────────────────────────────────────────────────────
 * Every updated row is read back and compared against the number that was measured. A row that
 * could not be measured, could not be signed, or does not match is reported by name at the end
 * rather than quietly skipped — a backfill that cannot say what it missed is not finished.
 *
 * --dry-run measures everything and writes nothing.
 */
import { execFile } from "node:child_process"
import { readFileSync } from "node:fs"
import { createClient } from "@supabase/supabase-js"
import ffmpegStatic from "ffmpeg-static"

function loadEnv() {
  try {
    for (const line of readFileSync(".env.local", "utf8").split("\n")) {
      const m = /^([A-Z0-9_]+)=(.*)$/.exec(line)
      if (m) process.env[m[1]] ??= m[2].replace(/^["']|["']$/g, "")
    }
  } catch { /* CI supplies them directly */ }
}
loadEnv()

const FF = (ffmpegStatic as unknown as string) || "ffmpeg"
const BUCKET = "social-media"
const DRY = process.argv.includes("--dry-run")
const LIMIT = (() => { const i = process.argv.indexOf("--limit"); return i >= 0 ? Number(process.argv[i + 1]) : null })()

/** ffmpeg writes everything interesting to stderr. -nostdin is load-bearing inside a loop. */
function probe(url: string): Promise<string> {
  return new Promise((resolve) => {
    execFile(FF, ["-nostdin", "-hide_banner", "-i", url], { maxBuffer: 1024 * 1024 * 8 }, (_e, _o, se) => resolve(String(se)))
  })
}
function parseDuration(stderr: string): number | null {
  const m = /Duration:\s*(\d+):(\d\d):(\d\d(?:\.\d+)?)/.exec(stderr)
  if (!m) return null
  const s = Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3])
  return Number.isFinite(s) && s > 0 ? Math.round(s * 10) / 10 : null
}

type Row = { id: string; display_name: string | null; storage_path: string | null; kind: string | null; duration_s: number | null }

async function main() {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  const { data: all, error } = await sb.from("social_content")
    .select("id, display_name, storage_path, kind, duration_s").order("created_at")
  if (error) { console.error("read failed:", error.message); process.exit(1) }
  const rows = (all ?? []) as Row[]

  const already = rows.filter((r) => r.duration_s !== null)
  const images = rows.filter((r) => r.duration_s === null && r.kind === "image")
  const noPath = rows.filter((r) => r.duration_s === null && r.kind !== "image" && !r.storage_path)
  let todo = rows.filter((r) => r.duration_s === null && r.kind !== "image" && r.storage_path)
  if (LIMIT) todo = todo.slice(0, LIMIT)

  console.log(`${rows.length} content rows${DRY ? "   (DRY RUN — nothing is written)" : ""}`)
  console.log(`  already have a duration, left alone: ${already.length}`)
  console.log(`  images, nothing to measure:          ${images.length}`)
  console.log(`  missing a storage path, skipped:     ${noPath.length}`)
  console.log(`  to measure:                          ${todo.length}\n`)

  const measured: { row: Row; seconds: number }[] = []
  const failed: { row: Row; why: string }[] = []

  for (const [i, r] of todo.entries()) {
    const { data: signed, error: se } = await sb.storage.from(BUCKET).createSignedUrl(r.storage_path!, 300)
    if (se || !signed) { failed.push({ row: r, why: `cannot sign: ${se?.message ?? "no url"}` }); continue }
    const seconds = parseDuration(await probe(signed.signedUrl))
    if (seconds === null) { failed.push({ row: r, why: "ffmpeg reported no duration" }); continue }
    measured.push({ row: r, seconds })
    if ((i + 1) % 25 === 0) console.log(`  …${i + 1}/${todo.length}`)
  }

  console.log(`\nmeasured ${measured.length} of ${todo.length}`)
  const secs = measured.map((m) => m.seconds).sort((a, b) => a - b)
  if (secs.length) {
    console.log(`range ${secs[0].toFixed(1)}s … ${secs[secs.length - 1].toFixed(1)}s   median ${secs[Math.floor(secs.length / 2)].toFixed(1)}s`)
    console.log("\nfirst 10 of what would be written:")
    for (const m of measured.slice(0, 10)) console.log(`  ${m.seconds.toFixed(1).padStart(6)}s  ${(m.row.display_name ?? m.row.id).slice(0, 60)}`)
  }

  if (DRY) {
    if (failed.length) {
      console.log(`\n${failed.length} could NOT be measured and would be left null:`)
      for (const f of failed) console.log(`  ${(f.row.display_name ?? f.row.id).slice(0, 60)} — ${f.why}`)
    }
    console.log("\nDRY RUN — nothing was written.")
    return
  }

  // ONLY BLANKS. The `is null` guard is repeated on the update so a row that gained a duration
  // between the read above and this write is left to whoever set it.
  let wrote = 0
  const mismatched: string[] = []
  for (const m of measured) {
    const { error: ue } = await sb.from("social_content")
      .update({ duration_s: m.seconds }).eq("id", m.row.id).is("duration_s", null)
    if (ue) { failed.push({ row: m.row, why: `update failed: ${ue.message}` }); continue }
    const { data: back } = await sb.from("social_content").select("duration_s").eq("id", m.row.id).maybeSingle()
    const stored = back?.duration_s === null || back?.duration_s === undefined ? null : Number(back.duration_s)
    if (stored === null || Math.abs(stored - m.seconds) > 0.05) mismatched.push(`${m.row.display_name ?? m.row.id}: measured ${m.seconds}, stored ${stored}`)
    else wrote++
  }

  console.log(`\nwrote and verified ${wrote} of ${measured.length}`)
  if (mismatched.length) { console.log(`\n${mismatched.length} did not read back as measured:`); for (const x of mismatched) console.log(`  ${x}`) }
  if (failed.length) { console.log(`\n${failed.length} failed:`); for (const f of failed) console.log(`  ${(f.row.display_name ?? f.row.id).slice(0, 60)} — ${f.why}`) }
  console.log(`\nstill null after this run: ${images.length + noPath.length + failed.length + mismatched.length}`)
}

main().catch((e) => { console.error(e); process.exit(1) })
