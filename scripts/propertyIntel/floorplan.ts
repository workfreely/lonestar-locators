// Floorplan-page extraction CANARY (5–10 of the 20 canary properties). Identifies
// individual floorplans and captures ONLY stated facts into property_floor_plans, with
// official source URL + checked date. No fabrication. Floorplan-specific facts live on
// the floorplan row (not promoted to property-wide). Run: npx tsx scripts/propertyIntel/floorplan.ts [--limit=8]
import fs from "node:fs"; import path from "node:path"
;(() => { const p = path.join(process.cwd(), ".env.local"); for (const line of fs.readFileSync(p, "utf8").split("\n")) { const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "") } })()
const S = "/private/tmp/claude-501/-Users-jaymorris-Desktop-lonestar-locators-app/30160563-4dba-40ec-bd16-aeca0a940f8b/scratchpad"
const LIMIT = Number((process.argv.find((a) => a.startsWith("--limit="))?.split("=")[1]) ?? 8)
const cost = { claudeCalls: 0, webFetches: 0, inTok: 0, outTok: 0 }

async function fetchText(url: string): Promise<string> {
  try { cost.webFetches++; const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 15000)
    const r = await fetch(url, { signal: ctrl.signal, headers: { "User-Agent": "Mozilla/5.0 LocatorBeastBot" } }); clearTimeout(t)
    if (!r.ok) return ""; const h = await r.text()
    return h.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 14000)
  } catch { return "" }
}

async function main() {
  const { supabaseAdmin } = await import("@/lib/supabase/admin")
  const { insertFloorPlan } = await import("@/lib/propertyIntel/wideWriter")
  const Anthropic = (await import("@anthropic-ai/sdk")).default
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const now = new Date().toISOString()
  const chosen: string[] = JSON.parse(fs.readFileSync(`${S}/canary_run.json`, "utf8")).chosen

  const { data: rows } = await supabaseAdmin.from("property_catalog")
    .select("place_id, property_name, website_url, floor_plans_url").in("place_id", chosen)
  const withSite = (rows ?? []).filter((r) => r.website_url).slice(0, LIMIT)
  console.log(`floorplan canary on ${withSite.length} properties`)
  const summary: Record<string, unknown>[] = []

  for (const p of withSite) {
    const base = p.website_url as string
    let text = ""
    for (const u of [p.floor_plans_url as string, new URL("/floorplans", base).toString(), new URL("/floor-plans", base).toString()].filter(Boolean)) {
      const t = await fetchText(u); if (t && t.length > 400) { text = t; break }
    }
    if (!text) { summary.push({ name: p.property_name, floorplans: 0, note: "no floorplan page text" }); continue }
    const SYSTEM = `Extract INDIVIDUAL floor plans from official floor-plan page text. Return RAW JSON array only.
Each: {"name","beds"(number|null),"baths"(number|null),"sqft_min"(int|null),"sqft_max"(int|null),"starting_rent"(int|null),"is_penthouse"(bool),"is_townhome"(bool),"is_loft"(bool),"is_split_level"(bool),"private_yard"(bool|null),"attached_garage"(bool|null),"balcony_patio"(bool|null),"ceiling_height_ft"(string|null ONLY if explicitly stated),"furnished"(bool|null ONLY if explicitly stated)}.
Include ONLY floor plans and facts actually present in the text. Use null when not stated. Do NOT fabricate. Max 25 floor plans.`
    let plans: Record<string, unknown>[] = []
    try {
      cost.claudeCalls++
      const msg = await client.messages.create({ model: "claude-opus-4-8", max_tokens: 3500, system: SYSTEM, messages: [{ role: "user", content: `Property: ${p.property_name}. Floor-plan page text:\n${text}` }] })
      cost.inTok += msg.usage?.input_tokens ?? 0; cost.outTok += msg.usage?.output_tokens ?? 0
      const b = msg.content.find((x: { type: string }) => x.type === "text") as { text: string } | undefined
      const raw = (b?.text ?? "[]").replace(/```json/g, "").replace(/```/g, "").trim()
      plans = JSON.parse(raw)
      if (!Array.isArray(plans)) plans = []
    } catch (e) { summary.push({ name: p.property_name, floorplans: 0, note: "extract failed: " + (e as Error).message }); continue }

    let wrote = 0
    for (const fp of plans.slice(0, 25)) {
      if (!fp.name) continue
      const ok = await insertFloorPlan(p.place_id as string, {
        name: String(fp.name).slice(0, 120),
        beds: fp.beds ?? null, baths: fp.baths ?? null, sqft_min: fp.sqft_min ?? null, sqft_max: fp.sqft_max ?? null,
        starting_rent: fp.starting_rent ?? null,
        is_townhome: fp.is_townhome ?? null, is_split_level: fp.is_split_level ?? null,
        is_loft: fp.is_loft ?? null, is_penthouse: fp.is_penthouse ?? null,
        ceiling_height_ft: fp.ceiling_height_ft ?? null,
        source_type: "official_property_site", source_reference: base, verification_status: "verified", checked_at: now,
        raw: { private_yard: fp.private_yard ?? null, attached_garage: fp.attached_garage ?? null, balcony_patio: fp.balcony_patio ?? null, furnished: fp.furnished ?? null },
      })
      if (ok) wrote++
    }
    console.log(`  ✓ ${p.property_name}: ${wrote} floorplans`)
    summary.push({ name: p.property_name, floorplans: wrote, sample: plans.slice(0, 3).map((x) => x.name) })
  }
  fs.writeFileSync(`${S}/floorplan_run.json`, JSON.stringify({ summary, cost }, null, 1))
  console.log(JSON.stringify(cost, null, 1))
}
main().catch((e) => { console.error(e); process.exit(1) })
