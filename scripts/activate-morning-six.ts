// APPROVE THIS MORNING'S SIX, GIVE THEM A WORKABLE SLOT, AND TURN AUTO POSTING ON.
//
// Run: npx tsx scripts/activate-morning-six.ts [--apply]
// Without --apply it reads everything, prints exactly what it would write, and writes nothing.
//
// The operator approved these six in writing and asked for them to be rescheduled to the next
// publishing window today, with Auto Posting activated. Four writes, in an order that matters:
//
//   1. APPROVAL on the six. Every publish worker filters on approved_at, so until this nothing
//      can go out. Scoped to the six by their exact stored instant.
//   2. THE COMPANION STORIES for the three Instagram Reels, through ensureStoryCompanion — the
//      same function the editor's approval route calls. Doing step 1 with raw SQL would otherwise
//      skip it, and a Reel with no companion row has no Story to release 45 minutes later.
//   3. RESUME AUTO POSTING. sa_set_auto_posting stamps auto_posting_resumed_at = now() on the
//      transition into 'on', and isEligibleAfterResume requires scheduled_at >= that stamp.
//   4. RE-TIME THE SIX, after the stamp, so they are eligible. This is why 3 precedes 4: a post
//      left at 07:30 is permanently ineligible once the switch is flipped at 09:00, which is the
//      backlog guard doing its job rather than a fault.
//
// WHAT IT DELIBERATELY DOES NOT TOUCH: the other 78 posts, tonight's 19:30 slot, any pause flag,
// any destination, any caption, overlay, template, render or audio setting. Every write below is
// scoped by the exact instant 2026-11-24T13:30:00Z, so tonight's rows are not reachable from here.
import { createClient } from "@supabase/supabase-js"
import { readFileSync } from "node:fs"
import { ensureStoryCompanion } from "../lib/social/storyCompanion"
import { storyDelayMinutes } from "../lib/social/storyFollowUp"
import { isEligibleAfterResume, isWithinLatenessWindow, MAX_LATENESS_MS } from "../lib/social/autoPosting"

const APPLY = process.argv.includes("--apply")
const MORNING = "2026-11-24T13:30:00+00:00"
const OWNER = "c567c077-d3f4-4532-8807-a54795f753f5"

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "")
}
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
})

const SELECT =
  "id, platform, destination, status, scheduled_at, approved_at, published_at, external_post_id, " +
  "render_status, rendered_storage_path, connection_id, follows_post_id, " +
  "destination_connection:connection_id(username, provider, posting_paused, buffer_channel_id)"
const one = (v: unknown) => (Array.isArray(v) ? v[0] : v) as Record<string, any> | null
const short = (s: unknown) => String(s ?? "-").slice(0, 8)

async function main() {
  // ── READ, AND REFUSE ON ANYTHING UNEXPECTED ───────────────────────────────────────────────
  const { data, error } = await db.from("social_posts").select(SELECT).eq("scheduled_at", MORNING)
  if (error) throw new Error(error.message)
  const six = (data ?? []) as Record<string, any>[]

  console.log(`THIS MORNING'S SLOT (${MORNING})`)
  for (const p of six.sort((a, b) => String(a.platform).localeCompare(String(b.platform)))) {
    const c = one(p.destination_connection)
    console.log(`  ${short(p.id)}  ${String(p.platform).padEnd(10)} @${String(c?.username).padEnd(18)} ` +
      `${String(p.destination).padEnd(16)} ${p.render_status}  paused=${c?.posting_paused ? "YES" : "no"}  ` +
      `approved=${p.approved_at ? "yes" : "no"}  published=${p.published_at ? "YES" : "no"}`)
  }
  const bad: string[] = []
  if (six.length !== 6) bad.push(`expected 6 posts at that instant, found ${six.length}`)
  for (const p of six) {
    if (p.published_at || p.external_post_id) bad.push(`${short(p.id)} has already published`)
    if (p.render_status !== "ready" || !p.rendered_storage_path) bad.push(`${short(p.id)} has no finished render`)
    if (!p.connection_id) bad.push(`${short(p.id)} has no destination`)
    if (p.follows_post_id) bad.push(`${short(p.id)} is a companion, not an original`)
    if (one(p.destination_connection)?.posting_paused) bad.push(`${short(p.id)}'s account is paused`)
  }
  const reels = six.filter((p) => p.destination === "instagram_reel")
  if (reels.length !== 3) bad.push(`expected 3 Instagram Reels, found ${reels.length}`)
  if (bad.length) { console.log("\nREFUSED — nothing was written:"); for (const b of bad) console.log(`  ${b}`); process.exit(1) }

  // Tonight's rows, read now so the report can prove afterwards that they did not move.
  const { data: tonight } = await db.from("social_posts")
    .select("id, scheduled_at, status, approved_at").eq("scheduled_at", "2026-11-25T01:30:00+00:00")
  const tonightBefore = (tonight ?? []).map((t) => `${short(t.id)}@${t.scheduled_at}/${t.status}/${t.approved_at ? "approved" : "unapproved"}`).sort()
  console.log(`\nTONIGHT, BEFORE: ${tonightBefore.length} posts at 19:30 Central — ${tonightBefore.length === 6 ? "all six present" : "UNEXPECTED COUNT"}`)

  const whenIso = new Date(Date.now() + 20_000).toISOString() // the new slot: due in 20 seconds
  const delay = storyDelayMinutes()
  console.log(`\nWHAT WILL BE WRITTEN`)
  console.log(`  1. approved_at = now() on all six`)
  console.log(`  2. a companion Story for each of the ${reels.length} Instagram Reels (ensureStoryCompanion)`)
  console.log(`  3. auto_posting = 'on', auto_posting_resumed_at = now()`)
  console.log(`  4. scheduled_at = ${whenIso} on the six (next publishing window; the cron runs every 5 minutes)`)
  console.log(`\n  the Story delay in force is ${delay} minutes, so each Story lands at its Reel's real publish time + ${delay}m`)
  console.log(`  the lateness window is ${MAX_LATENESS_MS / 60000} minutes from the new slot`)
  if (!APPLY) { console.log("\nNothing was written. Re-run with --apply."); return }

  const nowIso = new Date().toISOString()

  // ── 1. APPROVAL ───────────────────────────────────────────────────────────────────────────
  const { data: approved, error: aErr } = await db.from("social_posts")
    .update({ approved_at: nowIso, declined_at: null, updated_at: nowIso })
    .eq("scheduled_at", MORNING).is("published_at", null).select("id")
  if (aErr) throw new Error(`approval failed: ${aErr.message}`)
  console.log(`\n1. approved ${approved?.length ?? 0} post(s)`)
  if ((approved?.length ?? 0) !== 6) throw new Error("approval did not land on all six — stopping before anything else")

  // ── 2. THE COMPANION STORIES ──────────────────────────────────────────────────────────────
  // Idempotent by a partial unique index on follows_post_id; already_exists is success.
  console.log(`2. companion Stories:`)
  for (const reel of reels) {
    const r = await ensureStoryCompanion(db as never, reel.id as string)
    const c = one(reel.destination_connection)
    console.log(`   @${String(c?.username).padEnd(18)} reel ${short(reel.id)} -> ` +
      (r.created ? `story ${short(r.storyId)} created` : `${r.reason}${r.storyId ? ` (${short(r.storyId)})` : ""}`))
  }

  // ── 3. AUTO POSTING ON ────────────────────────────────────────────────────────────────────
  const resumedAt = new Date().toISOString()
  const { error: sErr } = await db.from("social_settings")
    .update({ auto_posting: "on", auto_posting_resumed_at: resumedAt, updated_at: resumedAt })
    .eq("owner_user_id", OWNER)
  if (sErr) throw new Error(`auto posting failed: ${sErr.message}`)
  console.log(`3. auto_posting = on, resumed at ${resumedAt}`)

  // ── 4. THE NEW SLOT ───────────────────────────────────────────────────────────────────────
  // AFTER the resume stamp, so isEligibleAfterResume passes. Scoped to the morning instant, so
  // tonight's rows cannot be reached. status is already 'scheduled' and is left alone.
  const { data: moved, error: mErr } = await db.from("social_posts")
    .update({ scheduled_at: whenIso, updated_at: new Date().toISOString() })
    .eq("scheduled_at", MORNING).is("published_at", null).select("id, scheduled_at")
  if (mErr) throw new Error(`reschedule failed: ${mErr.message}`)
  console.log(`4. re-timed ${moved?.length ?? 0} post(s) to ${whenIso}`)

  // ── READ BACK ─────────────────────────────────────────────────────────────────────────────
  const { data: after } = await db.from("social_posts").select(SELECT).eq("scheduled_at", whenIso)
  const rows = (after ?? []) as Record<string, any>[]
  const settings = (await db.from("social_settings").select("auto_posting, auto_posting_resumed_at").eq("owner_user_id", OWNER).maybeSingle()).data as any
  console.log(`\nVERIFIED`)
  console.log(`  ${rows.length} posts at the new slot, ${rows.filter((r) => r.approved_at).length} approved, ${rows.filter((r) => r.render_status === "ready").length} rendered`)
  for (const r of rows) {
    const eligible = isEligibleAfterResume(r.scheduled_at, { state: settings.auto_posting, resumedAt: settings.auto_posting_resumed_at })
    const inWindow = isWithinLatenessWindow(r.scheduled_at)
    const c = one(r.destination_connection)
    console.log(`  ${short(r.id)}  @${String(c?.username).padEnd(18)} ${String(r.destination).padEnd(16)} ` +
      `via ${c?.buffer_channel_id ? "Buffer" : "native"}  eligible=${eligible}  inLatenessWindow=${inWindow}`)
  }
  const { data: stories } = await db.from("social_posts")
    .select("id, follows_post_id, status, scheduled_at, approved_at, render_status, connection_id")
    .not("follows_post_id", "is", null).is("published_at", null)
  console.log(`\n  companion Stories waiting: ${(stories ?? []).length} (unscheduled until their Reel publishes)`)
  for (const s of (stories ?? []) as Record<string, any>[]) {
    console.log(`    ${short(s.id)} follows ${short(s.follows_post_id)}  status=${s.status}  scheduled_at=${s.scheduled_at ?? "NULL"}  render=${s.render_status}`)
  }

  const { data: tonightAfter } = await db.from("social_posts")
    .select("id, scheduled_at, status, approved_at").eq("scheduled_at", "2026-11-25T01:30:00+00:00")
  const tonightNow = (tonightAfter ?? []).map((t) => `${short(t.id)}@${t.scheduled_at}/${t.status}/${t.approved_at ? "approved" : "unapproved"}`).sort()
  const same = tonightNow.length === tonightBefore.length && tonightNow.every((v, i) => v === tonightBefore[i])
  console.log(`\n  tonight's 19:30: ${tonightNow.length} posts, ${same ? "byte-for-byte unchanged" : "CHANGED — investigate"}`)
}

main().catch((e) => { console.error(`\nFAILED: ${e instanceof Error ? e.message : String(e)}`); process.exit(1) })
