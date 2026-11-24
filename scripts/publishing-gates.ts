// CAN ANYTHING PUBLISH RIGHT NOW? — the whole chain, read-only.
//
// Run: npx tsx scripts/publishing-gates.ts
//
// Writes nothing and needs no secrets beyond the service role. It answers one question in the
// order the system asks it, so "publishing is paused" is a set of facts rather than a claim:
//
//   1. the owner-wide Auto Posting switch          social_settings.auto_posting
//   2. each destination's own pause flag           social_connections.posting_paused
//   3. approval                                    social_posts.approved_at
//   4. a current rendered artifact                 render_status / rendered_storage_path
//   5. the deploy-time kill switches               process.env (listed, not read from Vercel)
//
// Gates 1 to 4 live in the database and are read here. Gate 5 lives in the Vercel project and is
// only named: `vercel env ls production` says which exist, and this script will not pretend to
// know a value it cannot see.
import { createClient } from "@supabase/supabase-js"
import { readFileSync } from "node:fs"
import { isBufferRouted } from "../lib/social/bufferRoute"
import { parseMarketRestriction } from "../lib/social/marketRestriction"

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "")
}
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
})

const WEEK_START = "2026-11-24T00:00:00Z"
const WEEK_END = "2026-12-01T12:00:00Z"

async function main() {
  const now = new Date()
  console.log(`PUBLISHING GATES — read ${now.toISOString()} (${now.toLocaleString("en-US", { timeZone: "America/Chicago" })} Central)\n`)

  // ── 1. THE OWNER-WIDE SWITCH ──────────────────────────────────────────────────────────────
  const { data: settings } = await db.from("social_settings").select("owner_user_id, auto_posting, auto_posting_resumed_at")
  console.log("1. AUTO POSTING (owner-wide; anything that is not exactly 'on' is paused)")
  for (const s of (settings ?? []) as Record<string, unknown>[]) {
    console.log(`   ${String(s.owner_user_id).slice(0, 8)}  ${s.auto_posting}  resumed ${s.auto_posting_resumed_at ?? "never"}`)
  }
  if ((settings ?? []).length === 0) console.log("   no row at all — which reads as paused")

  // ── 2. THE DESTINATIONS ───────────────────────────────────────────────────────────────────
  const { data: conns } = await db.from("social_connections")
    .select("id, provider, username, label, agent_user_id, owner_user_id, posting_paused, posts_per_day, market_restriction, buffer_account_id, buffer_channel_id, status")
  const all = (conns ?? []) as Record<string, unknown>[]
  console.log("\n2. DESTINATIONS")
  for (const c of all.sort((a, b) => String(a.provider).localeCompare(String(b.provider)) || String(a.username).localeCompare(String(b.username)))) {
    const route = isBufferRouted(c as never) ? "Buffer" : c.provider === "instagram" ? "Meta Graph" : "TikTok API"
    const mk = parseMarketRestriction(c.market_restriction)
    console.log(`   @${String(c.username).padEnd(18)} ${String(c.provider).padEnd(10)} ${c.posting_paused ? "PAUSED " : "active "} via ${route.padEnd(11)} ${mk ? mk.join("/") : "all markets"}`)
  }

  // ── 3 AND 4. THE WEEK'S OWN ROWS ──────────────────────────────────────────────────────────
  const { data: posts } = await db.from("social_posts")
    .select("id, platform, destination, status, scheduled_at, connection_id, approved_at, declined_at, render_status, rendered_storage_path, needs_review_at, external_post_id, published_at, sibling_of_post_id")
    .gte("scheduled_at", WEEK_START).lt("scheduled_at", WEEK_END)
  const week = (posts ?? []) as Record<string, unknown>[]
  const byConn = new Map<string, Record<string, unknown>[]>()
  for (const p of week) {
    const k = String(p.connection_id)
    byConn.set(k, [...(byConn.get(k) ?? []), p])
  }
  console.log(`\n3. THE WEEK — ${week.length} posts scheduled 24 to 30 November`)
  console.log(`   approved           ${week.filter((p) => p.approved_at).length} of ${week.length}   <- nothing publishes while this is 0`)
  console.log(`   declined           ${week.filter((p) => p.declined_at).length}`)
  console.log(`   rendered           ${week.filter((p) => p.render_status === "ready" && p.rendered_storage_path).length} of ${week.length}`)
  console.log(`   held for review    ${week.filter((p) => p.needs_review_at).length}`)
  console.log(`   already published  ${week.filter((p) => p.published_at || p.external_post_id).length}`)
  console.log(`   TikTok siblings    ${week.filter((p) => p.sibling_of_post_id).length}`)
  console.log("\n   per account:")
  for (const [cid, rows] of byConn) {
    const c = all.find((x) => x.id === cid)
    const ready = rows.filter((r) => r.render_status === "ready" && r.rendered_storage_path).length
    console.log(`   @${String(c?.username ?? cid).padEnd(18)} ${String(c?.provider ?? "?").padEnd(10)} ${String(rows.length).padStart(2)} posts  ${ready} rendered  ${rows.filter((r) => r.approved_at).length} approved`)
  }

  // Every slot time, so a missing or doubled slot is visible rather than inferred.
  const times = [...new Set(week.map((p) => String(p.scheduled_at)))].sort()
  const bad = times.filter((t) => week.filter((p) => String(p.scheduled_at) === t).length !== 6)
  console.log(`\n   ${times.length} distinct instants, ${bad.length === 0 ? "all six accounts at every one" : `WRONG COUNT at: ${bad.join(", ")}`}`)

  // ── 5. THE DEPLOY-TIME SWITCHES ───────────────────────────────────────────────────────────
  console.log("\n4. DEPLOY-TIME KILL SWITCHES (Vercel production — presence from `vercel env ls production`)")
  for (const [name, note] of [
    ["SOCIAL_INSTAGRAM_AUTOPUBLISH_ENABLED", "the native Instagram worker (main + Dallas Instagram)"],
    ["SOCIAL_BUFFER_AUTOPUBLISH_ENABLED", "the Buffer worker — all three TikToks and Lisette's Instagram"],
    ["SOCIAL_BUFFER_TIKTOK_ENABLED", "TikTok specifically, inside the Buffer worker"],
    ["SOCIAL_TIKTOK_AUTOPUBLISH_ENABLED", "the native TikTok worker — unused while every TikTok is Buffer-routed"],
    ["SOCIAL_AUTOPILOT_TRIGGER_ENABLED", "the hourly planner; not needed for this week, which is hand-placed"],
    ["SOCIAL_AUTOPILOT_WRITE_ENABLED", "whether that planner may write at all"],
    ["SOCIAL_TIKTOK_SIBLING_AUTOCREATE", "automatic sibling creation; its unique index IS now applied"],
    ["CRON_SECRET", "every cron worker's own gate, render included"],
  ] as const) {
    console.log(`   ${name.padEnd(38)} ${note}`)
  }
  console.log("\n   This script runs locally and cannot read Vercel's values. `vercel env ls production` is the")
  console.log("   source for which of these exist; an absent variable is off, because every gate requires the")
  console.log("   exact string 'true'.")
}

main().catch((e) => { console.error(e instanceof Error ? e.message : String(e)); process.exit(1) })
