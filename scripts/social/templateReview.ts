// TEMPLATE REVIEW for the drafts still on the default market_type. READ-ONLY — recommends only.
//
// Headlines are produced by the REAL generator (composePost), not written out by hand, so the
// "proposed headline" column is what the editor would actually show if the template were changed.
import { createClient } from "@supabase/supabase-js"
import { readFileSync } from "node:fs"
import { buildTemplateHeadline, buildTemplateDetail, type OverlayTemplate } from "@/lib/social/composePost"

// One proposal per draft, keyed by property + unit type so the two videos of a property can differ.
const PROPOSALS: Record<string, { tmpl: OverlayTemplate | "KEEP"; why: string }> = {
  "Atelier Dallas Apartments|High-Rise":        { tmpl: "real_living", why: "41 storeys with floor-to-ceiling windows and a rooftop pool — a lifestyle claim it can actually back" },
  "Atelier Dallas Apartments|Penthouse":        { tmpl: "wanted_luxury", why: "deliberately different from its sibling video so the two don't read as duplicates" },
  "Dallas Power and Light Flats|Split-Level Loft": { tmpl: "what_mo_gets_you", why: "$3,850 plus rooftop pool, downtown views and concrete floors — it has a number AND something to show for it" },
  "Expo Park | Lofts|Split-Level Loft":         { tmpl: "hits_different", why: "a split-level loft in a converted district is the definition of this template" },
  "Hanover Preston Hollow|Penthouse":           { tmpl: "property_tour", why: "38 plans and no price; a tour frames it without claiming a number" },
  "Kessler Bluffs|Townhome":                    { tmpl: "KEEP", why: "on hold — no research record, only two highlights" },
  "Maple Terrace Residences|Penthouse":         { tmpl: "would_you_live_here", why: "a 1931 landmark tower is a question worth asking rather than a stat to recite" },
  "Merrick On Midway|Apartment":                { tmpl: "apartment_standards", why: "a five-storey mid-rise whose rooftop deck and in-unit laundry ARE the standards argument" },
  "Moda|Apartment":                             { tmpl: "upgrade", why: "Victory Park mid-rise with kitchen islands — an upgrade story, not a city label" },
  "Mondrian West Village|Split-Level Penthouse": { tmpl: "pov_upgrade", why: "a two-level penthouse in a 20-storey tower is the POV payoff" },
  "One Rangers Way|Penthouse":                  { tmpl: "wanted_luxury", why: "$4,800 beside Globe Life Field — the aspiration is the whole pitch" },
  "Oxenfree Stonebriar|Townhome":               { tmpl: "trade_up", why: "a townhome community with private yards and attached garages — the literal apartment-to-townhome trade" },
  "Remi Apartments|Apartment":                  { tmpl: "what_mo_gets_you", why: "$2,600 with Katy Trail access; the number carries it" },
  "The 23|Apartment":                           { tmpl: "pov_price", why: "$2,500 with downtown views in Victory Park" },
  "The Christopher|Penthouse":                  { tmpl: "real_living", why: "31 storeys in The Union; only two highlights, so the template should not depend on a third" },
  "The Willow|Split-Level Loft":                { tmpl: "special_feature", why: "the only default-template draft with BOTH a special (8 weeks free) and exposed concrete — the one template that uses both" },
  "CO/OP Heights|Apartment":                    { tmpl: "next_property", why: "a four-storey Heights building; a plain, friendly frame suits it" },
  "East End Lofts|Loft":                        { tmpl: "KEEP", why: "on hold — no place_id, so no research to draw on" },
  "Eighteen25 Downtown|Apartment":              { tmpl: "pov_upgrade", why: "rooftop pool and sky lounge two blocks from the Red Line" },
  "Enclave at Mason Creek|Townhome":            { tmpl: "KEEP", why: "its copy was just corrected Dallas-to-Houston; changing the template in the same breath would re-open what we just settled" },
  "Modera Waugh|Apartment":                     { tmpl: "real_living", why: "17 storeys with a rooftop deck over Buffalo Bayou — a lifestyle template earns its keep here" },
  "Allora Kinder Ranch|Apartment":              { tmpl: "affordable_luxury", why: "$1,270 with detached garages and private yards — the clearest affordable-luxury case in the set" },
  "Birdsong Apartments at Leon Springs|Townhome": { tmpl: "trade_up", why: "two-storey cottages and townhomes with yards" },
  "Collection at Boerne|Townhome":              { tmpl: "hits_different", why: "duplex-style build-to-rent in the Hill Country is genuinely unusual" },
  "Freestone Ladera|Apartment#1":               { tmpl: "trade_up", why: "fenced private yards on an apartment community. NOTE the generator degrades this to \"when you upgrade your apartment\" because the Unit Type is Apartment — the townhome wording only appears for a townhome Unit Type" },
  "Freestone Ladera|Apartment#2":               { tmpl: "next_property", why: "the second video of the same property deliberately takes a different frame" },
  "Infinity at the Rim|Townhome":               { tmpl: "special_feature", why: "DEPENDS ON A REORDER. T4's detail line takes the FIRST selected highlight, and this draft's order is High Ceilings / Private Yards / Infinity Pool — so it would read \"High Ceilings\", not the infinity pool. Worth doing only if Infinity Pool is moved to first, which is a manual selection and therefore yours to change" },
  "The Tobin Estate|Apartment":                 { tmpl: "what_mo_gets_you", why: "$2,000 with 6 weeks free and attached garages" },
  "Tin Top Flats at the Creamery|Townhome":     { tmpl: "real_living", why: "the restored Borden Dairy plant; floor-to-ceiling windows and high ceilings carry it" },
  "Iron Rock Ranch|Townhome":                   { tmpl: "pov_price", why: "$1,750 with 6 weeks free — Austin's only draft, and price is its strongest card" },
}

async function main() {
  const env = Object.fromEntries(readFileSync(".env.local", "utf8").split("\n").filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]))
  const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL as string, env.SUPABASE_SERVICE_ROLE_KEY as string)
  const { data: posts } = await sb.from("social_posts")
    .select("id, source_content_id, overlay_template, overlay_headline, overlay_subheadline")
    .eq("status", "draft").eq("overlay_template", "market_type")
  const { data: content } = await sb.from("social_content").select("*")
  const C = new Map((content ?? []).map((c) => [c.id as string, c]))

  const seen = new Map<string, number>()
  const rows: string[] = []
  const counts: Record<string, number> = {}
  for (const p of posts ?? []) {
    const c = C.get(p.source_content_id as string)!
    let key = `${c.property_name}|${c.property_type}`
    if (PROPOSALS[`${key}#1`]) { const n = (seen.get(key) ?? 0) + 1; seen.set(key, n); key = `${key}#${n}` }
    const prop = PROPOSALS[key]
    if (!prop) { rows.push(`?? no proposal for ${key}`); continue }
    const keep = prop.tmpl === "KEEP"
    const meta = {
      market: c.market, propertyType: c.property_type, special: c.special,
      budgetRange: c.budget_range, priceLabelMode: c.price_label_mode, amenities: c.amenities,
    }
    const out = keep ? null : {
      overlayHeadline: buildTemplateHeadline(prop.tmpl as OverlayTemplate, meta as never),
      overlaySubheadline: buildTemplateDetail(prop.tmpl as OverlayTemplate, meta as never),
    }
    counts[keep ? "market_type (kept)" : (prop.tmpl as string)] = (counts[keep ? "market_type (kept)" : (prop.tmpl as string)] ?? 0) + 1
    rows.push([
      c.market, c.property_name, String(c.property_type ?? ""),
      "market_type", keep ? "KEEP" : String(prop.tmpl),
      JSON.stringify(p.overlay_headline ?? ""),
      keep ? "—" : JSON.stringify(out!.overlayHeadline),
      keep ? "—" : JSON.stringify(out!.overlaySubheadline),
      prop.why,
    ].join("\t"))
  }
  for (const r of rows.sort()) console.log(r)
  console.log("\nRESULTING SPREAD:")
  for (const [k, v] of Object.entries(counts).sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(2)}  ${k}`)
}
void main().catch((e) => { console.error(e); process.exit(1) })
