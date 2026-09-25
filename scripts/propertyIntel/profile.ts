// Assemble the ACTUAL resulting Property Intelligence per property (catalog + attributes
// + approval + specials + keywords + provenance) for the canary report.
// Run: npx tsx scripts/propertyIntel/profile.ts [placeId ...]  (defaults to canary_run.json chosen)
import fs from "node:fs"
import path from "node:path"
;(() => {
  const p = path.join(process.cwd(), ".env.local")
  for (const line of fs.readFileSync(p, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "")
  }
})()
const S = "/private/tmp/claude-501/-Users-jaymorris-Desktop-lonestar-locators-app/30160563-4dba-40ec-bd16-aeca0a940f8b/scratchpad"

async function main() {
  const { supabaseAdmin } = await import("@/lib/supabase/admin")
  let ids = process.argv.slice(2).filter((a) => !a.startsWith("--"))
  if (!ids.length && fs.existsSync(`${S}/canary_run.json`)) ids = JSON.parse(fs.readFileSync(`${S}/canary_run.json`, "utf8")).chosen
  const profiles: Record<string, unknown>[] = []
  for (const placeId of ids) {
    const c = (await supabaseAdmin.from("property_catalog").select("*").eq("place_id", placeId).maybeSingle()).data as Record<string, unknown> | null
    if (!c) continue
    const attrs = (await supabaseAdmin.from("property_attributes").select("attribute_key,value,value_text,applicability,source_type,verification_status").eq("place_id", placeId).eq("value", "yes")).data ?? []
    const appr = (await supabaseAdmin.from("property_approval_policy").select("*").eq("place_id", placeId).maybeSingle()).data as Record<string, unknown> | null
    const spec = (await supabaseAdmin.from("property_specials").select("*").eq("place_id", placeId).maybeSingle()).data as Record<string, unknown> | null
    const prov = (await supabaseAdmin.from("property_field_provenance").select("field_name,source_type,verification_status").eq("place_id", placeId)).data ?? []
    const feat = attrs.map((a) => `${a.attribute_key}${a.applicability && a.applicability !== "property_wide" ? ` (${a.applicability})` : ""}`)
    const apprSummary = appr ? Object.fromEntries(Object.entries(appr).filter(([k, v]) => v != null && !["place_id", "updated_at"].includes(k))) : null
    profiles.push({
      placeId,
      name: c.property_name, market: c.market, city: c.city,
      building_style: c.structural_scale, grade: c.property_grade, inventory_type: c.inventory_type,
      stories: c.stories, year_built: c.year_built, penthouse_available: c.penthouse_available,
      dwelling_attachment: c.dwelling_attachment, townhome_overlap: c.townhome_overlap,
      google_rating: c.google_rating, google_reviews: c.google_review_count, website: c.website_url, phone: c.phone,
      management_company: c.management_company, submarket: c.submarket,
      amenity_keywords: c.amenity_keywords, location_keywords: c.location_keywords,
      features: feat,
      approval: apprSummary,
      current_special: spec?.raw_special_text ?? c.current_special,
      special_verified: spec?.special_last_verified,
      provenance_fields: prov.length,
      provenance_sources: [...new Set(prov.map((p) => p.source_type))],
    })
  }
  fs.writeFileSync(`${S}/canary_profiles.json`, JSON.stringify(profiles, null, 1))
  console.log(`wrote ${profiles.length} profiles`)
  // print a few in readable form
  for (const p of profiles.slice(0, 8)) console.log("\n" + JSON.stringify(p, null, 1))
}
main().catch((e) => { console.error(e); process.exit(1) })
