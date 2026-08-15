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

type ImageCandidate = { url: string; boost: number }

// Source boosts — structured/gallery property images are preferred over social.
const GALLERY_BOOST = 4 // an item inside a JSON-LD image ARRAY (a real gallery)
const STRUCTURED_BOOST = 3 // a single JSON-LD image/photo
const SOCIAL_BOOST = 1 // og:image / twitter:image

// Filename/URL signals that mark an image as NOT a real property photo. Kept
// conservative to avoid rejecting real photos whose community name coincidentally
// contains a word (e.g. "brand" only matches as its own path segment, so
// "brandywine-exterior.jpg" is NOT rejected).
const REJECT_PATTERNS: RegExp[] = [
  /logo/i, /favicon/i, /\bicon\b/i, /icons?\//i, /sprite/i, /wordmark/i, /brandmark/i,
  /[-_/]brand[-_.]/i, /emblem/i, /\bbadge\b/i, /avatar/i, /placeholder/i, /\bdefault\b/i,
  /og[-_]?default/i, /\bblank\b/i, /\bpixel\b/i, /spacer/i, /\bshare\b/i, /apple[-_]?touch/i,
  /watermark/i, /1x1/i,
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

// Returns a confidence score, or null when the candidate is rejected outright.
export function scorePropertyImage(rawUrl: string, boost = SOCIAL_BOOST): number | null {
  const url = (rawUrl ?? "").trim()
  if (!url) return null
  const lower = url.toLowerCase()
  if (lower.startsWith("data:")) return null // inline data URIs are icons/spacers
  if (/\.svg(\?|#|$)/.test(lower)) return null // vector = logo/icon on marketing sites
  if (REJECT_PATTERNS.some((re) => re.test(url))) return null
  if (OG_SHARECARD.test(lower)) return null // generated branded share card
  if (isTinyImage(lower)) return null
  let score = boost
  if (PHOTO_PATTERNS.some((re) => re.test(url))) score += 3
  if (/\.(jpe?g|webp)(\?|#|$)/i.test(lower)) score += 2 // photos are usually jpg/webp
  return score
}

// Pick the highest-confidence photo among candidates; null when none survive.
// Ties keep the earliest (source/gallery order), so a gallery's first (hero)
// image wins over later ones of equal score.
export function selectBestImage(candidates: ImageCandidate[]): string | null {
  let best: { url: string; score: number } | null = null
  for (const c of candidates) {
    const s = scorePropertyImage(c.url, c.boost)
    if (s === null) continue
    if (!best || s > best.score) best = { url: c.url, score: s }
  }
  return best?.url ?? null
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

  const image = selectBestImage(candidates)

  return { name, address, image }
}
