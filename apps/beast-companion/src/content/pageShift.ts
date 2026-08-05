import { ANIM_MS, PANEL_WIDTH } from "@/utils/constants";
import type { LayoutMode } from "@/types";

/**
 * Page-shift controller — the ONLY thing that touches the host page's layout.
 *
 * It is kept completely separate from the sidebar UI (which lives in a Shadow
 * DOM) so that a layout quirk on one website can never break the panel, and the
 * panel's React tree never accidentally mutates the host page.
 *
 * Preferred mode ("push"): we add a right margin to <html> equal to the panel
 * width. Because <html> is sized by the viewport, a right margin shrinks the
 * page's usable width and reflows its content to the left — exactly the Apollo
 * behavior — while our fixed-position panel fills the freed strip on the right.
 * No overlay, no backdrop; the page stays fully visible and interactive.
 *
 * Fallback mode ("overlay"): if a site can't be resized safely, we shift
 * nothing and simply let the panel float above the right edge. This is a visual
 * fallback only — still no dark backdrop and no blocked interaction.
 */

const HTML = document.documentElement;

// We only ever set two inline properties on <html>. We record their ORIGINAL
// inline values (usually empty strings) so restore is exact and reversible —
// no guessing, no leftover styles, no permanent change to the host page.
type Snapshot = { marginRight: string; transition: string };
let snapshot: Snapshot | null = null;

function takeSnapshot(): Snapshot {
  return {
    marginRight: HTML.style.marginRight,
    transition: HTML.style.transition,
  };
}

function applyPush(): void {
  // `transition` on the root animates the reflow in lockstep with the panel.
  HTML.style.setProperty("transition", `margin-right ${ANIM_MS}ms ease`);
  HTML.style.setProperty("margin-right", `${PANEL_WIDTH}px`);
}

/** Open the layout for the panel. Returns the mode actually used. */
export function openLayout(mode: LayoutMode = "push"): LayoutMode {
  // Snapshot once, on the first open, so repeated open/close stays reversible.
  if (!snapshot) snapshot = takeSnapshot();

  if (mode === "push") {
    applyPush();
    return "push";
  }
  // overlay: intentionally no layout change.
  return "overlay";
}

/** Restore the host page to exactly how it was before we touched it. */
export function closeLayout(): void {
  if (!snapshot) return;
  // Restore the original inline values verbatim (usually clearing them).
  HTML.style.marginRight = snapshot.marginRight;
  // Keep the transition briefly so the reflow-back animates, then restore it.
  window.setTimeout(() => {
    if (snapshot) HTML.style.transition = snapshot.transition;
  }, ANIM_MS);
}

/**
 * Hard teardown for when the content script unloads (extension disabled/updated,
 * or SPA teardown). Removes every trace synchronously — no animation, no
 * residue — honoring "clean up all injected styles when the extension unloads".
 */
export function teardownLayout(): void {
  if (!snapshot) return;
  HTML.style.marginRight = snapshot.marginRight;
  HTML.style.transition = snapshot.transition;
  snapshot = null;
}
