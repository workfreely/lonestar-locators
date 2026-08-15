import { NextResponse } from "next/server"
import { isValidUrl, normalizeUrl } from "@/lib/utils/isValidUrl"
import { extractPropertyMetadata } from "@/lib/leads/detectPropertyMetadata"

// Fetches a property URL server-side (avoids browser CORS entirely) and
// pulls out a best-guess name/address from its metadata. Always resolves
// with { success: false } rather than an error status on any failure —
// the caller (FavoriteModal) treats that as "leave the fields editable,"
// not as something to surface as a hard error.
export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  const url = body?.url

  if (typeof url !== "string" || !isValidUrl(url)) {
    return NextResponse.json({ success: false })
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 8000)

  try {
    const res = await fetch(normalizeUrl(url), {
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; LoneStarLocatorsBot/1.0)" },
    })

    if (!res.ok) return NextResponse.json({ success: false })

    const contentType = res.headers.get("content-type") || ""
    if (!contentType.includes("text/html")) return NextResponse.json({ success: false })

    const html = await res.text()
    const { name, address, image } = extractPropertyMetadata(html)

    if (!name && !address) return NextResponse.json({ success: false })

    // Resolve the preview image (og:image) against the page URL so a relative or
    // protocol-relative path becomes an absolute, reusable URL. Best-effort — a
    // bad/unparseable image is simply dropped (the UI falls back to the placeholder).
    let imageUrl: string | null = null
    if (image) {
      try {
        imageUrl = new URL(image, normalizeUrl(url)).href
      } catch {
        imageUrl = null
      }
    }

    return NextResponse.json({ success: true, propertyName: name, propertyAddress: address, imageUrl })
  } catch (error) {
    console.error("[detect-metadata] fetch failed:", error)
    return NextResponse.json({ success: false })
  } finally {
    clearTimeout(timeout)
  }
}
