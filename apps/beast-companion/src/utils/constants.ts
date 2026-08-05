/**
 * Single source of truth for brand + layout constants.
 *
 * Keeping these here (rather than scattered in CSS/TSX) means the collapsed tab,
 * the expanded panel, and the page-shift logic all agree on one panel width and
 * one palette — critical because the page-shift margin MUST equal the panel
 * width for the push effect to line up.
 */

/** Extension version — mirrors manifest.json / package.json. */
export const VERSION = "0.1.0";

/** Locator Beast brand palette (subset used by the companion). */
export const BRAND = {
  blue: "#2f6bff",
  blueBright: "#5b8bff",
  bgDark: "#05070d",
  panelDark: "#0b0f1a",
  ink: "#05070d",
  inkSoft: "#4b5162",
  white: "#ffffff",
  border: "#e5e7ee",
} as const;

/** Expanded panel width. Responsive clamping happens in CSS; this is the base
 *  the page-shift uses on standard desktop widths. */
export const PANEL_WIDTH = 384;

/** Collapsed tab size (square-ish), per the docked-tab spec (48–56px). */
export const TAB_SIZE = 52;

/** How far down the viewport the collapsed tab sits (≈20–25% from the top). */
export const TAB_TOP_VH = 22;

/** Animation duration shared by the panel slide and the page-shift, so they
 *  move together. */
export const ANIM_MS = 280;

/**
 * Human-readable whitelist, for documentation and future UI only.
 *
 * The REAL enforcement is declarative in manifest.json → content_scripts.matches.
 * Chrome never injects this extension outside those match patterns, so on any
 * non-approved site there is literally no code, no observer, and no sidebar.
 */
export const SUPPORTED_DOMAINS = ["*.smartapartmentdata.com"] as const;
