// VARIED TEMPLATE PROPOSALS — read-only. Every headline and detail line below is produced by the
// real generator, and every one is checked for two things it must never do: surface a concession
// the research cannot support, or state a price the operator did not enter.
import { createClient } from "@supabase/supabase-js"
import { readFileSync } from "node:fs"
import { buildTemplateHeadline, buildTemplateDetail, isGeneratedCaption, type SourceMeta, type OverlayTemplate } from "@/lib/social/composePost"

import { familyFor, pickTemplate } from "@/lib/social/templateFamilies"

async function main() {
  const env = Object.fromEntries(readFileSync(".env.local", "utf8").split("\n").filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]))
  const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL as string, env.SUPABASE_SERVICE_ROLE_KEY as string)
  const { data: posts } = await sb.from("social_posts").select("id, source_content_id, social_special, caption, overlay_headline, overlay_subheadline")
    .eq("status", "draft").eq("overlay_template", "market_type")
  const { data: content } = await sb.from("social_content").select("*")
  const C = new Map((content ?? []).map((c) => [c.id as string, c]))

  type P = { name: string; market: string; type: string; tpl: OverlayTemplate; headNow: string; headNew: string; detNow: string; detNew: string; capOwned: boolean }
  const proposals: P[] = []
  const held: string[] = []
  let priceLeak = 0, specialLeak = 0

  for (const p of posts ?? []) {
    const c = C.get(p.source_content_id as string)!
    const meta: SourceMeta = {
      market: c.market, propertyType: c.property_type, special: c.special,
      socialSpecial: p.social_special ?? null, budgetRange: c.budget_range,
      priceLabelMode: c.price_label_mode, amenities: c.amenities,
    }
    // A draft whose special is on the video stays put: changing its template regenerates the
    // caption, and the operator has frozen captions.
    if (String(c.special ?? "").trim()) { held.push(`${c.property_name} — carries a special; template change would regenerate its caption`); continue }
    const fam = familyFor(c.property_type as string | null)
    if (!fam) { held.push(`${c.property_name} — no template family for Unit Type ${JSON.stringify(c.property_type)}`); continue }
    const tpl = pickTemplate(c.id as string, fam)
    const headNew = buildTemplateHeadline(tpl, meta), detNew = buildTemplateDetail(tpl, meta)

    // LEAK CHECKS. A price may appear only if the operator entered one; a concession never.
    if (/\$/.test(detNew + headNew) && !String(c.budget_range ?? "").trim()) { priceLeak++; held.push(`${c.property_name} — ${tpl} would state a price the video does not have`); continue }
    if (/free|weeks?\b.*free|special/i.test(detNew)) { specialLeak++; held.push(`${c.property_name} — ${tpl} would surface a concession`); continue }

    proposals.push({ name: String(c.property_name), market: String(c.market), type: String(c.property_type),
      tpl, headNow: buildTemplateHeadline("market_type", meta), headNew, detNow: String(p.overlay_subheadline ?? ""), detNew,
      capOwned: isGeneratedCaption(String(p.caption ?? ""), meta, c.id as string) })
  }

  console.log(`market_type drafts: ${posts!.length} · proposed: ${proposals.length} · held: ${held.length}`)
  console.log(`leak checks — price stated without one entered: ${priceLeak} · concession surfaced: ${specialLeak}\n`)
  const spread: Record<string, number> = {}
  for (const p of proposals) spread[p.tpl] = (spread[p.tpl] ?? 0) + 1
  console.log("SPREAD:"); for (const [k, v] of Object.entries(spread).sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(3)}  ${k}`)
  console.log(`\ndistinct headlines: ${new Set(proposals.map((p) => p.headNew)).size} across ${proposals.length} drafts`)
  console.log(`captions that would need protecting (generator-owned): ${proposals.filter((p) => p.capOwned).length}/${proposals.length}`)

  console.log(`\nHELD (${held.length}):`); for (const h of held) console.log(`  · ${h}`)
  console.log(`\nREPRESENTATIVE BEFORE → AFTER (one per template):`)
  const seen = new Set<string>()
  for (const p of proposals) {
    if (seen.has(p.tpl)) continue
    seen.add(p.tpl)
    console.log(`\n  ${p.name}  [${p.market} · ${p.type}]   market_type → ${p.tpl}`)
    console.log(`    headline  ${JSON.stringify(p.headNow)}`)
    console.log(`           →  ${JSON.stringify(p.headNew)}`)
    console.log(`    detail    ${JSON.stringify(p.detNow)} → ${JSON.stringify(p.detNew)}`)
  }
}
void main().catch((e) => { console.error(e); process.exit(1) })
