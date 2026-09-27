// Property Image Intelligence v1.1 — DISCOVERY ORCHESTRATION (I/O).
//
// Composes the v1.1 discovery order over a single verified official website:
//   fetch static page → (render with Playwright when static is blocked/thin or provider needs it)
//   → structured extraction (next-data / json-ld / gallery-json / srcset / img)
//   → full-resolution CDN normalization
//   → same-origin alternate photo-page discovery (from the page's own nav links)
//   → dedupe identical underlying assets/renditions BEFORE any expensive processing.
// Returns candidate URLs each carrying discovery evidence (mechanism, source page, declared dims).
// The frozen technical validation + metadata reject + visual gate + ranking run in engine.ts.
//
// Deterministic where possible; the browser is used only when necessary (Entrata etc.). v1.0 unchanged.
import type { Browser } from "playwright"
import { assetIdentity } from "../imageEngine"
import { normalizeToFullRes, providerOf, dedupeKey } from "./normalize"
import { fromSrcset, fromImgTags, fromJsonLd, fromNextData, fromGalleryJson, fromSitecore, fromHtmlScan, internalPhotoLinks, setBase, type RawCand } from "./structured"

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"

export type DiscoveredCand = {
  discoveredUrl: string            // exact URL found in the page (post entity-decode)
  candidateUrls: string[]          // normalized full-res requests to try, ordered; last = discovered
  alt: string
  declaredW?: number
  declaredH?: number
  mechanism: string                // discovery mechanism (next-data / json-ld / srcset / img / alt-page / …)
  sourcePage: string               // which page it came from
  provider: string
  ident: string                    // assetIdentity for dedupe
}

export type DiscoveryResult = {
  website: string
  rendered: boolean
  blocked: boolean
  provider: string
  pagesInspected: string[]
  candidates: DiscoveredCand[]
  rawCount: number                 // total raw hits before dedupe (proves dedupe happened)
}

async function getStatic(url: string, ms = 15000): Promise<{ ok: boolean; status: number; html: string; finalUrl: string; blocked: boolean }> {
  const ac = new AbortController(); const t = setTimeout(() => ac.abort(), ms)
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml,*/*" }, redirect: "follow", signal: ac.signal }).finally(() => clearTimeout(t))
    const ct = r.headers.get("content-type") || ""
    const html = /text|html|json/.test(ct) ? (await r.text()).slice(0, 1500000) : ""
    const blocked = r.status === 403 || r.status === 429 || /just a moment|checking your browser|attention required|verify you are human/i.test(html.slice(0, 4000))
    return { ok: r.ok && !blocked, status: r.status, html, finalUrl: r.url, blocked }
  } catch { return { ok: false, status: 0, html: "", finalUrl: url, blocked: false } }
}

async function getRendered(browser: Browser, url: string): Promise<{ html: string; finalUrl: string; blocked: boolean; extraHtml: string }> {
  const ctx = await browser.newContext({ userAgent: UA, viewport: { width: 1366, height: 900 }, locale: "en-US" })
  const page = await ctx.newPage()
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 })
    await page.waitForTimeout(2500)
    const title = await page.title().catch(() => "")
    if (/just a moment|checking your browser|attention required|verify you are human/i.test(title)) return { html: "", finalUrl: url, blocked: true, extraHtml: "" }
    // gentle scroll to trigger lazy galleries
    try { await page.evaluate(async () => { await new Promise<void>((res) => { let y = 0; const i = setInterval(() => { window.scrollBy(0, 1000); y += 1000; if (y > document.body.scrollHeight + 1500) { clearInterval(i); res() } }, 100) }) }); await page.waitForTimeout(600) } catch { /* noop */ }
    const html = await page.content().catch(() => "")
    // also capture rendered <img> currentSrc (post-lazy) as extra HTML-ish fragment
    const imgs: string[] = await page.evaluate(() => [...document.querySelectorAll("img")].map((i) => { const el = i as HTMLImageElement; return `<img src="${el.currentSrc || el.src || ""}" alt="${(i.getAttribute("alt") || "").replace(/"/g, "")}">` }).filter((s) => /src="http/.test(s))).catch(() => [])
    return { html, finalUrl: page.url(), blocked: false, extraHtml: imgs.join("\n") }
  } catch { return { html: "", finalUrl: url, blocked: false, extraHtml: "" } }
  finally { await ctx.close().catch(() => {}) }
}

function extractAll(html: string, sourcePage: string): RawCand[] {
  if (!html) return []
  setBase(sourcePage) // resolve relative img/srcset URLs against the page they were found on
  // Structured/high-confidence sources first, then a broad HTML scan for photos outside <img>
  // (CSS background, lightbox, Webflow galleries). Dedupe downstream keeps the best-labeled hit.
  return [
    ...fromSitecore(html),
    ...fromNextData(html),
    ...fromJsonLd(html),
    ...fromGalleryJson(html),
    ...fromSrcset(html),
    ...fromImgTags(html),
    ...fromHtmlScan(html),
  ]
}

/** Full discovery for one property. `browser` is optional; when omitted, only static discovery runs. */
export async function discover(website: string, opts: { browser?: Browser; forceRender?: boolean; maxAltPages?: number } = {}): Promise<DiscoveryResult> {
  const pagesInspected: string[] = []
  const raw: (RawCand & { sourcePage: string })[] = []

  // 1) static homepage
  const stat = await getStatic(website)
  pagesInspected.push(website)
  let rendered = false, blocked = false
  let homeHtml = stat.html
  let base = stat.finalUrl || website
  const staticHits = stat.html ? extractAll(stat.html, website) : []

  // 2) render when blocked, thin, or explicitly required (e.g. Entrata static 403)
  const thin = staticHits.filter((c) => c.mechanism !== "img").length < 2 && staticHits.length < 6
  if (opts.browser && (stat.blocked || opts.forceRender || (!stat.ok && stat.status !== 200) || thin)) {
    const r = await getRendered(opts.browser, website)
    if (r.blocked) blocked = true
    if (r.html) { rendered = true; homeHtml = r.html + "\n" + r.extraHtml; base = r.finalUrl }
  }
  for (const c of extractAll(homeHtml, base)) raw.push({ ...c, sourcePage: base })

  // 3) same-origin alternate photo pages (from the page's OWN nav links)
  const links = internalPhotoLinks(homeHtml, base).slice(0, opts.maxAltPages ?? 4)
  for (const link of links) {
    let html = ""
    const s = await getStatic(link, 12000)
    if (s.ok && s.html) html = s.html
    else if (opts.browser) { const r = await getRendered(opts.browser, link); if (r.html) { html = r.html + "\n" + r.extraHtml; rendered = true } }
    if (!html) continue
    pagesInspected.push(link)
    const before = raw.length
    for (const c of extractAll(html, link)) raw.push({ ...c, sourcePage: link })
    // stop early once we clearly have enough distinct assets
    if (raw.length - before > 0 && dedupeCount(raw) >= 12) break
  }

  // 4) normalize (full-res) + dedupe by underlying asset identity BEFORE expensive processing
  const byIdent = new Map<string, DiscoveredCand>()
  for (const c of raw) {
    const norm = normalizeToFullRes(c.url)
    const ident = dedupeKey(c.url, assetIdentity)
    const existing = byIdent.get(ident)
    if (existing) { if (!existing.alt && c.alt) existing.alt = c.alt; continue } // keep first, enrich alt; DEDUPE renditions
    byIdent.set(ident, {
      discoveredUrl: c.url,
      candidateUrls: norm.candidates,
      alt: c.alt,
      declaredW: c.w, declaredH: c.h,
      mechanism: c.mechanism + (c.sourcePage !== base ? "@alt-page" : ""),
      sourcePage: c.sourcePage,
      provider: norm.provider,
      ident,
    })
  }
  const candidates = [...byIdent.values()]
  const provider = candidates.length ? mode(candidates.map((c) => c.provider)) : providerOf(website)
  return { website, rendered, blocked, provider, pagesInspected, candidates, rawCount: raw.length }
}

function dedupeCount(raw: { url: string }[]): number { return new Set(raw.map((r) => assetIdentity(r.url))).size }
function mode(a: string[]): string { const m: Record<string, number> = {}; let best = a[0], n = 0; for (const x of a) { m[x] = (m[x] || 0) + 1; if (m[x] > n) { n = m[x]; best = x } } return best }
