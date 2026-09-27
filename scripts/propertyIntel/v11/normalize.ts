// Property Image Intelligence v1.1 — FULL-RESOLUTION CDN NORMALIZER (deterministic, pure, no I/O).
//
// Given a discovered image URL, return an ordered list of candidate URLs that request a genuinely
// LARGER rendition of the *same underlying asset* from the same official CDN — proven patterns from
// the Path-A audit (RENTCafe/Yardi, LeaseStar/RealPage, Myrazz, Apartments247, Cloudinary/G5, Bynder,
// Duda, Webflow, Sitecore). This does NOT enlarge pixels; it rewrites the CDN's own size/transform
// controls so the CDN serves its higher-resolution source. The caller MUST still fetch each candidate,
// verify MIME + real decoded dimensions, and run the frozen ≥800×450 / metadata / visual-gate checks —
// a normalized URL is only a *request* for a bigger rendition, never an accepted image. Wide banner /
// hero crops therefore remain correctly rejected by the frozen short-side/aspect + visual gate.
//
// v1.0 (imageEngine.ts assetIdentity) is unchanged; this module is additive.

export type NormResult = {
  original: string
  provider: string
  candidates: string[] // ordered high→acceptable; ALWAYS includes original as the final fallback
  transformed: boolean // true if at least one genuinely-larger request was produced
}

const dec = (u: string) => u.replace(/&amp;/g, "&") // HTML-entity decode (Sitecore/MAA embed &amp; in srcset)

function host(u: string): string { try { return new URL(u).host.toLowerCase() } catch { return "" } }

// RENTCafe / Yardi (resource.rentcafe.com, Cloudinary-style): keep the asset path after the transform
// chain, request one clean large transform. URL shape: .../image/upload/<transforms...>/s3/<path>.<ext>
function rentcafe(u: string): string[] {
  const m = u.match(/^(https?:\/\/[^/]+\/image\/upload\/)(.*)$/i)
  if (!m) return []
  // asset path = everything from the first "s3/" (or the last segment group) onward
  const rest = m[2]
  const s3 = rest.match(/(s3\/.*)$/i)
  const asset = s3 ? s3[1] : rest.replace(/^[^/]*\//, "")
  return [`${m[1]}q_auto,f_auto,w_1920/${asset}`, `${m[1]}q_auto,f_auto/${asset}`]
}

// LeaseStar / RealPage (capi.myleasestar.com): the size is a path segment /v2/dimg[-crop]/<id>/<WxH>/…
// CANONICALIZE every rendition of one asset id to dimg-crop/<id>/1920x1080 so all renditions dedupe by
// id and we always request a proper photo crop. A source that is intrinsically a wide banner still fails
// the frozen short-side (≥450) / visual gate — width alone never rescues it.
function leasestar(u: string): string[] {
  const m = u.match(/^(https?:\/\/[^/]+)\/v2\/dimg(?:-crop)?\/(\d+)\/\d+x\d+\/(\d+)(\.[a-z]+)/i)
  if (!m) return []
  return [`${m[1]}/v2/dimg-crop/${m[2]}/1920x1080/${m[3]}${m[4]}`]
}

// ZRS / cachefly (sxxweb8cdn.cachefly.net): thumbnails are a proxy /img/thumbnail.aspx?p=<original path>.
// Use the underlying original (same asset, full-res). Direct /common/uploads/.../media/<uuid> are already
// originals. Both dedupe by the media UUID (the proxy query otherwise defeats assetIdentity).
function cachefly(u: string): string[] {
  try {
    const x = new URL(u)
    if (/thumbnail\.aspx$/i.test(x.pathname)) {
      const p = x.searchParams.get("p")
      if (p) return [`${x.protocol}//${x.host}${p.startsWith("/") ? "" : "/"}${p}`]
    }
  } catch { /* noop */ }
  return []
}

// Myrazz (images. OR assets.myrazz.com, uploadcare): /uc-image/<id>/<ops.../>filename → keep id +
// filename, request one large resize with NO scale_crop (what shrank it to 640/thumbnail). All renditions
// of an id collapse to the same canonical request.
function myrazz(u: string): string[] {
  const m = u.match(/^https?:\/\/(?:images|assets)\.myrazz\.com\/uc-image\/([^/]+)\//i)
  if (!m) return []
  // uploadcare serves the original by id; ask for a single large aspect-preserving resize, no scale_crop.
  return [`https://images.myrazz.com/uc-image/${m[1]}/-/format/jpeg/-/quality/normal/-/resize/1920x/`]
}

// Apartments247: thumbs.apts247.info/resize/?img=<underlying original>&w=710 → use the underlying original.
function apts247(u: string): string[] {
  try {
    const x = new URL(u)
    if (/thumbs\.apts247\.info/i.test(x.host)) {
      const img = x.searchParams.get("img")
      if (img) return [img] // the underlying media.apts247.info original (proven full-res)
    }
  } catch { /* noop */ }
  return []
}

// Cloudinary (incl. G5): /image/upload/<transforms>/v<ver>/<path> → drop fixed w_/h_ size transform.
function cloudinary(u: string): string[] {
  const m = u.match(/^(https?:\/\/[^/]+\/image\/upload\/)(.*?)(v\d+\/.*)$/i)
  if (!m) return []
  return [`${m[1]}q_auto,f_auto/${m[3]}`, `${m[1]}q_auto,f_auto,w_1920/${m[3]}`]
}

// Bynder: ...?io=transform:fill,width:400,height:600 → request a larger fit.
function bynder(u: string): string[] {
  const m = u.match(/^(.*?)(\?io=transform:[^]*)$/i)
  if (!m) return []
  return [`${m[1]}?io=transform:fit,width:1920,height:1440`]
}

// Duda (irp.cdn-website.com): ...<id>-600w.jpg → try the un-suffixed original, then a large variant.
function duda(u: string): string[] {
  const m = u.match(/^(.*?)-(\d{2,4})w(\.(?:jpe?g|png|webp))$/i)
  if (!m) return []
  return [`${m[1]}${m[3]}`, `${m[1]}-1920w${m[3]}`]
}

// Webflow (website-files.com): ..._name-p-500.jpg (scaled) → strip the -p-<n> to get the original.
function webflow(u: string): string[] {
  const m = u.match(/^(.*?)-p-\d+(\.(?:jpe?g|png|webp))$/i)
  if (!m) return []
  return [`${m[1]}${m[2]}`]
}

// Sitecore Cloud (edge.sitecorecloud.io): query controls w/h/mw. Raise w to >=1920, drop the mw cap.
function sitecore(u: string): string[] {
  try {
    const x = new URL(dec(u))
    if (!/sitecorecloud\.io/i.test(x.host)) return []
    x.searchParams.set("w", "1920")
    if (x.searchParams.has("mw")) x.searchParams.delete("mw")
    x.searchParams.delete("h") // let width drive; preserves aspect
    return [x.toString()]
  } catch { return [] }
}

const RULES: [string, (u: string) => string[]][] = [
  ["Yardi/RENTCafe", (u) => (/resource\.rentcafe\.com|cdn(?:general)?[a-z]*\.rentcafe\.com/i.test(u) ? rentcafe(u) : [])],
  ["RealPage/LeaseStar", (u) => (/myleasestar\.com/i.test(u) ? leasestar(u) : [])],
  ["ZRS/cachefly", (u) => (/cachefly\.net/i.test(u) ? cachefly(u) : [])],
  ["Myrazz", (u) => (/(?:images|assets)\.myrazz\.com/i.test(u) ? myrazz(u) : [])],
  ["Apartments247", (u) => (/apts247\.info/i.test(u) ? apts247(u) : [])],
  ["G5/Cloudinary", (u) => (/cloudinary\.com/i.test(u) ? cloudinary(u) : [])],
  ["Bynder", (u) => (/\.bynder\.com/i.test(u) ? bynder(u) : [])],
  ["Duda", (u) => (/irp\.cdn-website\.com/i.test(u) ? duda(u) : [])],
  ["Webflow", (u) => (/website-files\.com/i.test(u) ? webflow(u) : [])],
  ["Sitecore/MAA", (u) => (/sitecorecloud\.io/i.test(u) ? sitecore(u) : [])],
]

export function normalizeToFullRes(rawUrl: string): NormResult {
  const url = dec(rawUrl)
  for (const [provider, fn] of RULES) {
    const ups = fn(url).filter((c) => c && c !== url)
    if (ups.length) {
      const seen = new Set<string>(); const candidates: string[] = []
      for (const c of [...ups, url]) if (!seen.has(c)) { seen.add(c); candidates.push(c) }
      return { original: url, provider, candidates, transformed: true }
    }
  }
  return { original: url, provider: providerOf(url), candidates: [url], transformed: false }
}

// Dedupe key for collapsing multiple renditions of ONE underlying asset before expensive processing.
// For a known CDN, every rendition normalizes to the SAME canonical full-res request, so that string
// is the identity. For non-CDN/custom URLs, fall back to v1.0's assetIdentity (size/crop-token strip).
export function dedupeKey(rawUrl: string, assetIdentity: (u: string) => string): string {
  const n = normalizeToFullRes(rawUrl)
  return n.transformed ? n.candidates[0] : assetIdentity(n.candidates[0])
}

export function providerOf(u: string): string {
  const h = host(u)
  if (/rentcafe\.com/.test(h)) return "Yardi/RENTCafe"
  if (/myleasestar\.com/.test(h)) return "RealPage/LeaseStar"
  if (/myrazz\.com/.test(h)) return "Myrazz"
  if (/cachefly\.net/.test(h)) return "ZRS/cachefly"
  if (/apts247\.info/.test(h)) return "Apartments247"
  if (/cloudinary\.com/.test(h)) return "G5/Cloudinary"
  if (/bynder\.com/.test(h)) return "Bynder"
  if (/cdn-website\.com/.test(h)) return "Duda"
  if (/website-files\.com/.test(h)) return "Webflow"
  if (/sitecorecloud\.io/.test(h)) return "Sitecore/MAA"
  if (/entrata\.com/.test(h)) return "Entrata"
  return "other/custom"
}
