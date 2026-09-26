// BATCH 0 — dry characterization re-probe of missing-image properties WITH a website.
// Reuses the production pipeline (safeFetch → collectImageCandidates → scorePropertyImage →
// rankPropertyImages) plus real reachability + sharp dimension validation on the top candidates.
// Classifies each property into RECOVERABLE_NOW / NEEDS_RENDERED_WEB / NO_ACCEPTABLE_IMAGE /
// DEAD_OR_INVALID_SOURCE. WRITES NOTHING to property_catalog. Read-only characterization.
// Run: npx tsx scripts/propertyIntel/image_probe_batch0.ts [--limit=N] [--concurrency=8]
import fs from "node:fs"; import path from "node:path"
;(() => { const p = path.join(process.cwd(), ".env.local"); for (const l of fs.readFileSync(p, "utf8").split("\n")) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "") } })()
const S = "/private/tmp/claude-501/-Users-jaymorris-Desktop-lonestar-locators-app/30160563-4dba-40ec-bd16-aeca0a940f8b/scratchpad"
const LIMIT = Number(process.argv.find((a) => a.startsWith("--limit="))?.split("=")[1] ?? 0)
const CONC = Number(process.argv.find((a) => a.startsWith("--concurrency="))?.split("=")[1] ?? 8)
const PAGE_TIMEOUT = 14000, IMG_TIMEOUT = 12000
// Minimum "strong primary" dimensions: longer side ≥ 800px, shorter side ≥ 450px.
const MIN_LONG = 800, MIN_SHORT = 450
const UA = "Mozilla/5.0 (compatible; LocatorBeastImageProbe/1.0; +https://locatorbeast.com)"
const JS_PLATFORM = /switch_cls|rentcafe|securecafe|residentportal|entrata|prospectportal|realpage|onesite|appfolio|funnelleasing|rooof/i
// Markers that the real photo gallery is populated by JS (client-side carousels / SPA shells),
// so the served HTML exposes only chrome. Deliberately EXCLUDES data-src/lazyload — imgGalleryCandidates
// already reads those, so their presence does NOT imply the photos are out of HTTP reach.
const JS_GALLERY = /swiper|slick[-"']|glightbox|fancybox|owl-carousel|flickity|__NEXT_DATA__|data-reactroot|window\.__NUXT|ng-version/i
const PARKED = /(domain (is )?for sale|buy this domain|parked (free|domain)|godaddy\.com\/domainsearch|hugedomains|sedo\.com|this domain (may be )?for sale|courtesy of \w+ hosting)/i

type Bucket = "RECOVERABLE_NOW" | "NEEDS_RENDERED_WEB" | "NO_ACCEPTABLE_IMAGE" | "DEAD_OR_INVALID_SOURCE"

function withTimeout(ms: number) { const ac = new AbortController(); const t = setTimeout(() => ac.abort(), ms); return { signal: ac.signal, done: () => clearTimeout(t) } }
function visibleTextLen(html: string): number {
  return html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().length
}
function regDomain(host: string): string { const p = host.replace(/^www\./, "").split("."); return p.slice(-2).join(".") }

async function main() {
  const { supabaseAdmin } = await import("@/lib/supabase/admin")
  const { safeFetch } = await import("@/lib/security/ssrfGuard")
  const { rankPropertyImages, collectImageCandidates } = await import("@/lib/leads/detectPropertyMetadata")
  const sharp = (await import("sharp")).default

  // Load the 561 missing-with-website properties (paginate past the 1000 cap; here <1000).
  const rows: { place_id: string; property_name: string | null; website_url: string; market: string | null; property_image_status: string | null }[] = []
  for (let from = 0; ; from += 1000) {
    const { data } = await supabaseAdmin.from("property_catalog")
      .select("place_id, property_name, website_url, market, property_image_status")
      .eq("image_selection_state", "missing").not("website_url", "is", null).neq("website_url", "")
      .order("place_id").range(from, from + 999)
    if (!data || !data.length) break
    rows.push(...(data as typeof rows)); if (data.length < 1000) break
  }
  const targets = LIMIT ? rows.slice(0, LIMIT) : rows
  console.log(`Batch 0 probe targets: ${targets.length} (concurrency ${CONC})  ·  WRITES NOTHING`)

  type Rec = {
    place_id: string; name: string | null; market: string | null; url: string; prior: string | null
    bucket: Bucket; reason: string; finalUrl?: string; httpStatus?: number; textLen?: number
    candidateCount?: number; chosen?: { url: string; source?: string; score: number; tier: number; w?: number; h?: number; contentType?: string }
    runnerUpScore?: number; validation?: string
  }
  const out: Rec[] = []
  let idx = 0
  async function worker() {
    while (idx < targets.length) {
      const i = idx++; const r = targets[i]
      const rec: Rec = { place_id: r.place_id, name: r.property_name, market: r.market, url: r.website_url, prior: r.property_image_status, bucket: "DEAD_OR_INVALID_SOURCE", reason: "" }
      try {
        const pt = withTimeout(PAGE_TIMEOUT)
        const resp = await safeFetch(r.website_url, { headers: { "User-Agent": UA, "Accept": "text/html,*/*", "Accept-Encoding": "identity" }, signal: pt.signal, maxRedirects: 4 }).finally(pt.done)
        if (!resp.ok) { rec.bucket = "DEAD_OR_INVALID_SOURCE"; rec.reason = `fetch_failed: ${resp.reason}`; out.push(rec); continue }
        rec.finalUrl = resp.finalUrl; rec.httpStatus = resp.response.status
        const ct = resp.response.headers.get("content-type") ?? ""
        // Blocked (bot-challenge / auth / rate-limit) → normal HTTP can't expose content → rendered/blocked bucket.
        if ([401, 403, 429].includes(resp.response.status)) { rec.bucket = "NEEDS_RENDERED_WEB"; rec.reason = `blocked_http_${resp.response.status}`; out.push(rec); continue }
        if (resp.response.status >= 400) { rec.bucket = "DEAD_OR_INVALID_SOURCE"; rec.reason = `http_${resp.response.status}`; out.push(rec); continue }
        if (!/text\/html|application\/xhtml/i.test(ct)) { rec.bucket = "DEAD_OR_INVALID_SOURCE"; rec.reason = `non_html_content:${ct.split(";")[0]}`; out.push(rec); continue }
        const html = await resp.response.text()
        rec.textLen = visibleTextLen(html)
        // Parked / unrelated-redirect detection.
        const startHost = (() => { try { return new URL(r.website_url.startsWith("http") ? r.website_url : `https://${r.website_url}`).host } catch { return "" } })()
        const finalHost = (() => { try { return new URL(resp.finalUrl).host } catch { return "" } })()
        if (PARKED.test(html)) { rec.bucket = "DEAD_OR_INVALID_SOURCE"; rec.reason = "parked_domain"; out.push(rec); continue }
        if (startHost && finalHost && regDomain(startHost) !== regDomain(finalHost) && rec.textLen < 500) { rec.bucket = "DEAD_OR_INVALID_SOURCE"; rec.reason = `redirected_offdomain:${finalHost}`; out.push(rec); continue }

        const rawCount = collectImageCandidates(html).length
        const ranked = rankPropertyImages(html, resp.finalUrl)
        rec.candidateCount = ranked.length
        ;(rec as Rec & { rawCandidates?: number }).rawCandidates = rawCount

        if (ranked.length === 0) {
          if (rawCount === 0) {
            // Served HTML exposes NO <img>/og/twitter/jsonld image at all → JS/CSS-injected or blocked.
            rec.bucket = "NEEDS_RENDERED_WEB"; rec.reason = rec.textLen < 300 ? "js_shell_no_text" : "no_images_in_served_html"
          } else if (JS_GALLERY.test(html) || JS_PLATFORM.test(resp.finalUrl)) {
            // Images present were only chrome/logos; a JS carousel/lazy gallery holds the real photos.
            rec.bucket = "NEEDS_RENDERED_WEB"; rec.reason = `js_gallery_only_chrome_in_html(raw=${rawCount})`
          } else {
            // Plain static page whose only images are logos/badges/floorplans — no real photo even rendered.
            rec.bucket = "NO_ACCEPTABLE_IMAGE"; rec.reason = `only_chrome_images_static(raw=${rawCount})`
          }
          out.push(rec); continue
        }

        // Validate top candidates (reachable + is image + dimensions) — walk down until one passes (cap 3).
        rec.runnerUpScore = ranked[1]?.score
        let passed: Rec["chosen"] | null = null
        let lastFail = ""
        for (const cand of ranked.slice(0, 3)) {
          const it = withTimeout(IMG_TIMEOUT)
          try {
            const ir = await safeFetch(cand.url, { headers: { "User-Agent": UA, "Accept": "image/*,*/*", "Range": "bytes=0-393215" }, signal: it.signal, maxRedirects: 3 }).finally(it.done)
            if (!ir.ok) { lastFail = `unreachable:${ir.reason}`; continue }
            if (ir.response.status >= 400) { lastFail = `img_http_${ir.response.status}`; continue }
            const ictype = ir.response.headers.get("content-type") ?? ""
            if (!/^image\//i.test(ictype)) { lastFail = `not_image:${ictype.split(";")[0] || "unknown"}`; continue }
            const buf = Buffer.from(await ir.response.arrayBuffer())
            let meta: { width?: number; height?: number; format?: string }
            try { meta = await sharp(buf).metadata() } catch (e) { lastFail = `undecodable_image`; continue }
            const w = meta.width ?? 0, h = meta.height ?? 0
            const long = Math.max(w, h), short = Math.min(w, h)
            if (long < MIN_LONG || short < MIN_SHORT) { lastFail = `too_small:${w}x${h}`; continue }
            passed = { url: cand.url, source: cand.source, score: cand.score, tier: Math.min(5, Math.max(1, Math.floor(cand.score / 1000))), w, h, contentType: ictype.split(";")[0] }
            break
          } catch (e) { lastFail = `img_error:${(e as Error).name}` } finally { it.done() }
        }
        if (passed) {
          rec.bucket = "RECOVERABLE_NOW"; rec.chosen = passed
          rec.reason = `top score ${passed.score} (tier ${passed.tier}, ${passed.source}); runner-up ${rec.runnerUpScore ?? "none"}`
          rec.validation = `reachable image ${passed.w}x${passed.h} ${passed.contentType}`
        } else if (JS_GALLERY.test(html) || JS_PLATFORM.test(resp.finalUrl)) {
          rec.bucket = "NEEDS_RENDERED_WEB"; rec.reason = `js_gallery_top_candidates_invalid: ${lastFail}`; rec.validation = lastFail
        } else {
          rec.bucket = "NO_ACCEPTABLE_IMAGE"; rec.reason = `all_top_candidates_failed_validation: ${lastFail}`; rec.validation = lastFail
        }
        out.push(rec)
      } catch (e) {
        rec.bucket = "DEAD_OR_INVALID_SOURCE"; rec.reason = `probe_error:${(e as Error).name}:${(e as Error).message.slice(0, 60)}`; out.push(rec)
      }
      if (out.length % 50 === 0) console.error(`  …${out.length}/${targets.length}`)
    }
  }
  await Promise.all(Array.from({ length: CONC }, worker))

  fs.writeFileSync(`${S}/image_probe_batch0.json`, JSON.stringify(out, null, 1))
  // Aggregates
  const by = (f: (r: Rec) => string) => out.reduce<Record<string, number>>((a, r) => (a[f(r)] = (a[f(r)] ?? 0) + 1, a), {})
  const buckets = by((r) => r.bucket)
  const rec = out.filter((r) => r.bucket === "RECOVERABLE_NOW")
  const summary = {
    attempted: out.length,
    buckets,
    fetch_failures: out.filter((r) => r.reason.startsWith("fetch_failed") || r.reason.startsWith("probe_error")).length,
    candidate_distribution: {
      zero: out.filter((r) => (r.candidateCount ?? 0) === 0).length,
      one: out.filter((r) => (r.candidateCount ?? 0) === 1).length,
      multiple: out.filter((r) => (r.candidateCount ?? 0) > 1).length,
    },
    recoverable_source_breakdown: rec.reduce<Record<string, number>>((a, r) => (a[r.chosen?.source ?? "unknown"] = (a[r.chosen?.source ?? "unknown"] ?? 0) + 1, a), {}),
    recoverable_scene_tier: rec.reduce<Record<string, number>>((a, r) => { const t = String(r.chosen?.tier ?? "?"); a[t] = (a[t] ?? 0) + 1; return a }, {}),
    no_image_reasons: by((r) => r.bucket === "NO_ACCEPTABLE_IMAGE" ? r.reason.split(":")[0] : "_"),
    dead_reasons: by((r) => r.bucket === "DEAD_OR_INVALID_SOURCE" ? r.reason.split(":")[0] : "_"),
    by_market_recoverable: rec.reduce<Record<string, number>>((a, r) => (a[r.market ?? "?"] = (a[r.market ?? "?"] ?? 0) + 1, a), {}),
  }
  console.log(JSON.stringify(summary, null, 1))
}
main().catch((e) => { console.error(e); process.exit(1) })
