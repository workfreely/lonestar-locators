import { MARKETS } from "@/lib/markets/catalog"
import { AVAILABLE_THEMES } from "@/lib/themes/config"

// Canonical resolution of a submitted search city/market string to a built-in
// hero THEME slug, reusing the EXISTING catalogs as the single source of truth
// (no city list or image map is duplicated here):
//
//   city string → market (lib/markets/catalog: the market `name` IS the value
//                 submitted as `city`; also match by slug) → market.defaultTheme
//   ...else the string may already be a theme label/slug ("Austin") →   that slug
//
// Matching is a case-insensitive EXACT match against catalog values ONLY, so a
// free-text / attacker-supplied `city` can never yield an arbitrary slug — only
// a slug that exists in the catalog, or null.
//
// Markets are deliberately DISTINCT (Dallas, Fort Worth, Miami, Fort Lauderdale
// are separate markets); there is intentionally no "DFW"/fuzzy aliasing here.
//
// Returns null when the city is empty or unsupported. A returned slug may still
// have no bundled image (e.g. new-braunfels, san-marcos, tucson) — callers that
// need a guaranteed image resolve through themeImageUrl() + a fallback.
export function cityToThemeSlug(city: string | null | undefined): string | null {
  const norm = (city ?? "").trim().toLowerCase()
  if (!norm) return null

  const market =
    MARKETS.find((m) => m.name.toLowerCase() === norm) ??
    MARKETS.find((m) => m.slug.toLowerCase() === norm)
  if (market) return market.defaultTheme

  const theme = AVAILABLE_THEMES.find(
    (t) => t.label.toLowerCase() === norm || t.slug.toLowerCase() === norm,
  )
  return theme ? theme.slug : null
}
