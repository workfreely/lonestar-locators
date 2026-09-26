// RENDERED image recovery (Playwright) — GAP-FILL ONLY. Automates the validated rendered-browser
// method: navigate the public site (JS renders, passes Cloudflare), follow the public /photos/
// gallery, scan the FULL rendered gallery + page-state media URLs, collect alt/title/category,
// detect the ACTUAL media provider/CDN after rendering, then:
//   cheap metadata reject  →  reachability/MIME/SVG/real-dimension validation  →  VISUAL gate
//   (Haiku 4.5: real property photo vs logo/brand/promo)  →  scene + property-type ranking  →
//   Primary + different-scene Fallback, written through the per-slot safe writer (never replaces).
// Does NOT defeat CAPTCHAs/auth: a challenged/blocked site is marked needs_manual_review.
// Run: npx tsx scripts/propertyIntel/rendered_recovery.ts --cohort=<file> [--confirm] [--limit=N] [--sheet]
import fs from "node:fs"; import path from "node:path"
;(() => { const p = path.join(process.cwd(), ".env.local"); for (const l of fs.readFileSync(p, "utf8").split("\n")) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "") } })()
import { chromium, type Page } from "playwright"
import { classifyPropertyImage } from "./visual_gate"
const S = "/private/tmp/claude-501/-Users-jaymorris-Desktop-lonestar-locators-app/30160563-4dba-40ec-bd16-aeca0a940f8b/scratchpad"
const CONFIRM = process.argv.includes("--confirm")
const SHEET = process.argv.includes("--sheet")
const COHORT = process.argv.find((a) => a.startsWith("--cohort="))?.split("=")[1]!
const LIMIT = Number(process.argv.find((a) => a.startsWith("--limit="))?.split("=")[1] ?? 0)
const LEDGER = process.argv.find((a) => a.startsWith("--ledger="))?.split("=")[1] ?? `${S}/rendered_ledger.json`
const MIN_LONG = 800, MIN_SHORT = 450
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"

// ── provider media CDNs (detected AFTER rendering, not from domain) ──
const PROVIDER_CDN: [string, RegExp][] = [
  ["Entrata", /medialibrarycfo\.entrata\.com|commoncf\.entrata\.com/i],
  ["Yardi/RENTCafe", /resource\.rentcafe\.com|cdn(?:general)?[a-z]*\.rentcafe\.com/i],
  ["G5/Cloudinary", /g5-assets|res\.cloudinary\.com\/g5|g5-cld/i],
  ["Cloudinary", /res\.cloudinary\.com/i],
  ["Myrazz", /images\.myrazz\.com|ucarecdn/i],
  ["RealPage/LeaseStar", /myleasestar\.com/i],
  ["Duda", /irp\.cdn-website\.com/i],
  ["Webflow", /website-files\.com/i],
  ["Apartments247", /apts247\.info/i],
]
function detectProvider(urls: string[]): string { for (const [name, re] of PROVIDER_CDN) if (urls.some((u) => re.test(u))) return name; return "other/custom" }

// ── cheap metadata rejects (before validation + vision) ──
const ENTRATA_BRANDING = /\/MLv3\/9\/36\//i
const TITLECARD_FILE = /screen_title|%5Bscreen_title%5D|site_title|separator/i
const LOGO_FILE = /logo|wordmark|brandmark|\bbadge\b|\bseal\b|favicon|\bicon\b|\bemblem\b|monogram|\bbco\b|-special\b|promo|coming-?soon/i
function metadataReject(url: string, alt: string): string | null {
  const u = url.toLowerCase(), a = alt.toLowerCase()
  if (/\.svg(\?|#|$)/.test(u)) return "svg"
  if (ENTRATA_BRANDING.test(url)) return "entrata_branding_path"
  if (TITLECARD_FILE.test(url)) return "titlecard_filename"
  if (LOGO_FILE.test(u)) return "logo_filename"
  if (/\blogo\b|wordmark|\bbadge\b/.test(a)) return "logo_alt"
  return null
}

const SCENE: { fam: string; label: string; re: RegExp }[] = [
  { fam: "exterior", label: "Building/Exterior", re: /\bexterior\b|\bfacade\b|\bentrance\b|\baerial\b|two.?story home|home exterior|\bhigh.?rise\b|\btower\b|\bbuilding\b/i },
  { fam: "rooftop_view", label: "Rooftop/Skyline/View", re: /rooftop|skyline|cityscape/i },
  { fam: "pool", label: "Pool", re: /\bpool\b|poolside|swimming|infinity/i },
  { fam: "kitchen", label: "Kitchen", re: /\bkitchen\b/i },
  { fam: "living", label: "Living/Interior/Model", re: /living|\bmodel\b|\binterior\b|open.?concept|\blobby\b|dining|bedroom/i },
  { fam: "amenity_strong", label: "Amenity (clubhouse/lounge/rooftop)", re: /clubhouse|club house|\blounge\b|courtyard|cabana/i },
  { fam: "amenity_weak", label: "Amenity (secondary)", re: /fitness|\bgym\b|\bgrill\b|\bbbq\b|dog park|business center|mail|package|game room/i },
]
function classify(text: string): { fam: string; label: string } {
  for (const s of SCENE) if (s.re.test(text)) return { fam: s.fam, label: s.label }
  return { fam: "unknown", label: "Property photo" }
}
function inferType(name: string, hints: string): string {
  const b = `${name} ${hints}`.toLowerCase()
  if (/homes for rent|two.?story home|home exterior|attached.*garage|fenced (front )?yard|rental home|build.to.rent|townhome/.test(b)) return "BTR/Rental Homes"
  if (/\btower\b|high.?rise|floor.?to.?ceiling|rooftop|uptown|downtown|skyline/.test(b)) return "High-Rise/Mid-Rise"
  return "Garden/Conventional"
}
const PRIORITY: Record<string, string[]> = {
  "High-Rise/Mid-Rise": ["exterior", "rooftop_view", "pool", "kitchen", "living", "amenity_strong", "amenity_weak", "unknown"],
  "Garden/Conventional": ["pool", "exterior", "kitchen", "living", "amenity_strong", "rooftop_view", "amenity_weak", "unknown"],
  "BTR/Rental Homes": ["exterior", "kitchen", "living", "pool", "amenity_strong", "rooftop_view", "amenity_weak", "unknown"],
}

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
    if (Math.max(w, h) < MIN_LONG || Math.min(w, h) < MIN_SHORT) return { ok: false, w, h, reason: `too_small:${w}x${h}` }
    return { ok: true, w, h, mime }
  } catch (e) { return { ok: false, reason: `err:${(e as Error).name}` } }
}

type Cand = { url: string; alt: string; fam: string; label: string; ident: string }
function ident(u: string) { try { const x = new URL(u); return `${x.host}${x.pathname.split("/").pop()?.replace(/[-_]?\d{2,5}x\d{2,5}/, "").replace(/\.(jpe?g|png|webp)$/, "") ?? x.pathname}` } catch { return u } }

async function autoScroll(page: Page) {
  try { await page.evaluate(async () => { await new Promise<void>((res) => { let y = 0; const i = setInterval(() => { window.scrollBy(0, 900); y += 900; if (y > document.body.scrollHeight + 2000) { clearInterval(i); res() } }, 120) }) }); await page.waitForTimeout(700) } catch { /**/ }
}

const PROVIDER_HOST = /entrata|rentcafe|cloudinary|myrazz|ucarecdn|apts247|website-files|cdn-website|myleasestar|swifty|multihub|scene7|cachefly|s3[.-]|blob\.core|cloudfront|googleusercontent/i
// Parse <img> tags out of an HTML string (server-rendered /photos/ page). srcset-aware; captures alt/title.
function parseHtmlImgs(html: string): { url: string; alt: string }[] {
  const out: { url: string; alt: string }[] = []
  for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
    const tag = m[0]
    let src = ""
    const srcset = /\bsrcset=["']([^"']+)["']/i.exec(tag)?.[1]
    if (srcset) { const e = srcset.split(/,\s+/).map((x) => x.trim().split(/\s+/)[0]).filter(Boolean); if (e.length) src = e[e.length - 1] }
    if (!src) src = /\b(?:data-src|data-lazy-src|data-original)=["']([^"']+)["']/i.exec(tag)?.[1] ?? ""
    if (!src) src = /\bsrc=["']([^"']+)["']/i.exec(tag)?.[1] ?? ""
    if (!src || !PROVIDER_HOST.test(src)) continue
    const alt = (/\balt=["']([^"']*)["']/i.exec(tag)?.[1] ?? "").trim()
    const title = (/\btitle=["']([^"']*)["']/i.exec(tag)?.[1] ?? "").trim()
    out.push({ url: src, alt: `${alt} ${title}`.trim() })
  }
  return out
}

async function extractGallery(page: Page, siteUrl: string): Promise<{ provider: string; candidates: { url: string; alt: string }[]; challenged: boolean }> {
  await page.goto(siteUrl, { waitUntil: "domcontentloaded", timeout: 30000 })
  await page.waitForTimeout(3000)
  const title = await page.title().catch(() => "")
  if (/just a moment|checking your browser|attention required|access denied|verify you are human/i.test(title)) return { provider: "blocked", candidates: [], challenged: true }
  // rendered homepage provider imgs (hero/preview)
  const homeImgs: { url: string; alt: string }[] = await page.evaluate(() => [...document.querySelectorAll("img")].map((i) => ({ url: (i as HTMLImageElement).currentSrc || (i as HTMLImageElement).src || i.getAttribute("data-src") || "", alt: `${i.getAttribute("alt") || ""} ${i.getAttribute("title") || ""}`.trim() })).filter((o) => o.url)).catch(() => [])
  // find the public /photos/ (or gallery) page and SAME-ORIGIN FETCH its server-rendered HTML
  // (this is the prototype's proven path — the browser context is already past Cloudflare).
  const photos = await page.$$eval('a[href*="photo" i],a[href*="gallery" i]', (as) => as.map((a) => (a as HTMLAnchorElement).href).filter((h) => /photo|gallery/i.test(h))[0] ?? null).catch(() => null)
  let photosHtml = ""
  if (photos) photosHtml = await page.evaluate(async (u) => { try { const r = await fetch(u, { credentials: "include" }); return r.ok ? await r.text() : "" } catch { return "" } }, photos).catch(() => "")
  const map = new Map<string, { url: string; alt: string }>()
  const add = (url: string, alt: string) => { const k = url.split("?")[0].replace(/\/fit-in\/\d+x\d+/i, ""); if (!/\/fit-in\/\d{2,3}x\d{2,3}\//i.test(url) && !map.has(k)) map.set(k, { url: k, alt: (map.get(k)?.alt || alt).trim() }) }
  for (const o of parseHtmlImgs(photosHtml)) add(o.url, o.alt)
  // JSON/page-state provider URLs in the fetched HTML (galleries stored as data, e.g. Park at River Oaks)
  for (const mm of photosHtml.matchAll(/https:\/\/(?:medialibrarycfo\.entrata\.com|resource\.rentcafe\.com|[a-z0-9.-]*cloudinary[^"'\\ )]*\/uploads|images\.myrazz\.com)[^"'\\ )]+?\.(?:jpe?g|png|webp)/gi)) add(mm[0], "")
  // homepage imgs as backup coverage
  for (const o of homeImgs) if (PROVIDER_HOST.test(o.url)) add(o.url, o.alt)
  const candidates = [...map.values()]
  return { provider: detectProvider(candidates.map((c) => c.url)), candidates, challenged: false }
}

async function main() {
  const { enrichProperty } = await import("@/lib/propertyEnrichment/writer")
  const { SupabaseEnrichmentStore } = await import("@/lib/propertyEnrichment/stores/supabaseStore")
  const { supabaseAdmin } = await import("@/lib/supabase/admin")
  const store = new SupabaseEnrichmentStore()
  const cohort: { place_id: string; name?: string; market?: string; url: string; slot?: string }[] = JSON.parse(fs.readFileSync(COHORT, "utf8"))
  const targets = LIMIT ? cohort.slice(0, LIMIT) : cohort
  const ledger: Record<string, unknown> = fs.existsSync(LEDGER) ? JSON.parse(fs.readFileSync(LEDGER, "utf8")) : {}
  const sheet: Record<string, unknown>[] = []
  const now = () => new Date().toISOString()
  const rej: Record<string, number> = {}; const bump = (k: string) => { rej[k] = (rej[k] ?? 0) + 1 }
  const primScenes: Record<string, number> = {}, fbScenes: Record<string, number> = {}, providers: Record<string, number> = {}
  let done = 0, skipped = 0, failed = 0, mreview = 0, wroteP = 0, wroteF = 0, altUsed = 0, candTot = 0

  console.log(`RENDERED recovery — cohort ${targets.length} · mode ${CONFIRM ? "CONFIRM(writes)" : "DRY"}`)
  const browser = await chromium.launch({ headless: true })
  const ctx = await browser.newContext({ userAgent: UA, viewport: { width: 1366, height: 900 }, locale: "en-US" })

  for (const tgt of targets) {
    const pid = tgt.place_id
    if ((ledger[pid] as { status?: string })?.status === "done" || (ledger[pid] as { status?: string })?.status === "skipped_locked") { skipped++; continue }
    // Gap-fill guard: read live slot states.
    const { data: row } = await supabaseAdmin.from("property_catalog").select("image_selection_state, image_backup_state, property_image_url, property_image_url_backup, website_url, property_name, property_type, inventory_type").eq("place_id", pid).single()
    if (!row) { ledger[pid] = { status: "failed", reason: "not_found" }; failed++; continue }
    const needPrimary = row.image_selection_state === "missing" && !row.property_image_url
    const needFallback = row.image_backup_state === "missing" && !row.property_image_url_backup
    if (!needPrimary && !needFallback) { ledger[pid] = { status: "skipped_locked", reason: "both slots locked" }; skipped++; continue }
    const site = row.website_url || tgt.url
    const type = inferType(row.property_name || tgt.name || "", `${row.property_type ?? ""} ${row.inventory_type ?? ""}`)
    const page = await ctx.newPage()
    try {
      const gal = await extractGallery(page, site)
      if (gal.challenged) { ledger[pid] = { status: "needs_manual_review", reason: "challenged/blocked" }; mreview++; continue }
      providers[gal.provider] = (providers[gal.provider] ?? 0) + 1
      candTot += gal.candidates.length
      // cheap metadata reject → build survivor candidates with scene + type-aware ordering
      const survivors: Cand[] = []
      for (const c of gal.candidates) {
        const mr = metadataReject(c.url, c.alt); if (mr) { bump(mr); continue }
        if (c.alt) altUsed++
        const sc = classify(`${c.alt} ${c.url}`)
        survivors.push({ url: c.url, alt: c.alt, fam: sc.fam, label: sc.label, ident: ident(c.url) })
      }
      // type-aware ordering (scene family priority; unknown last)
      const prio = PRIORITY[type]
      survivors.sort((a, b) => prio.indexOf(a.fam) - prio.indexOf(b.fam))
      // pick Primary: first survivor that validates AND passes the visual gate
      async function pick(exclude?: Cand): Promise<(Cand & { w: number; h: number }) | null> {
        for (const c of survivors) {
          if (exclude && (c.ident === exclude.ident || c.url === exclude.url)) continue
          if (exclude && c.fam === exclude.fam && exclude.fam !== "unknown") continue // prefer different scene for fallback
          const v = await validate(c.url); if (!v.ok) { bump(v.reason?.split(":")[0] ?? "invalid"); continue }
          const g = await classifyPropertyImage(c.url)
          if (g.verdict === "reject") { bump(`visual_${g.category}`); continue }
          if (g.verdict === "error") { bump("visual_error"); continue }
          return { ...c, w: v.w!, h: v.h! }
        }
        return null
      }
      const primary = needPrimary ? await pick() : null
      // fallback: different scene, also gated. (fill fallback whenever the slot is missing)
      const fbExclude = primary ?? (row.property_image_url ? ({ ident: ident(row.property_image_url), url: row.property_image_url, fam: "unknown", alt: "", label: "" } as Cand) : undefined)
      const fallback = needFallback ? await pick(fbExclude ?? undefined) : null

      const fields: { field: string; value: unknown; sourceType: "official_property_site"; sourceReference: string; verificationStatus: "verified"; checkedAt: string }[] = []
      const prov = { sourceType: "official_property_site" as const, sourceReference: site, verificationStatus: "verified" as const, checkedAt: now() }
      if (primary && needPrimary) fields.push(
        { field: "property_image_url", value: primary.url, ...prov },
        { field: "property_image_source", value: `website:gallery:${gal.provider}`, ...prov },
        { field: "property_image_source_detail", value: `primary=${primary.label}`, ...prov },
        { field: "property_image_status", value: "valid", ...prov },
        { field: "property_image_verified_at", value: now(), ...prov },
        { field: "property_image_checked_at", value: now(), ...prov },
      )
      if (fallback && needFallback) fields.push(
        { field: "property_image_url_backup", value: fallback.url, ...prov },
        { field: "property_image_backup_source", value: `website:gallery:${gal.provider}`, ...prov },
        { field: "property_image_backup_source_detail", value: `fallback=${fallback.label}`, ...prov },
        { field: "property_image_backup_status", value: "valid", ...prov },
        { field: "property_image_backup_verified_at", value: now(), ...prov },
        { field: "property_image_backup_checked_at", value: now(), ...prov },
      )
      if (!fields.length) { ledger[pid] = { status: "needs_manual_review", reason: "no_gated_candidate", provider: gal.provider }; mreview++; continue }
      if (CONFIRM) {
        const res = await enrichProperty(store, { placeId: pid, jobId: "image_recovery_rendered", fields })
        if (res.results.find((r) => r.field === "property_image_url")?.outcome === "written") wroteP++
        if (res.results.find((r) => r.field === "property_image_url_backup")?.outcome === "written") wroteF++
      }
      if (primary) primScenes[primary.label] = (primScenes[primary.label] ?? 0) + 1
      if (fallback) fbScenes[fallback.label] = (fbScenes[fallback.label] ?? 0) + 1
      ledger[pid] = { status: "done", provider: gal.provider, type, primary: primary?.url, primaryScene: primary?.label, fallback: fallback?.url, fallbackScene: fallback?.label }
      sheet.push({ pid, name: row.property_name, market: tgt.market, type, provider: gal.provider, primary: primary ? { url: primary.url, scene: primary.label, dims: `${primary.w}x${primary.h}` } : null, fallback: fallback ? { url: fallback.url, scene: fallback.label, dims: `${fallback.w}x${fallback.h}` } : null })
      done++
    } catch (e) { ledger[pid] = { status: "failed", reason: `err:${(e as Error).name}:${(e as Error).message.slice(0, 50)}` }; failed++ }
    finally { await page.close().catch(() => {}) }
    fs.writeFileSync(LEDGER, JSON.stringify(ledger, null, 1))
  }
  await browser.close()
  if (SHEET) fs.writeFileSync(`${S}/rendered_sheet.json`, JSON.stringify(sheet, null, 1))
  console.log(JSON.stringify({ cohort: targets.length, done, skipped, failed, needs_manual_review: mreview, wrotePrimary: wroteP, wroteFallback: wroteF,
    providers, primaryScenes: primScenes, fallbackScenes: fbScenes, altAvailability: `${altUsed}/${candTot}`, rejections: rej }, null, 1))
}
main().catch((e) => { console.error(e); process.exit(1) })
