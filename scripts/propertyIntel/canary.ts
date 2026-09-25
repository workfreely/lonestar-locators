// 20-property enrichment CANARY. Curated intelligence is already imported; this fills
// MISSING info and verifies via official/approved external sources (official site +
// floorplans via Claude extraction, Google Places for identity/geo/rating) through the
// SAME safe writers (preserve-by-default, provenance). Then reports + idempotency dry-run.
// Run: npx tsx scripts/propertyIntel/canary.ts [--limit N]
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
const JOB = "canary_2026_09_25"
const LIMIT = Number((process.argv.find((a) => a.startsWith("--limit="))?.split("=")[1]) ?? 20)
const cost = { googleCalls: 0, claudeCalls: 0, webFetches: 0, claudeInTok: 0, claudeOutTok: 0 }

async function fetchText(url: string): Promise<string> {
  try {
    cost.webFetches++
    const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 15000)
    const r = await fetch(url, { signal: ctrl.signal, headers: { "User-Agent": "Mozilla/5.0 LocatorBeastBot" } })
    clearTimeout(t)
    if (!r.ok) return ""
    const html = await r.text()
    return html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim().slice(0, 12000)
  } catch { return "" }
}

async function googleResolve(name: string, address: string, market: string) {
  const key = process.env.GOOGLE_PLACES_API_KEY
  if (!key) return null
  cost.googleCalls++
  const body = JSON.stringify({ textQuery: `${name} ${address} ${market} TX`.trim(), maxResultCount: 1 })
  try {
    const r = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount,places.websiteUri,places.nationalPhoneNumber" },
      body,
    })
    if (!r.ok) return null
    const j = await r.json(); return j.places?.[0] ?? null
  } catch { return null }
}

async function claudeExtract(name: string, market: string, keys: string[], text: string) {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key || !text) return null
  const Anthropic = (await import("@anthropic-ai/sdk")).default
  const client = new Anthropic({ apiKey: key })
  const SYSTEM = `You extract STRUCTURED apartment features from official property website text. Return RAW JSON only, no markdown.
Only assert a feature if the text clearly supports it. If not stated, OMIT it (do not guess; unknown is fine).
Allowed feature keys (use these EXACT keys, omit any not supported): ${keys.join(", ")}.
For each feature give value ("yes"|"no") and applicability ("property_wide"|"select_units"|"specific_floor_plans"|"penthouses"). Use "select_units"/"specific_floor_plans" when the text says "select units"/"in select homes"/"in penthouses" etc — never a blanket property_wide unless it clearly applies to all.
Return at most 30 of the MOST clearly-supported features (skip weak/implied ones). Keep "evidence" under 8 words.
Also extract current_special (verbatim text if any) and up to 3 amenity keywords + 3 location/neighborhood keywords that genuinely distinguish this property.
JSON shape: {"features":[{"key","value","applicability","evidence"}],"current_special":"","amenity_keywords":[],"location_keywords":[]}`
  try {
    cost.claudeCalls++
    const msg = await client.messages.create({
      model: "claude-opus-4-8", max_tokens: 4000, system: SYSTEM,
      messages: [{ role: "user", content: `Property: ${name} (${market}). Website text:\n${text}` }],
    })
    cost.claudeInTok += msg.usage?.input_tokens ?? 0; cost.claudeOutTok += msg.usage?.output_tokens ?? 0
    const block = msg.content.find((b: { type: string }) => b.type === "text") as { text: string } | undefined
    if (!block) return null
    const raw = block.text.replace(/```json/g, "").replace(/```/g, "").trim()
    return JSON.parse(raw)
  } catch (e) { console.error("  claude:", (e as Error).message); return null }
}

async function main() {
  const { supabaseAdmin } = await import("@/lib/supabase/admin")
  const { enrichProperty } = await import("@/lib/propertyEnrichment/writer")
  const { writeAttributes } = await import("@/lib/propertyEnrichment/attributes")
  const { writeWideRow } = await import("@/lib/propertyIntel/wideWriter")
  const { SupabaseEnrichmentStore } = await import("@/lib/propertyEnrichment/stores/supabaseStore")
  const store = new SupabaseEnrichmentStore()
  const nowIso = new Date().toISOString()

  const { data: keyRows } = await supabaseAdmin.from("property_attribute_keys").select("attribute_key").eq("value_kind", "tristate")
  const KEYS = (keyRows ?? []).map((k) => k.attribute_key as string)

  // Curated name/address per matched place_id (for Google identity) from the ledger.
  const ledger: Record<string, { name: string; address: string; market: string }> = {}
  for (const l of fs.readFileSync(`${S}/accepted_ledger.tsv`, "utf8").split("\n").filter(Boolean)) {
    const [pid, , , market, name, address] = l.split("\t")
    if (!ledger[pid]) ledger[pid] = { name: name ?? "", address: address ?? "", market: market ?? "" }
  }

  // Representative selection: spread across markets + inventory types + website presence.
  // The 710 curated-matched properties are exactly those with inventory_type populated.
  const { data: pool } = await supabaseAdmin.from("property_catalog")
    .select("place_id, market, inventory_type, structural_scale, website_url, penthouse_available")
    .not("inventory_type", "is", null)
  const chosen: string[] = []
  const perMarket: Record<string, number> = {}
  const sortKey = (r: Record<string, unknown>) => `${r.market}|${r.inventory_type ?? "z"}`
  for (const r of (pool ?? []).sort((a, b) => sortKey(a).localeCompare(sortKey(b)))) {
    const m = (r.market as string) ?? "?"
    if ((perMarket[m] ?? 0) >= Math.ceil(LIMIT / 4) + 1) continue
    chosen.push(r.place_id as string); perMarket[m] = (perMarket[m] ?? 0) + 1
    if (chosen.length >= LIMIT) break
  }
  console.log(`selected ${chosen.length}:`, perMarket)

  const runlog: Record<string, unknown>[] = []
  for (const placeId of chosen) {
    const led = ledger[placeId]
    const before = (await supabaseAdmin.from("property_catalog").select("website_url,google_rating,google_review_count,phone,address,city").eq("place_id", placeId).maybeSingle()).data
    const log: Record<string, unknown> = { placeId, name: led?.name, market: led?.market, wrote: [], google: false, claudeFeatures: 0, conflicts: [], failures: [] }

    // A) Google Places identity/geo/rating (fill-empty via safe writer)
    const g = await googleResolve(led?.name ?? "", led?.address ?? "", led?.market ?? "")
    if (g) {
      log.google = true
      const gf = [
        ["latitude", g.location?.latitude], ["longitude", g.location?.longitude],
        ["google_rating", g.rating], ["google_review_count", g.userRatingCount],
        ["website_url", g.websiteUri], ["phone", g.nationalPhoneNumber],
        ["address", g.formattedAddress],
      ].filter(([, v]) => v != null).map(([field, value]) => ({
        field: field as string, value, sourceType: "google_places" as const,
        sourceReference: g.id, verificationStatus: "verified" as const, checkedAt: nowIso,
      }))
      const res = await enrichProperty(store, { placeId, jobId: JOB, fields: gf })
      for (const fr of res.results) if (fr.outcome === "written") (log.wrote as string[]).push(`google:${fr.field}`)
    }

    // B) Official site + floorplans → Claude feature/special/keyword extraction
    const site = (g?.websiteUri as string) || (before?.website_url as string) || ""
    if (site) {
      let text = await fetchText(site)
      for (const suffix of ["/floorplans", "/floor-plans", "/amenities"]) {
        try { const extra = await fetchText(new URL(suffix, site).toString()); if (extra) text += "\n" + extra } catch { /* skip */ }
      }
      const ex = await claudeExtract(led?.name ?? "", led?.market ?? "", KEYS, text)
      if (ex) {
        const attrs = (ex.features ?? []).filter((f: Record<string, unknown>) => KEYS.includes(f.key as string)).map((f: Record<string, unknown>) => ({
          attributeKey: f.key, value: (f.value === "no" ? "no" : "yes"), applicability: f.applicability ?? "property_wide",
          sourceType: "official_property_site" as const, sourceReference: site,
          verificationStatus: "verified" as const, checkedAt: nowIso,
        }))
        log.claudeFeatures = attrs.length
        if (attrs.length) {
          const ar = await writeAttributes(store, { placeId, jobId: JOB, attributes: attrs })
          for (const r of ar.results) { if (r.outcome === "written") (log.wrote as string[]).push(`attr:${r.attributeKey}`); if (r.reason.startsWith("conflict")) (log.conflicts as string[]).push(r.attributeKey) }
        }
        if (ex.current_special) {
          await writeWideRow("property_specials", placeId, {
            raw_special_text: { value: ex.current_special, sourceType: "official_property_site", sourceReference: site, verificationStatus: "verified", checkedAt: nowIso },
            special_active: { value: true, sourceType: "official_property_site", sourceReference: site, verificationStatus: "verified", checkedAt: nowIso },
            special_source: { value: site, sourceType: "official_property_site", sourceReference: site, verificationStatus: "verified", checkedAt: nowIso },
            special_last_verified: { value: nowIso.slice(0, 10), sourceType: "official_property_site", sourceReference: site, verificationStatus: "verified", checkedAt: nowIso },
          }, { jobId: JOB, eventPrefix: "special" })
        }
        // C) Keywords: prefer curated (already in catalog); else fill from Claude.
        const kwFields: { field: string; value: unknown }[] = []
        const cur = (await supabaseAdmin.from("property_catalog").select("amenity_keywords,location_keywords").eq("place_id", placeId).maybeSingle()).data
        if ((!cur?.amenity_keywords || (cur.amenity_keywords as unknown[]).length < 3) && ex.amenity_keywords?.length)
          kwFields.push({ field: "amenity_keywords", value: (ex.amenity_keywords as string[]).slice(0, 3) })
        if ((!cur?.location_keywords || (cur.location_keywords as unknown[]).length < 3) && ex.location_keywords?.length)
          kwFields.push({ field: "location_keywords", value: (ex.location_keywords as string[]).slice(0, 3) })
        if (kwFields.length) await enrichProperty(store, { placeId, jobId: JOB, fields: kwFields.map((k) => ({ ...k, sourceType: "official_property_site" as const, sourceReference: site, verificationStatus: "verified" as const, checkedAt: nowIso })) })
      } else log.failures = ["claude_extract_failed_or_no_text"]
    } else log.failures = ["no_website"]

    console.log(`  ✓ ${led?.name} — google=${log.google} feats=${log.claudeFeatures} wrote=${(log.wrote as string[]).length}`)
    runlog.push(log)
  }

  fs.writeFileSync(`${S}/canary_run.json`, JSON.stringify({ chosen, runlog, cost }, null, 1))
  console.log("\nCANARY WRITES DONE"); console.log(JSON.stringify(cost, null, 1))
}
main().catch((e) => { console.error(e); process.exit(1) })
