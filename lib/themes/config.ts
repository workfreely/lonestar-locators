// ── Visual theme catalog (Hero Background) ──────────────────────────────────
//
// The SINGLE source of truth for the built-in hero background *themes*. A theme
// is purely a background image shown on the landing page — it is NOT a market
// (where the locator works). Markets live in `lib/markets/catalog.ts`; the
// market → default-theme mapping lives there too (DEFAULT_THEME_BY_MARKET).
//
// Ordering is authoritative and FIXED: the Hero Background dropdown renders in
// exactly this order (grouped by state), never sorted, never reordered, never
// rebuilt around the current selection — the selected option only gets the
// native ✓. "Custom" is appended by the UI as the always-last option.
//
// Images are auto-mapped by filename: the importer (`scripts/import-themes.mjs`)
// writes `lib/themes/generated-themes.ts` keyed by theme slug, and we join on
// that slug here. A theme with NO imported image stays in the list and falls
// back to the default (dark) background — it is never hidden. Adding a theme is
// a one-line edit here (+ dropping the image in the source folder & rerunning
// the importer); no UI code changes.

import { IMPORTED_THEMES } from "./generated-themes"

export type ThemeOption = { slug: string; label: string }
export type ThemeGroup = { state: string; themes: ThemeOption[] }

export const CUSTOM_THEME_ID = "custom"

export const AVAILABLE_THEME_GROUPS: ThemeGroup[] = [
  {
    state: "Texas",
    themes: [
      { slug: "austin", label: "Austin" },
      { slug: "dallas", label: "Dallas" },
      { slug: "fort-worth", label: "Fort Worth" },
      { slug: "houston", label: "Houston" },
      { slug: "new-braunfels", label: "New Braunfels" },
      { slug: "san-antonio", label: "San Antonio" },
      { slug: "san-marcos", label: "San Marcos" },
    ],
  },
  { state: "Georgia", themes: [{ slug: "atlanta", label: "Atlanta" }] },
  {
    state: "Arizona",
    themes: [
      { slug: "phoenix", label: "Phoenix" },
      { slug: "tucson", label: "Tucson" },
    ],
  },
  {
    state: "Florida",
    themes: [
      { slug: "miami", label: "Miami" },
      { slug: "ft-lauderdale", label: "Fort Lauderdale" },
      { slug: "orlando", label: "Orlando" },
    ],
  },
  { state: "Illinois", themes: [{ slug: "chicago", label: "Chicago" }] },
  { state: "Colorado", themes: [{ slug: "denver", label: "Denver" }] },
  { state: "Tennessee", themes: [{ slug: "nashville", label: "Nashville" }] },
]

/** Flat, order-preserving list of every built-in theme (excludes "Custom"). */
export const AVAILABLE_THEMES: ThemeOption[] = AVAILABLE_THEME_GROUPS.flatMap((g) => g.themes)

const LABEL_BY_SLUG: Record<string, string> = Object.fromEntries(AVAILABLE_THEMES.map((t) => [t.slug, t.label]))

// Image inventory, auto-mapped by filename (theme slug → optimized webp path).
const IMAGE_BY_SLUG: Record<string, string> = Object.fromEntries(IMPORTED_THEMES.map((t) => [t.slug, t.imageUrl]))

/** Resolved background image for a theme slug, or null when none is bundled. */
export function themeImageUrl(slug: string): string | null {
  return IMAGE_BY_SLUG[slug] ?? null
}

/** Display label for a theme slug (falls back to the slug itself). */
export function themeLabel(slug: string): string {
  return LABEL_BY_SLUG[slug] ?? slug
}

/** True when `slug` is a known built-in theme (not "custom", not unknown). */
export function isBuiltInTheme(slug: string): boolean {
  return slug in LABEL_BY_SLUG
}

/** Built-in themes that have no bundled image yet (they still show + fall back). */
export function themesMissingImages(): ThemeOption[] {
  return AVAILABLE_THEMES.filter((t) => !themeImageUrl(t.slug))
}
