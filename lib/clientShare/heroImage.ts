import { cityToThemeSlug } from "@/lib/markets/cityTheme"
import { themeImageUrl } from "@/lib/themes/config"
import { SKYLINE_PATH } from "./skylinePath"

// THE canonical client-facing hero image resolver, shared by the post-submission
// Thank You page and the client Recommendations (/r) page. It resolves the
// CLIENT's submitted SEARCH city to an existing Locator Beast theme skyline,
// falling back to the generic SKYLINE_PATH so the hero is NEVER broken/empty:
//
//   city → cityToThemeSlug (canonical catalog match) → themeImageUrl → SKYLINE_PATH
//
// SAFETY: the returned path is ALWAYS either a catalog theme image
// (/themes/{state}/{slug}.webp) or the bundled SKYLINE_PATH. Because the slug is
// resolved by an exact match against the catalog (never derived from the raw
// string), an unknown / free-text / malicious `city` can never produce an
// arbitrary asset path — it simply falls back to SKYLINE_PATH.
//
// Markets whose default theme has no bundled image (new-braunfels, san-marcos,
// tucson) and unknown cities both resolve to SKYLINE_PATH.
//
// This is the client SEARCH-market image and is INDEPENDENT of the locator's own
// Smart Lead Form hero/theme configuration (which is unchanged by this helper).
//
// NOTE: theme images are .webp; this drives the on-page CSS hero only (browsers
// render webp). The Open Graph image keeps using the generic SKYLINE_PATH .jpeg
// via skylineDataUri(), because next/og (Satori) cannot decode webp.
export function clientHeroImage(city: string | null | undefined): string {
  const slug = cityToThemeSlug(city)
  return (slug && themeImageUrl(slug)) || SKYLINE_PATH
}
