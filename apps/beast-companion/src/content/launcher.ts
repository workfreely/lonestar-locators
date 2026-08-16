import launcherCss from "./launcher.css?inline";
import { log } from "@/utils/log";

/**
 * The injected launcher tab.
 *
 * Anchoring model (this is the important part): the OUTER HOST element itself is
 * the fixed, viewport-anchored 52×52 handle — `position: fixed; right: 0`. It is
 * NOT a full-viewport overlay with the tab fixed inside the Shadow DOM. That old
 * indirection (a 100%-wide host + a separately-fixed child) is what made the tab
 * lag behind Chrome's native side-panel divider during a live resize.
 *
 * Because the host is `position: fixed` and lives directly under <html> (no
 * transformed ancestor), the viewport is its containing block, so `right: 0`
 * re-anchors to the panel's live edge every frame with no JS involved. There is
 * NO window.innerWidth math, NO cached coordinates, and NO resize handler — the
 * browser does the anchoring in the compositor.
 *
 * The Shadow DOM holds only the visual button, which FILLS the host (100%×100%)
 * and never positions it. `data-side` on the host is the single switch for
 * left-vs-right (inline left/right + `:host()` corner mirroring).
 *
 * Positioning is written with setProperty(..., "important") so a hostile page
 * rule (e.g. `* { position: static !important }`) can't dislodge the handle.
 */

export const HOST_ID = "beast-companion-launcher-host";

// The Locator Beast mark: blue rounded square + white chevron.
const LOGO_SVG = `
<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <rect width="24" height="24" rx="6" fill="#2f6bff"/>
  <path d="M6 15l6-7 6 7" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

/** Fixed host geometry that never changes, regardless of side or page CSS. */
const HOST_FIXED_STYLE: Record<string, string> = {
  position: "fixed",
  // Anchored just BELOW the site's top nav (matches the Apollo edge-tab height),
  // not mid-viewport. A fixed px (not vh) keeps it clearing the ~64px header on
  // any viewport height, while staying well below the Companion panel's own
  // header/pin/close row. position:fixed keeps it put as the dashboard scrolls.
  top: "104px",
  width: "52px",
  height: "52px",
  margin: "0",
  padding: "0",
  border: "0",
  "box-sizing": "border-box",
  transform: "none",
  transition: "none",
  "z-index": "2147483647",
  "pointer-events": "auto",
};

function applyImportant(el: HTMLElement, styles: Record<string, string>): void {
  for (const [prop, value] of Object.entries(styles)) {
    el.style.setProperty(prop, value, "important");
  }
}

/** Anchor the host to the given edge with !important inline styles. */
function anchorHost(host: HTMLElement, side: "left" | "right"): void {
  if (side === "left") {
    host.style.setProperty("left", "0", "important");
    host.style.setProperty("right", "auto", "important");
  } else {
    host.style.setProperty("right", "0", "important");
    host.style.setProperty("left", "auto", "important");
  }
}

export type Launcher = {
  host: HTMLElement;
  /** Dock/mirror the launcher to the panel's edge ("right" default, "left" mirrored). */
  setSide: (side: "left" | "right") => void;
};

export function createLauncher(onOpen: () => void): Launcher {
  log("launcher: creating host");
  const host = document.createElement("div");
  host.id = HOST_ID;
  host.dataset.side = "right"; // single switch for left/right (also read by :host() CSS)
  applyImportant(host, HOST_FIXED_STYLE);
  anchorHost(host, "right");

  const shadow = host.attachShadow({ mode: "open" });

  const style = document.createElement("style");
  style.textContent = launcherCss;
  shadow.appendChild(style);

  // The button FILLS the host and does not position it.
  const tab = document.createElement("button");
  tab.type = "button";
  tab.className = "bc-tab";
  tab.innerHTML = LOGO_SVG;
  // Open-only: a click always opens the native panel; Chrome's native X closes.
  tab.setAttribute("aria-label", "Open Locator Beast Companion");
  tab.title = "Open Locator Beast Companion";
  tab.addEventListener("click", onOpen);
  shadow.appendChild(tab);

  // Attach directly under <html> (never <body>) so a transform on <body> can't
  // become the fixed-position containing block and drag the handle inward.
  document.documentElement.appendChild(host);
  log("launcher: host anchored fixed under <html>");

  return {
    host,
    setSide(side: "left" | "right") {
      host.dataset.side = side;
      anchorHost(host, side);
    },
  };
}
