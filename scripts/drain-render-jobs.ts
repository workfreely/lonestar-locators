// DRAIN THE RENDER QUEUE FROM HERE.
//
// Run: npx tsx scripts/drain-render-jobs.ts [--max N]
//
// The same three steps /api/cron/social-render takes, in the same order, against the same
// database: lb_claim_render_job, renderPostToStorage, lb_finish_render_job. It exists because the
// deployed worker is reachable only with CRON_SECRET, and the operator needed this morning's
// videos rendered now rather than on the next */5 tick after a secret was found.
//
// IT IS NOT A SECOND RENDERER. Same claim RPC (so it cannot take a job the cron is holding), same
// renderPostToStorage, same finish RPC, same one-job-at-a-time shape. ffmpeg comes from
// ffmpeg-static and the overlay font from assets/, both bundled in this repo, so the bytes are the
// bytes Vercel would have produced.
import { createClient } from "@supabase/supabase-js"
import { readFileSync } from "node:fs"
import { renderPostToStorage } from "../lib/social/renderPost"
import { CLAIM_LEASE_SECONDS } from "../lib/social/renderJobs"

const maxIdx = process.argv.indexOf("--max")
const MAX = maxIdx > -1 ? Number(process.argv[maxIdx + 1]) : 10

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "")
}
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
})

async function main() {
  for (let i = 0; i < MAX; i++) {
    const worker = `local-${Math.random().toString(36).slice(2, 10)}`
    const { data: claimed, error: claimErr } = await db.rpc("lb_claim_render_job", { p_worker: worker, p_lease_seconds: CLAIM_LEASE_SECONDS })
    if (claimErr) { console.error(`claim failed: ${claimErr.message}`); process.exit(1) }
    const job = (Array.isArray(claimed) ? claimed[0] : claimed) as { id: string; post_id: string; platform: string } | undefined
    if (!job) { console.log("queue empty — nothing left to render"); return }

    const { data: postRow } = await db.from("social_posts").select("owner_user_id, platform, destination").eq("id", job.post_id).maybeSingle()
    const ownerUserId = (postRow as { owner_user_id?: string | null } | null)?.owner_user_id ?? null
    if (!ownerUserId) {
      await db.rpc("lb_finish_render_job", { p_id: job.id, p_ok: false, p_output_path: null, p_metrics: { worker }, p_error: "post has no owner_user_id" })
      console.log(`  ${job.post_id.slice(0, 8)}  FAILED: no owner`)
      continue
    }

    const started = Date.now()
    process.stdout.write(`  ${job.post_id.slice(0, 8)}  ${job.platform.padEnd(10)} rendering… `)
    const result = await renderPostToStorage({ supabase: db as never, id: job.post_id, userId: ownerUserId })
    const secs = ((Date.now() - started) / 1000).toFixed(1)

    if (result.ok) {
      await db.rpc("lb_finish_render_job", {
        p_id: job.id, p_ok: true, p_output_path: result.outputPath,
        p_metrics: { renderVersion: result.renderVersion, platform: result.platform, worker },
        p_error: result.platform !== job.platform ? `platform mismatch: job ${job.platform}, post ${result.platform}` : null,
      })
      console.log(`OK in ${secs}s  v${result.renderVersion}  ${result.outputPath}`)
    } else {
      await db.rpc("lb_finish_render_job", { p_id: job.id, p_ok: false, p_output_path: null, p_metrics: { worker }, p_error: `${result.code}: ${result.message}`.slice(0, 400) })
      console.log(`FAILED in ${secs}s  ${result.code}: ${result.message}`)
    }
  }
  console.log(`stopped after ${MAX} job(s) — re-run to continue`)
}

main().catch((e) => { console.error(e instanceof Error ? e.message : String(e)); process.exit(1) })
