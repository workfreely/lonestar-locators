// Best-effort property metadata extraction from a fetched HTML page —
// checked in order: JSON-LD structured data, Open Graph tags, then the
// plain <title> tag as a last resort. Regex-based on purpose (no DOM/HTML
// parser dependency) — good enough for well-formed marketing/listing
// pages, which is the realistic input here (an operator pasting a real
// apartment community's URL), not arbitrary hostile HTML.

export type DetectedMetadata = {
  name: string | null
  address: string | null
  // Best-available property preview image (og:image first). Absolute-or-relative
  // as found on the page; the caller resolves it against the source URL. Null when
  // the page exposes no usable image → the UI shows the shared placeholder.
  image: string | null
}

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .trim()
}

function extractMetaContent(html: string, key: string): string | null {
  // Attribute order varies across sites (property/content, or content/property).
  const patterns = [
    new RegExp(`<meta[^>]*(?:property|name)=["']${key}["'][^>]*content=["']([^"']*)["']`, "i"),
    new RegExp(`<meta[^>]*content=["']([^"']*)["'][^>]*(?:property|name)=["']${key}["']`, "i"),
  ]
  for (const re of patterns) {
    const m = html.match(re)
    if (m?.[1]) return decodeHtmlEntities(m[1])
  }
  return null
}

function extractTitle(html: string): string | null {
  const m = html.match(/<title[^>]*>([^<]*)<\/title>/i)
  return m?.[1] ? decodeHtmlEntities(m[1]) : null
}

function extractJsonLdBlocks(html: string): any[] {
  const blocks: any[] = []
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html))) {
    try {
      const parsed = JSON.parse(m[1].trim())
      if (Array.isArray(parsed)) blocks.push(...parsed)
      else blocks.push(parsed)
    } catch {
      // Malformed JSON-LD on the page — skip it, not fatal to detection.
    }
  }
  return blocks
}

function formatAddress(address: any): string | null {
  if (!address) return null
  if (typeof address === "string") return decodeHtmlEntities(address)
  if (typeof address === "object") {
    const parts = [address.streetAddress, address.addressLocality, address.addressRegion, address.postalCode]
      .filter((p) => typeof p === "string" && p.trim())
    if (parts.length > 0) return parts.join(", ")
  }
  return null
}

// ── Confidence-based property-image selection ───────────────────────────────
// og:image / social cards frequently return a LOGO or branded share graphic
// rather than a real property photo (e.g. 300 Main). We don't want a mix of
// logos, photos, and placeholders — so a candidate is only accepted when it
// looks like an actual photo, and we PREFER structured-data / gallery photos.
// A placeholder is preferable to a questionable image: when nothing scores as a
// confident photo we return null and let PropertyThumb show its placeholder.
//
// This is a URL/metadata heuristic (no DOM, no image-dimension fetch) — see the
// limitations noted in the tests. It biases toward false negatives (a real photo
// occasionally rejected → placeholder) over false positives (a logo shown).

// A candidate carries its URL, a source boost, and optional CONTEXT (an <img>'s
// alt / class / title, or nearby caption text) — scene ranking and rejection both
// read the URL *and* the context, so "Pool at sunset" alt on an opaque filename
// still ranks as a pool, and an alt of "Floor Plan" is rejected.
type ImageCandidate = { url: string; boost: number; context?: string }

// Source boosts — structured/gallery property images are preferred over social.
// These are TIEBREAKERS ONLY: the scene tier (below) dominates the score, so a
// pool from a low-boost <img> still outranks a logo-less "other" image from
// JSON-LD. Kept small on purpose.
const GALLERY_BOOST = 4 // an item inside a JSON-LD image ARRAY (a real gallery)
const STRUCTURED_BOOST = 3 // a single JSON-LD image/photo
const SOCIAL_BOOST = 1 // og:image / twitter:image
const IMG_BOOST = 2 // a gallery/hero <img> on the page (alt/class give it context)

// Filename/URL signals that mark an image as NOT a real property photo. Kept
// conservative to avoid rejecting real photos whose community name coincidentally
// contains a word (e.g. "brand" only matches as its own path segment, so
// "brandywine-exterior.jpg" is NOT rejected).
const REJECT_PATTERNS: RegExp[] = [
  /logo/i, /favicon/i, /\bicon\b/i, /icons?\//i, /sprite/i, /wordmark/i, /brandmark/i,
  /[-_/]brand[-_.]/i, /emblem/i, /\bbadge\b/i, /avatar/i, /placeholder/i, /\bdefault\b/i,
  /og[-_]?default/i, /\bblank\b/i, /\bpixel\b/i, /spacer/i, /\bshare\b/i, /apple[-_]?touch/i,
  /watermark/i, /1x1/i,
  // Awards / certifications / seals — real graphics but NOT property photos. Added
  // after the sample surfaced a "National-Green-Building-Standard" bronze badge
  // slipping through because its filename contained "building".
  /\bseal\b/i, /\baward\b/i, /certified/i, /certification/i, /accredited/i,
  /energy[-_]?star/i, /green[-_]?building/i, /national[-_]?green/i, /\bngbs\b/i,
  /equal[-_]?housing/i, /\behl\b/i, /fair[-_]?housing/i, /\bverified\b/i, /\bratings?[-_]/i,
  // Floor plans / site plans — a schematic, never a scene.
  /floor[-_ ]?plans?/i, /\bfloorplan/i, /site[-_ ]?plans?/i, /\bsiteplan/i, /[-_/]fp[-_]\d/i,
  // Map tiles / screenshots and generic promo graphics.
  /static[-_]?map/i, /staticmap/i, /maps\.googleapis/i, /\bpromo\b/i, /\bbanner[-_]?ad/i, /\bflyer\b/i,
  // Social platform embeds / icons and promo posts (discovery: Instagram/Facebook
  // graphics slip in as opaque-name tier-2 picks — "Let's Eat" event card etc.).
  /\binstagram\b/i, /\bfacebook\b/i, /\btiktok\b/i, /\blinkedin\b/i, /\byoutube\b/i, /\bpinterest\b/i,
  /social[-_ ]?(?:media|icon|share|link|bar|nav|feed|post)/i,
  // Accessibility-widget assets (accessiBe / UserWay / AudioEye) + WCAG/WAI badges —
  // never a property photo (discovery: accessibility/wcag/wai/conformance on ~12% of sites).
  /accessibility/i, /\bwcag\b/i, /\bwai\b/i, /conformance/i, /accessibe|userway|audioeye/i,
  // Stock / lifestyle library images (dry-run finding: a farmers-market stock hero).
  // CONSERVATIVE — distinctive stock-source names + explicit "stock photo"/"lifestyle"
  // tags only. NOT people/person/resident: a real community photo with people is kept.
  /shutterstock/i, /\bistock(?:photo)?/i, /gettyimages|getty[-_ ]?images/i, /unsplash/i, /\bpexels/i,
  /\bstock[-_ ]?photos?\b/i, /\bstockphoto/i, /\bstock[-_ ]?images?\b/i, /\bstock\b/i, /lifestyle/i,
]

// Signals that an image IS a real property photo (boosts confidence).
const PHOTO_PATTERNS: RegExp[] = [
  /photo/i, /galler/i, /\bhero\b/i, /banner/i, /building/i, /exterior/i, /interior/i,
  /amenit/i, /\bproperty\b/i, /communit/i, /\bunit\b/i, /apartment/i, /\bpool\b/i,
  /\bslide/i, /carousel/i, /lifestyle/i, /residence/i,
]

// Auto-generated Open Graph SHARE-CARD files (e.g. RentCafe/CMS
// "og_image-<hash>.jpg" or "og1-<hash>.jpg" under /cache//assets/) are frequently
// a BRANDED graphic — a skyline/interior with the community LOGO + name overlaid
// (300 Main is exactly this). URL text can't see the overlay, so we treat these
// generated cards as low-confidence and reject them: a clean structured/gallery
// photo still wins, and when the card is the only image we fall back to the
// placeholder (preferred over a logo). A real uploaded photo used as og:image
// (e.g. /uploads/living-room.jpg) is NOT matched — only the generated
// "og<digits>" / "og_image-<hash>" naming with a hash is.
const OG_SHARECARD = /\/og[-_]?(?:image)?\d*[-_][a-z0-9]{6,}\.(?:jpe?g|png|webp)(?:[?#]|$)/i

// Explicitly tiny dimensions in the URL → an icon/thumbnail, not a hero photo.
// Only ≤2-digit dims (≤99px) are treated as tiny, so 1920x1080 etc. are fine.
function isTinyImage(lower: string): boolean {
  if (/[-_/(]\d{1,2}x\d{1,2}[-_.)/]/.test(lower)) return true
  if (/[?&](?:w|width|h|height)=\d{1,2}(?:&|$|,)/.test(lower)) return true
  return false
}

// ── Scene ranking: STRONG signals establish the tier; SUPPORTING signals only
// nudge within it ─────────────────────────────────────────────────────────────
// The STRONG tier DOMINATES the score (×1000), so ordering is deterministic:
//   5 exterior/building > 4 rooftop/pool/major amenity > 3 kitchen/model interior
//   > 2 secondary amenity / other > 1 rendering (fallback).
// Membership tuned to the keyword-discovery audit: only high-confidence scene
// words can SET a tier. Matched against the URL AND the candidate context (an
// <img>'s alt/class/title). Checked high→low; first match wins (exterior over pool).
const STRONG_TIERS: { tier: number; re: RegExp }[] = [
  // Tier 5 — exterior/building. "front" only qualifies alongside building/exterior
  // (bare "front" is a supporting signal), so "front desk"/"storefront" don't lift it.
  { tier: 5, re: /\bexterior\b|\bbuildings?\b|facade|\bentrance\b|\btower\b|high[-_ ]?rise|town[-_ ]?home|town[-_ ]?house|\baerial\b|\bdrone\b|(?:building|exterior)[-_ ]?front|front[-_ ]?(?:exterior|building)/i },
  // Tier 4 — pool / major amenity.
  { tier: 4, re: /\bpool\b|\bswimming\b|rooftop|courtyard|\bcabana\b|resort/i },
  // Tier 3 — kitchen / model / interior.
  { tier: 3, re: /kitchen|\bmodel\b|\binterior\b|\bliving\b|bedroom|bathroom|\bdining\b|apartment[-_ ]?home|residence/i },
  // Tier 2 — secondary amenities.
  { tier: 2, re: /clubhouse|fitness|\bgym\b|\blounge\b|exercise|workout|coworking|business[-_ ]?center/i },
]
// SUPPORTING signals: a small additive nudge ONLY (never set a tier). So
// "kitchen+island+stainless+cabinets" is a very strong tier-3 candidate, while
// "island" or "community" ALONE stays at the default "other" tier and can't
// outrank a real pool/exterior. Counted DISTINCT and capped.
const SUPPORTING_RE = /\bcommunity\b|\bcommunit|neighborhood|\boutdoor\b|\bpatio\b|\bbalcony\b|\bterrace\b|\broom\b|\bresident\b|appliances?|stainless|\bisland\b|granite|countertops?|cabinets?|\bwindows?\b|\bceiling\b|spacious|\bmodern\b|\bdeck\b|\bskyline\b|\bfront\b|\bamenit|hardwood|\bgarden\b/gi
// Renderings are FALLBACK ONLY: a rendering signal caps the tier at 1 even when a
// strong scene word also appears.
const RENDERING_RE = /rendering|architectural|\bcgi\b|artist[-_ ]?concept|coming[-_ ]?soon/i

// Best-effort pixel dimensions from the URL: filename "-1920x1080", "?w=/&h=", or
// cloudinary "w_/h_". Returns null when none are present.
function urlDims(url: string): { w: number; h: number } | null {
  const wh = /[-_/(](\d{2,5})x(\d{2,5})[-_.)/]/.exec(url)
  if (wh) return { w: +wh[1], h: +wh[2] }
  const gw = /[?&]w(?:idth)?=(\d{2,5})/i.exec(url)?.[1]
  const gh = /[?&]h(?:eight)?=(\d{2,5})/i.exec(url)?.[1]
  if (gw && gh) return { w: +gw, h: +gh }
  const cw = /[,/]w_(\d{2,5})(?=[,/])/i.exec(url)?.[1]
  const ch = /[,/]h_(\d{2,5})(?=[,/])/i.exec(url)?.[1]
  if (cw && ch) return { w: +cw, h: +ch }
  const only = gw || cw || gh || ch
  if (only) return { w: +only, h: +only } // single dim → treat as square for sizing
  return null
}
// Prefer landscape + higher resolution over square/tiny thumbnails. A PREFERENCE,
// not a gate — small vs the ×1000 tier weight, so it only orders within a tier
// (e.g. a full-res gallery pool over the site's 80px cloudinary pool thumbnail).
function sizeBonus(url: string): number {
  const d = urlDims(url)
  if (!d) return 0
  const max = Math.max(d.w, d.h)
  let b = 0
  if (max >= 1200) b += 12
  else if (max >= 800) b += 7
  else if (max >= 500) b += 2
  else if (max >= 300) b -= 3
  else b -= 12 // sub-300px → thumbnail
  if (d.w > d.h) b += 4 // landscape
  else if (d.w === d.h) b -= 1 // perfect square → often a cropped logo/thumb
  return b
}

// Returns a confidence score, or null when the candidate is rejected outright.
// `context` is the candidate's alt/class/title (empty for URL-only sources) and
// participates in BOTH rejection and scene ranking.
export function scorePropertyImage(rawUrl: string, boost = SOCIAL_BOOST, context = ""): number | null {
  const url = (rawUrl ?? "").trim()
  if (!url) return null
  const lower = url.toLowerCase()
  const text = `${url} ${context}`.toLowerCase()
  if (lower.startsWith("data:")) return null // inline data URIs are icons/spacers
  if (/\.svg(\?|#|$)/.test(lower)) return null // vector = logo/icon on marketing sites
  if (REJECT_PATTERNS.some((re) => re.test(text))) return null // url OR context (alt="Floor Plan")
  if (OG_SHARECARD.test(lower)) return null // generated branded share card
  if (isTinyImage(lower)) return null
  // STRONG scene word sets the tier. Default 2 ("other" — a valid, un-rejected
  // photo of an unknown scene, at the same rank as a secondary amenity, above a
  // rendering). A rendering signal caps to 1.
  let tier = 2
  for (const s of STRONG_TIERS) {
    if (s.re.test(text)) { tier = s.tier; break }
  }
  if (RENDERING_RE.test(text)) tier = 1
  // SUPPORTING signals: small additive nudge, DISTINCT + capped, so they order
  // within a tier but never lift one image over a better SCENE tier.
  const support = new Set((text.match(SUPPORTING_RE) ?? []).map((m) => m.toLowerCase()))
  const hasPhotoSignal = PHOTO_PATTERNS.some((re) => re.test(text))
  let extra = boost + Math.min(support.size, 6) * 1.5
  if (/\.(jpe?g|webp)(\?|#|$)/i.test(lower)) extra += 2 // photos are usually jpg/webp
  if (hasPhotoSignal) extra += 1 // hero/gallery/photo → content image
  extra += sizeBonus(url) // resolution + landscape break ties; never cross a tier

  // ── Structural demotion (tier-2 "other" ONLY) ──────────────────────────────
  // Applies ONLY when the image carries NO scene tier, NO supporting signal, and
  // NO photo-likelihood signal — i.e. a purely opaque candidate. Two shapes are
  // very likely a logo / branded share-card rather than a real property photo:
  //   (1) a near-square PNG (logos are square PNGs), and
  //   (2) an opaque ~1.91:1 image (1200×630 etc. — the OG share-card aspect).
  // These are DEMOTED below any plausible real photo (not rejected). A real photo
  // — anything with a scene/supporting/photo signal — never reaches this branch,
  // so a clear pool/exterior/kitchen always overrides the penalty. When only a
  // demoted graphic remains, selectBestImage falls back to the building icon.
  if (tier === 2 && support.size === 0 && !hasPhotoSignal) {
    const d = urlDims(url)
    if (d && d.w > 0 && d.h > 0) {
      const ratio = d.w / d.h
      const squarePng = /\.png(\?|#|$)/i.test(lower) && Math.abs(ratio - 1) <= 0.05
      const ogCard = ratio >= 1.85 && ratio <= 2.0 // ~1.91:1 branded card; excludes 16:9 (1.78)
      if (squarePng || ogCard) return GRAPHIC_DEMOTE + extra
    }
  }
  return tier * 1000 + extra
}

// A demoted graphic scores in its own band, BELOW a rendering (tier 1) and far
// below any real photo (tier ≥ 2). TRUST_FLOOR sits between the two: a candidate
// under it is treated as "nothing trustworthy" → the building-icon fallback.
const GRAPHIC_DEMOTE = 300
const TRUST_FLOOR = 800

// Pick the highest-confidence photo among candidates; null when none survive OR
// only a structurally-demoted graphic remains (→ building-icon fallback).
export function selectBestImage(candidates: ImageCandidate[]): string | null {
  let best: { url: string; score: number } | null = null
  for (const c of candidates) {
    const s = scorePropertyImage(c.url, c.boost, c.context ?? "")
    if (s === null) continue
    if (!best || s > best.score) best = { url: c.url, score: s }
  }
  if (!best || best.score < TRUST_FLOOR) return null // nothing trustworthy → icon fallback
  return best.url
}

// Flatten a JSON-LD image/photo value (string | array | ImageObject) into scored
// candidates. Array members are treated as a gallery (higher boost).
function jsonLdImageCandidates(value: unknown, boost: number, out: ImageCandidate[]): void {
  if (!value) return
  if (typeof value === "string") {
    const u = value.trim()
    if (u) out.push({ url: u, boost })
  } else if (Array.isArray(value)) {
    for (const item of value) jsonLdImageCandidates(item, GALLERY_BOOST, out)
  } else if (typeof value === "object" && typeof (value as { url?: unknown }).url === "string") {
    const u = ((value as { url: string }).url).trim()
    if (u) out.push({ url: u, boost })
  }
}

// Gallery / hero <img> candidates. Marketing sites frequently put the real
// exterior/pool photos in the gallery while og:image is a logo or a generated
// share-card (both rejected above), so the canonical JSON-LD+og path alone falls
// to the placeholder even when a great photo is right there. We collect each
// <img>'s best source (largest srcset entry, else data-src/lazy, else src) plus
// its alt/class/title as CONTEXT, so the scene ranker can read "Pool"/"Exterior"
// from the alt even on an opaque filename — and reject a "Floor Plan"/badge alt.
// The rejection gate + scene tiers do the filtering; this just widens the pool.
function imgGalleryCandidates(html: string, out: ImageCandidate[]): void {
  const re = /<img\b[^>]*>/gi
  let m: RegExpExecArray | null
  let seen = 0
  while ((m = re.exec(html)) && seen < 60) {
    const tag = m[0]
    let src: string | null = null
    const srcset = /\bsrcset=["']([^"']+)["']/i.exec(tag)?.[1]
    if (srcset) {
      // Split on the ENTRY separator (comma + whitespace), NOT every comma — a
      // cloudinary/CDN URL's transform segment contains commas (w_400,c_fill) with
      // no following space, so a naive split shatters the URL. Take the last entry
      // (largest descriptor); grab the URL before its width/density descriptor.
      const entries = srcset.split(/,\s+/).map((e) => e.trim().split(/\s+/)[0]).filter(Boolean)
      if (entries.length) src = entries[entries.length - 1]
    }
    if (!src) src = /\b(?:data-src|data-lazy-src|data-original|data-lazy)=["']([^"']+)["']/i.exec(tag)?.[1] ?? null
    if (!src) src = /\bsrc=["']([^"']+)["']/i.exec(tag)?.[1] ?? null
    if (!src || src.startsWith("data:")) continue
    const alt = /\balt=["']([^"']*)["']/i.exec(tag)?.[1] ?? ""
    const cls = /\bclass=["']([^"']*)["']/i.exec(tag)?.[1] ?? ""
    const title = /\btitle=["']([^"']*)["']/i.exec(tag)?.[1] ?? ""
    out.push({ url: src.trim(), boost: IMG_BOOST, context: `${alt} ${cls} ${title}` })
    seen++
  }
}

export function extractPropertyMetadata(html: string): DetectedMetadata {
  let name: string | null = null
  let address: string | null = null
  const candidates: ImageCandidate[] = []

  for (const block of extractJsonLdBlocks(html)) {
    if (!name && typeof block?.name === "string") name = decodeHtmlEntities(block.name)
    if (!address) address = formatAddress(block?.address)
    jsonLdImageCandidates(block?.image, STRUCTURED_BOOST, candidates)
    jsonLdImageCandidates(block?.photo, STRUCTURED_BOOST, candidates)
  }

  if (!name) name = extractMetaContent(html, "og:title")
  if (!name) name = extractMetaContent(html, "og:site_name")
  if (!name) name = extractTitle(html)

  // Social cards participate too, but at the lowest boost AND still subject to
  // the photo/logo filter — so a logo og:image is rejected while a structured
  // gallery photo (or a genuine hero og:image) wins.
  const og = extractMetaContent(html, "og:image")
  if (og) candidates.push({ url: og, boost: SOCIAL_BOOST })
  const tw = extractMetaContent(html, "twitter:image")
  if (tw) candidates.push({ url: tw, boost: SOCIAL_BOOST })

  // Gallery/hero <img> photos — the scene ranker + rejection gate decide whether
  // any of them beat the structured/social candidates.
  imgGalleryCandidates(html, candidates)

  const image = selectBestImage(candidates)

  return { name, address, image }
}
