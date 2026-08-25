export const runtime = "nodejs"

import { NextResponse } from "next/server"
import { isValidUrl, normalizeUrl } from "@/lib/utils/isValidUrl"
import { extractPropertyMetadata } from "@/lib/leads/detectPropertyMetadata"
import { createClient } from "@/lib/supabase/server"
import { rateLimit } from "@/lib/rateLimit"
import { safeFetch } from "@/lib/security/ssrfGuard"

// Fetches a property URL server-side (avoids browser CORS entirely) and pulls a
// best-guess name/address out of its metadata.
//
// SECURITY — this route was an unauthenticated SSRF. It accepted any URL from
// any caller and fetched it from our server, gated only by isValidUrl(), which
// requires nothing more than `hostname.includes(".")` — a test that
// "127.0.0.1", "10.0.0.5" and "169.254.169.254" all pass. That made it an
// unauthenticated probe into loopback, RFC1918 space and cloud metadata, and it
// returned parsed page content, so it could exfiltrate as well as scan.
//
// Now: authenticated, rate-limited, and every hop validated by resolved IP (see
// lib/security/ssrfGuard.ts). Its sole caller is FavoriteModal.tsx, which is
// authenticated CRM UI, so requiring a session removes no legitimate use.
//
// The response shape is unchanged — the caller (FavoriteModal) treats
// { success: false } as "leave the fields editable", not as an error to show.
// Failures stay generic on purpose: a distinguishable "blocked" answer would
// turn this into an internal-network oracle, telling an attacker which
// addresses exist. Reasons are logged server-side only.

const TIMEOUT_MS = 8000          // unchanged from the original
const RATE_LIMIT = 30            // per user
const RATE_WINDOW_MS = 60_000

export async function POST(request: Request) {
  // 1. Authenticated callers only.
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ success: false }, { status: 401 })
  }

  // 2. Per-user rate limit. Keyed on the user id rather than IP because the
  //    route is authenticated — that is both more accurate and not defeated by
  //    a shared office NAT.
  const limit = rateLimit(`detect-metadata:${user.id}`, RATE_LIMIT, RATE_WINDOW_MS)
  if (!limit.allowed) {
    return NextResponse.json(
      { success: false },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } }
    )
  }

  const body = await request.json().catch(() => null)
  const url = body?.url
  if (typeof url !== "string" || !isValidUrl(url)) {
    return NextResponse.json({ success: false })
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    // 3. Validated fetch: scheme, resolved IPs, and every redirect hop.
    const result = await safeFetch(normalizeUrl(url), {
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; LoneStarLocatorsBot/1.0)" },
      maxRedirects: 3,
    })

    if (!result.ok) {
      console.warn(`[detect-metadata] refused for user ${user.id}: ${result.reason}`)
      return NextResponse.json({ success: false })
    }

    const res = result.response
    if (!res.ok) return NextResponse.json({ success: false })

    const contentType = res.headers.get("content-type") || ""
    if (!contentType.includes("text/html")) return NextResponse.json({ success: false })

    const html = await res.text()
    const { name, address, image } = extractPropertyMetadata(html)
    if (!name && !address) return NextResponse.json({ success: false })

    // Resolve og:image against the FINAL url (after redirects) so a relative or
    // protocol-relative path becomes absolute. Best-effort — a bad image is
    // dropped and the UI falls back to the placeholder.
    let imageUrl: string | null = null
    if (image) {
      try {
        imageUrl = new URL(image, result.finalUrl).href
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
