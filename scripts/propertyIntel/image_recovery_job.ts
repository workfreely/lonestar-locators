// DURABLE image-recovery job — GAP-FILL ONLY, never replaces an existing accepted image.
// Retrieval tier 1 (static/provider): safeFetch → collectImageCandidates → scorePropertyImage →
// rankPropertyImages (reused, unchanged). Selects Primary + a DIFFERENT-identity Fallback, validates
// BOTH (reachable, image MIME, non-SVG, real sharp dimensions, decodes), then writes through the
// existing safe enrichProperty writer — which authorizes image writes ONLY for image_selection_state
// = 'missing' | 'change_requested' and locks to 'keep' on success (existing accepted images are
// rejected with image_locked_keep). Resumable via a JSON ledger; idempotent (a re-run skips rows that
// are no longer 'missing'). Rendered-browser tier is NOT handled here (needs headless automation).
// Run: npx tsx scripts/propertyIntel/image_recovery_job.ts --cohort=<file.json> [--limit=N] [--confirm]
import fs from "node:fs"; import path from "node:path"
;(() => { const p = path.join(process.cwd(), ".env.local"); for (const l of fs.readFileSync(p, "utf8").split("\n")) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "") } })()
const S = "/private/tmp/claude-501/-Users-jaymorris-Desktop-lonestar-locators-app/30160563-4dba-40ec-bd16-aeca0a940f8b/scratchpad"
const CONFIRM = process.argv.includes("--confirm")
const COHORT = process.argv.find((a) => a.startsWith("--cohort="))?.split("=")[1] ?? `${S}/cohort_static.json`
const LIMIT = Number(process.argv.find((a) => a.startsWith("--limit="))?.split("=")[1] ?? 0)
const LEDGER = process.argv.find((a) => a.startsWith("--ledger="))?.split("=")[1] ?? `${S}/recovery_ledger.json`
const MIN_LONG = 800, MIN_SHORT = 450
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/125.0.0.0 Safari/537.36"

const SCENE: { fam: string; label: string; re: RegExp }[] = [
  { fam: "exterior", label: "Building/Exterior", re: /\bexterior\b|\bfacade\b|\bentrance\b|\baerial\b|two.?story home|home exterior|\bhigh.?rise\b|\btower\b|\bbuilding\b/i },
  { fam: "rooftop_view", label: "Rooftop/Skyline/View", re: /rooftop|skyline|cityscape|aerial/i },
  { fam: "pool", label: "Pool", re: /\bpool\b|poolside|swimming|infinity/i },
  { fam: "kitchen", label: "Kitchen", re: /\bkitchen\b/i },
  { fam: "living", label: "Living/Interior/Model", re: /living|\bmodel\b|\binterior\b|open.?concept|\blobby\b|dining|bedroom/i },
  { fam: "amenity", label: "Amenity", re: /clubhouse|\blounge\b|fitness|\bgym\b|courtyard|cabana/i },
]
function classify(text: string): { fam: string; label: string } {
  for (const s of SCENE) if (s.re.test(text)) return { fam: s.fam, label: s.label }
  return { fam: "unknown", label: "Property photo" }
}
// OG-card aspect guard (branded share cards slip past URL heuristics) — flag for manual review.
function ogAspect(w: number, h: number) { const r = w / h; return r >= 1.85 && r <= 1.95 && w <= 1300 }

async function validate(url: string): Promise<{ ok: boolean; w?: number; h?: number; mime?: string; reason?: string }> {
  const sharp = (await import("sharp")).default
  const ac = new AbortController(); const t = setTimeout(() => ac.abort(), 12000)
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA, "Accept": "image/*", "Range": "bytes=0-524287" }, signal: ac.signal }).finally(() => clearTimeout(t))
    if (r.status >= 400) return { ok: false, reason: `http_${r.status}` }
    const mime = (r.headers.get("content-type") ?? "").split(";")[0].toLowerCase()
    if (!/^image\//.test(mime)) return { ok: false, reason: "not_image" }
    if (/svg/.test(mime)) return { ok: false, reason: "svg" }
    const buf = Buffer.from(await r.arrayBuffer())
    let meta; try { meta = await sharp(buf).metadata() } catch { return { ok: false, reason: "undecodable" } }
    const w = meta.width ?? 0, h = meta.height ?? 0
    if (Math.max(w, h) < MIN_LONG || Math.min(w, h) < MIN_SHORT) return { ok: false, w, h, mime, reason: `too_small:${w}x${h}` }
    return { ok: true, w, h, mime }
  } catch (e) { return { ok: false, reason: `err:${(e as Error).name}` } }
}

async function main() {
  const { safeFetch } = await import("@/lib/security/ssrfGuard")
  const { rankPropertyImages, imageIdentity } = await import("@/lib/leads/detectPropertyMetadata")
  const { enrichProperty } = await import("@/lib/propertyEnrichment/writer")
  const { SupabaseEnrichmentStore } = await import("@/lib/propertyEnrichment/stores/supabaseStore")
  const { supabaseAdmin } = await import("@/lib/supabase/admin")
  const store = new SupabaseEnrichmentStore()

  const cohort: { place_id: string; name?: string; market?: string; url: string }[] = JSON.parse(fs.readFileSync(COHORT, "utf8"))
  const targets = LIMIT ? cohort.slice(0, LIMIT) : cohort
  const ledger: Record<string, { status: string; reason?: string; primary?: string; fallback?: string; scenes?: string }> = fs.existsSync(LEDGER) ? JSON.parse(fs.readFileSync(LEDGER, "utf8")) : {}
  const now = () => new Date().toISOString()
  const rej: Record<string, number> = {}
  const bump = (k: string) => { rej[k] = (rej[k] ?? 0) + 1 }
  const scenes: Record<string, number> = {}, fbScenes: Record<string, number> = {}
  let done = 0, skipped = 0, failed = 0, mreview = 0, wrotePrimary = 0, wroteFallback = 0

  console.log(`Image recovery — cohort ${targets.length}  ·  mode: ${CONFIRM ? "CONFIRM (writes)" : "DRY"}  ·  ledger ${path.basename(LEDGER)}`)
  for (const tgt of targets) {
    const pid = tgt.place_id
    if (ledger[pid]?.status === "done" || ledger[pid]?.status === "skipped_locked") { skipped++; continue } // resume
    ledger[pid] = { status: "running" }
    // Gap-fill guard #1 (job layer): only act while the slot is still MISSING.
    const { data: row } = await supabaseAdmin.from("property_catalog").select("image_selection_state, property_image_url, website_url, property_type, inventory_type").eq("place_id", pid).single()
    if (!row) { ledger[pid] = { status: "failed", reason: "not_found" }; failed++; continue }
    if (row.image_selection_state !== "missing" || (row.property_image_url && row.property_image_url !== "")) {
      ledger[pid] = { status: "skipped_locked", reason: `state=${row.image_selection_state}` }; skipped++; fs.writeFileSync(LEDGER, JSON.stringify(ledger)); continue
    }
    const site = row.website_url || tgt.url
    try {
      const ac = new AbortController(); const t = setTimeout(() => ac.abort(), 14000)
      const resp = await safeFetch(site, { headers: { "User-Agent": UA, "Accept": "text/html", "Accept-Encoding": "identity" }, signal: ac.signal, maxRedirects: 4 }).finally(() => clearTimeout(t))
      if (!resp.ok) { ledger[pid] = { status: "failed", reason: `fetch:${resp.reason}` }; failed++; bump("fetch_failed"); continue }
      const html = await resp.response.text()
      const ranked = rankPropertyImages(html, resp.finalUrl) // reused: logos/floorplans/tiny/demoted already dropped
      if (!ranked.length) { ledger[pid] = { status: "needs_manual_review", reason: "no_ranked_candidates" }; mreview++; continue }

      // PRIMARY: first ranked candidate that validates.
      let primary: { url: string; w: number; h: number; fam: string; label: string; ident: string } | null = null
      for (const c of ranked.slice(0, 5)) {
        const v = await validate(c.url)
        if (!v.ok) { bump(v.reason?.startsWith("too_small") ? "too_small" : v.reason === "svg" ? "svg" : v.reason === "undecodable" ? "undecodable" : "unreachable_or_invalid"); continue }
        if (ogAspect(v.w!, v.h!) && !SCENE.some((s) => s.re.test(c.context ?? ""))) { bump("og_card_aspect"); continue }
        const sc = classify(`${c.context ?? ""} ${c.url}`)
        primary = { url: c.url, w: v.w!, h: v.h!, fam: sc.fam, label: sc.label, ident: imageIdentity(c.url) }; break
      }
      if (!primary) { ledger[pid] = { status: "needs_manual_review", reason: "no_valid_primary" }; mreview++; continue }

      // FALLBACK: next ranked candidate of a DIFFERENT identity (prefer different scene) that validates.
      let fallback: typeof primary = null
      for (const c of ranked) {
        const ident = imageIdentity(c.url)
        if (ident === primary.ident || c.url === primary.url) continue
        const sc = classify(`${c.context ?? ""} ${c.url}`)
        const v = await validate(c.url)
        if (!v.ok) continue
        if (ogAspect(v.w!, v.h!) && !SCENE.some((s) => s.re.test(c.context ?? ""))) continue
        // prefer different scene: take immediately if different family, else remember first valid
        if (!fallback) fallback = { url: c.url, w: v.w!, h: v.h!, fam: sc.fam, label: sc.label, ident }
        if (sc.fam !== primary.fam) { fallback = { url: c.url, w: v.w!, h: v.h!, fam: sc.fam, label: sc.label, ident }; break }
      }

      // Build the safe-writer candidate set (image fields only). Provenance = official_property_site/verified.
      const prov = { sourceType: "official_property_site" as const, sourceReference: resp.finalUrl, verificationStatus: "verified" as const, checkedAt: now() }
      const fields: { field: string; value: unknown; sourceType: "official_property_site"; sourceReference: string; verificationStatus: "verified"; checkedAt: string }[] = [
        { field: "property_image_url", value: primary.url, ...prov },
        { field: "property_image_source", value: "website:gallery", ...prov },
        { field: "property_image_source_detail", value: `primary=${primary.label}${fallback ? `; fallback=${fallback.label}` : ""}`, ...prov },
        { field: "property_image_status", value: "valid", ...prov },
        { field: "property_image_verified_at", value: now(), ...prov },
        { field: "property_image_checked_at", value: now(), ...prov },
      ]
      if (fallback) fields.push({ field: "property_image_url_backup", value: fallback.url, ...prov })

      if (CONFIRM) {
        const res = await enrichProperty(store, { placeId: pid, jobId: "image_recovery_static", fields })
        const wrotePri = res.results.find((r) => r.field === "property_image_url")?.outcome === "written"
        const wroteFb = res.results.find((r) => r.field === "property_image_url_backup")?.outcome === "written"
        if (!wrotePri) { ledger[pid] = { status: "failed", reason: `writer:${res.results.find((r) => r.field === "property_image_url")?.reason}` }; failed++; continue }
        if (wrotePri) wrotePrimary++
        if (wroteFb) wroteFallback++
      }
      scenes[primary.label] = (scenes[primary.label] ?? 0) + 1
      if (fallback) fbScenes[fallback.label] = (fbScenes[fallback.label] ?? 0) + 1
      ledger[pid] = { status: "done", primary: primary.url, fallback: fallback?.url, scenes: `${primary.label}${fallback ? " / " + fallback.label : " / (none)"}` }
      done++
    } catch (e) { ledger[pid] = { status: "failed", reason: `err:${(e as Error).name}` }; failed++ }
    if ((done + skipped + failed + mreview) % 10 === 0) fs.writeFileSync(LEDGER, JSON.stringify(ledger))
  }
  fs.writeFileSync(LEDGER, JSON.stringify(ledger, null, 1))
  console.log(JSON.stringify({ cohort: targets.length, done, skipped, failed, needs_manual_review: mreview,
    wrotePrimary, wroteFallback, primaryScenes: scenes, fallbackScenes: fbScenes, rejections: rej }, null, 1))
}
main().catch((e) => { console.error(e); process.exit(1) })
