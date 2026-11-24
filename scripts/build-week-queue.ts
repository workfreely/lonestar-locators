// BUILD THE FIRST WEEK'S QUEUE — 84 posts, each with its account, its date and its time.
//
// Run: npx tsx scripts/build-week-queue.ts [--apply]
// Without --apply it prints every row it would write or change and touches nothing.
//
// ── WHY THIS EXISTS, STATED HONESTLY ────────────────────────────────────────────────────────
// The week was selected and then left in a markdown file, on the reasoning that the autopilot
// planner owns scheduled_at and connection_id and would refuse to claim a row that already had
// them. That is true of the planner and irrelevant to the operator: he hand-picked these 42
// slots, so there is nothing for the planner to choose. The planner's job starts AFTER this week,
// maintaining the cadence; this week is his.
//
// ── IT WRITES A STATE THE EDITOR ROUTE WOULD REFUSE, DELIBERATELY ───────────────────────────
// PATCH /posts/[id] with intent:"schedule" requires approved_at first ("scheduling is the real
// entrance to publishing"), and for a tiktok_video it also requires stored TikTok publishing
// settings — columns that do not exist in production, so the editor cannot schedule a TikTok post
// at all. Both gates guard PUBLISHING. This writes scheduled_at + status='scheduled' with
// approved_at still NULL, which means:
//
//   • the Calendar renders the week, because it reads status='scheduled' and nothing else;
//   • NOTHING can publish, because every publish worker filters on approved_at IS NOT NULL
//     before it reads a row — the broadest gate in the system, and it is untouched here.
//
// So the operator sees his week and still holds the only key. He approves in the editor, as he
// asked to.
//
// ── DUPLICATE SCHEDULING IS PREVENTED BY THE DATABASE, NOT BY THIS SCRIPT ───────────────────
// social_posts_connection_slot_uidx is UNIQUE (connection_id, scheduled_at) where both are set:
// one account cannot hold two posts at one instant, whatever writes them. 6 accounts x 14 slots
// = 84 distinct pairs. social_posts_content_connection_dest_uidx additionally forbids the same
// video twice on one account+surface while unpublished. This script asserts both before writing,
// so a clash is a refusal rather than a caught exception half way through.
//
// ── EXISTING WORK IS REUSED, NEVER REPLACED ────────────────────────────────────────────────
// A slot's video almost always already has the operator's own draft, with his caption, overlay
// text and template. That row IS the scheduled post — it gains a time and an account and keeps
// everything else. A second group carrying the same video gets a `variation` copied from it,
// because social_posts_one_initial_draft_uidx allows only one edit_initial row per source. The
// seven TikTok drafts that already exist are adopted the same way rather than duplicated.
import { createClient } from "@supabase/supabase-js"
import { readFileSync } from "node:fs"
import { selectWeekOne, propOf, slotTime, DOW, GROUPS, OWNER, LISETTE, type Slot, type Group } from "./weekOneSelection"
import { isExternalAgentConnection, effectiveAgent } from "../lib/social/agentIdentity"
import { assignedTo, personalAssignmentRefusal, marketRestrictionWaived } from "../lib/social/personalOwnership"
import { parseMarketRestriction, isMarketAllowed } from "../lib/social/marketRestriction"
import { tiktokSiblingRowFrom } from "../lib/social/tiktokSibling"
import { preparePost, priceLabelMode } from "../lib/social/composePost"
import { defaultPostType } from "../lib/social/postTypes"

const APPLY = process.argv.includes("--apply")

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "")
}
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
})

// THE SIX ACCOUNTS, BY GROUP. Resolved from the database by username + provider rather than hard
// -coded ids, so a reconnected account cannot silently send a group's week to the wrong feed.
const GROUP_ACCOUNTS: Record<Group, { instagram: string; tiktok: string }> = {
  Main:    { instagram: "realestatepro_tx", tiktok: "realestatepro_tx" },
  Dallas:  { instagram: "locatorbeast",     tiktok: "locator.beast" },
  Lisette: { instagram: "locatorlisette",   tiktok: "locatorlisette" },
}

type Conn = {
  id: string; provider: string; username: string | null; label: string | null
  agent_user_id: string | null; owner_user_id: string | null
  posting_paused: boolean | null; market_restriction: unknown
  buffer_account_id: string | null; buffer_channel_id: string | null
}
type Row = Record<string, unknown>

// The creative travels; publishing state and artifacts do not. Mirrors tiktokSiblingRowFrom's
// division for the Instagram half: anything that would let a copy act on its own, or that names a
// specific rendered file, is left out and starts empty.
const CREATIVE_COLUMNS = [
  "owner_user_id", "source_content_id", "platform", "post_type", "post_name", "caption",
  "on_video_text", "on_video_config", "overlay_headline", "overlay_subheadline", "hashtags",
  "audio_choice", "audio_track_id", "overlay_mode", "social_special", "overlay_template",
  "voice_hook_id", "voice_cta_id", "cover_thumb_offset_ms", "destination", "source_storage_path",
  "presenter_id", "presenter_intro_seconds", "presenter_clip_storage_path",
  "presenter_audio_storage_path", "presenter_side", "presenter_width_px",
  "featured_property_type", "presenter_cta_id", "presenter_cta_clip_storage_path",
] as const

const SELECT_ALL =
  "id, " + CREATIVE_COLUMNS.join(", ") +
  ", status, scheduled_at, connection_id, approved_at, render_status, rendered_storage_path, created_via, sibling_of_post_id, follows_post_id, published_at, created_at"

const short = (v: string | null | undefined) => (v ? v.slice(0, 8) : "-")

async function main() {
  // ── 1. THE ACCOUNTS ───────────────────────────────────────────────────────────────────────
  const { data: connData, error: connErr } = await db
    .from("social_connections")
    .select("id, provider, username, label, agent_user_id, owner_user_id, posting_paused, market_restriction, buffer_account_id, buffer_channel_id")
  if (connErr) throw new Error(`connections: ${connErr.message}`)
  const conns = (connData ?? []) as Conn[]
  const byId = new Map(conns.map((c) => [c.id, c]))
  const find = (provider: string, username: string) => {
    const hits = conns.filter((c) => c.provider === provider && c.username === username)
    if (hits.length !== 1) throw new Error(`expected exactly one ${provider} @${username}, found ${hits.length}`)
    return hits[0]
  }
  const accounts: Record<Group, { instagram: Conn; tiktok: Conn }> = {
    Main: { instagram: find("instagram", GROUP_ACCOUNTS.Main.instagram), tiktok: find("tiktok", GROUP_ACCOUNTS.Main.tiktok) },
    Dallas: { instagram: find("instagram", GROUP_ACCOUNTS.Dallas.instagram), tiktok: find("tiktok", GROUP_ACCOUNTS.Dallas.tiktok) },
    Lisette: { instagram: find("instagram", GROUP_ACCOUNTS.Lisette.instagram), tiktok: find("tiktok", GROUP_ACCOUNTS.Lisette.tiktok) },
  }
  console.log("THE SIX ACCOUNTS")
  for (const g of GROUPS) {
    for (const p of ["instagram", "tiktok"] as const) {
      const c = accounts[g][p]
      const mk = parseMarketRestriction(c.market_restriction)
      console.log(`  ${g.padEnd(8)} ${p.padEnd(10)} @${String(c.username).padEnd(18)} ${short(c.id)}  paused=${c.posting_paused ? "YES" : "no "}  markets=${mk ? mk.join("/") : "all"}  buffer=${c.buffer_channel_id ? "yes" : "no"}`)
    }
  }

  // ── 2. THE WEEK ───────────────────────────────────────────────────────────────────────────
  const slots = await selectWeekOne(db)

  // The stored instant must BE 07:30 or 19:30 in Central, not merely written that way.
  for (const s of slots) {
    const iso = slotTime(s.date, s.when)
    const wall = new Date(iso).toLocaleString("en-US", { timeZone: "America/Chicago", hour: "2-digit", minute: "2-digit", hour12: false })
    const want = s.when === "AM" ? "07:30" : "19:30"
    if (wall !== want) throw new Error(`${s.date} ${s.when}: stored instant reads ${wall} Central, expected ${want}`)
  }

  // ── 3. THE SOURCES, for the ownership and market rules ────────────────────────────────────
  const srcIds = [...new Set(slots.map((s) => s.src.id))]
  const { data: srcData, error: srcErr } = await db
    .from("social_content")
    .select("id, property_name, display_name, market, property_type, special, budget_range, price_label_mode, amenities, details, overlay_mode, available_to_agents, personal_agent_user_id, debut_for_agent_user_id")
    .in("id", srcIds)
  if (srcErr) throw new Error(`sources: ${srcErr.message}`)
  const srcById = new Map((srcData ?? []).map((s) => [s.id as string, s as Row]))

  // ── 4. EVERY SLOT IS AUTHORISED BEFORE ANYTHING IS WRITTEN ────────────────────────────────
  // The app's own predicates, not a second opinion written here. A single refusal aborts the whole
  // run: a partially built week is worse than none, because the operator would have to work out
  // which half of it is real.
  const refusals: string[] = []
  for (const s of slots) {
    const src = srcById.get(s.src.id)
    const content = { availableToAgents: src?.available_to_agents as boolean | null, personalAgentUserId: src?.personal_agent_user_id as string | null }
    for (const p of ["instagram", "tiktok"] as const) {
      const c = accounts[s.group][p]
      const dest = { connectionId: c.id, agent_user_id: c.agent_user_id, owner_user_id: c.owner_user_id }
      const assigned = personalAssignmentRefusal(content, dest)
      if (assigned) { refusals.push(`${s.date} ${s.when} ${s.group}/${p} ${propOf(s.src)}: ${assigned}`); continue }
      if (isExternalAgentConnection(c) && !assignedTo(content, effectiveAgent(c)) && content.availableToAgents !== true) {
        refusals.push(`${s.date} ${s.when} ${s.group}/${p} ${propOf(s.src)}: personal_video`); continue
      }
      const restriction = parseMarketRestriction(c.market_restriction)
      if (!marketRestrictionWaived(content, dest) && !isMarketAllowed(restriction, src?.market as string | null)) {
        refusals.push(`${s.date} ${s.when} ${s.group}/${p} ${propOf(s.src)}: market ${src?.market} not allowed on @${c.username} (${restriction?.join("/")})`)
      }
    }
  }
  if (refusals.length) {
    console.log(`\nREFUSED — ${refusals.length} slot/account pair(s) are not allowed. Nothing was written.`)
    for (const r of refusals) console.log(`  ${r}`)
    process.exit(1)
  }
  console.log(`\nAUTHORISATION  all 84 slot/account pairs pass the personal-ownership and market rules`)

  // ── 5. THE EXISTING ROWS ──────────────────────────────────────────────────────────────────
  const { data: postData, error: postErr } = await db
    .from("social_posts").select(SELECT_ALL).in("source_content_id", srcIds).is("published_at", null)
  if (postErr) throw new Error(`posts: ${postErr.message}`)
  const existing = (postData ?? []) as Row[]
  const claimed = new Set<string>()           // row ids this run has already given to a slot
  const rowsFor = (srcId: string, destination: string) =>
    existing.filter((r) => r.source_content_id === srcId && r.destination === destination)

  type Planned = {
    slot: Slot; platform: "instagram" | "tiktok"; connection: Conn; when: string
    action: "reuse" | "variation" | "sibling" | "adopt" | "create"; postId?: string; from?: string
  }
  const planned: Planned[] = []

  // CHRONOLOGICAL ORDER, and that is not cosmetic. A video shared by two groups has ONE draft of
  // the operator's and needs a second copy, and whichever slot is considered first keeps the
  // original. Walking the slots group by group gave Thursday's main post his Village at Lexington
  // Ranch draft and handed today's Dallas 07:30 — a slot he named by hand — a copy. Earliest slot
  // first means the posts going out soonest are the rows he has actually been editing.
  const inOrder = [...slots].sort((a, b) =>
    a.day - b.day || (a.when === b.when ? 0 : a.when === "AM" ? -1 : 1) || GROUPS.indexOf(a.group) - GROUPS.indexOf(b.group))

  // Instagram first: a TikTok sibling is a sibling OF a specific Instagram row, so that row has to
  // be decided before its TikTok half can name it.
  for (const s of inOrder) {
    const when = slotTime(s.date, s.when)
    for (const platform of ["instagram", "tiktok"] as const) {
      const c = accounts[s.group][platform]
      const destination = platform === "instagram" ? "instagram_reel" : "tiktok_video"
      const rows = rowsFor(s.src.id, destination)
      // Already pointed at this very account — an earlier run of this script, or the operator's
      // own hand. Re-used so the script is idempotent rather than additive.
      const mine = rows.find((r) => r.connection_id === c.id && !claimed.has(r.id as string))
      if (mine) { claimed.add(mine.id as string); planned.push({ slot: s, platform, connection: c, when, action: "reuse", postId: mine.id as string }); continue }
      // An unassigned row is the operator's draft for this video. It becomes the scheduled post.
      const free = rows.find((r) => !r.connection_id && !claimed.has(r.id as string))
      if (free) {
        claimed.add(free.id as string)
        planned.push({ slot: s, platform, connection: c, when, action: platform === "instagram" ? "reuse" : "adopt", postId: free.id as string })
        continue
      }
      // Nothing free: this video is already carrying another group's slot, so this group needs its
      // own copy of the creative.
      if (platform === "instagram") {
        // A handful of videos have a TikTok draft and no Instagram one, so there is nothing to
        // copy. Those get a fresh post with the same auto-prepared copy the Library's own Edit
        // button would have produced — and created_via 'variation', because the one edit_initial
        // row this source is allowed is the TikTok draft that already exists.
        const template = rows[0]
        if (!template) { planned.push({ slot: s, platform, connection: c, when, action: "create" }); continue }
        planned.push({ slot: s, platform, connection: c, when, action: "variation", from: template.id as string })
      } else {
        planned.push({ slot: s, platform, connection: c, when, action: "sibling" })
      }
    }
  }

  // ── 6. THE DUPLICATE CHECKS, BEFORE THE FIRST WRITE ───────────────────────────────────────
  const pairs = new Set<string>()
  for (const p of planned) {
    const key = `${p.connection.id}@${p.when}`
    if (pairs.has(key)) throw new Error(`two posts for @${p.connection.username} at ${p.when} — refusing`)
    pairs.add(key)
  }
  const dests = new Set<string>()
  for (const p of planned) {
    const key = `${p.slot.src.id}|${p.connection.id}|${p.platform}`
    if (dests.has(key)) throw new Error(`${propOf(p.slot.src)} twice on @${p.connection.username} (${p.platform}) — refusing`)
    dests.add(key)
  }
  // And against rows this run is NOT touching: another post could already hold one of these slots.
  const { data: busy } = await db
    .from("social_posts").select("id, connection_id, scheduled_at")
    .is("published_at", null).not("scheduled_at", "is", null).not("connection_id", "is", null)
  for (const b of (busy ?? []) as Row[]) {
    const key = `${b.connection_id}@${new Date(String(b.scheduled_at)).toISOString()}`
    if (pairs.has(key) && !planned.some((p) => p.postId === b.id)) {
      throw new Error(`slot ${b.scheduled_at} on ${short(b.connection_id as string)} is already held by post ${short(b.id as string)} — refusing`)
    }
  }
  console.log(`DUPLICATES     84 distinct (account, instant) pairs; 84 distinct (video, account, surface) pairs; no clash with any post outside this week`)

  // ── 7. THE PLAN ───────────────────────────────────────────────────────────────────────────
  const counts = { reuse: 0, variation: 0, sibling: 0, adopt: 0, create: 0 }
  console.log("\nWHAT WILL BE WRITTEN — status 'scheduled', approved_at left NULL so nothing can publish\n")
  for (let d = 0; d < 7; d++) {
    console.log(`${DOW[d]} ${slots.find((s) => s.day === d)!.date}`)
    for (const g of GROUPS) {
      for (const w of ["AM", "PM"] as const) {
        const row = planned.filter((p) => p.slot.day === d && p.slot.when === w && p.slot.group === g)
        const ig = row.find((p) => p.platform === "instagram")!
        const tt = row.find((p) => p.platform === "tiktok")!
        console.log(
          `  ${w === "AM" ? "07:30" : "19:30"} ${g.padEnd(8)} ${propOf(ig.slot.src).slice(0, 38).padEnd(39)} ` +
          `IG @${String(ig.connection.username).padEnd(17)} ${ig.action.padEnd(9)} ${short(ig.postId) }   ` +
          `TT @${String(tt.connection.username).padEnd(17)} ${tt.action.padEnd(9)} ${short(tt.postId)}`,
        )
      }
    }
  }
  for (const p of planned) counts[p.action]++
  console.log(`\n  ${counts.reuse} existing drafts scheduled in place, ${counts.adopt} existing TikTok drafts adopted, ${counts.variation} Instagram variations created, ${counts.create} Instagram posts created from scratch, ${counts.sibling} TikTok siblings created`)
  console.log(`  ${planned.length} posts in all — ${planned.filter((p) => p.platform === "instagram").length} Instagram, ${planned.filter((p) => p.platform === "tiktok").length} TikTok`)

  if (!APPLY) { console.log("\nNothing was written. Re-run with --apply."); return }

  // ── 8. THE WRITES ─────────────────────────────────────────────────────────────────────────
  // Instagram before TikTok within a slot, so a sibling can name its original. Each write is
  // checked; the first failure stops the run and says where it stopped.
  const idFor = new Map<string, string>()  // `${day}:${when}:${group}:${platform}` -> post id
  const key = (p: Planned) => `${p.slot.day}:${p.slot.when}:${p.slot.group}:${p.platform}`
  let wrote = 0
  for (const platform of ["instagram", "tiktok"] as const) {
    for (const p of planned.filter((x) => x.platform === platform)) {
      const schedule = { connection_id: p.connection.id, scheduled_at: p.when, status: "scheduled", updated_at: new Date().toISOString() }
      if (p.postId) {
        const patch: Row = { ...schedule }
        if (platform === "tiktok" && p.action === "adopt") {
          const original = idFor.get(key({ ...p, platform: "instagram" } as Planned))
          const row = existing.find((r) => r.id === p.postId)
          if (original && !row?.sibling_of_post_id) patch.sibling_of_post_id = original
        }
        const { error } = await db.from("social_posts").update(patch).eq("id", p.postId)
        if (error) throw new Error(`${p.postId}: ${error.message}`)
        idFor.set(key(p), p.postId)
      } else if (p.action === "create") {
        const src = srcById.get(p.slot.src.id)!
        const prepared = preparePost({
          market: src.market as string | null,
          propertyType: src.property_type as string | null,
          special: src.special as string | null,
          budgetRange: src.budget_range as string | null,
          priceLabelMode: priceLabelMode(src.price_label_mode),
          amenities: src.amenities as string | null,
        }, p.slot.src.id)
        const stored = src.details && typeof src.details === "object" && !Array.isArray(src.details)
          ? ((src.details as Record<string, unknown>).preparedPost as Record<string, unknown> | undefined) : undefined
        const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null)
        const tags = Array.isArray(stored?.hashtags) ? (stored!.hashtags as unknown[]).filter((t): t is string => typeof t === "string" && !!t.trim()) : []
        const row: Row = {
          owner_user_id: OWNER, source_content_id: p.slot.src.id,
          platform: "instagram", destination: "instagram_reel", post_type: defaultPostType("instagram"),
          post_name: src.display_name ?? null,
          caption: str(stored?.caption) ?? prepared.caption,
          overlay_headline: str(stored?.overlayHeadline) ?? prepared.overlayHeadline,
          overlay_subheadline: str(stored?.overlaySubheadline) ?? prepared.overlaySubheadline,
          hashtags: tags.length ? tags : prepared.hashtags,
          overlay_mode: src.overlay_mode === "existing" ? "existing" : "generate",
          audio_choice: "original", render_status: "none", created_via: "variation",
          ...schedule,
        }
        delete row.updated_at
        const { data, error } = await db.from("social_posts").insert(row).select("id").single()
        if (error) throw new Error(`create for ${propOf(p.slot.src)} on @${p.connection.username}: ${error.message}`)
        idFor.set(key(p), data!.id as string)
      } else if (p.action === "variation") {
        const template = existing.find((r) => r.id === p.from)!
        const row: Row = { created_via: "variation", render_status: "none", ...schedule }
        for (const col of CREATIVE_COLUMNS) row[col] = template[col] ?? null
        delete row.updated_at
        const { data, error } = await db.from("social_posts").insert(row).select("id").single()
        if (error) throw new Error(`variation for ${propOf(p.slot.src)} on @${p.connection.username}: ${error.message}`)
        idFor.set(key(p), data!.id as string)
      } else {
        const originalId = idFor.get(key({ ...p, platform: "instagram" } as Planned))
        if (!originalId) throw new Error(`sibling for ${propOf(p.slot.src)}: its Instagram original was not written`)
        const { data: orig, error: oErr } = await db.from("social_posts").select(SELECT_ALL).eq("id", originalId).single()
        if (oErr) throw new Error(`sibling for ${propOf(p.slot.src)}: ${oErr.message}`)
        const row = { ...tiktokSiblingRowFrom(orig as Row, originalId), ...schedule }
        delete (row as Row).updated_at
        const { data, error } = await db.from("social_posts").insert(row).select("id").single()
        if (error) throw new Error(`sibling for ${propOf(p.slot.src)} on @${p.connection.username}: ${error.message}`)
        idFor.set(key(p), data!.id as string)
      }
      wrote++
    }
  }
  console.log(`\nWROTE ${wrote} posts.`)

  // ── 9. READ BACK, AND SAY WHAT IS TRUE ────────────────────────────────────────────────────
  const ids = [...idFor.values()]
  const { data: back } = await db
    .from("social_posts").select("id, platform, destination, status, scheduled_at, connection_id, approved_at, render_status")
    .in("id", ids)
  const rows = (back ?? []) as Row[]
  const perConn = new Map<string, number>()
  for (const r of rows) perConn.set(String(r.connection_id), (perConn.get(String(r.connection_id)) ?? 0) + 1)
  console.log("\nVERIFIED")
  console.log(`  ${rows.length} rows read back; ${rows.filter((r) => r.status === "scheduled").length} scheduled, ${rows.filter((r) => r.scheduled_at).length} with a time, ${rows.filter((r) => r.connection_id).length} with an account`)
  console.log(`  approved: ${rows.filter((r) => r.approved_at).length}  —  nothing can publish while this is 0`)
  console.log(`  rendered: ${rows.filter((r) => r.render_status === "ready").length} of ${rows.length}`)
  for (const [cid, n] of perConn) {
    const c = byId.get(cid)!
    console.log(`  @${String(c.username).padEnd(18)} ${c.provider.padEnd(10)} ${n} posts`)
  }
}

main().catch((e) => { console.error(`\nFAILED: ${e instanceof Error ? e.message : String(e)}`); process.exit(1) })
