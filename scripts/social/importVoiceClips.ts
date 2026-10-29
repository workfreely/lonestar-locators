/**
 * BULK IMPORT — Jay's 58 voice recordings into the Social Beast library.
 *
 *   npx tsx scripts/social/importVoiceClips.ts --dir "~/Downloads/Locator Beast Audio" --dry-run
 *   npx tsx scripts/social/importVoiceClips.ts --dir "~/Downloads/Locator Beast Audio" --user <uuid>
 *
 * For each recording it measures the original, normalises a DERIVATIVE to −16 LUFS, reads
 * market/category/price out of the filename, and upserts one row. The original is uploaded
 * byte-for-byte and never processed in place.
 *
 * ── RUN IT TWICE AND NOTHING HAPPENS TWICE ──────────────────────────────────────────────────
 * The upsert keys on (user_id, original_filename), which the migration enforces with a unique
 * index. A re-run after a corrected filename, a failed batch or a re-measure updates in place.
 * That matters more than it sounds: a bulk import that cannot be safely repeated is one that
 * gets abandoned halfway and finished by hand.
 *
 * ── IT REFUSES TO GUESS ─────────────────────────────────────────────────────────────────────
 * A filename naming two markets, a price hook with no city, a CTA naming no property type — all
 * of these are written with `processing_status = 'review'` and a reason, not resolved by a
 * precedence rule. The compatibility checker then treats a flagged clip as unusable until a
 * person clears it.
 *
 * --dry-run does everything except write: it measures, classifies, and prints exactly what would
 * be stored. That is the mode to run before the migration is applied.
 */
import { execFile } from "node:child_process"
import { promises as fs } from "node:fs"
import path from "node:path"
import os from "node:os"
import { createClient } from "@supabase/supabase-js"
import { readFileSync } from "node:fs"

/** Load .env.local the way `next dev` would. These scripts run outside Next, so nothing else does it. */
function loadEnv() {
  try {
    for (const line of readFileSync(".env.local", "utf8").split("\n")) {
      const m = /^([A-Z0-9_]+)=(.*)$/.exec(line)
      if (m) process.env[m[1]] ??= m[2].replace(/^["']|["']$/g, "")
    }
  } catch { /* CI supplies them directly */ }
}
loadEnv()
import ffmpegStatic from "ffmpeg-static"
import {
  VOICE_NORMALIZE, parseLoudnorm, measureFilter, applyFilter, needsCompression, encodeArgs,
  type LoudnessMeasurement,
} from "@/lib/social/voiceNormalize"
import { parseVoiceClip, type VoiceClipMeta } from "@/lib/social/voiceLibrary"

const FF = (ffmpegStatic as unknown as string) || "ffmpeg"
const BUCKET = "social-media"

function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] ?? null : null
}
const DRY = process.argv.includes("--dry-run")

function run(args: string[]): Promise<string> {
  return new Promise((resolve) => {
    // ffmpeg writes everything interesting to stderr, including the loudnorm JSON.
    // -nostdin is load-bearing in a loop: without it ffmpeg eats the caller's stdin.
    execFile(FF, ["-nostdin", ...args], { maxBuffer: 1024 * 1024 * 32 }, (_e, _o, se) => resolve(String(se)))
  })
}

function parseDuration(stderr: string): number | null {
  const m = /Duration:\s*(\d+):(\d\d):(\d\d(?:\.\d+)?)/.exec(stderr)
  return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : null
}

/**
 * HOW MANY SAMPLES ACTUALLY DECODE — which is NOT what the container's `Duration:` header says.
 *
 * Re-encoding to AAC moves that header around a frame boundary in both directions: of the 58
 * recordings, 20 derivatives report a duration 0.02–0.05s shorter than their source and 20 report
 * it longer. Comparing those headers makes a re-encode look like a trim. Decoding and counting is
 * the only comparison that means anything.
 */
async function decodedSamples(file: string): Promise<number | null> {
  const se = await run(["-hide_banner", "-nostats", "-i", file, "-ac", "1", "-af", "astats=metadata=1:reset=0", "-f", "null", "-"])
  const m = /Number of samples:\s*(\d+)/.exec(se)
  return m ? Number(m[1]) : null
}

/** First and last moment of speech, at a −45 dB floor. Stored, not acted on — see the migration. */
function parseSpeechBounds(stderr: string, duration: number): { start: number; end: number } {
  const starts = [...stderr.matchAll(/silence_start:\s*(-?[\d.]+)/g)].map((m) => Number(m[1]))
  const ends = [...stderr.matchAll(/silence_end:\s*([\d.]+)/g)].map((m) => Number(m[1]))
  let start = 0
  if (starts.length && starts[0] <= 0.05 && ends.length) start = ends[0]
  let end = duration
  for (let i = 0; i < starts.length; i++) {
    const e = ends[i] ?? duration
    if (e >= duration - 0.08 && starts[i] > start) { end = starts[i]; break }
  }
  return { start, end }
}

type Processed = {
  meta: VoiceClipMeta
  original: LoudnessMeasurement
  normalized: LoudnessMeasurement | null
  duration: number
  /** The DERIVATIVE's container duration — informational only; see decodedSamples(). */
  normalizedDuration: number | null
  /** Decoded sample counts, source vs derivative. This is what the trim check compares. */
  samples: { original: number | null; normalized: number | null }
  speech: { start: number; end: number }
  compressed: boolean
  normalizedPath: string | null
}

async function processOne(file: string, folder: string, work: string): Promise<Processed | null> {
  const meta = parseVoiceClip(folder, path.basename(file))
  const probe = await run(["-hide_banner", "-i", file])
  const duration = parseDuration(probe)
  if (duration === null) return null

  const silence = await run(["-hide_banner", "-nostats", "-i", file, "-af", "silencedetect=noise=-45dB:d=0.12", "-f", "null", "-"])
  const speech = parseSpeechBounds(silence, duration)

  const first = parseLoudnorm(await run(["-hide_banner", "-nostats", "-i", file, "-af", "loudnorm=print_format=json", "-f", "null", "-"]))
  if (!first) return null
  const compressed = needsCompression(first)

  // Pass one must measure the chain it will actually apply, compressor included.
  const measured = parseLoudnorm(await run(["-hide_banner", "-nostats", "-i", file, "-af", measureFilter(compressed), "-f", "null", "-"]))
  if (!measured) return { meta, original: first, normalized: null, normalizedDuration: null, samples: { original: null, normalized: null }, duration, speech, compressed, normalizedPath: null }

  const out = path.join(work, `${path.basename(file, ".m4a")}.normalized.m4a`)
  await run(["-hide_banner", "-loglevel", "error", "-y", "-i", file, "-af", applyFilter(measured, compressed), ...encodeArgs(), out])
  const after = parseLoudnorm(await run(["-hide_banner", "-nostats", "-i", out, "-af", "loudnorm=print_format=json", "-f", "null", "-"]))
  const outDuration = parseDuration(await run(["-hide_banner", "-i", out]))
  const samples = { original: await decodedSamples(file), normalized: await decodedSamples(out) }
  return { meta, original: first, normalized: after, normalizedDuration: outDuration, samples, duration, speech, compressed, normalizedPath: out }
}

async function main() {
  const dir = (arg("dir") ?? "").replace(/^~/, os.homedir())
  if (!dir) { console.error("--dir is required"); process.exit(1) }
  const userId = arg("user")
  if (!DRY && !userId) { console.error("--user <uuid> is required unless --dry-run"); process.exit(1) }

  const files: { path: string; folder: string }[] = []
  for (const folder of (await fs.readdir(dir, { withFileTypes: true })).filter((d) => d.isDirectory())) {
    for (const f of await fs.readdir(path.join(dir, folder.name))) {
      if (f.toLowerCase().endsWith(".m4a")) files.push({ path: path.join(dir, folder.name, f), folder: folder.name })
    }
  }
  files.sort((a, b) => a.path.localeCompare(b.path))
  console.log(`${files.length} recordings in ${dir}${DRY ? "   (DRY RUN — nothing is written)" : ""}\n`)

  const work = await fs.mkdtemp(path.join(os.tmpdir(), "voice-import-"))
  const sb = DRY ? null : createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const rows: Processed[] = []
  let failed = 0

  for (const f of files) {
    const r = await processOne(f.path, f.folder, work)
    if (!r) { failed++; console.log(`  ! could not measure ${path.basename(f.path)}`); continue }
    rows.push(r)
    if (!DRY && sb && r.normalizedPath) {
      const base = `${userId}/voice`
      const origKey = `${base}/${path.basename(f.path)}`
      const normKey = `${base}/normalized/${path.basename(r.normalizedPath)}`
      await sb.storage.from(BUCKET).upload(origKey, await fs.readFile(f.path), { contentType: "audio/mp4", upsert: true })
      await sb.storage.from(BUCKET).upload(normKey, await fs.readFile(r.normalizedPath), { contentType: "audio/mp4", upsert: true })
      const { error } = await sb.from("social_voice_clips").upsert({
        user_id: userId, clip_type: r.meta.clipType, name: r.meta.displayName,
        storage_path: origKey, normalized_storage_path: normKey,
        original_filename: r.meta.originalFilename, display_name: r.meta.displayName,
        market: r.meta.market, category: r.meta.category, property_type: r.meta.propertyType,
        price_point: r.meta.pricePoint, cta_keyword: r.meta.ctaKeyword,
        duration_seconds: Math.round(r.duration), duration_original: r.duration,
        speech_start_seconds: r.speech.start, speech_end_seconds: r.speech.end,
        lufs_original: r.original.inputI, tp_original: r.original.inputTp,
        lufs_normalized: r.normalized?.inputI ?? null, tp_normalized: r.normalized?.inputTp ?? null,
        compression_applied: r.compressed,
        processing_status: r.meta.review.length ? "review" : r.normalized ? "normalized" : "failed",
        review_notes: r.meta.review.length ? r.meta.review : null,
        // WHAT THE CLIP MAY CLAIM. Without these the API reads null and falls back to
        // "universal", which would quietly make every price hook and every client-success
        // recording usable on any property — the exact gate this library exists to enforce.
        // transcript stays null for the 57 that have not been transcribed; it is never invented.
        transcript: r.meta.transcript,
        transcript_status: r.meta.transcriptStatus,
        eligibility: r.meta.eligibility,
        requires: r.meta.requires.length ? r.meta.requires : [],
      }, { onConflict: "user_id,original_filename" })
      if (error) { failed++; console.log(`  ! upsert failed for ${r.meta.originalFilename}: ${error.message}`) }
    }
  }

  // ── EVERY RECORDING, ONE LINE EACH ─────────────────────────────────────────────────────────
  // A per-file listing, because a summary cannot show that THIS file was classified THAT way.
  // Printed by default in a dry run (that is what a dry run is for) and on request otherwise.
  if (DRY || process.argv.includes("--list")) {
    console.log("file                                          type  mkt   category             price  proptype    cta   elig         dur    LUFS→          TP     cmp")
    for (const r of rows) {
      const m = r.meta
      const dur = r.duration.toFixed(2).padStart(6)
      const lufs = `${r.original.inputI.toFixed(1)}→${(r.normalized?.inputI ?? NaN).toFixed(1)}`.padStart(13)
      const tp = (r.normalized?.inputTp ?? NaN).toFixed(2).padStart(6)
      // Fewer decoded samples out than in is the only thing that can be a trim.
      const trimmed = r.samples.original !== null && r.samples.normalized !== null && r.samples.normalized < r.samples.original
      console.log(
        `${m.originalFilename.slice(0, 44).padEnd(45)} ${m.clipType.padEnd(5)} ${(m.market ?? "—").padEnd(5)} ` +
        `${m.category.padEnd(20)} ${(m.pricePoint ? `$${m.pricePoint}` : "—").padStart(6)} ` +
        `${(m.propertyType ?? "—").padEnd(11)} ${(m.ctaKeyword ?? "—").padEnd(5)} ${m.eligibility.padEnd(12)} ` +
        `${dur} ${lufs} ${tp}  ${r.compressed ? "yes" : " - "}${trimmed ? "  ← LENGTH CHANGED" : ""}`,
      )
    }
    console.log()
  }

  // ── what happened ──────────────────────────────────────────────────────────────────────────
  const by = <T extends string>(k: (r: Processed) => T) =>
    rows.reduce<Record<string, number>>((a, r) => ((a[k(r)] = (a[k(r)] ?? 0) + 1), a), {})
  console.log("by market:  ", JSON.stringify(by((r) => r.meta.market)))
  console.log("by category:", JSON.stringify(by((r) => r.meta.category)))
  const normd = rows.filter((r) => r.normalized)
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1)
  console.log(`\nloudness: ${mean(rows.map((r) => r.original.inputI)).toFixed(2)} → ${mean(normd.map((r) => r.normalized!.inputI)).toFixed(2)} LUFS mean`)
  console.log(`peaks:    worst ${Math.max(...normd.map((r) => r.normalized!.inputTp)).toFixed(2)} dBTP stored  (asked loudnorm for ${VOICE_NORMALIZE.truePeakDb}, must stay under ${VOICE_NORMALIZE.maxEncodedTruePeakDb})`)
  console.log(`compression applied to ${rows.filter((r) => r.compressed).length} of ${rows.length}`)
  const flagged = rows.filter((r) => r.meta.review.length)
  console.log(`\nflagged for review: ${flagged.length}`)
  for (const r of flagged) console.log(`   ${r.meta.originalFilename}\n      ${r.meta.review.join("; ")}`)
  // Judged against what a STORED file must measure, not against what loudnorm was asked for —
  // the gap between those two is the AAC encoder's intersample overshoot.
  const over = normd.filter((r) => r.normalized!.inputTp > VOICE_NORMALIZE.maxEncodedTruePeakDb)
  if (over.length) {
    console.log(`\n!! ${over.length} exceeded the peak ceiling — investigate before using them:`)
    for (const r of over) console.log(`   ${r.meta.originalFilename}  ${r.normalized!.inputTp} dBTP`)
  }
  // NOTHING IS TRIMMED. The leading and trailing silence is the performance's timing and the
  // renderer depends on it, so a derivative must never decode to fewer samples than its source.
  // Judged on decoded samples, not container headers — see decodedSamples() for why.
  const measurable = rows.filter((r) => r.samples.original !== null && r.samples.normalized !== null)
  const shorter = measurable.filter((r) => r.samples.normalized! < r.samples.original!)
  console.log(`no recording trimmed: ${measurable.length - shorter.length} of ${measurable.length} measured` +
    (shorter.length ? "  ← AUDIO WAS LOST" : ""))
  for (const r of shorter) console.log(`   ${r.meta.originalFilename}  ${r.samples.original} → ${r.samples.normalized} samples`)

  if (failed) console.log(`\n${failed} failure(s)`)
  console.log(DRY ? "\nDRY RUN — nothing was uploaded or written." : "\nimport complete.")
}

main().catch((e) => { console.error(e); process.exit(1) })
