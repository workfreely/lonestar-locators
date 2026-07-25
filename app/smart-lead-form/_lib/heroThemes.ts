// Placeholder theme registry. Long-term, this list will be generated from
// the service areas a locator selects during onboarding, and each city's
// `defaultImageUrl` will point at bundled photography. Until that system
// exists, city themes have no default image yet — the panel shows a
// "coming soon" note instead of a broken image. "Custom" is the only theme
// that ever reads from `branding.heroImageUrl`.
export type HeroThemeId = "san-antonio" | "austin" | "dallas" | "custom"

export type HeroTheme = {
  id: HeroThemeId
  label: string
  defaultImageUrl: string | null
}

export const HERO_THEMES: HeroTheme[] = [
  { id: "san-antonio", label: "San Antonio", defaultImageUrl: null },
  { id: "austin", label: "Austin", defaultImageUrl: null },
  { id: "dallas", label: "Dallas", defaultImageUrl: null },
  { id: "custom", label: "Custom", defaultImageUrl: null },
]

export function getHeroTheme(id: HeroThemeId): HeroTheme {
  return HERO_THEMES.find((theme) => theme.id === id) ?? HERO_THEMES[HERO_THEMES.length - 1]
}
