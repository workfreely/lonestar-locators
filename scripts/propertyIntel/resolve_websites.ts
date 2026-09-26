// Website-source resolver: for active properties MISSING website_url but WITH a Google place_id,
// fetch the official websiteUri via Google Places Details (New) and persist it through the safe
// enrichProperty writer (source google_places, verified) so the property becomes image-recovery-ready.
// Only a confidently valid http(s) URL is written; otherwise the property stays missing_website
// (manual review). Read-only unless --confirm. Run: npx tsx scripts/propertyIntel/resolve_websites.ts [--confirm]
import fs from "node:fs"; import path from "node:path"
;(() => { const p = path.join(process.cwd(), ".env.local"); for (const l of fs.readFileSync(p, "utf8").split("\n")) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "") } })()
const CONFIRM = process.argv.includes("--confirm")
const FIELD_MASK = "id,websiteUri,businessStatus" // websiteUri = Places Details (New) contact-data field
const PER_CALL_USD = 0.017

function validSite(u: string | undefined): string | null {
  if (!u) return null
  try { const x = new URL(u); if (x.protocol !== "http:" && x.protocol !== "https:") return null
    // reject obvious aggregators/social as an "official" site
    if (/facebook\.com|instagram\.com|yelp\.com|apartments\.com|google\.com|zillow\.com|apartmentguide/i.test(x.host)) return null
    return x.href } catch { return null }
}

async function main() {
  const { supabaseAdmin } = await import("@/lib/supabase/admin")
  const { enrichProperty } = await import("@/lib/propertyEnrichment/writer")
  const { SupabaseEnrichmentStore } = await import("@/lib/propertyEnrichment/stores/supabaseStore")
  const store = new SupabaseEnrichmentStore()
  const key = process.env.GOOGLE_PLACES_API_KEY!
  const { data } = await supabaseAdmin.from("property_catalog").select("place_id, property_name").or("website_url.is.null,website_url.eq.").not("place_id", "is", null).order("place_id")
  const rows = (data ?? []) as { place_id: string; property_name: string | null }[]
  console.log(`Missing-website w/ place_id: ${rows.length} · mode ${CONFIRM ? "CONFIRM" : "DRY"} · est ≤ $${(rows.length * PER_CALL_USD).toFixed(2)} (free tier applies)`)
  const now = () => new Date().toISOString()
  let resolved = 0, written = 0, closed = 0, noSite = 0, aggregator = 0
  const report: Record<string, unknown>[] = []
  for (const r of rows) {
    let d: { websiteUri?: string; businessStatus?: string } | null = null
    try { const resp = await fetch(`https://places.googleapis.com/v1/places/${r.place_id}`, { headers: { "X-Goog-Api-Key": key, "X-Goog-FieldMask": FIELD_MASK } }); if (resp.ok) d = await resp.json() } catch { /**/ }
    const site = validSite(d?.websiteUri)
    const rawHadSite = !!d?.websiteUri
    if (d?.businessStatus && d.businessStatus !== "OPERATIONAL") closed++
    if (!site) { if (rawHadSite) aggregator++; else noSite++; report.push({ place_id: r.place_id, name: r.property_name, outcome: rawHadSite ? "rejected_aggregator_or_invalid" : "no_website_on_google", raw: d?.websiteUri ?? null }); continue }
    resolved++
    if (CONFIRM) {
      const res = await enrichProperty(store, { placeId: r.place_id, jobId: "website_resolver", fields: [
        { field: "website_url", value: site, sourceType: "google_places", sourceReference: r.place_id, verificationStatus: "verified", checkedAt: now() },
      ] })
      if (res.results.find((x) => x.field === "website_url")?.outcome === "written") written++
    }
    report.push({ place_id: r.place_id, name: r.property_name, outcome: "resolved", website: site })
  }
  fs.writeFileSync("/private/tmp/claude-501/-Users-jaymorris-Desktop-lonestar-locators-app/30160563-4dba-40ec-bd16-aeca0a940f8b/scratchpad/website_resolve_report.json", JSON.stringify(report, null, 1))
  console.log(JSON.stringify({ attempted: rows.length, resolved, written, rejected_aggregator: aggregator, no_website_on_google: noSite, non_operational: closed, est_cost_usd: Number((rows.length * PER_CALL_USD).toFixed(2)) }, null, 1))
}
main().catch((e) => { console.error(e); process.exit(1) })
