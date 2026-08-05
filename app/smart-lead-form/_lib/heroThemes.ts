import { AVAILABLE_THEMES, CUSTOM_THEME_ID, themeImageUrl, themeLabel } from "@/lib/themes/config"

// Adapter over the centralized theme catalog (lib/themes/config.ts). The theme
// list, ordering, labels, and image mapping all live there; this module just
// exposes the small shape the public form renderer needs. A theme id is a city
// theme slug (e.g. "austin") or "custom" — "custom" is the only theme that reads
// from `branding.heroImageUrl`. A built-in theme with no bundled image resolves
// to `defaultImageUrl: null`, so the form gracefully falls back to its default
// (dark) background — the option is never hidden.
export type HeroThemeId = string

export type HeroTheme = {
  id: HeroThemeId
  label: string
  defaultImageUrl: string | null
}

const CUSTOM: HeroTheme = { id: CUSTOM_THEME_ID, label: "Custom", defaultImageUrl: null }

/** Flat list of every built-in theme + Custom last (order preserved). */
export const HERO_THEMES: HeroTheme[] = [
  ...AVAILABLE_THEMES.map((t) => ({ id: t.slug, label: t.label, defaultImageUrl: themeImageUrl(t.slug) })),
  CUSTOM,
]

export function getHeroTheme(id: HeroThemeId): HeroTheme {
  if (id === CUSTOM_THEME_ID) return CUSTOM
  // Unknown ids (e.g. a theme removed from the catalog) fall back to Custom.
  const label = themeLabel(id)
  return label === id && !AVAILABLE_THEMES.some((t) => t.slug === id)
    ? CUSTOM
    : { id, label, defaultImageUrl: themeImageUrl(id) }
}
