// Social Autopilot — human-readable Content Library name builder (pure; server-safe).
//
// Default format when metadata exists:  "Property Name - Market - YYYY-MM-DD - NN"
// Temporary format before metadata:      "<original filename base> - YYYY-MM-DD - NN"
// The name is display-only metadata — it never affects the immutable storage path.
import { normalizeSocialMarket } from "@/lib/social/markets"

// Keep letters, numbers, spaces, underscores and hyphens; collapse whitespace.
function clean(s: string | null | undefined): string {
  return (s ?? "").replace(/[^\p{L}\p{N}\s_-]/gu, "").replace(/\s+/g, " ").trim()
}

export function padSeq(n: number | null | undefined): string {
  const v = typeof n === "number" && n > 0 ? n : 1
  return String(v).padStart(2, "0")
}

export function filenameBase(name: string | null | undefined): string {
  const b = (name ?? "").replace(/\.[^.]+$/, "")
  return clean(b) || "Video"
}

export function buildSocialDisplayName(opts: {
  propertyName?: string | null
  market?: string | null
  dateISO?: string | null
  seq?: number | null
  fallbackFilename?: string | null
}): string {
  const date = (opts.dateISO ?? "").slice(0, 10)
  const prop = clean(opts.propertyName)
  const market = clean(normalizeSocialMarket(opts.market))
  const parts: string[] = []
  if (prop) parts.push(prop)
  if (market) parts.push(market)
  if (parts.length === 0) parts.push(filenameBase(opts.fallbackFilename)) // temporary name
  if (date) parts.push(date)
  parts.push(padSeq(opts.seq))
  return parts.filter(Boolean).join(" - ")
}
