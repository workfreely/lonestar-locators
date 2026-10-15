// TEMPLATE AUDIT across every draft still on the default market_type. READ-ONLY.
//
// Headlines and detail lines are produced by the REAL generator, so each row is what the editor
// would actually show. Recommendations follow the metadata, never a rotation: a template is only
// proposed when the draft HAS what that template needs.
import { createClient } from "@supabase/supabase-js"
import { readFileSync } from "node:fs"
import { buildTemplateHeadline, buildTemplateDetail, buildCaption, isGeneratedCaption, type SourceMeta, type OverlayTemplate } from "@/lib/social/composePost"

type Row = {
  market: string; name: string; unitType: string; buildingType: string
  price: string; special: string; specialVerified: boolean; highlights: string[]
  now: string; rec: OverlayTemplate | "KEEP"; why: string
  headNow: string; headRec: string; detailNow: string; detailRec: string
  posts: number
  /** TRUE when the stored caption still matches the generator. The editor's changeTemplate
   *  regenerates the caption only when this is true, so for these drafts a template change is NOT
   *  caption-neutral — it rewrites the caption from the new template. */
  captionOwned: boolean
  captionWouldBecome: string
  captionNow: string
}

const DISTINCTIVE = new Set(["Infinity Pool", "Rooftop Pool", "Floor-to-Ceiling Windows", "Private Yards",
  "Skyline Views", "Downtown Views", "Lake Views", "Sky Lounge", "Exposed Concrete Ceilings", "Roof Deck",
  "Indoor Pool", "Private Terraces", "Putting Green"])

/** Pick a template from what this draft actually has. Never surfaces an unverified concession. */
function recommend(r: Omit<Row, "rec" | "why" | "headRec" | "detailRec">): { t: OverlayTemplate | "KEEP"; why: string } {
  const t = r.unitType, price = r.price.trim(), hasDistinctive = r.highlights.some((h) => DISTINCTIVE.has(h))

  // A concession that research cannot currently support must not be promoted into the overlay.
  if (r.special && !r.specialVerified) {
    return { t: "KEEP", why: "its special is not verified current — fix the caption first; a template change regenerates it" }
  }
  // Specialised unit types carry a lifestyle line better than a city label.
  if (/Penthouse/.test(t)) return { t: "wanted_luxury", why: "a penthouse video; aspiration beats a city label" }
  if (/Loft/.test(t)) return { t: "real_living", why: "a loft is a lifestyle, not a category" }
  if (/High-Rise/.test(t)) return price
    ? { t: "what_mo_gets_you", why: "a high-rise with a price — the number is the hook" }
    : { t: "real_living", why: "a high-rise with no price to quote" }
  if (/Townhome|Rental Home/.test(t)) return { t: "trade_up", why: "the apartment-to-home trade is this type's natural pitch" }
  if (/Studio/.test(t)) return { t: "next_property", why: "a studio sells on fit, not grandeur" }
  // Apartments: differentiate on what the draft actually has.
  if (price && hasDistinctive) return { t: "what_mo_gets_you", why: "a price AND a distinctive feature to justify it" }
  if (price) return { t: "pov_price", why: "a price, but nothing distinctive to show beside it" }
  if (hasDistinctive) return { t: "upgrade", why: `a distinctive feature (${r.highlights.find((h) => DISTINCTIVE.has(h))}) and no price` }
  if (r.highlights.length >= 3) return { t: "next_property", why: "three highlights, none distinctive — show, don't claim" }
  return { t: "KEEP", why: "nothing here that another template could use" }
}

async function main() {
  const env = Object.fromEntries(readFileSync(".env.local", "utf8").split("\n").filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]))
  const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL as string, env.SUPABASE_SERVICE_ROLE_KEY as string)
  const { data: posts } = await sb.from("social_posts").select("id, source_content_id, overlay_template, social_special, status").eq("status", "draft")
  const { data: content } = await sb.from("social_content").select("*")
  const { data: research } = await sb.from("social_property_research").select("place_id, stable, pricing")
  const C = new Map((content ?? []).map((c) => [c.id as string, c]))
  const R = new Map((research ?? []).map((r) => [r.place_id as string, r]))
  const postCount = new Map<string, number>()
  for (const p of posts ?? []) postCount.set(p.source_content_id as string, (postCount.get(p.source_content_id as string) ?? 0) + 1)

  const rows: Row[] = []
  for (const p of (posts ?? []).filter((x) => x.overlay_template === "market_type")) {
    const c = C.get(p.source_content_id as string)!
    const r = c.place_id ? R.get(c.place_id as string) : null
    const specials = ((r?.pricing as { specials?: { status?: string; value?: string }[] })?.specials ?? [])
    const special = String(c.special ?? "").trim()
    const verified = !!special && specials.some((s) => s.status === "verified_current" &&
      String(s.value ?? "").toLowerCase().includes(special.toLowerCase().replace(/!$/, "").split(" ")[0]))
    const meta: SourceMeta = {
      market: c.market, propertyType: c.property_type, special: c.special,
      socialSpecial: p.social_special ?? null, budgetRange: c.budget_range,
      priceLabelMode: c.price_label_mode, amenities: c.amenities,
    }
    const base = {
      market: String(c.market ?? ""), name: String(c.property_name ?? ""),
      unitType: String(c.property_type ?? ""), buildingType: String((r?.stable as Record<string, unknown>)?.buildingType ?? ""),
      price: String(c.budget_range ?? ""), special, specialVerified: verified,
      highlights: String(c.amenities ?? "").split("\n").map((s) => s.trim()).filter(Boolean),
      now: "market_type", headNow: buildTemplateHeadline("market_type", meta), detailNow: buildTemplateDetail("market_type", meta),
      posts: postCount.get(c.id as string) ?? 1,
      captionOwned: isGeneratedCaption(String(p.caption ?? ""), meta, c.id as string),
      captionWouldBecome: "", captionNow: String(p.caption ?? ""),
    }
    const { t, why } = recommend(base)
    rows.push({ ...base, rec: t, why,
      headRec: t === "KEEP" ? "—" : buildTemplateHeadline(t, meta),
      detailRec: t === "KEEP" ? "—" : buildTemplateDetail(t, meta),
      captionWouldBecome: t === "KEEP" ? "" : buildCaption(meta, c.id as string, t) })
  }

  const changes = rows.filter((r) => r.rec !== "KEEP")
  // THE INTERACTION THAT MATTERS. Captions are frozen, and changeTemplate regenerates the caption
  // whenever the stored one still matches the generator. So for a generator-owned caption a
  // template change is NOT caption-neutral.
  const owned = changes.filter((r) => r.captionOwned)
  const safe = changes.filter((r) => !r.captionOwned)
  console.log(`CAPTION IMPACT OF THE PROPOSED TEMPLATE CHANGES`)
  console.log(`  caption-neutral (stored caption is manual, changeTemplate leaves it): ${safe.length}`)
  console.log(`  WOULD REWRITE THE CAPTION (stored caption is generator-owned):        ${owned.length}`)
  // WHAT exactly moves. The amenity block, the service line and the CTA are template-independent;
  // only the opening hook is template-aware. Measured rather than assumed.
  let openerOnly = 0, deeper = 0
  const examples: string[] = []
  for (const r of owned) {
    const before = r.captionNow.split("\n"), after = r.captionWouldBecome.split("\n")
    const restSame = before.slice(1).join("\n") === after.slice(1).join("\n")
    if (restSame) openerOnly++; else deeper++
    if (examples.length < 4 && restSame && before[0] !== after[0]) examples.push(`    ${r.name.padEnd(30).slice(0,30)} ${JSON.stringify(before[0])} → ${JSON.stringify(after[0])}`)
  }
  console.log(`  of those, ONLY the opening line differs:        ${openerOnly}`)
  console.log(`  of those, something below line 1 also differs:  ${deeper}`)
  console.log(`  carrying a special into the new caption:        ${owned.filter((r) => /✨/.test(r.captionWouldBecome)).length}`)
  console.log(`  CTA preserved in every case:                   ${owned.every((r) => r.captionNow.split("\n").slice(-1)[0] === r.captionWouldBecome.split("\n").slice(-1)[0]) ? "yes" : "NO"}`)
  for (const e of examples) console.log(e)
  console.log()
  console.log(`market_type drafts: ${rows.length} · recommend a change: ${changes.length} · keep: ${rows.length - changes.length}\n`)
  const spread: Record<string, number> = {}
  for (const r of rows) spread[r.rec === "KEEP" ? "market_type (kept)" : r.rec] = (spread[r.rec === "KEEP" ? "market_type (kept)" : r.rec] ?? 0) + 1
  console.log("RESULTING SPREAD:")
  for (const [k, v] of Object.entries(spread).sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(3)}  ${k}`)

  console.log(`\nKEPT, and why (${rows.length - changes.length}):`)
  for (const r of rows.filter((x) => x.rec === "KEEP")) console.log(`  ${r.name.padEnd(34).slice(0, 34)} │ ${r.why}`)

  for (const [t, list] of Object.entries(changes.reduce<Record<string, Row[]>>((a, r) => ({ ...a, [r.rec as string]: [...(a[r.rec as string] ?? []), r] }), {}))
    .sort((a, b) => b[1].length - a[1].length)) {
    console.log(`\n${"═".repeat(96)}\n${t.toUpperCase()} — ${list.length}   (${list[0].why})`)
    console.log(`  headline: ${JSON.stringify(list[0].headNow)} → ${JSON.stringify(list[0].headRec)}`)
    for (const r of list.slice(0, 50)) {
      console.log(`  ${r.name.padEnd(32).slice(0, 32)} │ ${r.market.padEnd(12)} │ ${r.unitType.padEnd(22)} │ → ${JSON.stringify(r.headRec).padEnd(52).slice(0, 52)} │ ${JSON.stringify(r.detailRec)}`)
    }
  }
}
void main().catch((e) => { console.error(e); process.exit(1) })
