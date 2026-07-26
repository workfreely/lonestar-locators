// Centralized CRM theme logic — the single source of truth for the four
// locked appearance themes (Midnight is the reference; Light, Obsidian and
// Rose share its depth system, only the palette differs). Shared by the
// anti-flash inline script (app/layout.tsx), ThemeProvider, and the
// Appearance menu. Nothing here touches the DOM except applyTheme.
//
// All four themes are dark-chrome (dark workspace, elevated content), so
// applyTheme keeps Tailwind's `.dark` class on alongside the per-theme
// `data-theme` attribute that selects the palette in globals.css.

export type CrmTheme = "midnight" | "obsidian" | "rose" | "evergreen" | "purple"

export const CRM_THEMES: CrmTheme[] = ["midnight", "obsidian", "rose", "evergreen", "purple"]

// Midnight is the design system's reference implementation, so it's the
// default when nothing (or an old light/dark/system value) is stored.
export const DEFAULT_THEME: CrmTheme = "midnight"

export const THEME_STORAGE_KEY = "theme-preference"

export function isCrmTheme(value: unknown): value is CrmTheme {
  return (
    value === "midnight" ||
    value === "obsidian" ||
    value === "rose" ||
    value === "evergreen" ||
    value === "purple"
  )
}

export function readStoredTheme(): CrmTheme {
  if (typeof window === "undefined") return DEFAULT_THEME
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY)
  return isCrmTheme(stored) ? stored : DEFAULT_THEME
}

export function applyTheme(theme: CrmTheme) {
  if (typeof document === "undefined") return
  const root = document.documentElement
  root.setAttribute("data-theme", theme)
  // Every CRM theme is dark-chrome — keep `.dark` on so the handful of
  // Tailwind `dark:` utilities in the CRM stay active. The specific
  // palette is chosen by `data-theme` in globals.css.
  root.classList.add("dark")
}

// Inlined verbatim into a <script> tag in app/layout.tsx's <head> — must
// stay a self-contained string (no imports) since it runs before React
// hydrates. Scoped to /admin so the marketing site is never touched. Keep
// in sync with the functions above by hand; it deliberately duplicates.
export const ANTI_FLASH_THEME_SCRIPT = `
(function() {
  try {
    if (!location.pathname.startsWith('/admin')) return;
    var t = localStorage.getItem('${THEME_STORAGE_KEY}');
    if (t !== 'midnight' && t !== 'obsidian' && t !== 'rose' && t !== 'evergreen' && t !== 'purple') t = '${DEFAULT_THEME}';
    var r = document.documentElement;
    r.setAttribute('data-theme', t);
    r.classList.add('dark');
  } catch (e) {}
})();
`.trim()
