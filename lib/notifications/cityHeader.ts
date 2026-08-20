import { MARKETS } from "@/lib/markets/catalog"
import { themeImageUrl, AVAILABLE_THEMES } from "@/lib/themes/config"
import { absoluteUrl } from "./branding"

// Resolve a lead's submitted city/market to an ABSOLUTE, email-usable skyline
// header image — reusing Locator Beast's EXISTING theme registry as the single
// source of truth. No city list, theme mapping, or images are duplicated here:
//
//   lead.city  →  market (lib/markets/catalog: the market `name` IS the value
//                 submitted as `city`)  →  market.defaultTheme  →
//                 themeImageUrl(slug) (lib/themes/config → /themes/{state}/{slug}.webp)
//                 →  absoluteUrl(...) (https://locatorbeast.com/...)
//
// The skyline follows the LEAD's market only; it is independent of the user's
// CRM color theme, and the email styling stays Locator Beast branded.
//
// Returns imageUrl = null when the city is missing, unsupported, or its theme
// has no bundled image (e.g. new-braunfels, san-marcos, tucson) — callers then
// render the neutral branded header (renderEmail with no bannerImageUrl).
//
// NOTE: the registry images are .webp — rendered by Gmail / Apple Mail / most
// webmail, but NOT Outlook desktop. renderEmail wraps the banner in an `!mso`
// guard + a dark branded band, so Outlook (and any client that can't show webp)
// degrades to the neutral header rather than a broken image.

export type CitySkyline = { label: string | null; imageUrl: string | null }

export function resolveCitySkyline(city: string | null | undefined): CitySkyline {
  const raw = (city ?? "").trim()
  if (!raw) return { label: null, imageUrl: null }
  const norm = raw.toLowerCase()

  // 1) Per-agent Smart Form submits the market NAME as `city` (e.g. "Houston",
  //    "Dallas", "Fort Worth" — Dallas/Fort Worth and Miami/Fort Lauderdale are
  //    separate markets). Match a market by name/slug.
  let themeSlug: string | null = null
  const market =
    MARKETS.find((m) => m.name.toLowerCase() === norm) ??
    MARKETS.find((m) => m.slug.toLowerCase() === norm)
  if (market) themeSlug = market.defaultTheme

  // 2) Otherwise a free-text city may directly be a theme label/slug ("Austin").
  if (!themeSlug) {
    const theme = AVAILABLE_THEMES.find(
      (t) => t.label.toLowerCase() === norm || t.slug.toLowerCase() === norm,
    )
    if (theme) themeSlug = theme.slug
  }

  if (!themeSlug) return { label: raw, imageUrl: null }

  const rel = themeImageUrl(themeSlug) // "/themes/{state}/{slug}.webp" | null
  return { label: raw, imageUrl: rel ? absoluteUrl(rel) : null }
}

/** Ready-to-spread banner props for renderEmail, resolved from a lead's city. */
export function cityBanner(city: string | null | undefined): { bannerImageUrl: string | null; bannerAlt?: string } {
  const { label, imageUrl } = resolveCitySkyline(city)
  return { bannerImageUrl: imageUrl, bannerAlt: label ? `${label} skyline` : undefined }
}
