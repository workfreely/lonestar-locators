import {
  THEME_REGISTRY,
  resolveThemeId,
  semanticToCssVars,
  DEFAULT_THEME_ID,
  type ThemeId,
} from "@bc/companion-shared";

/**
 * Apply a shared theme to the side-panel document at runtime. We set the `--lb-*`
 * custom properties directly from the SHARED token registry (single source of
 * truth) instead of importing a cross-package stylesheet — that's bundler-robust
 * in both `vite` dev and the production build. The inline paint in sidepanel.html
 * already covers the pre-React frame; this fills in the full token set on mount.
 */
export function applyTheme(themeId: ThemeId | string | undefined = DEFAULT_THEME_ID): ThemeId {
  const id = resolveThemeId(themeId);
  const vars = semanticToCssVars(THEME_REGISTRY[id]);
  const root = document.documentElement;
  for (const [prop, value] of Object.entries(vars)) {
    root.style.setProperty(prop, value);
  }
  root.setAttribute("data-lb-theme", id);
  return id;
}
