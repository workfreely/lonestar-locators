/**
 * Design tokens shared by the Locator Beast CRM and Beast Companion. These are
 * the SAME `--crm-*` chrome tokens the web app already uses (see app/globals.css)
 * — extracted so the extension consumes tokens instead of a copied stylesheet.
 *
 * The Companion ships the "Midnight" palette by default: it matches the CRM's
 * dark chrome and its accent (#2f6bff) is the Beast brand blue already used by
 * the launcher, so the panel reads as one product with the workspace.
 */

export interface CrmPalette {
  background: string;
  workspace: string;
  panel: string;
  card: string;
  inset: string;
  border: string;
  borderSoft: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  /** rgb triplet used inside shadow rgba() */
  shadowColor: string;
  accent: string;
  accentHover: string;
  accentContrast: string;
}

/** Midnight — the Companion default (navy-charcoal). Values copied verbatim from
 *  app/globals.css `:root[data-theme="midnight"]`. */
export const MIDNIGHT: CrmPalette = {
  background: "#04060c",
  workspace: "#04060c",
  panel: "#0e1119",
  card: "#1b2030",
  inset: "#12151f",
  border: "#2b3242",
  borderSoft: "#0a0d14",
  textPrimary: "#f4f6fb",
  textSecondary: "#b7bec9",
  textMuted: "#8b93a0",
  shadowColor: "0, 0, 0",
  accent: "#2758d1",
  accentHover: "#2f6bff",
  accentContrast: "#ffffff",
};

/** Shape tokens (radii, spacing, typography) — mirrors the panel's existing look. */
export const SHAPE = {
  radius: { sm: "8px", md: "12px", lg: "14px", xl: "16px", pill: "999px" },
  space: { xs: "4px", sm: "8px", md: "12px", lg: "16px", xl: "24px" },
  font: {
    family:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, "Apple Color Emoji", sans-serif',
    size: { xs: "11px", sm: "12.5px", md: "13px", lg: "14px", xl: "22px" },
    weight: { normal: 500, semibold: 600, bold: 700 },
  },
} as const;

/** Semantic badge tones → {bg, text, border} for the current (dark) surface.
 *  Keeps stage/approval/overdue pills consistent across app + extension without
 *  Tailwind classes. */
export type BadgeToneStyle = { bg: string; text: string; border: string };
export const BADGE_TONES: Record<string, BadgeToneStyle> = {
  amber: { bg: "rgba(245,158,11,0.16)", text: "#fbbf24", border: "rgba(245,158,11,0.35)" },
  blue: { bg: "rgba(47,107,255,0.16)", text: "#7aa2ff", border: "rgba(47,107,255,0.35)" },
  violet: { bg: "rgba(139,92,246,0.16)", text: "#b794f6", border: "rgba(139,92,246,0.35)" },
  emerald: { bg: "rgba(16,185,129,0.16)", text: "#34d399", border: "rgba(16,185,129,0.35)" },
  orange: { bg: "rgba(249,115,22,0.16)", text: "#fb923c", border: "rgba(249,115,22,0.35)" },
  yellow: { bg: "rgba(234,179,8,0.16)", text: "#facc15", border: "rgba(234,179,8,0.35)" },
  gray: { bg: "rgba(148,163,184,0.16)", text: "#cbd5e1", border: "rgba(148,163,184,0.35)" },
  green: { bg: "rgba(34,197,94,0.16)", text: "#4ade80", border: "rgba(34,197,94,0.35)" },
  slate: { bg: "rgba(100,116,139,0.16)", text: "#94a3b8", border: "rgba(100,116,139,0.35)" },
  red: { bg: "rgba(239,68,68,0.16)", text: "#f87171", border: "rgba(239,68,68,0.35)" },
};

/** Emit the `--crm-*` custom-property block for a palette (used to generate CSS
 *  and to set inline styles that paint before React mounts — the white-flash fix). */
export function paletteToCssVars(p: CrmPalette): Record<string, string> {
  return {
    "--crm-background": p.background,
    "--crm-workspace": p.workspace,
    "--crm-panel": p.panel,
    "--crm-card": p.card,
    "--crm-inset": p.inset,
    "--crm-border": p.border,
    "--crm-border-soft": p.borderSoft,
    "--crm-text-primary": p.textPrimary,
    "--crm-text-secondary": p.textSecondary,
    "--crm-text-muted": p.textMuted,
    "--crm-shadow-color": p.shadowColor,
    "--crm-accent": p.accent,
    "--crm-accent-hover": p.accentHover,
    "--crm-accent-contrast": p.accentContrast,
  };
}
