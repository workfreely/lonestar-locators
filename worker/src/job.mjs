// One job, start to finish. Every per-render file lives under a single directory that is removed in
// a finally — success, failure or throw — so nothing accumulates between jobs. That accumulation is
// precisely what broke the Vercel attempt.
import { promises as fs } from "node:fs"
import path from "node:path"
import os from "node:os"
import { createClient } from "@supabase/supabase-js"
import { probe, parseSource, renderOverlay, composite, CANVAS, SCALE } from "./render.mjs"

const BUCKET = "social-media"
const ROOT = process.env.RENDER_WORK_ROOT ?? "/var/render"

export function db() {
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required")
  return createClient(url, key, { auth: { persistSession: false } })
}

async function dirSize(p) {
  let total = 0
  for (const e of await fs.readdir(p, { withFileTypes: true })) {
    const f = path.join(p, e.name)
    total += e.isDirectory() ? await dirSize(f) : (await fs.stat(f)).size
  }
  return total
}

/**
 * Render one job.
 * `markupFor(post)` returns the PreviewOverlay HTML — injected so the worker shares the app's one
 * typography definition instead of carrying a second copy of it.
 */
export async function runJob({ supabase, job, post, markup, workerId }) {
  const work = await fs.mkdtemp(path.join(ROOT, `job-${job.id}-`))
  const t0 = Date.now()
  let peakDiskBytes = 0
  try {
    // 1. Fetch the source master.
    let s = Date.now()
    const { data: signed, error: signErr } = await supabase.storage.from(BUCKET).createSignedUrl(post.sourcePath, 900)
    if (signErr || !signed) throw new Error(`source sign failed: ${signErr?.message}`)
    const srcPath = path.join(work, "source" + (path.extname(post.sourcePath) || ".mp4"))
    const res = await fetch(signed.signedUrl)
    if (!res.ok) throw new Error(`source download failed: HTTP ${res.status}`)
    await fs.writeFile(srcPath, Buffer.from(await res.arrayBuffer()))
    const downloadMs = Date.now() - s
    const sourceBytes = (await fs.stat(srcPath)).size

    // 2. Probe — every later decision derives from this, nothing is assumed.
    const info = parseSource(await probe(srcPath))

    // 3. Typography at 4x, then one lanczos3 downsample.
    const overlayPng = path.join(work, "overlay.png")
    const { chromiumMs, downsampleMs, rawBytes } = await renderOverlay(markup, overlayPng)
    peakDiskBytes = Math.max(peakDiskBytes, await dirSize(work))

    // 4. Composite + ONE delivery encode.
    const outPath = path.join(work, "out.mp4")
    const { encodeMs, audioMode } = await composite({ srcPath, overlayPng, outPath, info })
    const outBytes = (await fs.stat(outPath)).size
    peakDiskBytes = Math.max(peakDiskBytes, await dirSize(work))

    // 5. Upload the finished master back.
    s = Date.now()
    const dest = `${post.ownerId}/${post.contentId}/render-${job.id}.mp4`
    const up = await supabase.storage.from(BUCKET).upload(dest, await fs.readFile(outPath), { contentType: "video/mp4", upsert: true })
    if (up.error) throw new Error(`upload failed: ${up.error.message}`)
    const uploadMs = Date.now() - s

    const outInfo = parseSource(await probe(outPath))
    return {
      outputPath: dest,
      metrics: {
        workerId, scale: SCALE, canvas: CANVAS,
        source: { ...info, bytes: sourceBytes },
        output: { fps: outInfo.fps, width: outInfo.width, height: outInfo.height, bytes: outBytes },
        audioMode,
        ms: { download: downloadMs, chromium: chromiumMs, downsample: downsampleMs, encode: encodeMs, upload: uploadMs, total: Date.now() - t0 },
        peakWorkDiskMB: +(peakDiskBytes / 1048576).toFixed(1),
        overlayRawMB: +(rawBytes / 1048576).toFixed(2),
        rssMB: +(process.memoryUsage().rss / 1048576).toFixed(0),
        hostCpus: os.cpus().length, hostMemMB: +(os.totalmem() / 1048576).toFixed(0),
      },
    }
  } finally {
    // UNCONDITIONAL. The whole point of the container move.
    await fs.rm(work, { recursive: true, force: true }).catch(() => {})
  }
}
