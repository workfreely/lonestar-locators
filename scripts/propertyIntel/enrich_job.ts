// Durable, resumable, batched matched-catalog enrichment job. Per-property state in
// property_enrichment_job_items (the resume authority — NOT last_item). Cost tracked with
// a hard ceiling that auto-pauses. Failures are recorded and never stop the job.
// Bulk extraction uses Claude Haiku 4.5 (cost-responsible; workflow proven with Opus in
// the canary). Run: npx tsx scripts/propertyIntel/enrich_job.ts [--batch=40] [--ceiling=35] [--concurrency=5] [--resume=<jobId>]
import fs from "node:fs"; import path from "node:path"
;(() => { const p = path.join(process.cwd(), ".env.local"); for (const line of fs.readFileSync(p, "utf8").split("\n")) { const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "") } })()
// A stray stream/decode rejection (e.g. a site with a broken content-encoding) must not
// crash the whole durable job — log and continue; per-item try/catch handles the rest.
process.on("unhandledRejection", (e) => console.error("[unhandledRejection]", String(e).slice(0, 140)))
process.on("uncaughtException", (e) => console.error("[uncaughtException]", String(e).slice(0, 140)))
const arg = (k: string, d: number) => Number((process.argv.find((a) => a.startsWith(`--${k}=`))?.split("=")[1]) ?? d)
const BATCH = arg("batch", 40), CEILING = arg("ceiling", 35), CONC = arg("concurrency", 5), MAX = arg("max", 0)
const RESUME = process.argv.find((a) => a.startsWith("--resume="))?.split("=")[1]
const MODE = process.argv.find((a) => a.startsWith("--mode="))?.split("=")[1] ?? "matched" // matched | skeleton
const MODEL = "claude-haiku-4-5-20251001"
// Metro market derivation from a Google formatted address (for skeleton identity).
const MKT: Record<string, string[]> = {
  "Austin": ["austin", "round rock", "cedar park", "pflugerville", "leander", "georgetown", "kyle", "buda", "san marcos"],
  "Dallas": ["dallas", "fort worth", "plano", "irving", "arlington", "frisco", "mckinney", "richardson", "garland", "addison", "carrollton", "lewisville", "grand prairie", "denton", "euless", "bedford", "mansfield", "the colony", "allen", "waxahachie"],
  "Houston": ["houston", "katy", "sugar land", "the woodlands", "cypress", "pearland", "spring", "pasadena", "conroe", "humble", "tomball", "stafford", "missouri city"],
  "San Antonio": ["san antonio", "new braunfels", "schertz", "boerne", "converse", "universal city", "selma", "cibolo", "helotes", "live oak"],
}
function marketFromAddress(addr: string): string | null {
  const a = (addr || "").toLowerCase()
  for (const [mkt, cities] of Object.entries(MKT)) if (cities.some((c) => a.includes(c))) return mkt
  return null
}
const S = "/private/tmp/claude-501/-Users-jaymorris-Desktop-lonestar-locators-app/30160563-4dba-40ec-bd16-aeca0a940f8b/scratchpad"
// Haiku 4.5 list pricing per 1M tokens.
const IN_PER_M = 1.0, OUT_PER_M = 5.0
const cost = { googleCalls: 0, claudeCalls: 0, inTok: 0, outTok: 0, fetches: 0 }
const usd = () => (cost.inTok / 1e6) * IN_PER_M + (cost.outTok / 1e6) * OUT_PER_M
const PER_ITEM_CALL_CAP = 6 // anomaly guard

// Robust JSON extraction — Haiku sometimes wraps JSON in fences or appends a note.
// Slice the outermost array/object and parse; return null on failure (→ limitation, not
// a hard failure that discards the whole property's stage).
function safeParse(text: string, kind: "object" | "array"): unknown | null {
  if (!text) return null
  const t = text.replace(/```json/gi, "").replace(/```/g, "").trim()
  const open = kind === "array" ? "[" : "{"
  const close = kind === "array" ? "]" : "}"
  const s = t.indexOf(open), e = t.lastIndexOf(close)
  const slice = s >= 0 && e > s ? t.slice(s, e + 1) : t
  try { return JSON.parse(slice) } catch { try { return JSON.parse(t) } catch { return null } }
}

async function fetchText(url: string): Promise<string> {
  try { cost.fetches++; const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 15000)
    // Accept-Encoding: identity avoids undici's brotli/gzip decompression path, which can
    // throw an off-thread TransformError on malformed encodings and crash the process.
    const r = await fetch(url, { signal: ctrl.signal, headers: { "User-Agent": "Mozilla/5.0 LocatorBeastBot", "Accept-Encoding": "identity" } }); clearTimeout(t)
    if (!r.ok) return ""
    let h = ""
    try { h = await r.text() } catch { return "" }
    return h.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim().slice(0, 12000)
  } catch { return "" }
}

async function main() {
  const { supabaseAdmin } = await import("@/lib/supabase/admin")
  const { enrichProperty } = await import("@/lib/propertyEnrichment/writer")
  const { writeAttributes } = await import("@/lib/propertyEnrichment/attributes")
  const { writeWideRow, insertFloorPlan } = await import("@/lib/propertyIntel/wideWriter")
  const { SupabaseEnrichmentStore } = await import("@/lib/propertyEnrichment/stores/supabaseStore")
  const Anthropic = (await import("@anthropic-ai/sdk")).default
  const store = new SupabaseEnrichmentStore()
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const gkey = process.env.GOOGLE_PLACES_API_KEY

  const { data: keyRows } = await supabaseAdmin.from("property_attribute_keys").select("attribute_key").eq("value_kind", "tristate")
  const KEYS = (keyRows ?? []).map((k) => k.attribute_key as string)
  const ledger: Record<string, { name: string; address: string; market: string }> = {}
  for (const l of fs.readFileSync(`${S}/accepted_ledger.tsv`, "utf8").split("\n").filter(Boolean)) {
    const [pid, , , market, name, address] = l.split("\t"); if (!ledger[pid]) ledger[pid] = { name: name ?? "", address: address ?? "", market: market ?? "" }
  }

  // ── Create or resume the job ──
  let jobId = RESUME
  if (!jobId) {
    let target: string[]
    if (MODE === "skeleton") {
      // Remainder: active-catalog skeletons (no identity yet), EXCLUDING review candidates
      // (never auto-admit). Paginated to clear PostgREST's default 1000-row cap.
      const rc = new Set(((await supabaseAdmin.from("property_review_candidates").select("place_id")).data ?? []).map((r) => r.place_id))
      const acc: string[] = []
      for (let from = 0; ; from += 1000) {
        const { data } = await supabaseAdmin.from("property_catalog").select("place_id").is("property_name", null).order("place_id").range(from, from + 999)
        if (!data || !data.length) break
        for (const r of data) if (!rc.has(r.place_id)) acc.push(r.place_id as string)
        if (data.length < 1000) break
      }
      target = acc
    } else {
      // Matched mode: original master-matched minus already web-enriched (canary).
      const { data: rows } = await supabaseAdmin.from("property_place_id_resolution")
        .select("place_id").eq("classification", "ACCEPTED_HIGH_CONFIDENCE").not("batch_label", "like", "qual_resolution%")
      const { data: web } = await supabaseAdmin.from("property_attributes").select("place_id").eq("source_type", "official_property_site")
      const webSet = new Set((web ?? []).map((w) => w.place_id))
      const { data: catIds } = await supabaseAdmin.from("property_catalog").select("place_id").not("inventory_type", "is", null)
      const catSet = new Set((catIds ?? []).map((c) => c.place_id))
      target = [...new Set((rows ?? []).map((r) => r.place_id as string))].filter((p) => catSet.has(p) && !webSet.has(p))
    }
    const { data: job } = await supabaseAdmin.from("property_enrichment_jobs").insert({
      job_type: "property_enrichment", status: "running", total: target.length,
      params: { ceiling: CEILING, model: MODEL, cost }, message: "matched-catalog rollout", requested_by: "workingfreely@gmail.com", started_at: new Date().toISOString(),
    }).select("id").single()
    jobId = job!.id as string
    // seed items
    const items = target.map((p, i) => ({ job_id: jobId, place_id: p, seq: i, status: "pending" }))
    for (let i = 0; i < items.length; i += 500) await supabaseAdmin.from("property_enrichment_job_items").insert(items.slice(i, i + 500))
    console.log(`created job ${jobId} with ${target.length} items`)
  } else {
    const { data: prior } = await supabaseAdmin.from("property_enrichment_jobs").select("params").eq("id", jobId).single()
    Object.assign(cost, (prior?.params as { cost?: typeof cost })?.cost ?? {})
    await supabaseAdmin.from("property_enrichment_job_items").update({ status: "pending" }).eq("job_id", jobId).eq("status", "in_progress")
    await supabaseAdmin.from("property_enrichment_jobs").update({ status: "running" }).eq("id", jobId)
    console.log(`resumed job ${jobId} (prior cost $${usd().toFixed(2)})`)
  }

  const now = () => new Date().toISOString()
  const activity = (level: string, event: string, detail: unknown, placeId?: string) => supabaseAdmin.from("property_enrichment_job_activity").insert({ job_id: jobId, place_id: placeId ?? null, level, event, detail })

  async function enrichOne(placeId: string) {
    const led = ledger[placeId]
    const m: { g: boolean; fields: number; attrs: number; floorplans: number; specials: number; conflicts: number; calls: number; failures: { stage: string; error: string; retryable: boolean }[]; limitations: string[] } = { g: false, fields: 0, attrs: 0, floorplans: 0, specials: 0, conflicts: 0, calls: 0, failures: [], limitations: [] }
    let site = ""
    let name = led?.name ?? ""
    let market = led?.market ?? ""
    let idFromDetails = false
    // 1) SKELETON IDENTITY — Places Details by place_id → canonical identity + market.
    if (MODE === "skeleton" || !led) {
      try {
        cost.googleCalls++; m.calls++
        const dr = await fetch(`https://places.googleapis.com/v1/places/${placeId}`, { headers: { "X-Goog-Api-Key": gkey ?? "", "X-Goog-FieldMask": "id,displayName,formattedAddress,location,rating,userRatingCount,websiteUri,nationalPhoneNumber" } })
        if (dr.ok) {
          const d = await dr.json()
          idFromDetails = true; m.g = true
          name = (d.displayName?.text as string) || name
          site = (d.websiteUri as string) || ""
          market = marketFromAddress(d.formattedAddress ?? "") ?? market
          const idf = [["property_name", d.displayName?.text], ["address", d.formattedAddress], ["market", market || null], ["latitude", d.location?.latitude], ["longitude", d.location?.longitude], ["google_rating", d.rating], ["google_review_count", d.userRatingCount], ["website_url", d.websiteUri], ["phone", d.nationalPhoneNumber]].filter(([, v]) => v != null).map(([f, v]) => ({ field: f as string, value: v, sourceType: "google_places" as const, sourceReference: placeId, verificationStatus: "verified" as const, checkedAt: now() }))
          const res = await enrichProperty(store, { placeId, jobId: jobId!, fields: idf })
          for (const fr of res.results) { if (fr.outcome === "written") m.fields++; if (fr.reason.startsWith("conflict")) m.conflicts++ }
        } else { m.failures.push({ stage: "places_details", error: `HTTP ${dr.status}`, retryable: dr.status === 429 || dr.status >= 500 }) }
      } catch (e) { m.failures.push({ stage: "places_details", error: (e as Error).message.slice(0, 120), retryable: true }) }
    }
    // 2) Google-owned refresh (matched mode only; skeleton already got Google data via Details)
    try {
      if (gkey && !idFromDetails && m.calls < PER_ITEM_CALL_CAP) {
        cost.googleCalls++; m.calls++
        const gr = await fetch("https://places.googleapis.com/v1/places:searchText", { method: "POST", headers: { "Content-Type": "application/json", "X-Goog-Api-Key": gkey, "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount,places.websiteUri,places.nationalPhoneNumber" }, body: JSON.stringify({ textQuery: `${name} ${led?.address ?? ""} ${market} TX`.trim(), maxResultCount: 1 }) })
        if (gr.ok) { const g = (await gr.json()).places?.[0]; if (g) {
          m.g = true; site = (g.websiteUri as string) || ""
          const gf = [["latitude", g.location?.latitude], ["longitude", g.location?.longitude], ["google_rating", g.rating], ["google_review_count", g.userRatingCount], ["website_url", g.websiteUri], ["phone", g.nationalPhoneNumber], ["address", g.formattedAddress]].filter(([, v]) => v != null).map(([f, v]) => ({ field: f as string, value: v, sourceType: "google_places" as const, sourceReference: g.id, verificationStatus: "verified" as const, checkedAt: now() }))
          const res = await enrichProperty(store, { placeId, jobId: jobId!, fields: gf })
          for (const fr of res.results) { if (fr.outcome === "written") m.fields++; if (fr.reason.startsWith("conflict")) m.conflicts++ }
        } }
      }
    } catch (e) { m.failures.push({ stage: "google", error: (e as Error).message.slice(0, 120), retryable: true }) }

    if (!site) { const cur = (await supabaseAdmin.from("property_catalog").select("website_url").eq("place_id", placeId).maybeSingle()).data; site = (cur?.website_url as string) || "" }
    if (!site) { m.limitations.push("no_website"); return m }

    // 3) Official website → features/special/keywords (Haiku)
    try {
      let text = await fetchText(site)
      for (const suf of ["/amenities", "/floorplans"]) { try { const x = await fetchText(new URL(suf, site).toString()); if (x) text += "\n" + x } catch { /* skip */ } }
      if (text.length < 300) { m.limitations.push("site_no_text_js_only", "needs_rendered_web") }
      else if (m.calls < PER_ITEM_CALL_CAP) {
        cost.claudeCalls++; m.calls++
        const SYS = `Extract STRUCTURED apartment intelligence from official property website text. Return RAW JSON only.
RULES: only assert what the text CLEARLY supports; if a field is not addressed, OMIT it or use "unknown" — NEVER infer "no"/"not included" from absence. Never guess. Do NOT extract rent/pricing, commission, or renter approval/credit policy.

1) features: array of {"key","value":"yes"|"no","applicability":"property_wide"|"select_units"|"specific_floor_plans"|"penthouses"} using ONLY these exact keys: ${KEYS.join(", ")}. Use select_units/specific_floor_plans/penthouses when the text scopes it — never blanket property_wide unless it applies to all. Max 30.
2) current_special: verbatim concession text if any, else "".
3) amenity_keywords / location_keywords: up to 3 each, genuinely distinguishing.
4) offerings: {"furnished_units_available","furniture_package_available","corporate_housing_available","washer_dryer_included","washer_dryer_connections"} each one of "Yes"|"No"|"Select Units"|"Specific Floor Plans"|"Unknown" — omit any not stated.
5) pet: {"pets_allowed":"Yes"|"No"|"Cats Only"|"Dogs Only"|"Unknown","breed_restrictions":"Yes"|"No"|"Unknown","pet_weight_limit":int|null,"number_of_pets_allowed":int|null,"pet_fee":int|null,"pet_deposit":int|null,"monthly_pet_rent":int|null} — omit anything not stated.
6) utilities: {"all_bills_paid":"Yes"|"No"|"Partial"|"Unknown","water_included","electric_included","gas_included","trash_included","sewer_included","cable_included"} each "Yes"|"No"|"Unknown" — only where the site explicitly addresses it.
7) internet: {"internet_included":"Yes"|"No"|"Unknown","fiber_available":"Yes"|"No"|"Unknown","internet_provider":string|null}.
8) lease: {"short_term_lease_available":"Yes"|"No"|"Restricted"|"Unknown","month_to_month_available":"Yes"|"No"|"Unknown","airbnb_short_term_rental_allowed":"Yes"|"No"|"Restricted"|"Unknown"}.
9) structure: {"building_style":"High-Rise"|"Mid-Rise"|"Garden-Style"|"Build-to-Rent"|"Mixed Residential"|null,"stories":int|null,"year_built":int|null,"year_renovated":int|null} — only if explicitly stated.
Shape: {"features":[],"current_special":"","amenity_keywords":[],"location_keywords":[],"offerings":{},"pet":{},"utilities":{},"internet":{},"lease":{},"structure":{}}`
        const msg = await anthropic.messages.create({ model: MODEL, max_tokens: 3000, system: SYS, messages: [{ role: "user", content: `Property: ${name} (${market}). Text:\n${text}` }] })
        cost.inTok += msg.usage?.input_tokens ?? 0; cost.outTok += msg.usage?.output_tokens ?? 0
        const b = msg.content.find((x: { type: string }) => x.type === "text") as { text: string } | undefined
        const ex = safeParse(b?.text ?? "", "object") as (Record<string, unknown> & { features?: Record<string, unknown>[]; current_special?: string; amenity_keywords?: string[]; location_keywords?: string[]; offerings?: Record<string, unknown>; pet?: Record<string, unknown>; utilities?: Record<string, unknown>; internet?: Record<string, unknown>; lease?: Record<string, unknown>; structure?: Record<string, unknown> }) | null
        if (!ex) { m.limitations.push("feature_json_unparseable") }
        else {
          const attrs = (ex.features ?? []).filter((f: Record<string, unknown>) => KEYS.includes(f.key as string)).map((f: Record<string, unknown>) => ({ attributeKey: f.key, value: f.value === "no" ? "no" : "yes", applicability: f.applicability ?? "property_wide", sourceType: "official_property_site" as const, sourceReference: site, verificationStatus: "verified" as const, checkedAt: now() }))
          if (attrs.length) { const ar = await writeAttributes(store, { placeId, jobId: jobId!, attributes: attrs }); for (const r of ar.results) { if (r.outcome === "written") m.attrs++; if (r.reason.startsWith("conflict")) m.conflicts++ } }
          if (ex.current_special) { const sr = await writeWideRow("property_specials", placeId, { raw_special_text: { value: ex.current_special, sourceType: "official_property_site", sourceReference: site, verificationStatus: "verified", checkedAt: now() }, special_active: { value: true, sourceType: "official_property_site", sourceReference: site, verificationStatus: "verified", checkedAt: now() }, special_source: { value: site, sourceType: "official_property_site", sourceReference: site, verificationStatus: "verified", checkedAt: now() }, special_last_verified: { value: now().slice(0, 10), sourceType: "official_property_site", sourceReference: site, verificationStatus: "verified", checkedAt: now() } }, { jobId: jobId!, eventPrefix: "special" }); if (sr.written.length) m.specials++ }
          const kw: { field: string; value: unknown }[] = []
          const cur = (await supabaseAdmin.from("property_catalog").select("amenity_keywords,location_keywords").eq("place_id", placeId).maybeSingle()).data
          if ((!cur?.amenity_keywords || (cur.amenity_keywords as unknown[]).length < 3) && ex.amenity_keywords?.length) kw.push({ field: "amenity_keywords", value: (ex.amenity_keywords as string[]).slice(0, 3) })
          if ((!cur?.location_keywords || (cur.location_keywords as unknown[]).length < 3) && ex.location_keywords?.length) kw.push({ field: "location_keywords", value: (ex.location_keywords as string[]).slice(0, 3) })
          if (kw.length) await enrichProperty(store, { placeId, jobId: jobId!, fields: kw.map((k) => ({ ...k, sourceType: "official_property_site" as const, sourceReference: site, verificationStatus: "verified" as const, checkedAt: now() })) })

          // Canonical catalog scalars (Furnished / Pet / Utilities / Internet / Lease / Structure).
          // Only fields the site actually stated; "unknown"/blank is dropped → never written as "No".
          const skip = (v: unknown) => v == null || v === "" || String(v).trim().toLowerCase() === "unknown"
          const domainFields: Record<string, string[]> = {
            offerings: ["furnished_units_available", "furniture_package_available", "corporate_housing_available", "washer_dryer_included", "washer_dryer_connections"],
            pet: ["pets_allowed", "breed_restrictions", "pet_weight_limit", "number_of_pets_allowed", "pet_fee", "pet_deposit", "monthly_pet_rent"],
            utilities: ["all_bills_paid", "water_included", "electric_included", "gas_included", "trash_included", "sewer_included", "cable_included"],
            internet: ["internet_included", "fiber_available", "internet_provider"],
            lease: ["short_term_lease_available", "month_to_month_available", "airbnb_short_term_rental_allowed"],
          }
          const catCands: { field: string; value: unknown }[] = []
          for (const [obj, fields] of Object.entries(domainFields)) {
            const src = (ex[obj] ?? {}) as Record<string, unknown>
            for (const f of fields) if (!skip(src[f])) catCands.push({ field: f, value: src[f] })
          }
          const st = (ex.structure ?? {}) as Record<string, unknown>
          if (!skip(st.building_style)) catCands.push({ field: "structural_scale", value: st.building_style })
          for (const f of ["stories", "year_built", "year_renovated"]) if (!skip(st[f]) && Number.isFinite(Number(st[f]))) catCands.push({ field: f, value: Number(st[f]) })
          if (catCands.length) {
            const cr = await enrichProperty(store, { placeId, jobId: jobId!, fields: catCands.map((c) => ({ ...c, sourceType: "official_property_site" as const, sourceReference: site, verificationStatus: "verified" as const, checkedAt: now() })) })
            for (const r of cr.results) { if (r.outcome === "written") m.fields++; if (r.reason.startsWith("conflict")) m.conflicts++ }
          }
        }
      }
    } catch (e) { m.failures.push({ stage: "website_extract", error: (e as Error).message.slice(0, 120), retryable: true }) }

    // 4) Floorplan page (Haiku)
    try {
      let ftext = ""
      for (const u of [new URL("/floorplans", site).toString(), new URL("/floor-plans", site).toString()]) { const t = await fetchText(u); if (t && t.length > 400) { ftext = t; break } }
      if (ftext && m.calls < PER_ITEM_CALL_CAP) {
        cost.claudeCalls++; m.calls++
        const FSYS = `Extract INDIVIDUAL floor plans from official floor-plan text. RAW JSON array only. Each: {"name","beds"(num|null),"baths"(num|null),"sqft_min"(int|null),"sqft_max"(int|null),"starting_rent"(int|null),"is_penthouse"(bool),"is_townhome"(bool),"is_loft"(bool),"is_split_level"(bool),"ceiling_height_ft"(string|null only if stated)}. Only facts present; null when not stated; no fabrication. Max 25.`
        const msg = await anthropic.messages.create({ model: MODEL, max_tokens: 3000, system: FSYS, messages: [{ role: "user", content: `Property: ${name}. Floor-plan text:\n${ftext}` }] })
        cost.inTok += msg.usage?.input_tokens ?? 0; cost.outTok += msg.usage?.output_tokens ?? 0
        const b = msg.content.find((x: { type: string }) => x.type === "text") as { text: string } | undefined
        const plans = safeParse(b?.text ?? "", "array")
        if (!Array.isArray(plans)) m.limitations.push("floorplan_json_unparseable")
        for (const fp of (Array.isArray(plans) ? plans : []).slice(0, 25)) { if (!fp.name) continue; const ok = await insertFloorPlan(placeId, { name: String(fp.name).slice(0, 120), beds: fp.beds ?? null, baths: fp.baths ?? null, sqft_min: fp.sqft_min ?? null, sqft_max: fp.sqft_max ?? null, starting_rent: fp.starting_rent ?? null, is_townhome: fp.is_townhome ?? null, is_split_level: fp.is_split_level ?? null, is_loft: fp.is_loft ?? null, is_penthouse: fp.is_penthouse ?? null, ceiling_height_ft: fp.ceiling_height_ft ?? null, source_type: "official_property_site", source_reference: site, verification_status: "verified", checked_at: now() }); if (ok) m.floorplans++ }
      } else if (!ftext) m.limitations.push("no_floorplan_page")
    } catch (e) { m.failures.push({ stage: "floorplan", error: (e as Error).message.slice(0, 120), retryable: true }) }

    return m
  }

  // ── Batch loop ──
  const tally = { completed: 0, partial: 0, failed: 0, skipped: 0, fields: 0, attrs: 0, floorplans: 0, specials: 0, conflicts: 0 }
  let processedThisRun = 0
  while (true) {
    if (MAX && processedThisRun >= MAX) { console.log(`--max ${MAX} reached this run (job stays running/resumable)`); break }
    if (usd() > CEILING) { await supabaseAdmin.from("property_enrichment_jobs").update({ status: "paused", message: `cost ceiling $${CEILING} reached`, params: { ceiling: CEILING, model: MODEL, cost } }).eq("id", jobId); await activity("warn", "paused_cost_ceiling", { usd: usd() }); console.log(`PAUSED at $${usd().toFixed(2)} (ceiling $${CEILING})`); break }
    const { data: batch } = await supabaseAdmin.from("property_enrichment_job_items").select("place_id").eq("job_id", jobId).eq("status", "pending").order("seq").limit(BATCH)
    if (!batch || !batch.length) { await supabaseAdmin.from("property_enrichment_jobs").update({ status: "completed", finished_at: now(), params: { ceiling: CEILING, model: MODEL, cost } }).eq("id", jobId); console.log("JOB COMPLETED"); break }
    // concurrency pool
    const ids = batch.map((b) => b.place_id as string)
    await supabaseAdmin.from("property_enrichment_job_items").update({ status: "in_progress", started_at: now() }).eq("job_id", jobId).in("place_id", ids)
    for (let i = 0; i < ids.length; i += CONC) {
      await Promise.all(ids.slice(i, i + CONC).map(async (placeId) => {
        try {
          const r = await enrichOne(placeId)
          // needs_rendered_web → terminal 'skipped' (handed to the rendered-browser phase; not retried).
          const renderedWeb = r.limitations.includes("needs_rendered_web")
          const status = renderedWeb ? "skipped"
            : (r.failures.length && r.attrs === 0 && r.fields === 0 && r.floorplans === 0 ? "failed" : "done")
          if (status === "failed") tally.failed++; else if (status === "skipped") tally.skipped++; else if (r.limitations.length || r.failures.length) tally.partial++; else tally.completed++
          tally.fields += r.fields; tally.attrs += r.attrs; tally.floorplans += r.floorplans; tally.specials += r.specials; tally.conflicts += r.conflicts
          await supabaseAdmin.from("property_enrichment_job_items").update({ status, attempts: 1, fields_written: r.fields, attrs_written: r.attrs, conflicts: r.conflicts, result: r, error: r.failures.map((f) => `${f.stage}:${f.error}`).join("; ") || null, finished_at: now() }).eq("job_id", jobId).eq("place_id", placeId)
          if (r.failures.length) await activity("error", "item_failure", r.failures, placeId)
        } catch (e) {
          tally.failed++
          await supabaseAdmin.from("property_enrichment_job_items").update({ status: "failed", attempts: 1, error: (e as Error).message.slice(0, 200), finished_at: now() }).eq("job_id", jobId).eq("place_id", placeId)
          await activity("error", "item_exception", { error: (e as Error).message.slice(0, 200) }, placeId)
        }
      }))
    }
    processedThisRun += ids.length
    const processed = tally.completed + tally.partial + tally.failed
    await supabaseAdmin.from("property_enrichment_jobs").update({ processed, updated: tally.fields + tally.attrs, added: tally.attrs, conflicts: tally.conflicts, failed: tally.failed, skipped: tally.partial, last_item: ids[ids.length - 1], last_item_at: now(), params: { ceiling: CEILING, model: MODEL, cost } }).eq("id", jobId)
    console.log(`batch done · processed=${processed} attrs=${tally.attrs} fields=${tally.fields} fp=${tally.floorplans} specials=${tally.specials} conflicts=${tally.conflicts} failed=${tally.failed} · $${usd().toFixed(2)}`)
  }
  fs.writeFileSync(`${S}/enrich_job_run.json`, JSON.stringify({ jobId, tally, cost, usd: usd() }, null, 1))
  console.log(JSON.stringify({ jobId, tally, cost, usd: Number(usd().toFixed(2)) }, null, 1))
}
main().catch((e) => { console.error(e); process.exit(1) })
