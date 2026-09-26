// PROVIDER FINGERPRINT (read-only research). For the 561 missing-image properties with a website,
// fetch the page (Chrome UA) and detect the underlying multifamily website vendor from response
// headers (works even on a 403 block), body signatures, script/link/img hostnames, and generator
// meta. Also records the image-CDN hosts referenced in the served HTML (where the real gallery lives).
// Cross-references each property with its Batch 0 bucket. WRITES NOTHING.
// Run: npx tsx scripts/propertyIntel/fingerprint_providers.ts [--concurrency=10] [--limit=N]
import fs from "node:fs"; import path from "node:path"
;(() => { const p = path.join(process.cwd(), ".env.local"); for (const l of fs.readFileSync(p, "utf8").split("\n")) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "") } })()
const S = "/private/tmp/claude-501/-Users-jaymorris-Desktop-lonestar-locators-app/30160563-4dba-40ec-bd16-aeca0a940f8b/scratchpad"
const CONC = Number(process.argv.find((a) => a.startsWith("--concurrency="))?.split("=")[1] ?? 10)
const LIMIT = Number(process.argv.find((a) => a.startsWith("--limit="))?.split("=")[1] ?? 0)
const CHROME = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"

// Provider signatures — matched against headers + body + referenced hostnames. Checked in order;
// first match wins (specific vendors before generic CMS before WAF).
// Order matters — MAIN site-builder / gallery platform is checked before ILS widgets a site may
// merely EMBED (a LeaseStar pricing iframe on a Webflow site must classify as Webflow, not LeaseStar).
// G5 requires its real path signature (g5-c-/g5-cl-), not a generic "myleasestar" widget host.
const PROVIDERS: { name: string; re: RegExp }[] = [
  { name: "Yardi/RENTCafe", re: /rentcafe|securecafe|\byardi\b|cdngeneral|switch_cls/i },
  { name: "Entrata/ProspectPortal", re: /\.entrata\.com|prospectportal|residentportal/i },
  { name: "Webflow", re: /website-files\.com|webflow\.io|wf-domain|data-wf-/i },
  { name: "Duda", re: /irp\.cdn-website\.com|dudamobile|dudaone|_dm_static/i },
  { name: "Squarespace", re: /squarespace\.com|static1\.squarespace|sqs-/i },
  { name: "Wix", re: /wixstatic|\bwix\.com\b|_wixCssStates|wix-warmup/i },
  { name: "RealPage/G5", re: /g5-c-[a-z0-9]|g5-cl-[a-z0-9]|g5-assets|g5-cdn|g5search/i },
  { name: "Myrazz", re: /myrazz/i },
  { name: "Funnel", re: /funnelleasing/i },
  { name: "Rooof", re: /rooof/i },
  { name: "Apartments247", re: /apts247/i },
  { name: "MultiHub", re: /multihub\.io/i },
  { name: "Swifty", re: /swifty-media|swiftysoftware/i },
  { name: "WordPress", re: /wp-content|wp-json|wp-includes/i },
  // Lower-priority: ILS / pricing widgets frequently EMBEDDED on another platform's site.
  { name: "RealPage/LeaseStar (widget)", re: /myleasestar|leasestar|\brealpage\b|onesite|sightmap/i },
]
// Image-CDN hostnames worth tallying (where a real gallery photo would come from).
const IMG_CDN = /cloudinary|rentcafe|myrazz|entrata|cdn-website\.com|website-files\.com|myleasestar|multihub|apts247|squarespace-cdn|wixstatic|cloudfront|s3[.-]|blob\.core|scene7|imgix|ucarecdn|googleusercontent|bynder|cachefly/i
const WAF = /cloudflare|cf-ray|akamai|incapsula|imperva|datadome|perimeterx|sucuri/i

function hostsFrom(html: string): string[] {
  const hosts = new Set<string>()
  const re = /(?:src|href)=["']https?:\/\/([^/"']+)/gi
  let m: RegExpExecArray | null; let n = 0
  while ((m = re.exec(html)) && n < 4000) { hosts.add(m[1].toLowerCase()); n++ }
  return [...hosts]
}
function imgHostsFrom(html: string): string[] {
  const hosts = new Set<string>()
  const re = /<img\b[^>]*?\b(?:src|data-src|data-lazy-src)=["']([^"']+)["']/gi
  let m: RegExpExecArray | null; let n = 0
  while ((m = re.exec(html)) && n < 400) { try { const h = new URL(m[1], "https://x").host.toLowerCase(); if (h && h !== "x") hosts.add(h) } catch { /**/ } n++ }
  // og/twitter too
  const og = /<meta[^>]+(?:og:image|twitter:image)[^>]+content=["']([^"']+)/gi
  while ((m = og.exec(html)) && n < 500) { try { hosts.add(new URL(m[1], "https://x").host.toLowerCase()) } catch { /**/ } n++ }
  return [...hosts]
}

async function main() {
  const { supabaseAdmin } = await import("@/lib/supabase/admin")
  const { safeFetch } = await import("@/lib/security/ssrfGuard")
  const b0: { place_id: string; bucket: string }[] = JSON.parse(fs.readFileSync(`${S}/image_probe_batch0.json`, "utf8"))
  const bucketOf = new Map(b0.map((r) => [r.place_id, r.bucket]))

  const rows: { place_id: string; property_name: string | null; website_url: string; market: string | null }[] = []
  for (let from = 0; ; from += 1000) {
    const { data } = await supabaseAdmin.from("property_catalog").select("place_id, property_name, website_url, market")
      .eq("image_selection_state", "missing").not("website_url", "is", null).neq("website_url", "").order("place_id").range(from, from + 999)
    if (!data || !data.length) break; rows.push(...(data as typeof rows)); if (data.length < 1000) break
  }
  const targets = LIMIT ? rows.slice(0, LIMIT) : rows
  console.log(`Fingerprint targets: ${targets.length} (conc ${CONC})  ·  READ-ONLY`)

  type Rec = { place_id: string; name: string | null; market: string | null; url: string; bucket: string; status: number | null; provider: string; signals: string[]; imgCdns: string[]; server?: string; waf?: string }
  const out: Rec[] = []
  let idx = 0
  async function worker() {
    while (idx < targets.length) {
      const r = targets[idx++]
      const rec: Rec = { place_id: r.place_id, name: r.property_name, market: r.market, url: r.website_url, bucket: bucketOf.get(r.place_id) ?? "?", status: null, provider: "Custom/unknown", signals: [], imgCdns: [] }
      const ac = new AbortController(); const t = setTimeout(() => ac.abort(), 14000)
      try {
        const resp = await safeFetch(r.website_url, { headers: { "User-Agent": CHROME, "Accept": "text/html,application/xhtml+xml", "Accept-Language": "en-US,en;q=0.9", "Accept-Encoding": "identity" }, signal: ac.signal, maxRedirects: 4 }).finally(() => clearTimeout(t))
        if (!resp.ok) { rec.provider = "DEAD/unreachable"; rec.signals.push(resp.reason.slice(0, 40)); out.push(rec); continue }
        rec.status = resp.response.status
        const server = resp.response.headers.get("server") ?? ""
        const xpb = resp.response.headers.get("x-powered-by") ?? ""
        const setck = (resp.response.headers.get("set-cookie") ?? "")
        const cfray = resp.response.headers.get("cf-ray") ? "cf-ray" : ""
        rec.server = server
        const headerBlob = `${server} ${xpb} ${setck} ${cfray} ${resp.response.headers.get("via") ?? ""} ${resp.finalUrl}`
        let body = ""
        try { body = /text\/html|xhtml/i.test(resp.response.headers.get("content-type") ?? "") ? await resp.response.text() : "" } catch { /**/ }
        const refHosts = body ? hostsFrom(body) : []
        rec.imgCdns = body ? imgHostsFrom(body).filter((h) => IMG_CDN.test(h)) : []
        const blob = `${headerBlob} ${refHosts.join(" ")} ${body.slice(0, 200000)}`
        // WAF marker (informational — explains 403s)
        const wafm = `${server} ${cfray} ${setck}`.match(WAF); if (wafm) rec.waf = wafm[0].toLowerCase()
        // Provider detection
        for (const p of PROVIDERS) { if (p.re.test(blob)) { rec.provider = p.name; break } }
        // If still unknown but blocked by a WAF with no body, note it
        if (rec.provider === "Custom/unknown" && !body && rec.status && rec.status >= 400) rec.provider = "Blocked (no body)"
        // Capture a couple of concrete signal hits for the report
        for (const p of PROVIDERS) if (p.re.test(blob)) rec.signals.push(p.name)
        out.push(rec)
      } catch (e) { rec.provider = "DEAD/unreachable"; rec.signals.push(`err:${(e as Error).name}`); out.push(rec) }
      if (out.length % 60 === 0) console.error(`  …${out.length}/${targets.length}`)
    }
  }
  await Promise.all(Array.from({ length: CONC }, worker))
  fs.writeFileSync(`${S}/provider_fingerprints.json`, JSON.stringify(out, null, 1))

  // Aggregate: provider × bucket
  const buckets = ["RECOVERABLE_NOW", "NEEDS_RENDERED_WEB", "NO_ACCEPTABLE_IMAGE", "DEAD_OR_INVALID_SOURCE"]
  const provs = [...new Set(out.map((r) => r.provider))]
  const table: Record<string, Record<string, number>> = {}
  for (const r of out) { (table[r.provider] ??= {})[r.bucket] = ((table[r.provider] ?? {})[r.bucket] ?? 0) + 1; table[r.provider].TOTAL = (table[r.provider].TOTAL ?? 0) + 1 }
  const sorted = Object.entries(table).sort((a, b) => b[1].TOTAL - a[1].TOTAL)
  console.log("\n=== PROVIDER × BUCKET (missing cohort) ===")
  console.log(["provider".padEnd(24), "TOT", "RECOV", "REND", "NO_IMG", "DEAD"].join("\t"))
  for (const [p, c] of sorted) console.log([p.padEnd(24), c.TOTAL ?? 0, c.RECOVERABLE_NOW ?? 0, c.NEEDS_RENDERED_WEB ?? 0, c.NO_ACCEPTABLE_IMAGE ?? 0, c.DEAD_OR_INVALID_SOURCE ?? 0].join("\t"))
  // Image CDN hosts seen across missing cohort
  const cdn: Record<string, number> = {}
  for (const r of out) for (const h of r.imgCdns) cdn[h] = (cdn[h] ?? 0) + 1
  console.log("\n=== image-CDN hosts referenced in missing pages (top 20) ===")
  console.log(Object.entries(cdn).sort((a, b) => b[1] - a[1]).slice(0, 20).map(([h, n]) => `${n}\t${h}`).join("\n"))
  // WAF among 403/blocked
  const waf: Record<string, number> = {}
  for (const r of out) if (r.waf) waf[r.waf] = (waf[r.waf] ?? 0) + 1
  console.log("\n=== WAF markers (explains blocks) ===", JSON.stringify(waf))
}
main().catch((e) => { console.error(e); process.exit(1) })
