// QUEUE RENDERS FOR NAMED POSTS.
//
// Run: npx tsx scripts/enqueue-renders.ts <post-id-prefix> [...] [--apply]
//
// Thin wrapper over lib/social/renderJobs.enqueueRenderJobs — the SAME function the approval
// route and the plan run use, with the same idempotency key, so a job queued here is
// indistinguishable from one queued by the app and the /api/cron/social-render worker drains it
// the same way. It queues; it does not render.
import { createClient } from "@supabase/supabase-js"
import { readFileSync } from "node:fs"
import { enqueueRenderJobs, RENDER_JOB_POST_COLUMNS, type RenderJobPost } from "../lib/social/renderJobs"

const args = process.argv.slice(2)
const APPLY = args.includes("--apply")
const prefixes = args.filter((a) => !a.startsWith("--"))

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "")
}
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
})

async function main() {
  if (prefixes.length === 0) { console.error("name at least one post id (a prefix is fine)"); process.exit(1) }
  const { data, error } = await db.from("social_posts").select(RENDER_JOB_POST_COLUMNS + ", connection_id, scheduled_at")
  if (error) { console.error(error.message); process.exit(1) }
  const all = (data ?? []) as (RenderJobPost & { connection_id: string | null; scheduled_at: string | null })[]
  const posts = all.filter((p) => prefixes.some((x) => p.id.startsWith(x)))
  const missing = prefixes.filter((x) => !all.some((p) => p.id.startsWith(x)))
  if (missing.length) { console.error(`not found: ${missing.join(", ")}`); process.exit(1) }

  console.log(`${posts.length} post(s):`)
  for (const p of posts) console.log(`  ${p.id.slice(0, 8)}  ${p.platform}/${p.destination}  render_status=${p.render_status}  ${p.scheduled_at ?? "unscheduled"}`)
  if (!APPLY) { console.log("\nNothing was queued. Re-run with --apply."); return }

  const report = await enqueueRenderJobs(db as never, posts)
  console.log(`\nqueued ${report.created.length}, already queued ${report.deduped.length}, skipped ${report.skipped.length}, errors ${report.errors.length}`)
  for (const s of report.skipped) console.log(`  skipped ${s.postId.slice(0, 8)}: ${s.reason}`)
  for (const e of report.errors) console.log(`  ERROR   ${e.postId.slice(0, 8)}: ${e.message}`)
}

main().catch((e) => { console.error(e instanceof Error ? e.message : String(e)); process.exit(1) })
