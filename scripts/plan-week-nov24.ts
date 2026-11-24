// THE FIRST SEVEN DAYS — 24 to 30 November 2026, three account groups, two slots a day.
//
// Run: npx tsx scripts/plan-week-nov24.ts [--apply]
// Without --apply it writes nothing. With --apply it creates a draft ONLY for a selected video
// that does not already have one.
//
// ── WHY THIS WRITES ALMOST NOTHING ──────────────────────────────────────────────────────────
// 271 unpublished drafts already exist, covering 268 of 283 sources. Nearly every video the
// operator might pick is already an editable draft with prepared copy. So the missing piece was
// never the drafts — it was the SELECTION: which video fills which slot, for which group, on
// which day, and which ones can be shared between groups.
//
// ── WHY NO scheduled_at OR connection_id IS SET ─────────────────────────────────────────────
// The autopilot planner is what assigns those, and it claims a post by requiring
// scheduled_at / connection_id / published_at / external_post_id to be NULL
// (CLAIM_REQUIRED_NULLS in autopilotWrite.ts). Pre-setting them would make every selected post
// permanently unclaimable and hand the whole queue to manual management — the opposite of
// publishing "without manual intervention". The planner already enforces 07:30 / 19:30, the
// market restrictions, the balanced rotation, the Instagram/TikTok mirroring and the debut hold.
// This plan decides WHAT; the planner decides WHEN, from the cadence already configured.
//
// ── THE CONSTRAINTS, ALL OF THEM ────────────────────────────────────────────────────────────
//   • main group     14 slots across San Antonio, Austin, Dallas and Houston
//   • Dallas group   14 slots, Dallas ONLY
//   • Lisette        14 slots, balanced San Antonio / Austin, SHARED content only
//   • no property repeats WITHIN a group across the seven days
//   • personal videos never leave their owner
//   • day one is fixed by the operator's own picks
//   • sharing: a Dallas video on main can serve the Dallas group; a San Antonio or Austin video
//     on main can serve Lisette, but only if it is shared content
import { createClient } from "@supabase/supabase-js"
import { readFileSync } from "node:fs"
import { preparePost, priceLabelMode } from "../lib/social/composePost"
import { defaultPostType } from "../lib/social/postTypes"

const APPLY = process.argv.includes("--apply")
const LISETTE = "27d7bde4-00f0-433c-b32b-b243623ad20a"

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "")
}
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
})

type Src = {
  id: string; display_name: string | null; property_name: string | null; market: string | null
  duration_s: number | null; available_to_agents: boolean | null
  personal_agent_user_id: string | null; created_at: string
}
type Slot = {
  day: number; date: string; when: "AM" | "PM"; group: "Main" | "Dallas" | "Lisette"
  src: Src; sharedFrom?: string; note?: string
}

const DATES = ["2026-11-24", "2026-11-25", "2026-11-26", "2026-11-27", "2026-11-28", "2026-11-29", "2026-11-30"]
const DOW = ["Tue", "Wed", "Thu", "Fri", "Sat", "Sun", "Mon"]

async function main() {
  const { data, error } = await db
    .from("social_content")
    .select("id, display_name, property_name, market, duration_s, available_to_agents, personal_agent_user_id, created_at")
    .order("created_at", { ascending: false })
  if (error) { console.error(error.message); process.exit(1) }
  const all = (data ?? []) as Src[]

  const { data: drafts } = await db.from("social_posts").select("id, source_content_id").is("published_at", null)
  const draftFor = new Map<string, string>()
  for (const d of drafts ?? []) if (!draftFor.has(d.source_content_id)) draftFor.set(d.source_content_id, d.id)

  const byId = new Map(all.map((s) => [s.id, s]))
  const prop = (s: Src) => (s.property_name ?? s.display_name ?? s.id).trim()

  // Eligibility, stated once so every pick is checked the same way.
  const mine = (s: Src) => s.personal_agent_user_id === null              // not reserved for an agent
  const hers = (s: Src) => s.personal_agent_user_id === LISETTE
  const shared = (s: Src) => s.available_to_agents === true               // may reach an agent's account
  const inMarket = (s: Src, mk: string[]) => !!s.market && mk.includes(s.market)

  // Day one, exactly as the operator specified it.
  const FIXED: Record<string, string> = {
    "Lisette:0:AM": "33daf0d4-087e-4e89-afaa-8e54d59c5c30", // her debut, already customised
    "Lisette:0:PM": "65a0c574",                             // Oasis at Round Rock, Austin, 17.5s
    "Main:0:AM": "c313a193",                                // his 32.1s South Side, Personal -> Only me
    "Main:0:PM": "f7cd86fe",                                // Oasis at Round Rock, Austin, 21.3s
  }
  const resolve = (idOrPrefix: string) => byId.get(idOrPrefix) ?? all.find((s) => s.id.startsWith(idOrPrefix))

  const usedProp: Record<string, Set<string>> = { Main: new Set(), Dallas: new Set(), Lisette: new Set() }
  const slots: Slot[] = []

  const take = (group: Slot["group"], day: number, when: "AM" | "PM", pick: Src, sharedFrom?: string, note?: string) => {
    usedProp[group].add(prop(pick))
    slots.push({ day, date: DATES[day], when, group, src: pick, sharedFrom, note })
  }

  // The pools, newest first so the freshest footage goes out first.
  const pool = (mk: string[], who: "main" | "lisette") =>
    all.filter((s) =>
      inMarket(s, mk) &&
      (who === "main" ? mine(s) : (shared(s) && !hers(s))) &&
      (who === "main" || !hers(s)))

  // ── MAIN: 4 Dallas + 4 San Antonio + 3 Austin + 3 Houston ────────────────────────────────
  // Deliberately shaped so the Dallas group can reuse the Dallas picks and Lisette can reuse the
  // San Antonio and Austin ones. Houston is main-only: neither other group may carry it.
  const mainShape: ("Dallas" | "San Antonio" | "Austin" | "Houston")[] = [
    "Austin", "Dallas", "San Antonio", "Houston", "Dallas", "San Antonio", "Austin",
    "Dallas", "Houston", "San Antonio", "Dallas", "Austin", "San Antonio", "Houston",
  ]
  const mainPicks: Src[] = []
  for (let i = 0; i < 14; i++) {
    const day = Math.floor(i / 2), when: "AM" | "PM" = i % 2 === 0 ? "AM" : "PM"
    const key = `Main:${day}:${when}`
    if (FIXED[key]) {
      const s = resolve(FIXED[key])!
      mainPicks.push(s); take("Main", day, when, s, undefined, day === 0 && when === "AM" ? "Personal → Only me" : undefined)
      continue
    }
    const want = mainShape[i]
    const cand = pool([want], "main").find((s) => !usedProp.Main.has(prop(s)))
    if (!cand) { console.error(`main: nothing left in ${want} for day ${day} ${when}`); process.exit(1) }
    mainPicks.push(cand); take("Main", day, when, cand)
  }

  // ── DALLAS GROUP: reuse main's Dallas picks, then fill from the Dallas library ────────────
  const mainDallas = mainPicks.filter((s) => s.market === "Dallas")
  for (let i = 0; i < 14; i++) {
    const day = Math.floor(i / 2), when: "AM" | "PM" = i % 2 === 0 ? "AM" : "PM"
    const reuse = mainDallas.find((s) => !usedProp.Dallas.has(prop(s)))
    if (reuse) { take("Dallas", day, when, reuse, "Main"); continue }
    const cand = pool(["Dallas"], "main").find((s) => !usedProp.Dallas.has(prop(s)))
    if (!cand) { console.error(`dallas: nothing left for day ${day} ${when}`); process.exit(1) }
    take("Dallas", day, when, cand)
  }

  // ── LISETTE: her debut, then as much of main's shared SA/Austin as her balance allows ─────
  // Reuse is chosen BEFORE the rest of her week rather than slot by slot. A greedy per-slot walk
  // kept reaching for her own library because the market it happened to want next had no unused
  // main pick left, which left reusable renders on the table — the opposite of the point.
  //
  // So: take her two fixed picks, work out how many San Antonio and Austin slots remain, fill as
  // many as possible from main's shared picks within those quotas, then top up from her library.
  const mainForHer = mainPicks.filter((s) => inMarket(s, ["San Antonio", "Austin"]) && shared(s) && !hers(s))
  const fixedHer = ["AM", "PM"].map((w) => resolve(FIXED[`Lisette:0:${w}`])!).filter(Boolean)
  const quota: Record<string, number> = { "San Antonio": 7, Austin: 7 }
  // HER FIXED PICKS COUNT AS USED BEFORE ANY REUSE IS CHOSEN. They are only passed to take()
  // later, inside the slot loop, so without this the claim below could hand her a DIFFERENT clip
  // of a property she is already showing — which is exactly what happened: main carries another
  // Oasis at Round Rock and another South Side Living, and both were offered to her as reuse,
  // taking her to 12 distinct properties out of 14.
  for (const s of fixedHer) { quota[s.market!] -= 1; usedProp.Lisette.add(prop(s)) }

  const herRest: { src: Src; sharedFrom?: string }[] = []
  const claim = (s: Src, from?: string) => {
    if (usedProp.Lisette.has(prop(s)) || herRest.some((x) => prop(x.src) === prop(s))) return false
    if ((quota[s.market ?? ""] ?? 0) <= 0) return false
    quota[s.market!] -= 1
    herRest.push({ src: s, sharedFrom: from })
    return true
  }
  for (const s of mainForHer) claim(s, "Main")                       // reuse first, as much as fits
  for (const mk of ["San Antonio", "Austin"]) {                      // then her own library
    while ((quota[mk] ?? 0) > 0) {
      const cand = pool([mk], "lisette").find((s) => !usedProp.Lisette.has(prop(s)) && !herRest.some((x) => prop(x.src) === prop(s)))
      if (!cand) break
      claim(cand)
    }
  }
  // Alternate the two markets across the week so neither clusters at one end of it.
  const sa = herRest.filter((x) => x.src.market === "San Antonio")
  const au = herRest.filter((x) => x.src.market === "Austin")
  const ordered: { src: Src; sharedFrom?: string }[] = []
  for (let i = 0; i < Math.max(sa.length, au.length); i++) { if (sa[i]) ordered.push(sa[i]); if (au[i]) ordered.push(au[i]) }

  let cursor = 0
  for (let i = 0; i < 14; i++) {
    const day = Math.floor(i / 2), when: "AM" | "PM" = i % 2 === 0 ? "AM" : "PM"
    const key = `Lisette:${day}:${when}`
    if (FIXED[key]) {
      const s = resolve(FIXED[key])!
      take("Lisette", day, when, s, undefined, day === 0 && when === "AM" ? "her debut — publishes first on BOTH platforms" : undefined)
      continue
    }
    const next = ordered[cursor++]
    if (!next) { console.error(`lisette: nothing left for day ${day} ${when}`); process.exit(1) }
    take("Lisette", day, when, next.src, next.sharedFrom)
  }

  // ── THE SCHEDULE ─────────────────────────────────────────────────────────────────────────
  console.log("SEVEN-DAY SCHEDULE — 24 to 30 November 2026, 07:30 and 19:30 Central")
  console.log("Instagram and TikTok mirror each other within every group, so each row is TWO posts.\n")
  for (let d = 0; d < 7; d++) {
    console.log(`${DOW[d]} ${DATES[d]}`)
    for (const g of ["Main", "Dallas", "Lisette"] as const) {
      for (const w of ["AM", "PM"] as const) {
        const s = slots.find((x) => x.day === d && x.when === w && x.group === g)!
        const time = w === "AM" ? "07:30" : "19:30"
        const draft = draftFor.get(s.src.id)
        console.log(
          `  ${time} ${g.padEnd(8)} ${prop(s.src).slice(0, 44).padEnd(45)} ${String(s.src.market).padEnd(12)} ` +
          `${String(s.src.duration_s ?? "?").padStart(5)}s  ${s.src.id.slice(0, 8)}  ` +
          `draft ${draft ? draft.slice(0, 8) : "NONE — will create"}` +
          `${s.sharedFrom ? `  [same render as ${s.sharedFrom} ${(() => { const o = slots.find((x) => x.group === "Main" && x.src.id === s.src.id); return o ? `${DOW[o.day]} ${o.when}` : "" })()}]` : ""}${s.note ? `  [${s.note}]` : ""}`,
        )
      }
    }
    console.log("")
  }

  // ── WHAT IS SHARED, AND WHAT IT SAVES ────────────────────────────────────────────────────
  const sharedSlots = slots.filter((s) => s.sharedFrom)
  const distinct = new Set(slots.map((s) => s.src.id))
  console.log("SHARING")
  console.log(`  42 slots, ${distinct.size} distinct videos, ${sharedSlots.length} slots served by a video another group already carries`)
  for (const g of ["Dallas", "Lisette"] as const) {
    const n = sharedSlots.filter((s) => s.group === g).length
    console.log(`  ${g.padEnd(8)} reuses ${n} of its 14 from Main`)
  }
  console.log("\nBALANCE AND REPEATS")
  for (const g of ["Main", "Dallas", "Lisette"] as const) {
    const mk: Record<string, number> = {}
    for (const s of slots.filter((x) => x.group === g)) mk[s.src.market ?? "-"] = (mk[s.src.market ?? "-"] ?? 0) + 1
    const props = slots.filter((x) => x.group === g).map((s) => prop(s.src))
    console.log(`  ${g.padEnd(8)} ${Object.entries(mk).map(([k, v]) => `${k} ${v}`).join(", ").padEnd(46)} distinct properties ${new Set(props).size}/14`)
  }

  const missing = slots.filter((s) => !draftFor.get(s.src.id))
  const missingIds = Array.from(new Set(missing.map((s) => s.src.id)))
  console.log(`\nDRAFTS\n  ${distinct.size - missingIds.length} of ${distinct.size} selected videos already have an editable draft`)
  if (missingIds.length) console.log(`  ${missingIds.length} need one: ${missingIds.map((i) => i.slice(0, 8)).join(", ")}`)
  if (!APPLY) {
    console.log("\nNothing was written. Re-run with --apply to create only the missing drafts.")
    return
  }

  // Only the gaps. An existing draft is the operator's — it may already carry his template, text
  // and caption, and a second row for the same source would be refused by
  // social_posts_one_initial_draft_uidx anyway.
  for (const id of missingIds) {
    const src = byId.get(id)!
    const prepared = preparePost({
      market: src.market, propertyType: null, special: null, budgetRange: null,
      priceLabelMode: priceLabelMode(null), amenities: null,
    }, id)
    const { data: made, error: e } = await db.from("social_posts").insert({
      owner_user_id: "c567c077-d3f4-4532-8807-a54795f753f5",
      source_content_id: id,
      platform: "instagram",
      post_type: defaultPostType("instagram"),
      post_name: src.display_name,
      caption: prepared.caption,
      overlay_headline: prepared.overlayHeadline,
      overlay_subheadline: prepared.overlaySubheadline,
      hashtags: prepared.hashtags,
      overlay_mode: "generate",
      audio_choice: "original",
      render_status: "none",
      status: "draft",
      created_via: "edit_initial",
    }).select("id").single()
    if (e) { console.log(`  ${id.slice(0, 8)}  FAILED: ${e.message}`); continue }
    console.log(`  ${id.slice(0, 8)}  draft created ${made!.id.slice(0, 8)}  ${prop(src)}`)
  }
}

main().catch((e) => { console.error(e instanceof Error ? e.message : String(e)); process.exit(1) })
