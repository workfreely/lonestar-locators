// Centralized CRM theme logic — the single source of truth for how a
// ThemePreference ("light" | "dark" | "system") resolves to an actual
// applied theme, shared by the anti-flash inline script (app/layout.tsx),
// ThemeProvider, and the Appearance menu. Nothing here touches the DOM
// except applyTheme, which only ever toggles one class on <html>.

export type ThemePreference = "light" | "dark" | "system"
export type EffectiveTheme = "light" | "dark"

export const THEME_STORAGE_KEY = "theme-preference"

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === "light" || value === "dark" || value === "system"
}

export function getSystemPrefersDark(): boolean {
  if (typeof window === "undefined") return false
  return window.matchMedia("(prefers-color-scheme: dark)").matches
}

export function resolveEffectiveTheme(preference: ThemePreference): EffectiveTheme {
  if (preference === "system") return getSystemPrefersDark() ? "dark" : "light"
  return preference
}

export function readStoredThemePreference(): ThemePreference {
  if (typeof window === "undefined") return "light"
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY)
  return isThemePreference(stored) ? stored : "light"
}

export function applyTheme(preference: ThemePreference) {
  if (typeof document === "undefined") return
  document.documentElement.classList.toggle("dark", resolveEffectiveTheme(preference) === "dark")
}

// Inlined verbatim into a <script> tag in app/layout.tsx's <head> — must
// stay a self-contained string (no imports) since it runs before React
// hydrates. Keep this logic in sync with the functions above by hand;
// it deliberately duplicates rather than imports them.
export const ANTI_FLASH_THEME_SCRIPT = `
(function() {
  try {
    var pref = localStorage.getItem('${THEME_STORAGE_KEY}') || 'light';
    var isDark = pref === 'dark' || (pref === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    if (isDark) document.documentElement.classList.add('dark');
  } catch (e) {}
})();
`.trim()
