/**
 * Shared theme registry — all existing Locator Beast CRM appearance themes,
 * expressed as SEMANTIC tokens (not component-specific colors) so the CRM and the
 * Companion render identically. Midnight is the default and the pre-React paint
 * fallback; unknown/missing ids fall back to Midnight.
 *
 * Chrome values are copied verbatim from app/globals.css `:root[data-theme="…"]`.
 * Status colors (success/warning/danger/info) are shared across every theme (the
 * CRM keeps these literal in all themes by design).
 */

import { z } from "zod";

export const THEME_IDS = ["midnight", "evergreen", "purple", "obsidian", "rose"] as const;
export type ThemeId = (typeof THEME_IDS)[number];

export const DEFAULT_THEME_ID: ThemeId = "midnight";

/** The semantic surface — the only names UI code should reference. */
export interface SemanticTokens {
  background: string;
  surface: string;
  surfaceElevated: string;
  sectionHeader: string;
  border: string;
  textPrimary: string;
  textSecondary: string;
  accent: string;
  accentSoft: string;
  success: string;
  warning: string;
  danger: string;
  info: string;
}

/** Status colors — identical across all themes. */
const STATUS = {
  success: "#22c55e",
  warning: "#f59e0b",
  danger: "#ef4444",
  info: "#3b82f6",
} as const;

/** accentSoft is a tint of the theme accent (matches .crm-cta-soft's 16% mix). */
const soft = (accent: string) => `color-mix(in srgb, ${accent} 16%, transparent)`;

type ChromeInput = {
  background: string;
  surface: string;
  surfaceElevated: string;
  sectionHeader: string;
  border: string;
  textPrimary: string;
  textSecondary: string;
  accent: string;
};
const theme = (c: ChromeInput): SemanticTokens => ({
  ...c,
  accentSoft: soft(c.accent),
  ...STATUS,
});

export const THEME_REGISTRY: Record<ThemeId, SemanticTokens> = {
  midnight: theme({
    background: "#04060c",
    surface: "#0e1119",
    surfaceElevated: "#1b2030",
    sectionHeader: "#12151f",
    border: "#2b3242",
    textPrimary: "#f4f6fb",
    textSecondary: "#b7bec9",
    accent: "#2f6bff",
  }),
  evergreen: theme({
    background: "#0c1512",
    surface: "#14201b",
    surfaceElevated: "#203029",
    sectionHeader: "#142019",
    border: "#2a3f34",
    textPrimary: "#eef4f0",
    textSecondary: "#c2ccc6",
    accent: "#22885e",
  }),
  purple: theme({
    background: "#120b1c",
    surface: "#1b1229",
    surfaceElevated: "#2a1c40",
    sectionHeader: "#1a1128",
    border: "#3a2d50",
    textPrimary: "#f2eefb",
    textSecondary: "#c9c0d6",
    accent: "#8358d8",
  }),
  obsidian: theme({
    background: "#000000",
    surface: "#0e1014",
    surfaceElevated: "#191b21",
    sectionHeader: "#0f1116",
    border: "#262a31",
    textPrimary: "#f6f7f9",
    textSecondary: "#b6bac1",
    accent: "#3f78ff",
  }),
  rose: theme({
    background: "#1c1019",
    surface: "#271823",
    surfaceElevated: "#46283a",
    sectionHeader: "#201019",
    border: "#4b3541",
    textPrimary: "#fcf0f4",
    textSecondary: "#cdbcc4",
    accent: "#c14f70",
  }),
};

// ── Runtime validation + safe fallback ───────────────────────────────────────
export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === "string" && (THEME_IDS as readonly string[]).includes(value);
}

/** Never throws — unknown/missing ids resolve to Midnight. */
export function resolveThemeId(value: unknown): ThemeId {
  return isThemeId(value) ? value : DEFAULT_THEME_ID;
}

/** Zod schema with a built-in safe fallback to Midnight. */
export const themeIdSchema = z.enum(THEME_IDS).catch(DEFAULT_THEME_ID);

/** Emit the `--lb-*` custom properties for a theme (for CSS-in-JS or inline paint). */
export function semanticToCssVars(t: SemanticTokens): Record<string, string> {
  return {
    "--lb-background": t.background,
    "--lb-surface": t.surface,
    "--lb-surface-elevated": t.surfaceElevated,
    "--lb-section-header": t.sectionHeader,
    "--lb-border": t.border,
    "--lb-text-primary": t.textPrimary,
    "--lb-text-secondary": t.textSecondary,
    "--lb-accent": t.accent,
    "--lb-accent-soft": t.accentSoft,
    "--lb-success": t.success,
    "--lb-warning": t.warning,
    "--lb-danger": t.danger,
    "--lb-info": t.info,
  };
}
