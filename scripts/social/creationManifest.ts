// CREATION MANIFEST for the uploaded videos that have no post. READ-ONLY — creates nothing.
//
// A BLANK IS NOT A BLOCKER. Price, special and highlights are optional on a draft and the editor
// renders them empty without complaint, so the earlier manifest's "24 need work" overstated the
// problem: 18 of those 24 were short only of highlights. What actually BLOCKS a draft is an
// identity question — no market to file it under, no unit type to describe it, or no place_id,
// which means no research and no shared property record to attach anything to later.
import { createClient } from "@supabase/supabase-js"
import { readFileSync } from "node:fs"
import { DEFAULT_OVERLAY_TEMPLATE, type OverlayTemplate } from "@/lib/social/composePost"

/** What a draft cannot be created without. Everything else is a blank the operator can fill. */
function blockers(c: Record<string, unknown>, hasResearch: boolean): string[] {
  const out: string[] = []
  if (!c.market) out.push("no market — nothing to file it under")
  if (!c.property_type) out.push("no Unit Type — the overlay and the CTA keyword both derive from it")
  if (!c.place_id) out.push("no place_id — no research, and nothing to attach observations to")
  else if (!hasResearch) out.push("place_id present but no research record")
  if (!c.storage_path) out.push("no media")
  return out
}

/** A starting template, chosen from what is actually known. Never random. */
function proposeTemplate(c: Record<string, unknown>, highlights: string[]): { t: OverlayTemplate; why: string } {
  const price = String(c.budget_range ?? "").trim()
  const special = String(c.special ?? "").trim()
  const type = String(c.property_type ?? "")
  if (special && highlights.length) return { t: "special_feature", why: "has both a special and a highlight — the one template that shows both" }
  if (price && special) return { t: "affordable_luxury", why: "a price and a concession together" }
  if (price) return { t: "what_mo_gets_you", why: "a verified price is its strongest card" }
  if (/Penthouse|Loft/.test(type)) return { t: "real_living", why: "a specialised Unit Type carries a lifestyle line" }
  if (/Townhome|Rental Home/.test(type)) return { t: "trade_up", why: "the apartment-to-home trade is this type's natural pitch" }
  if (highlights.length >= 3) return { t: "next_property", why: "three highlights and no price — show, don't quote" }
  return { t: DEFAULT_OVERLAY_TEMPLATE, why: "too little known to improve on the default" }
}

async function main() {
  const env = Object.fromEntries(readFileSync(".env.local", "utf8").split("\n").filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]))
  const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL as string, env.SUPABASE_SERVICE_ROLE_KEY as string)
  const { data: content } = await sb.from("social_content").select("*")
  const { data: posts } = await sb.from("social_posts").select("source_content_id")
  const { data: research } = await sb.from("social_property_research").select("place_id, stable, pricing")
  const { data: obs } = await sb.from("social_property_observations").select("social_content_id, field")

  const hasPost = new Set((posts ?? []).map((p) => p.source_content_id as string))
  const R = new Map((research ?? []).map((r) => [r.place_id as string, r]))
  const obsCount = new Map<string, number>()
  for (const o of obs ?? []) obsCount.set(o.social_content_id as string, (obsCount.get(o.social_content_id as string) ?? 0) + 1)

  const rows = (content ?? []).filter((c) => !hasPost.has(c.id as string)).map((c) => {
    const r = c.place_id ? R.get(c.place_id as string) : null
    const highlights = String(c.amenities ?? "").split("\n").map((s) => s.trim()).filter(Boolean)
    const b = blockers(c, !!r)
    const tmpl = proposeTemplate(c, highlights)
    const stable = (r?.stable ?? {}) as Record<string, unknown>
    const verifiedPrices = Object.values((r?.pricing as { startingPrices?: Record<string, { status?: string }> })?.startingPrices ?? {})
      .filter((v) => v?.status === "verified_current").length
    return {
      market: String(c.market ?? "—"), name: String(c.property_name ?? "—"),
      unitType: String(c.property_type ?? "—"),
      buildingType: String(stable.buildingType ?? ""),
      area: String(c.area_neighborhood ?? ""), district: String(c.district ?? ""),
      highlights: highlights.length, price: String(c.budget_range ?? ""), special: String(c.special ?? ""),
      research: r ? "yes" : "no", verifiedPrices, obs: obsCount.get(c.id as string) ?? 0,
      tmpl: tmpl.t, tmplWhy: tmpl.why, blockers: b, ready: b.length === 0,
    }
  })

  const ready = rows.filter((r) => r.ready), blocked = rows.filter((r) => !r.ready)
  console.log(`VIDEOS WITHOUT A POST: ${rows.length}`)
  console.log(`  CAN BE CREATED NOW: ${ready.length}`)
  console.log(`  BLOCKED:            ${blocked.length}\n`)
  const byMarket: Record<string, { n: number; ready: number }> = {}
  for (const r of rows) { byMarket[r.market] ??= { n: 0, ready: 0 }; byMarket[r.market].n++; if (r.ready) byMarket[r.market].ready++ }
  for (const [m, v] of Object.entries(byMarket).sort((a, b) => b[1].n - a[1].n)) console.log(`  ${m.padEnd(14)} ${String(v.n).padStart(2)} videos · ${v.ready} ready`)

  console.log(`\n── BLOCKED (${blocked.length}) ──`)
  for (const r of blocked) console.log(`  ${r.name.padEnd(36).slice(0, 36)} │ ${r.market.padEnd(12)} │ ${r.blockers.join("; ")}`)

  console.log(`\n── READY, by proposed starting template ──`)
  const byT: Record<string, typeof ready> = {}
  for (const r of ready) (byT[r.tmpl] ??= []).push(r)
  for (const [t, list] of Object.entries(byT).sort((a, b) => b[1].length - a[1].length)) {
    console.log(`\n  ${t} — ${list.length}   (${list[0].tmplWhy})`)
    for (const r of list) {
      const blanks = [r.highlights < 3 ? `highlights ${r.highlights}/3` : "", !r.price ? "no price" : "", !r.special ? "no special" : ""].filter(Boolean)
      console.log(`    ${r.name.padEnd(36).slice(0, 36)} │ ${r.market.padEnd(12)} │ ${r.unitType.padEnd(22)} │ ${(r.buildingType || "—").padEnd(21)} │ ${r.area.padEnd(26).slice(0, 26)} │ ${blanks.join(", ") || "complete"}`)
    }
  }
}
void main().catch((e) => { console.error(e); process.exit(1) })
