// READ-ONLY static-HTML discovery probe for the v1.1 Path-A audit. Plain GET of each sampled official
// site (NO vision, NO Google, NO Routes). Scans raw HTML for the discovery signals that distinguish
// A1 (embedded structured gallery), A2 (srcset/parametric full-res), A3 (alternate-page photography),
// A5 (rendered/client-side). Also probes common alternate photo pages for reachability. $0.
import fs from "node:fs"
const S = process.env.S!
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/125.0.0.0 Safari/537.36"
const ALT = ["gallery", "photos", "amenities", "features", "community", "residences", "floor-plans", "floorplans", "the-property", "neighborhood"]

async function get(url: string, ms = 15000): Promise<{ ok: boolean; status: number; html: string; finalUrl: string }> {
  const ac = new AbortController(); const t = setTimeout(() => ac.abort(), ms)
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "text/html,*/*" }, redirect: "follow", signal: ac.signal }).finally(() => clearTimeout(t))
    const ct = r.headers.get("content-type") || ""
    const html = /text|html|json/.test(ct) ? (await r.text()).slice(0, 900000) : ""
    return { ok: r.ok, status: r.status, html, finalUrl: r.url }
  } catch (e: any) { return { ok: false, status: 0, html: "", finalUrl: url } }
}

function signals(html: string) {
  const has = (re: RegExp) => re.test(html)
  const count = (re: RegExp) => (html.match(re) || []).length
  // photo-ish <img>/srcset asset urls (jpg/png/webp/avif), excluding obvious logo/icon
  const imgUrls = [...html.matchAll(/(?:src|data-src|data-lazy|content)=["']([^"']+\.(?:jpe?g|png|webp|avif))(?:\?[^"']*)?["']/gi)].map(m => m[1])
  const srcsetUrls = [...html.matchAll(/(?:srcset|imagesrcset|data-srcset)=["']([^"']+)["']/gi)].map(m => m[1])
  const photoish = imgUrls.filter(u => !/logo|icon|sprite|favicon|placeholder|\.svg/i.test(u))
  return {
    next_data: has(/id=["']__NEXT_DATA__["']/),
    json_ld: count(/application\/ld\+json/gi),
    json_ld_image: has(/"@type"\s*:\s*"(?:ImageObject|Photograph)"/i) || has(/"image"\s*:\s*\[/i),
    gallery_json: has(/"gallery"\s*:/i) || has(/"photos?"\s*:\s*\[/i) || has(/"galleryImages"/i) || has(/"propertyGallery"/i),
    sitecore: has(/sitecorecloud\.io|scmedia|__JSS_STATE__|sitecore/i),
    srcset_count: srcsetUrls.length,
    srcset_widths: [...new Set([...html.matchAll(/(\d{3,4})w[ ,]/g)].map(m => +m[1]))].sort((a, b) => a - b).slice(0, 12),
    photo_img_count: photoish.length,
    sample_photos: [...new Set(photoish)].slice(0, 4),
    entrata: has(/switch_cls|entrata|prospectportal/i),
    rentcafe: has(/rentcafe|rcstdid|yardi/i),
    leasestar: has(/leasestar|myleasestar|realpage|\bilm=/i),
    webflow: has(/webflow/i),
    // rough "static images present" — if provider SPA, static html often has few photoish imgs
  }
}

async function main() {
  const A = JSON.parse(fs.readFileSync(`${S}/pathA_rows.json`, "utf8")) as any[]
  const pick = (f: (r: any) => boolean, n: number) => A.filter(f).filter(r => r.website_url && /^https?:/.test(r.website_url) && !/texas\.gov|notfound\./.test(r.website_url)).slice(0, n)
  // manual ground-truth cases + representative sample per provider/mechanism
  const manual = [
    { name: "MAA Abbey", market: "Dallas", website_url: "https://www.maac.com/texas/dallas/maa-abbey/", provider: "Sitecore/MAA", tag: "manual" },
    { name: "Beckett Wells Branch", market: "Austin", website_url: "https://rent-beckwellsbranch.com/gallery/", provider: "custom", tag: "manual" },
    { name: "Alister Apartments", market: "Austin", website_url: "http://www.alisterapts.com/", provider: "custom", tag: "manual" },
  ]
  const sample = [
    ...manual,
    ...pick(r => r.provider === "Entrata" && r.failure_mechanism === "provider_template_variance", 3).map(r => ({ ...r, tag: "Entrata" })),
    ...pick(r => r.provider === "Yardi/RENTCafe" && r.failure_mechanism === "provider_template_variance", 2).map(r => ({ ...r, tag: "RENTCafe" })),
    ...pick(r => r.provider === "RealPage/LeaseStar" && r.failure_mechanism === "provider_template_variance", 2).map(r => ({ ...r, tag: "LeaseStar" })),
    ...pick(r => r.provider === "Webflow", 2).map(r => ({ ...r, tag: "Webflow" })),
    ...pick(r => r.provider === "Myrazz" && r.failure_mechanism === "provider_template_variance", 2).map(r => ({ ...r, tag: "Myrazz" })),
    ...pick(r => r.provider === "Apartments247" && r.failure_mechanism === "provider_template_variance", 2).map(r => ({ ...r, tag: "Apts247" })),
    ...pick(r => r.failure_mechanism === "no_gallery_found_custom_site", 6).map(r => ({ ...r, tag: "custom" })),
  ]
  const out: any[] = []
  for (const s of sample) {
    const home = await get(s.website_url)
    const sig = home.html ? signals(home.html) : null
    // probe alternate pages only if homepage reachable and looks provider/custom (cheap: HEAD-like GET, short)
    const origin = (() => { try { return new URL(home.finalUrl).origin } catch { return "" } })()
    const alts: string[] = []
    if (home.ok && origin) {
      for (const a of ALT) {
        const r = await get(`${origin}/${a}`, 9000)
        if (r.ok && r.html && signals(r.html).photo_img_count >= 3) alts.push(`${a}(${signals(r.html).photo_img_count})`)
        if (alts.length >= 4) break
      }
    }
    out.push({ name: s.name, market: s.market, tag: s.tag, provider: s.provider, website: s.website_url, status: home.status, sig, alt_photo_pages: alts })
    console.log(`\n[${s.tag}] ${s.name} — ${home.status}`)
    if (sig) console.log("  signals:", JSON.stringify({ next: sig.next_data, jsonld: sig.json_ld, gallery_json: sig.gallery_json, sitecore: sig.sitecore, srcset: sig.srcset_count, widths: sig.srcset_widths, static_photos: sig.photo_img_count }))
    console.log("  alt photo pages:", alts.join(", ") || "(none≥3)")
  }
  fs.writeFileSync(`${S}/pathA_probe.json`, JSON.stringify(out, null, 1))
  console.log("\nwrote pathA_probe.json —", out.length, "sites probed")
}
main().catch(e => { console.error(e); process.exit(1) })
