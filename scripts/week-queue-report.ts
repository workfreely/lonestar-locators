// THE WEEK AS THE DATABASE ACTUALLY HOLDS IT.
//
// Run: npx tsx scripts/week-queue-report.ts [--md]
//
// Read-only. The planning report (scripts/plan-week-nov24.ts) says what WOULD be selected; this
// says what IS scheduled, read from social_posts and social_connections — the post id, the
// account, the stored instant, the render and the approval. The two are deliberately separate:
// once rows exist, a document generated from the selector can drift from them silently.
import { createClient } from "@supabase/supabase-js"
import { readFileSync } from "node:fs"

const MD = process.argv.includes("--md")

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "")
}
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
})

const GROUP_OF: Record<string, string> = {
  realestatepro_tx: "Main", locatorbeast: "Dallas", "locator.beast": "Dallas", locatorlisette: "Lisette",
}
const central = (iso: string) => new Date(iso).toLocaleString("en-US", {
  timeZone: "America/Chicago", weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false,
})

async function main() {
  const { data, error } = await db
    .from("social_posts")
    .select("id, platform, destination, status, scheduled_at, approved_at, render_status, rendered_storage_path, needs_review_at, published_at, external_post_url, overlay_template, source_content_id, connection_id, source:source_content_id(property_name, display_name, market, duration_s), destination_connection:connection_id(username, label, provider, posting_paused)")
    .gte("scheduled_at", "2026-11-24T00:00:00Z").lt("scheduled_at", "2026-12-01T12:00:00Z")
    .order("scheduled_at", { ascending: true })
  if (error) { console.error(error.message); process.exit(1) }
  const rows = (data ?? []) as Record<string, any>[]
  const one = (v: unknown) => (Array.isArray(v) ? v[0] : v) as Record<string, any> | null

  const slots = [...new Set(rows.map((r) => String(r.scheduled_at)))].sort()
  const bar = MD ? "| " : "  "
  if (MD) {
    console.log(`# The first week, as scheduled — 24 to 30 November 2026\n`)
    console.log(`${rows.length} posts across six accounts, two slots a day at 07:30 and 19:30 Central.`)
    console.log(`Rendered ${rows.filter((r) => r.render_status === "ready").length}/${rows.length} · approved ${rows.filter((r) => r.approved_at).length}/${rows.length} · published ${rows.filter((r) => r.published_at).length}/${rows.length}\n`)
  }
  for (const slot of slots) {
    const group = rows.filter((r) => String(r.scheduled_at) === slot)
    console.log(`\n${central(slot)} Central   (${slot})`)
    if (MD) {
      console.log("\n| account | platform | property | market | render | approved |")
      console.log("|---|---|---|---|---|---|")
    }
    for (const r of group.sort((a, b) => String(one(a.destination_connection)?.username).localeCompare(String(one(b.destination_connection)?.username)) || String(a.platform).localeCompare(String(b.platform)))) {
      const c = one(r.destination_connection)
      const s = one(r.source)
      const prop = (s?.property_name || s?.display_name || "?").slice(0, 40)
      const g = GROUP_OF[String(c?.username)] ?? "?"
      const render = r.render_status === "ready" && r.rendered_storage_path ? "rendered" : r.render_status
      const appr = r.published_at ? "PUBLISHED" : r.approved_at ? "approved" : r.needs_review_at ? "needs review" : "not approved"
      if (MD) {
        console.log(`| ${g} @${c?.username} | ${r.platform} | ${prop} | ${s?.market ?? "-"} | ${render} | ${appr} |`)
      } else {
        console.log(`${bar}${g.padEnd(8)} @${String(c?.username).padEnd(18)} ${String(r.platform).padEnd(10)} ${prop.padEnd(41)} ${String(s?.market).padEnd(12)} ${render.padEnd(9)} ${appr.padEnd(13)} ${String(r.id).slice(0, 8)}`)
      }
    }
  }
  if (!MD) {
    console.log(`\nTOTALS  ${rows.length} posts · rendered ${rows.filter((r) => r.render_status === "ready").length} · approved ${rows.filter((r) => r.approved_at).length} · published ${rows.filter((r) => r.published_at).length}`)
    const perConn = new Map<string, number>()
    for (const r of rows) {
      const c = one(r.destination_connection)
      perConn.set(`${c?.provider} @${c?.username}${c?.posting_paused ? " (PAUSED)" : ""}`, (perConn.get(`${c?.provider} @${c?.username}${c?.posting_paused ? " (PAUSED)" : ""}`) ?? 0) + 1)
    }
    for (const [k, v] of perConn) console.log(`  ${k.padEnd(40)} ${v} posts`)
  }
}

main().catch((e) => { console.error(e instanceof Error ? e.message : String(e)); process.exit(1) })
