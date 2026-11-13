// ENQUEUE RENDERS FOR SELECTED DALLAS POSTS — by explicit id, and only Dallas.
//
// ── WHY THIS EXISTS RATHER THAN CALLING THE ENDPOINT ────────────────────────────────────────
// /api/admin/social-autopilot/render-jobs/enqueue takes `postIds`, which is the safe way to use
// it — but its DEFAULT, when no ids are given, is every draft with render_status='none' on one
// platform, for every market. Its own comment calls the limit "a cap, not a page size … bulk
// enqueue is a deliberate act and should not silently fan out to the whole table because a filter
// was forgotten". There is no market filter on it at all.
//
// So the risk is not the endpoint, it is forgetting the ids. This resolves them itself, from the
// market, and then REFUSES to proceed if any resolved post is not what it claims to be. The ids
// and the check travel together instead of the ids being pasted from one place into another.
//
// ── WHAT IT CANNOT DO ───────────────────────────────────────────────────────────────────────
// It cannot approve anything. It cannot render anything. It cannot schedule or publish anything.
// It creates rows in the render JOB QUEUE and nothing else — the same thing the endpoint does, and
// the endpoint's own words for it are "jobs created only — nothing rendered, no post modified".
// Draining the queue is a separate, deliberate act: POST /render-jobs/run, one job per call.
//
// APPROVAL IS UNTOUCHED AND MUST STAY THAT WAY. Rendering is machine work; approval is the only
// column in social_posts a human sets deliberately, and nothing here goes near it. A rendered post
// still arrives as "RENDERED · NOT APPROVED" and still needs a person.
//
// ── DRY RUN BY DEFAULT ──────────────────────────────────────────────────────────────────────
//   npx tsx --env-file=.env.local scripts/social/dallasRenderEnqueue.ts
//   npx tsx --env-file=.env.local scripts/social/dallasRenderEnqueue.ts --market="San Antonio"
//   npx tsx --env-file=.env.local scripts/social/dallasRenderEnqueue.ts --limit=10
//   npx tsx --env-file=.env.local scripts/social/dallasRenderEnqueue.ts --confirm      ← writes jobs
import { supabaseAdmin } from "../../lib/supabase/admin"
import { enqueueRenderJobs, RENDER_JOB_POST_COLUMNS, type RenderJobPost } from "../../lib/social/renderJobs"
import { normalizeSocialMarket, SOCIAL_MARKETS } from "../../lib/social/markets"

const arg = (name: string): string | null => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`))
  return hit ? hit.slice(name.length + 3) : null
}
const CONFIRM = process.argv.includes("--confirm")
const MARKET = normalizeSocialMarket(arg("market") ?? "Dallas")
/** A cap, for the same reason the endpoint has one: a deliberate act should not fan out. */
const LIMIT = Math.max(1, Math.min(Number(arg("limit")) || 50, 500))

async function main() {
  if (!SOCIAL_MARKETS.some((m) => m.toLowerCase() === MARKET.toLowerCase())) {
    console.error(`"${MARKET}" is not a Social Beast market. Known: ${SOCIAL_MARKETS.join(", ")}`)
    process.exit(1)
  }

  console.log(`RENDER ENQUEUE — ${MARKET} only · limit ${LIMIT} · ${CONFIRM ? "CONFIRMED (will create jobs)" : "DRY RUN"}`)
  console.log("=".repeat(78))

  // THE SAME TARGET THE ENDPOINT'S DEFAULT USES, narrowed to one market: a draft that has never
  // been rendered. Nothing further along is touched — a rendered post, a scheduled post, a
  // published post and an approved post are all left alone.
  const { data, error } = await supabaseAdmin
    .from("social_posts")
    .select(`${RENDER_JOB_POST_COLUMNS}, status, render_status, destination, approved_at, scheduled_at, published_at, source:source_content_id(market, property_name)`)
    .eq("status", "draft")
    .eq("render_status", "none")
    .is("published_at", null)
    .is("scheduled_at", null)
    .order("created_at", { ascending: true })
  if (error) { console.error("could not read posts:", error.message); process.exit(1) }

  type Row = Record<string, unknown> & { source?: { market?: string | null; property_name?: string | null } | { market?: string | null; property_name?: string | null }[] | null }
  const srcOf = (r: Row) => (Array.isArray(r.source) ? r.source[0] : r.source) ?? null
  const all = (data ?? []) as Row[]

  // THE MARKET FILTER, applied here because the join cannot express it in the query above without
  // changing the select the job builder needs. Compared case-insensitively, the way every other
  // market comparison in this codebase now is.
  const inMarket = all.filter((r) => (srcOf(r)?.market ?? "").trim().toLowerCase() === MARKET.toLowerCase())
  const selected = inMarket.slice(0, LIMIT)

  console.log(`\n${all.length} unrendered draft(s) in total · ${inMarket.length} in ${MARKET} · taking ${selected.length}`)
  const otherMarkets = new Map<string, number>()
  for (const r of all) {
    const m = (srcOf(r)?.market ?? "(blank)").trim() || "(blank)"
    if (m.toLowerCase() !== MARKET.toLowerCase()) otherMarkets.set(m, (otherMarkets.get(m) ?? 0) + 1)
  }
  if (otherMarkets.size) {
    console.log(`  NOT selected (other markets): ${[...otherMarkets.entries()].map(([m, n]) => `${m} ${n}`).join(" · ")}`)
  }

  if (selected.length === 0) {
    console.log(`\nNothing to enqueue in ${MARKET}.`)
    return
  }

  // ── THE REFUSAL ───────────────────────────────────────────────────────────────────────────
  // Every selected row is re-checked against what it was selected for. This is the point of the
  // script: the ids and the assertion that they are the right ids cannot drift apart, because
  // nothing is pasted between two places.
  const problems: string[] = []
  for (const r of selected) {
    const src = srcOf(r)
    const id = String(r.id)
    if ((src?.market ?? "").trim().toLowerCase() !== MARKET.toLowerCase()) problems.push(`${id}: market is ${src?.market ?? "(none)"}`)
    if (r.status !== "draft") problems.push(`${id}: status is ${String(r.status)}`)
    if (r.render_status !== "none") problems.push(`${id}: render_status is ${String(r.render_status)}`)
    if (r.approved_at) problems.push(`${id}: already approved — not this script's business`)
    if (r.scheduled_at) problems.push(`${id}: already scheduled`)
    if (r.published_at) problems.push(`${id}: already published`)
  }
  if (problems.length) {
    console.error(`\nREFUSING — ${problems.length} selected post(s) are not unrendered ${MARKET} drafts:`)
    for (const p of problems.slice(0, 10)) console.error(`  ✗ ${p}`)
    process.exit(1)
  }
  console.log(`  ✓ all ${selected.length} selected posts re-checked: ${MARKET}, draft, never rendered, unapproved, unscheduled`)

  console.log("\nSELECTED POSTS")
  console.log("-".repeat(78))
  for (const r of selected) {
    console.log(`  ${String(r.id)}  ${String(r.destination ?? "(null)").padEnd(16)} ${(srcOf(r)?.property_name ?? "?").slice(0, 40)}`)
  }

  const ids = selected.map((r) => String(r.id))
  console.log("\nTHE EQUIVALENT REQUEST, if you would rather use the endpoint:")
  console.log(`  POST /api/admin/social-autopilot/render-jobs/enqueue`)
  console.log(`  ${JSON.stringify({ postIds: ids.slice(0, 3).concat(ids.length > 3 ? ["…"] : []) })}`)

  if (!CONFIRM) {
    console.log("\nDRY RUN — no job was created. Re-run with --confirm to enqueue these, and only these.")
    console.log("Then drain with POST /api/admin/social-autopilot/render-jobs/run, one job per call.")
    return
  }

  // enqueueRenderJobs is the SAME function the endpoint calls, so the job keys, the de-duplication
  // and the queue semantics are identical — this is not a second way to enqueue.
  const report = await enqueueRenderJobs(supabaseAdmin, selected as unknown as RenderJobPost[])
  console.log(`\nENQUEUED: ${report.created.length} created · ${report.deduped.length} already queued`)
  console.log("Nothing rendered, no post modified, nothing approved.")
  console.log("Drain with POST /api/admin/social-autopilot/render-jobs/run — one job per call.")
}

main().catch((e) => { console.error("failed:", e instanceof Error ? e.message : e); process.exit(1) })
