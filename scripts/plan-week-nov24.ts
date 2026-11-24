// THE FIRST SEVEN DAYS — 24 to 30 November 2026: the REPORT.
//
// Run: npx tsx scripts/plan-week-nov24.ts
// Read-only. It writes nothing, ever — the queue is built by scripts/build-week-queue.ts.
//
// The selection itself lives in scripts/weekOneSelection.ts, which this and the builder both
// import, so the schedule the operator reads and the rows the builder writes are the same 42
// answers rather than two greedy walks over a library that moves between runs.
import { createClient } from "@supabase/supabase-js"
import { readFileSync } from "node:fs"
import { selectWeekOne, propOf, DATES, DOW, GROUPS } from "./weekOneSelection"

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "")
}
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
})

async function main() {
  const slots = await selectWeekOne(db)
  const { data: drafts } = await db.from("social_posts").select("id, source_content_id").is("published_at", null)
  const draftFor = new Map<string, string>()
  for (const d of drafts ?? []) if (!draftFor.has(d.source_content_id)) draftFor.set(d.source_content_id, d.id)

  console.log("SEVEN-DAY SCHEDULE — 24 to 30 November 2026, 07:30 and 19:30 Central")
  console.log("Instagram and TikTok mirror each other within every group, so each row is TWO posts.\n")
  for (let d = 0; d < 7; d++) {
    console.log(`${DOW[d]} ${DATES[d]}`)
    for (const g of GROUPS) {
      for (const w of ["AM", "PM"] as const) {
        const s = slots.find((x) => x.day === d && x.when === w && x.group === g)!
        const draft = draftFor.get(s.src.id)
        const origin = s.sharedFrom
          ? (() => { const o = slots.find((x) => x.group === "Main" && x.src.id === s.src.id); return o ? `  [same render as Main ${DOW[o.day]} ${o.when}]` : "  [shared with Main]" })()
          : ""
        console.log(
          `  ${w === "AM" ? "07:30" : "19:30"} ${g.padEnd(8)} ${propOf(s.src).slice(0, 44).padEnd(45)} ${String(s.src.market).padEnd(12)} ` +
          `${String(s.src.duration_s ?? "?").padStart(5)}s  ${s.src.id.slice(0, 8)}  ` +
          `draft ${draft ? draft.slice(0, 8) : "NONE — will create"}${origin}${s.note ? `  [${s.note}]` : ""}`,
        )
      }
    }
    console.log("")
  }

  const sharedSlots = slots.filter((s) => s.sharedFrom)
  const distinct = new Set(slots.map((s) => s.src.id))
  console.log("SHARING")
  console.log(`  42 slots, ${distinct.size} distinct videos, ${sharedSlots.length} slots served by a video another group already carries`)
  for (const g of ["Dallas", "Lisette"] as const) {
    console.log(`  ${g.padEnd(8)} reuses ${sharedSlots.filter((s) => s.group === g).length} of its 14 from Main`)
  }
  console.log("\nBALANCE AND REPEATS")
  for (const g of GROUPS) {
    const mk: Record<string, number> = {}
    for (const s of slots.filter((x) => x.group === g)) mk[s.src.market ?? "-"] = (mk[s.src.market ?? "-"] ?? 0) + 1
    const props = slots.filter((x) => x.group === g).map((s) => propOf(s.src))
    console.log(`  ${g.padEnd(8)} ${Object.entries(mk).map(([k, v]) => `${k} ${v}`).join(", ").padEnd(46)} distinct properties ${new Set(props).size}/14`)
  }
  console.log("\nNothing was written. scripts/build-week-queue.ts turns this into 84 scheduled posts.")
}

main().catch((e) => { console.error(e instanceof Error ? e.message : String(e)); process.exit(1) })
