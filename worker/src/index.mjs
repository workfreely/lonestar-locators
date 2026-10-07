// Worker loop. ONE render at a time until reliability is proven (RENDER_CONCURRENCY is read but a
// value above 1 is refused for now, so the limit is explicit rather than accidental).
import os from "node:os"
import { randomUUID } from "node:crypto"
import { db, runJob } from "./job.mjs"
import { closeBrowser } from "./browser.mjs"

const WORKER_ID = `${os.hostname()}-${randomUUID().slice(0, 8)}`
const IDLE_MS = Number(process.env.RENDER_POLL_MS ?? 5000)
const LEASE_S = Number(process.env.RENDER_LEASE_SECONDS ?? 1800)
if (Number(process.env.RENDER_CONCURRENCY ?? 1) !== 1) throw new Error("concurrency >1 is not enabled yet")

let stopping = false
for (const sig of ["SIGTERM", "SIGINT"]) {
  // Drain rather than abandon: ECS sends SIGTERM before stopping a task, and a half-written render
  // whose lease is still held would block the queue until it expired.
  process.on(sig, () => { console.log(`${sig} — finishing current job then exiting`); stopping = true })
}

const supabase = db()
console.log(`worker ${WORKER_ID} up — cpus=${os.cpus().length} mem=${Math.round(os.totalmem() / 1048576)}MB`)

while (!stopping) {
  const { data: claimed, error } = await supabase.rpc("lb_claim_render_job", { p_worker: WORKER_ID, p_lease_seconds: LEASE_S })
  if (error) { console.error("claim failed:", error.message); await new Promise((r) => setTimeout(r, IDLE_MS)); continue }
  const job = Array.isArray(claimed) ? claimed[0] : claimed
  if (!job) { await new Promise((r) => setTimeout(r, IDLE_MS)); continue }

  console.log(`job ${job.id} claimed (attempt ${job.attempt_count}/${job.max_attempts})`)
  try {
    const { post, markup } = await loadPost(supabase, job.post_id)
    const { outputPath, metrics } = await runJob({ supabase, job, post, markup, workerId: WORKER_ID })
    await supabase.rpc("lb_finish_render_job", { p_id: job.id, p_ok: true, p_output_path: outputPath, p_metrics: metrics })
    console.log(`job ${job.id} succeeded in ${metrics.ms.total}ms -> ${outputPath}`)
  } catch (e) {
    // Returned to 'queued' for another attempt, or terminal once max_attempts is spent — the RPC
    // decides, so the retry rule lives in one place.
    await supabase.rpc("lb_finish_render_job", {
      p_id: job.id, p_ok: false, p_error: String(e?.message ?? e).slice(0, 500),
      p_detail: { stack: String(e?.stack ?? "").slice(0, 2000), worker: WORKER_ID },
    })
    console.error(`job ${job.id} failed:`, String(e?.message ?? e).slice(0, 300))
  }
}
await closeBrowser()
console.log("worker stopped cleanly")

/** Load the post and build its overlay markup. Replaced by the real app import at build time. */
async function loadPost(supabase, postId) {
  const { data, error } = await supabase.from("social_posts")
    .select("id, overlay_template, overlay_headline, overlay_subheadline, source_content_id, source:source_content_id(storage_path, owner_user_id)")
    .eq("id", postId).single()
  if (error) throw new Error(`post load failed: ${error.message}`)
  const { buildMarkup } = await import("./overlayMarkup.mjs")
  return {
    post: { sourcePath: data.source.storage_path, ownerId: data.source.owner_user_id ?? "unknown", contentId: data.source_content_id },
    markup: buildMarkup({ template: data.overlay_template, headline: data.overlay_headline, subheadline: data.overlay_subheadline }),
  }
}
