// READ-ONLY preview of the display names whose date disagrees with their own created_at.
//
// Run from the repo root:  node scripts/social/displayNameBackfillPreview.mjs
//
// SELECTs only. It writes nothing, and it is NOT the backfill — it is the evidence you would
// approve a backfill from. Nothing here touches created_at, media, schedules or posts.
//
// ── WHAT IT COMPARES ────────────────────────────────────────────────────────────────────────
// Each name carries a YYYY-MM-DD derived at upload time from `new Date().toISOString().slice(0,10)`
// — the UTC calendar day. Central is UTC-5 in summer and UTC-6 in winter, so anything uploaded
// after 7pm (6pm in winter) was named with tomorrow's date. The corrected value is the Central day
// of the row's OWN created_at, which is unchanged and authoritative.
//
// ── WHY name_customized MATTERS ─────────────────────────────────────────────────────────────
// A system-generated name is ours to correct. A name the operator typed is theirs, and a backfill
// must not rewrite it even if it happens to contain a date — so those are counted separately and
// listed apart.
import { createClient } from "@supabase/supabase-js"
import fs from "node:fs"

const env = {}
for (const l of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "")
}
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const centralDay = (iso) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" })
    .format(new Date(iso))

const { data, error } = await sb
  .from("social_content")
  .select("id, display_name, created_at, name_customized")
  .order("created_at")
if (error) { console.error("read failed:", error.message); process.exit(1) }

const DATE_RE = /(\d{4}-\d{2}-\d{2})/
const rows = []
let withDate = 0, customizedAffected = 0

for (const r of data ?? []) {
  const m = (r.display_name ?? "").match(DATE_RE)
  if (!m || !r.created_at) continue
  withDate++
  const correct = centralDay(r.created_at)
  if (m[1] === correct) continue
  if (r.name_customized) { customizedAffected++; continue }
  rows.push({
    id: r.id,
    old: r.display_name,
    // The ONLY edit is the date substring. Property, market and sequence are untouched, so a
    // backfill could never reshape a name — it can only move the date to the right day.
    next: r.display_name.replace(DATE_RE, correct),
    createdAt: r.created_at,
    utcDay: r.created_at.slice(0, 10),
    centralDay: correct,
  })
}

console.log(`\nSocial content rows:                     ${(data ?? []).length}`)
console.log(`Names carrying a date:                   ${withDate}`)
console.log(`System-generated names to correct:       ${rows.length}`)
console.log(`Operator-customized names left alone:    ${customizedAffected}`)
console.log(`\n${"OLD".padEnd(58)}  ${"CORRECTED".padEnd(58)}  created_at (UTC)`)
console.log("-".repeat(140))
for (const r of rows) {
  console.log(`${r.old.padEnd(58)}  ${r.next.padEnd(58)}  ${r.createdAt.slice(0, 19)}Z  (UTC ${r.utcDay} → CT ${r.centralDay})`)
}

// Every correction must move the date back by exactly one day. Anything else would mean the name's
// date never came from created_at at all, and must not be rewritten by a blind backfill.
const oneDayBack = rows.filter((r) => {
  const a = new Date(`${r.old.match(DATE_RE)[1]}T00:00:00Z`).getTime()
  const b = new Date(`${r.centralDay}T00:00:00Z`).getTime()
  return a - b === 86_400_000
})
console.log(`\nCorrections that move the date back exactly one day: ${oneDayBack.length} of ${rows.length}`)
if (oneDayBack.length !== rows.length) {
  console.log("  ⚠ some rows differ by something other than one day — review those individually before any backfill:")
  for (const r of rows.filter((x) => !oneDayBack.includes(x))) console.log(`    ${r.old}  →  ${r.next}`)
}
console.log("\nPREVIEW ONLY — nothing was written.\n")
