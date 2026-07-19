// Best-effort property metadata extraction from a fetched HTML page —
// checked in order: JSON-LD structured data, Open Graph tags, then the
// plain <title> tag as a last resort. Regex-based on purpose (no DOM/HTML
// parser dependency) — good enough for well-formed marketing/listing
// pages, which is the realistic input here (an operator pasting a real
// apartment community's URL), not arbitrary hostile HTML.

export type DetectedMetadata = {
  name: string | null
  address: string | null
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

export function extractPropertyMetadata(html: string): DetectedMetadata {
  let name: string | null = null
  let address: string | null = null

  for (const block of extractJsonLdBlocks(html)) {
    if (!name && typeof block?.name === "string") name = decodeHtmlEntities(block.name)
    if (!address) address = formatAddress(block?.address)
    if (name && address) break
  }

  if (!name) name = extractMetaContent(html, "og:title")
  if (!name) name = extractMetaContent(html, "og:site_name")
  if (!name) name = extractTitle(html)

  return { name, address }
}
