// Property Image Intelligence v1.1 — STRUCTURED IMAGE DISCOVERY (pure, no I/O).
//
// Deterministic extractors that pull official image candidates from a page's OWN structured data —
// before any conventional /gallery route guessing. Sources (audit-proven): embedded gallery JSON,
// Next.js __NEXT_DATA__ / page-state, Sitecore/JSS state, JSON-LD ImageObject, inline script gallery
// objects, and srcset/imagesrcset. Each candidate carries whatever structured evidence exists
// (alt text, declared width/height) so downstream can pre-rank and dedupe with LESS vision.
//
// These functions operate on an HTML string. They never fetch. v1.0 is unchanged.

export type RawCand = {
  url: string
  alt: string
  w?: number
  h?: number
  mechanism: string // which extractor found it (for the canary report)
}

const IMG_EXT = /\.(jpe?g|png|webp|avif)(?:[?#]|$)/i
const dec = (s: string) => s.replace(/&amp;/g, "&").replace(/&#x2F;/gi, "/").replace(/\\u002F/gi, "/").replace(/\\\//g, "/")
const clean = (u: string) => dec(String(u || "")).trim()
// Resolve a possibly-relative URL against the page base (protocol-relative and root/relative paths are
// common on custom sites); returns "" if it can't be made absolute. When no base is given, only
// already-absolute URLs survive (keeps the pure functions usable without I/O context).
let BASE = ""
const abs = (u: string): string => {
  if (!u) return ""
  if (/^https?:\/\//i.test(u)) return u
  if (/^\/\//.test(u)) return "https:" + u
  if (!BASE) return ""
  try { return new URL(u, BASE).toString() } catch { return "" }
}
const isPhoto = (raw: string) => { const u = abs(raw); return /^https?:\/\//i.test(u) && IMG_EXT.test(u) && !/\.svg(\?|#|$)/i.test(u) ? u : "" }

/** Set the page base URL used to resolve relative candidates for the next extraction calls. */
export function setBase(base: string) { BASE = base || "" }

/** srcset / imagesrcset — take the LARGEST width candidate from each set. */
export function fromSrcset(html: string): RawCand[] {
  const out: RawCand[] = []
  for (const m of html.matchAll(/\b(?:srcset|imagesrcset|data-srcset)=["']([^"']+)["']/gi)) {
    const entries = m[1].split(",").map((e) => e.trim()).map((e) => {
      const [u, w] = e.split(/\s+/); return { u: isPhoto(clean(u)), w: /(\d+)w/.test(w || "") ? +(w.match(/(\d+)w/)![1]) : 0 }
    }).filter((e) => e.u)
    if (!entries.length) continue
    entries.sort((a, b) => b.w - a.w)
    out.push({ url: entries[0].u, alt: "", w: entries[0].w || undefined, mechanism: "srcset" })
  }
  return out
}

/** Plain / lazy <img> src, srcset-fallback aware. */
export function fromImgTags(html: string): RawCand[] {
  const out: RawCand[] = []
  for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
    const tag = m[0]
    let src = ""
    const ss = /\bsrcset=["']([^"']+)["']/i.exec(tag)?.[1]
    if (ss) { const e = ss.split(",").map((x) => isPhoto(clean(x.trim().split(/\s+/)[0]))).filter(Boolean); if (e.length) src = e[e.length - 1] }
    if (!src) src = isPhoto(clean(/\b(?:data-src|data-lazy-src|data-original|data-lazy)=["']([^"']+)["']/i.exec(tag)?.[1] ?? ""))
    if (!src) src = isPhoto(clean(/\bsrc=["']([^"']+)["']/i.exec(tag)?.[1] ?? ""))
    if (!src) continue
    const alt = clean(/\balt=["']([^"']*)["']/i.exec(tag)?.[1] ?? "")
    const title = clean(/\btitle=["']([^"']*)["']/i.exec(tag)?.[1] ?? "")
    out.push({ url: src, alt: `${alt} ${title}`.trim(), mechanism: "img" })
  }
  return out
}

/** JSON-LD blocks: schema.org ImageObject/Photograph + image/photo arrays on REAL schema nodes (those
 *  carrying an @type), so arbitrary non-JSON-LD data blobs are not mis-mined as "json-ld". */
export function fromJsonLd(html: string): RawCand[] {
  const out: RawCand[] = []
  for (const m of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    let j: unknown
    try { j = JSON.parse(m[1].trim()) } catch { continue }
    walk(j, (node) => {
      const o = node as any
      const t = String(o["@type"] ?? "")
      if (!t) return // only mine nodes that are actual schema.org entities
      if (/ImageObject|Photograph/i.test(t)) {
        const url = isPhoto(clean(o.contentUrl ?? o.url ?? ""))
        if (url) out.push({ url, alt: clean(o.caption ?? o.name ?? ""), w: num(o.width), h: num(o.height), mechanism: "json-ld" })
      }
      for (const key of ["image", "photo", "photos", "images"]) {
        const v = o[key]
        for (const item of Array.isArray(v) ? v : v != null ? [v] : []) {
          if (typeof item === "string") { const u = isPhoto(clean(item)); if (u) out.push({ url: u, alt: "", mechanism: "json-ld" }) }
          else if (item && typeof item === "object") {
            const url = isPhoto(clean((item as any).contentUrl ?? (item as any).url ?? ""))
            if (url) out.push({ url, alt: clean((item as any).caption ?? (item as any).name ?? ""), w: num((item as any).width), h: num((item as any).height), mechanism: "json-ld" })
          }
        }
      }
    })
  }
  return out
}

/** Sitecore / embedded page-metadata gallery (e.g. MAA `search:data` in __NEXT_DATA__): the gallery
 *  objects are entity-encoded JSON with sitecorecloud.io image URLs + alt + w/h. Tag precisely so
 *  provenance records "sitecore-embedded", NOT "json-ld" (JSON-LD there only carries hero/floorplan). */
export function fromSitecore(html: string): RawCand[] {
  const out: RawCand[] = []; const seen = new Set<string>()
  const d = dec(html)
  // {"src":"https://…sitecorecloud.io/…jpg?…","alt":"…"} with optional width/height nearby
  for (const m of d.matchAll(/"(?:src|url|imageUrl|contentUrl)"\s*:\s*"(https:\/\/[^"]*sitecorecloud\.io[^"]+?)"(?:[^{}]*?"(?:alt|altText|caption)"\s*:\s*"([^"]*)")?/gi)) {
    const url = isPhoto(clean(m[1])); if (!url || seen.has(url)) continue; seen.add(url)
    out.push({ url, alt: clean(m[2] ?? ""), mechanism: "sitecore-embedded" })
  }
  return out
}

/** Broad last-resort scan of the entity-decoded HTML for provider/content photo URLs that live outside
 *  <img> (CSS background-image, lightbox JSON, Webflow galleries, inline scripts). Quality is still fully
 *  enforced downstream by metadata reject + dimension validation + the frozen visual gate, so a wide
 *  collect only widens coverage; it never lowers the bar. Mirrors v1.0's rendered-recovery content scan. */
const SCAN_HOST = /website-files\.com|cachefly\.net|myrazz\.com|sitecorecloud\.io|cloudinary\.com|rentcafe\.com|myleasestar\.com|apts247\.info|entrata\.com|cloudfront\.net|amazonaws\.com|googleusercontent/i
const SCAN_CONTENT = /\/(?:uploads|images?|media|gallery|photos?|photogallery|assets|content|wp-content|files|img)\/[^"'\\ )]*\.(?:jpe?g|png|webp)/i
export function fromHtmlScan(html: string): RawCand[] {
  const out: RawCand[] = []; const seen = new Set<string>()
  const d = dec(html)
  for (const m of d.matchAll(/https?:\/\/[^"'\\ )(]+?\.(?:jpe?g|png|webp)(?:\?[^"'\\ )(]*)?/gi)) {
    const raw = m[0]
    if (!(SCAN_HOST.test(raw) || SCAN_CONTENT.test(raw))) continue
    const u = isPhoto(raw); if (!u || seen.has(u)) continue; seen.add(u)
    out.push({ url: u, alt: "", mechanism: "html-scan" })
  }
  return out
}

/** Next.js __NEXT_DATA__ / JSS / embedded page-state: walk the JSON for {url/src, alt, width, height}. */
export function fromNextData(html: string): RawCand[] {
  const out: RawCand[] = []
  const blocks: string[] = []
  const nd = html.match(/<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i)
  if (nd) blocks.push(nd[1])
  for (const m of html.matchAll(/<script[^>]*>\s*(?:window\.__(?:JSS_STATE|PRELOADED_STATE|INITIAL_STATE|APOLLO_STATE)__|self\.__next_f\.push)\s*=?\s*\(?([\s\S]*?)\)?<\/script>/gi)) blocks.push(m[1])
  for (const b of blocks) {
    let j: unknown
    try { j = JSON.parse(b.trim().replace(/^[^[{]*/, "").replace(/;?\s*$/, "")) } catch { collectFromText(b, out); continue }
    walk(j, (node) => {
      const o = node as any
      const url = isPhoto(clean(o.src ?? o.url ?? o.imageUrl ?? o.image ?? o.contentUrl ?? o.original ?? o.large ?? ""))
      if (url) out.push({ url, alt: clean(o.alt ?? o.altText ?? o.caption ?? o.title ?? o.name ?? ""), w: num(o.width ?? o.w), h: num(o.height ?? o.h), mechanism: /sitecorecloud\.io/i.test(url) ? "sitecore-embedded" : "next-data" })
    })
  }
  return out
}

/** Inline "gallery"/"photos" JSON objects/arrays in ordinary <script> (non-Next custom builds). */
export function fromGalleryJson(html: string): RawCand[] {
  const out: RawCand[] = []
  for (const m of html.matchAll(/["'](?:gallery|galleryImages|propertyGallery|photos|slides|carousel)["']\s*:\s*(\[[\s\S]*?\])/gi)) {
    let arr: unknown
    try { arr = JSON.parse(m[1]) } catch { collectFromText(m[1], out); continue }
    walk(arr, (node) => {
      const o = node as any
      const url = isPhoto(clean(o.src ?? o.url ?? o.image ?? o.imageUrl ?? o.original ?? o.full ?? ""))
      if (url) out.push({ url, alt: clean(o.alt ?? o.caption ?? o.title ?? ""), w: num(o.width), h: num(o.height), mechanism: "gallery-json" })
    })
  }
  return out
}

/** Discover a SMALL number of SAME-ORIGIN official photo pages from the page's own nav links, restricted
 *  to the approved recovery ladder. Blog/neighborhood articles, careers, legal, corporate and external
 *  links are excluded (whitelist-only + explicit deny). Floorplan PAGES are allowed for the property
 *  PHOTOS on them; floorplan-diagram images are still rejected downstream by metadata + the visual gate. */
export function internalPhotoLinks(html: string, baseUrl: string): string[] {
  const want = /(gallery|photos|amenit|features|community|residences|apartments|interior|floor.?plans?|models?)/i
  const deny = /(blog|news|article|neighborhood|careers?|jobs|privacy|terms|legal|cookie|sitemap|contact|about-us|corporate|investor)/i
  const base = safeUrl(baseUrl)
  const found = new Map<string, string>()
  for (const m of html.matchAll(/<a\b[^>]*\bhref=["']([^"'#]+)["'][^>]*>/gi)) {
    const raw = clean(m[1]); if (!raw || /^(mailto:|tel:|javascript:)/i.test(raw)) continue
    const abs = safeUrl(raw, baseUrl); if (!abs || !base) continue
    if (abs.host !== base.host) continue // SAME verified official host only
    if (deny.test(abs.pathname)) continue // never blog/neighborhood/careers/legal/etc.
    if (!want.test(abs.pathname)) continue
    const key = abs.pathname.replace(/\/$/, "").toLowerCase()
    if (!found.has(key)) found.set(key, abs.toString())
  }
  // rank the most photo-likely routes first
  const rank = (u: string) => {
    const p = u.toLowerCase()
    return /gallery|\/photos/.test(p) ? 0 : /amenit/.test(p) ? 1 : /interior|residences|apartments/.test(p) ? 2 : /features|community/.test(p) ? 3 : 4
  }
  return [...found.values()].sort((a, b) => rank(a) - rank(b))
}

// ── helpers ──
function num(v: unknown): number | undefined { const n = typeof v === "string" ? parseInt(v, 10) : typeof v === "number" ? v : NaN; return Number.isFinite(n) && n > 0 ? n : undefined }
function safeUrl(u: string, base?: string): URL | null { try { return base ? new URL(u, base) : new URL(u) } catch { return null } }
function walk(node: unknown, visit: (o: object) => void, depth = 0) {
  if (!node || depth > 12) return
  if (Array.isArray(node)) { for (const x of node) walk(x, visit, depth + 1); return }
  if (typeof node === "object") { visit(node as object); for (const v of Object.values(node as object)) if (v && typeof v === "object") walk(v, visit, depth + 1) }
}
// last-resort: pull any photo URLs out of a script string we couldn't JSON.parse
function collectFromText(text: string, out: RawCand[]) {
  for (const m of dec(text).matchAll(/https?:\/\/[^"'\\ )]+?\.(?:jpe?g|png|webp)(?:\?[^"'\\ )]*)?/gi)) { const u = isPhoto(m[0]); if (u) out.push({ url: u, alt: "", mechanism: "script-scan" }) }
}
