// WHICH VIDEO FILLS WHICH SLOT — the first seven days, 24 to 30 November 2026.
//
// Extracted from scripts/plan-week-nov24.ts so the REPORT and the QUEUE BUILDER cannot disagree
// about the week. They did not, yet, but they would have: the report script held the only copy of
// the selection and the builder needed the same 42 answers to write 84 rows. Two copies of a
// greedy selection that both read a changing library is a defect waiting for its first divergence.
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
import type { SupabaseClient } from "@supabase/supabase-js"

export const LISETTE = "27d7bde4-00f0-433c-b32b-b243623ad20a"
export const OWNER = "c567c077-d3f4-4532-8807-a54795f753f5"

export type Src = {
  id: string; display_name: string | null; property_name: string | null; market: string | null
  duration_s: number | null; available_to_agents: boolean | null
  personal_agent_user_id: string | null; created_at: string
}
export type Group = "Main" | "Dallas" | "Lisette"
export type Slot = {
  day: number; date: string; when: "AM" | "PM"; group: Group
  src: Src; sharedFrom?: string; note?: string
}

export const DATES = ["2026-11-24", "2026-11-25", "2026-11-26", "2026-11-27", "2026-11-28", "2026-11-29", "2026-11-30"]
export const DOW = ["Tue", "Wed", "Thu", "Fri", "Sat", "Sun", "Mon"]
export const GROUPS: Group[] = ["Main", "Dallas", "Lisette"]

// DAY ONE, EXACTLY AS THE OPERATOR SPECIFIED IT.
// The three morning picks are his words of 24 Nov: his own South Side personal video on the main
// accounts, Village at Lexington Ranch on the Dallas accounts, Lisette's debut on hers. The two
// evening picks are the agreed plan's.
export const FIXED: Record<string, string> = {
  "Main:0:AM": "c313a193",                                // his 32.1s South Side, Personal -> Only me
  "Main:0:PM": "f7cd86fe",                                // Oasis at Round Rock, Austin, 21.3s
  "Dallas:0:AM": "5725378e",                              // Village at Lexington Ranch, Dallas, 12.3s
  "Lisette:0:AM": "33daf0d4-087e-4e89-afaa-8e54d59c5c30", // her debut, already customised
  "Lisette:0:PM": "65a0c574",                             // Oasis at Round Rock, Austin, 17.5s
}

export const propOf = (s: Src) => (s.property_name ?? s.display_name ?? s.id).trim()

/** 07:30 and 19:30 CENTRAL, written with the offset rather than converted, so the stored instant
 *  cannot drift with the machine's own zone. Asserted against America/Chicago by the caller. */
export const slotTime = (date: string, when: "AM" | "PM") =>
  new Date(`${date}T${when === "AM" ? "07:30:00" : "19:30:00"}-06:00`).toISOString()

export async function selectWeekOne(db: SupabaseClient<any, "public", any>): Promise<Slot[]> {
  const { data, error } = await db
    .from("social_content")
    .select("id, display_name, property_name, market, duration_s, available_to_agents, personal_agent_user_id, created_at")
    .order("created_at", { ascending: false })
  if (error) throw new Error(error.message)
  const all = (data ?? []) as Src[]
  const byId = new Map(all.map((s) => [s.id, s]))
  const resolve = (idOrPrefix: string) => byId.get(idOrPrefix) ?? all.find((s) => s.id.startsWith(idOrPrefix))

  // Eligibility, stated once so every pick is checked the same way.
  const mine = (s: Src) => s.personal_agent_user_id === null              // not reserved for an agent
  const hers = (s: Src) => s.personal_agent_user_id === LISETTE
  const shared = (s: Src) => s.available_to_agents === true               // may reach an agent's account
  const inMarket = (s: Src, mk: string[]) => !!s.market && mk.includes(s.market)

  const usedProp: Record<string, Set<string>> = { Main: new Set(), Dallas: new Set(), Lisette: new Set() }
  const slots: Slot[] = []
  const take = (group: Group, day: number, when: "AM" | "PM", pick: Src, sharedFrom?: string, note?: string) => {
    usedProp[group].add(propOf(pick))
    slots.push({ day, date: DATES[day], when, group, src: pick, sharedFrom, note })
  }
  const dayWhen = (i: number) => ({ day: Math.floor(i / 2), when: (i % 2 === 0 ? "AM" : "PM") as "AM" | "PM" })

  // The pools, newest first so the freshest footage goes out first.
  const pool = (mk: string[], who: "main" | "lisette") =>
    all.filter((s) => inMarket(s, mk) && (who === "main" ? mine(s) : (shared(s) && !hers(s))))

  // ── MAIN: 4 Dallas + 4 San Antonio + 3 Austin + 3 Houston ────────────────────────────────
  // Deliberately shaped so the Dallas group can reuse the Dallas picks and Lisette can reuse the
  // San Antonio and Austin ones. Houston is main-only: neither other group may carry it.
  const mainShape: ("Dallas" | "San Antonio" | "Austin" | "Houston")[] = [
    "Austin", "Dallas", "San Antonio", "Houston", "Dallas", "San Antonio", "Austin",
    "Dallas", "Houston", "San Antonio", "Dallas", "Austin", "San Antonio", "Houston",
  ]
  const mainPicks: Src[] = []
  for (let i = 0; i < 14; i++) {
    const { day, when } = dayWhen(i)
    const key = `Main:${day}:${when}`
    if (FIXED[key]) {
      const s = resolve(FIXED[key])
      if (!s) throw new Error(`main: fixed pick ${FIXED[key]} not found`)
      mainPicks.push(s)
      take("Main", day, when, s, undefined, day === 0 && when === "AM" ? "Personal → Only me" : undefined)
      continue
    }
    const want = mainShape[i]
    const cand = pool([want], "main").find((s) => !usedProp.Main.has(propOf(s)))
    if (!cand) throw new Error(`main: nothing left in ${want} for day ${day} ${when}`)
    mainPicks.push(cand); take("Main", day, when, cand)
  }

  // ── DALLAS GROUP: the operator's fixed pick, then main's Dallas picks, then the library ───
  // The fixed pick is registered in usedProp.Dallas BEFORE any reuse is chosen, for the reason
  // Lisette's loop learned the hard way: claiming reuse against a set that does not yet contain
  // the fixed picks hands the group a second clip of a property it is already showing.
  const dallasFixed: Src[] = []
  for (let i = 0; i < 14; i++) {
    const { day, when } = dayWhen(i)
    const key = `Dallas:${day}:${when}`
    if (!FIXED[key]) continue
    const s = resolve(FIXED[key])
    if (!s) throw new Error(`dallas: fixed pick ${FIXED[key]} not found`)
    dallasFixed.push(s); usedProp.Dallas.add(propOf(s))
  }
  const mainDallas = mainPicks.filter((s) => s.market === "Dallas")
  for (let i = 0; i < 14; i++) {
    const { day, when } = dayWhen(i)
    const key = `Dallas:${day}:${when}`
    if (FIXED[key]) {
      const s = resolve(FIXED[key])!
      // Already in usedProp from the pass above; take() re-adding it is a no-op on a Set.
      const alsoOnMain = mainPicks.some((m) => m.id === s.id)
      take("Dallas", day, when, s, alsoOnMain ? "Main" : undefined,
        day === 0 && when === "AM" ? "the operator's pick for today" : undefined)
      continue
    }
    const reuse = mainDallas.find((s) => !usedProp.Dallas.has(propOf(s)))
    if (reuse) { take("Dallas", day, when, reuse, "Main"); continue }
    const cand = pool(["Dallas"], "main").find((s) => !usedProp.Dallas.has(propOf(s)))
    if (!cand) throw new Error(`dallas: nothing left for day ${day} ${when}`)
    take("Dallas", day, when, cand)
  }

  // ── LISETTE: her debut, then as much of main's shared SA/Austin as her balance allows ─────
  // Reuse is chosen BEFORE the rest of her week rather than slot by slot. A greedy per-slot walk
  // kept reaching for her own library because the market it happened to want next had no unused
  // main pick left, which left reusable renders on the table — the opposite of the point.
  const mainForHer = mainPicks.filter((s) => inMarket(s, ["San Antonio", "Austin"]) && shared(s) && !hers(s))
  const fixedHer = ["AM", "PM"].map((w) => resolve(FIXED[`Lisette:0:${w}`])!).filter(Boolean)
  const quota: Record<string, number> = { "San Antonio": 7, Austin: 7 }
  for (const s of fixedHer) { quota[s.market!] -= 1; usedProp.Lisette.add(propOf(s)) }

  const herRest: { src: Src; sharedFrom?: string }[] = []
  const claim = (s: Src, from?: string) => {
    if (usedProp.Lisette.has(propOf(s)) || herRest.some((x) => propOf(x.src) === propOf(s))) return false
    if ((quota[s.market ?? ""] ?? 0) <= 0) return false
    quota[s.market!] -= 1
    herRest.push({ src: s, sharedFrom: from })
    return true
  }
  for (const s of mainForHer) claim(s, "Main")                       // reuse first, as much as fits
  for (const mk of ["San Antonio", "Austin"]) {                      // then her own library
    while ((quota[mk] ?? 0) > 0) {
      const cand = pool([mk], "lisette").find((s) => !usedProp.Lisette.has(propOf(s)) && !herRest.some((x) => propOf(x.src) === propOf(s)))
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
    const { day, when } = dayWhen(i)
    const key = `Lisette:${day}:${when}`
    if (FIXED[key]) {
      const s = resolve(FIXED[key])!
      take("Lisette", day, when, s, undefined, day === 0 && when === "AM" ? "her debut — publishes first on BOTH platforms" : undefined)
      continue
    }
    const next = ordered[cursor++]
    if (!next) throw new Error(`lisette: nothing left for day ${day} ${when}`)
    take("Lisette", day, when, next.src, next.sharedFrom)
  }

  if (slots.length !== 42) throw new Error(`expected 42 slots, built ${slots.length}`)
  return slots
}
