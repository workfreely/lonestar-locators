/**
 * Property Image Intelligence v1.1 — discovery/normalization regression tests (deterministic, no I/O).
 * Covers the audit-proven patterns + the 8 required regression cases. Runtime I/O behaviors
 * (independent per-candidate failure, Entrata render path, unresolved) are additionally proven by the
 * live 16-property canary; here they are asserted through their pure/deterministic pieces.
 *   npx tsx scripts/tests/image-v11.test.ts
 */
import { normalizeToFullRes, providerOf, dedupeKey } from "@/scripts/propertyIntel/v11/normalize"
import { fromNextData, fromJsonLd, fromGalleryJson, fromSrcset, fromImgTags, fromSitecore, fromHtmlScan, internalPhotoLinks } from "@/scripts/propertyIntel/v11/structured"
import { meetsThreshold, isAlreadyV11, ALGO_VERSION_V11 } from "@/scripts/propertyIntel/v11/engine"
import { looksAvif, avifEvalCopy, avifDecoderInfo } from "@/scripts/propertyIntel/v11/avif"
import { assetIdentity } from "@/scripts/propertyIntel/imageEngine"

let pass = 0, fail = 0
function ok(cond: boolean, msg: string) { if (cond) { pass++; console.log("  ✓ " + msg) } else { fail++; console.log("  ✗ " + msg) } }

console.log("\n# CDN full-resolution normalizer (larger request of the SAME asset)")
{
  const rc = normalizeToFullRes("https://resource.rentcafe.com/image/upload/x_0,y_0,w_4000,h_2667,c_crop/q_auto,f_auto,c_lfill,w_576,ar_1.44,g_auto/s3/2/92262/broadwater%20(21).jpg")
  ok(rc.transformed && rc.candidates[0].includes("w_1920") && rc.candidates[0].includes("s3/2/92262"), "RENTCafe → w_1920 request keeps the s3 asset path")
  const ls = normalizeToFullRes("https://capi.myleasestar.com/v2/dimg-crop/174880855/660x375/174880855.jpg")
  ok(ls.transformed && ls.candidates[0].includes("/1920x1080/"), "LeaseStar dimg-crop → 1920x1080 segment")
  const lsb = normalizeToFullRes("https://capi.myleasestar.com/v2/dimg/175431321/300x200/175431321.png")
  ok(lsb.candidates[0].includes("/v2/dimg-crop/175431321/1920x1080/"), "LeaseStar dimg → canonical dimg-crop 1920x1080 (dedupes with dimg-crop)")
  const mz = normalizeToFullRes("https://images.myrazz.com/uc-image/YY9/-/format/webp/-/scale_crop/640x640/center/aspire_007.jpeg.webp")
  ok(mz.transformed && mz.candidates[0] === "https://images.myrazz.com/uc-image/YY9/-/format/jpeg/-/quality/normal/-/resize/1920x/", "Myrazz → id + resize/1920x, drops scale_crop (uploadcare serves original by id)")
  const a247 = normalizeToFullRes("https://thumbs.apts247.info/resize/?img=https://media.apts247.info/0c/x/amenity_lists/community-amenities.jpg&w=710&output=webp")
  ok(a247.transformed && a247.candidates[0] === "https://media.apts247.info/0c/x/amenity_lists/community-amenities.jpg", "Apts247 → underlying media original")
  const cl = normalizeToFullRes("https://g5-assets-cld-res.cloudinary.com/image/upload/q_auto,f_auto,c_fill,h_300,w_300/v1777910962/g5/p1_photogallery-1.jpg")
  ok(cl.transformed && !/[,/]w_300/.test(cl.candidates[0]) && cl.candidates[0].includes("v1777910962"), "Cloudinary → drops fixed w_300/h_300, keeps version+path")
  const du = normalizeToFullRes("https://irp.cdn-website.com/44e69759/dms3rep/multi/opt/992840406-600w.jpg")
  ok(du.transformed && du.candidates[0].endsWith("992840406.jpg"), "Duda → un-suffixed original")
  const wf = normalizeToFullRes("https://cdn.prod.website-files.com/abc/hero_name-p-500.jpg")
  ok(wf.transformed && wf.candidates[0].endsWith("hero_name.jpg"), "Webflow → strips -p-500 scaled suffix")
}

console.log("\n# 1) MAA-style embedded structured gallery")
{
  const html = `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({ props: { pageProps: { gallery: [
    { src: "https://edge.sitecorecloud.io/x/media/10-maa-abbey-property-aerial-3.jpg?w=3840&h=2876", alt: "Aerial property view at MAA Abbey in Dallas, TX", width: 3840, height: 2876 },
    { src: "https://edge.sitecorecloud.io/x/media/1-maa-abbey-building.jpg?w=3840&h=1903", alt: "Building exterior at MAA Abbey in Dallas, TX", width: 3840, height: 1903 },
  ] } } })}</script>`
  const c = fromNextData(html)
  ok(c.length >= 2, "extracts >=2 images from __NEXT_DATA__ gallery")
  ok(c.some((x) => x.alt.includes("Building exterior at MAA Abbey") && x.w === 3840 && x.h === 1903), "captures alt text + declared width/height")
}

console.log("\n# 2) alternate Amenities-page photography discovery")
{
  const html = `<nav><a href="/floorplans">Floor Plans</a><a href="/amenities">Amenities</a><a href="/gallery">Gallery</a><a href="mailto:x@y.com">Email</a></nav>`
  const links = internalPhotoLinks(html, "http://www.alisterapts.com/")
  ok(links.some((u) => /\/amenities$/.test(u)), "discovers /amenities as a photo page")
  ok(/\/(gallery|photos)/.test(links[0]), "ranks gallery/photos ahead of amenities")
  ok(!links.some((u) => /mailto/.test(u)), "excludes mailto links")
}

console.log("\n# 3) gallery with one broken asset + valid assets (extraction keeps all; runtime skips independently)")
{
  const html = `<div class="gallery">
    <img src="https://site.com/images/pool.jpg" alt="Resort pool">
    <img src="https://site.com/images/BROKEN-404.jpg" alt="broken">
    <img src="https://site.com/images/clubhouse.jpg" alt="Clubhouse">
    <img src="https://site.com/images/gym.jpg" alt="Fitness center"></div>`
  const c = fromImgTags(html)
  ok(c.length === 4, "all 4 candidates collected (a broken URL is a runtime failure, not an extraction filter)")
  ok(c.some((x) => /pool\.jpg/.test(x.url)) && c.some((x) => /clubhouse\.jpg/.test(x.url)), "usable assets survive alongside the broken one")
}

console.log("\n# 4) responsive thumbnail → high-resolution SAME asset")
{
  const small = normalizeToFullRes("https://resource.rentcafe.com/image/upload/w_288,h_216/s3/2/85266/collection-41.jpg")
  const large = normalizeToFullRes("https://resource.rentcafe.com/image/upload/w_1200/s3/2/85266/collection-41.jpg")
  ok(small.transformed, "produces a larger request")
  ok(small.candidates[0] === large.candidates[0], "thumbnail and larger rendition normalize to the SAME canonical full-res asset URL")
}

console.log("\n# 5) duplicate responsive renditions dedupe to one asset")
{
  const renditions = [
    "https://resource.rentcafe.com/image/upload/w_288/s3/2/85266/collection-41.jpg",
    "https://resource.rentcafe.com/image/upload/w_576/s3/2/85266/collection-41.jpg",
    "https://resource.rentcafe.com/image/upload/w_1200/s3/2/85266/collection-41.jpg",
  ]
  const idents = new Set(renditions.map((u) => dedupeKey(u, assetIdentity)))
  ok(idents.size === 1, "3 renditions of one photo collapse to a single dedupe key (one vision call, not three)")
}

console.log("\n# 6) LeaseStar-style wide banner remains unsuitable after upscale")
{
  ok(meetsThreshold(1920, 1280) === true, "1920x1280 passes")
  ok(meetsThreshold(1600, 387) === false, "1600x387 wide banner FAILS (short side < 450) — width alone never rescues it")
  ok(meetsThreshold(800, 450) === true && meetsThreshold(799, 450) === false && meetsThreshold(800, 449) === false, "≥800×450 boundary is exact and frozen")
}

console.log("\n# 7) Entrata render-required routing")
{
  ok(providerOf("https://medialibrarycfo.entrata.com/x/photo.jpg") === "Entrata", "Entrata CDN detected")
  ok(providerOf("https://resource.rentcafe.com/x.jpg") === "Yardi/RENTCafe", "RENTCafe detected")
  ok(providerOf("https://edge.sitecorecloud.io/x.jpg") === "Sitecore/MAA", "Sitecore detected")
}

console.log("\n# 8) no usable official photography → nothing extracted → unresolved")
{
  const empty = "<html><head><title>Welcome</title></head><body><h1>Leasing office</h1></body></html>"
  const total = [...fromNextData(empty), ...fromJsonLd(empty), ...fromGalleryJson(empty), ...fromSrcset(empty), ...fromImgTags(empty)]
  ok(total.length === 0, "no candidates extracted from a photo-less page → selection null → unresolved")
}

console.log("\n# JSON-LD + gallery-json extraction")
{
  const ld = `<script type="application/ld+json">${JSON.stringify({ "@type": "ImageObject", contentUrl: "https://cdn.site.com/pool.jpg", caption: "Pool", width: 2000, height: 1333 })}</script>`
  ok(fromJsonLd(ld).some((x) => x.url.endsWith("pool.jpg") && x.w === 2000), "JSON-LD ImageObject extracted with dims")
  const gj = `<script>var data={"gallery":[{"url":"https://cdn.site.com/ext.jpg","alt":"Exterior"}]}</script>`
  ok(fromGalleryJson(gj).some((x) => x.url.endsWith("ext.jpg")), "inline gallery JSON extracted")
}

console.log("\n# entity-decoded srcset picks the largest width")
{
  const html = `<img srcset="https://s.com/a-640.jpg 640w, https://s.com/a-1920.jpg 1920w, https://s.com/a-1080.jpg 1080w">`
  ok(fromSrcset(html)[0].url.endsWith("a-1920.jpg"), "srcset → largest (1920w) chosen")
}

// ─────────────────────────── Canary gap-fix regressions ───────────────────────────

console.log("\n# LeaseStar adapter — canonical dimg-crop, dedupe by asset id")
{
  const a = normalizeToFullRes("https://capi.myleasestar.com/v2/dimg/69741171/400x400/69741171.png")
  const b = normalizeToFullRes("https://capi.myleasestar.com/v2/dimg-crop/69741171/1200x1200/69741171.png")
  ok(a.candidates[0].includes("/v2/dimg-crop/69741171/1920x1080/"), "any LeaseStar rendition → canonical dimg-crop 1920x1080")
  ok(dedupeKey(a.candidates[0], assetIdentity) === dedupeKey(b.candidates[0], assetIdentity), "dimg + dimg-crop of the same id collapse to one asset")
}

console.log("\n# ZRS/cachefly adapter — proxy → original, dedupe by media UUID (fixes false collapse)")
{
  const t1 = "https://sxxweb8cdn.cachefly.net/img/thumbnail.aspx?p=/common/uploads/zrs2019/930/media/AAA111.png"
  const t2 = "https://sxxweb8cdn.cachefly.net/img/thumbnail.aspx?p=/common/uploads/zrs2019/930/media/BBB222.png"
  const n1 = normalizeToFullRes(t1)
  ok(n1.transformed && n1.candidates[0] === "https://sxxweb8cdn.cachefly.net/common/uploads/zrs2019/930/media/AAA111.png", "thumbnail.aspx?p=… → underlying original")
  ok(dedupeKey(t1, assetIdentity) !== dedupeKey(t2, assetIdentity), "two distinct media UUIDs no longer collapse to one (the old bug)")
  ok(providerOf(t1) === "ZRS/cachefly", "cachefly provider detected")
}

console.log("\n# Myrazz — images. and assets. subdomains dedupe to one canonical asset")
{
  const i = normalizeToFullRes("https://images.myrazz.com/uc-image/9406e48c/-/scale_crop/259x210/x.webp")
  const a = normalizeToFullRes("https://assets.myrazz.com/uc-image/9406e48c/-/format/png/-/resize/x210/y.png")
  ok(i.candidates[0].includes("images.myrazz.com/uc-image/9406e48c/") && i.candidates[0].includes("resize/1920x"), "Myrazz → id + resize/1920x on canonical host")
  ok(i.candidates[0] === a.candidates[0], "images. and assets. renditions of one id collapse to a single asset")
}

console.log("\n# Sitecore-embedded extraction + accurate provenance label (MAA correction)")
{
  const html = `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({ props: { pageProps: { search: { data: { gallery: [
    { src: "https://edge.sitecorecloud.io/x/media/project/maac/.../10-maa-abbey-property-aerial-3.jpg?h=2876&w=3840", alt: "Aerial property view at MAA Abbey in Dallas, TX" },
  ] } } } } })}</script>
  <script type="application/ld+json">${JSON.stringify({ "@type": "LocalBusiness", image: "https://edge.sitecorecloud.io/x/media/hero.jpg" })}</script>`
  const sc = fromSitecore(html)
  ok(sc.some((x) => x.url.includes("property-aerial-3.jpg") && x.mechanism === "sitecore-embedded"), "gallery asset tagged sitecore-embedded (NOT json-ld)")
  ok(sc.some((x) => x.alt.includes("Aerial property view at MAA Abbey")), "captures the embedded alt text")
  const nd = fromNextData(html)
  ok(nd.every((x) => x.mechanism === "sitecore-embedded"), "next-data walk also labels sitecore host as sitecore-embedded")
}

console.log("\n# JSON-LD no longer mines non-schema data blobs")
{
  const blob = `<script type="application/ld+json">${JSON.stringify({ data: { images: ["https://cdn.x.com/a.jpg", "https://cdn.x.com/b.jpg"] } })}</script>`
  ok(fromJsonLd(blob).length === 0, "a blob without @type is NOT mined as json-ld (prevents mislabeled provenance)")
  const real = `<script type="application/ld+json">${JSON.stringify({ "@type": "ApartmentComplex", image: ["https://cdn.x.com/pool.jpg"] })}</script>`
  ok(fromJsonLd(real).some((x) => x.url.endsWith("pool.jpg")), "a real @type node's image[] is still extracted")
}

console.log("\n# Broad HTML-scan catches provider photos outside <img> (Webflow background/lightbox)")
{
  const html = `<div class="hero" style="background-image:url('https://cdn.prod.website-files.com/abc/6392_1-web-or-mls-Gala.jpg')"></div>
    <script>var lb={"items":[{"image":"https://cdn.prod.website-files.com/abc/6391_courtyard_HD.jpg"}]}</script>`
  const scan = fromHtmlScan(html)
  ok(scan.some((x) => x.url.endsWith("6392_1-web-or-mls-Gala.jpg")), "background-image photo captured")
  ok(scan.some((x) => x.url.endsWith("6391_courtyard_HD.jpg")), "lightbox-script photo captured")
  ok(fromImgTags(html).length === 0, "these were invisible to the <img> parser (why the canary missed them)")
}

console.log("\n# No-churn protection — an already-v1.1 Primary is never re-selected")
{
  ok(isAlreadyV11(`primary=Pool; mechanism=json-ld; algo=${ALGO_VERSION_V11}`) === true, "row stamped v1.1 → treated as already resolved (skip write)")
  ok(isAlreadyV11("primary=Pool; algo=property-image-intelligence-v1.0") === false, "a v1.0 row is NOT flagged as v1.1 (still eligible)")
  ok(isAlreadyV11(null) === false && isAlreadyV11("") === false && isAlreadyV11(undefined) === false, "empty/legacy provenance → eligible, not skipped")
}

console.log("\n# AVIF decoder is environment-probed (portability)")
{
  const info = avifDecoderInfo()
  ok(typeof info.sips === "boolean" && typeof info.note === "string", "decoder capability is probed, not assumed (no hard sips dependency)")
}

console.log("\n# AVIF — detection + transcode eval copy (valid / corrupt / duplicate)")
async function avifTests() {
  ok(looksAvif("https://x.com/a.avif") && looksAvif("https://x.com/a", "image/avif"), "AVIF detected by extension and by MIME")
  ok(!looksAvif("https://x.com/a.jpg", "image/jpeg"), "non-AVIF not misdetected")
  // corrupt/invalid: a data URL of non-image bytes → no eval copy
  const corrupt = await avifEvalCopy("data:application/octet-stream;base64,AAECAwQFBgcICQoL")
  ok(corrupt === null, "corrupt/invalid AVIF → null eval copy (never silently accepted)")
  // duplicate AVIF renditions dedupe by asset (custom host → assetIdentity strips size token)
  const d1 = dedupeKey("https://alisterapts.com/images/living-room_800x600.avif", assetIdentity)
  const d2 = dedupeKey("https://alisterapts.com/images/living-room_1600x1200.avif", assetIdentity)
  ok(d1 === d2, "two AVIF renditions of the same photo collapse to one (single transcode+gate)")
  // valid property AVIF → high-quality JPEG eval copy with real decoded dims (network; the frozen gate
  // then judges it — decode alone is not acceptance).
  const ev = await avifEvalCopy("https://www.alisterapts.com/images/Alister-living-room.avif")
  if (ev) { ok(ev.dataUrl.startsWith("data:image/jpeg;base64,") && ev.w >= 800 && ev.h >= 450, `valid AVIF → JPEG eval copy ${ev.w}x${ev.h}`) }
  else { ok(false, "valid AVIF eval copy (network) — expected a data URL"); }
}

;(async () => {
  await avifTests()
  console.log(`\n${fail === 0 ? "PASS" : "FAIL"} — ${pass} passed, ${fail} failed`)
  process.exit(fail === 0 ? 0 : 1)
})()
