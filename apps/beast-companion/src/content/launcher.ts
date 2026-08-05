import launcherCss from "./launcher.css?inline";
import { log } from "@/utils/log";

/**
 * The injected launcher tab.
 *
 * Plain DOM (no React) so the content bundle stays tiny and can paint instantly
 * at document_start — this is what keeps the launcher flicker-free across SAD's
 * postbacks and .aspx navigations. The heavy React UI lives in the native side
 * panel (Chrome-owned, never re-injected), not here.
 *
 * The tab lives inside a Shadow DOM so the host page's CSS can't touch it and
 * our CSS can't touch the page.
 */

export const HOST_ID = "beast-companion-launcher-host";

// The Locator Beast mark: blue rounded square + white chevron.
const LOGO_SVG = `
<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <rect width="24" height="24" rx="6" fill="#2f6bff"/>
  <path d="M6 15l6-7 6 7" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

export type Launcher = {
  host: HTMLElement;
  /** Reflect open/closed state in the tab's tooltip/label. */
  setOpen: (open: boolean) => void;
};

export function createLauncher(onToggle: () => void): Launcher {
  log("launcher: creating host");
  const host = document.createElement("div");
  host.id = HOST_ID;
  // Transparent, click-through overlay; only the tab captures clicks.
  host.style.cssText = [
    "position: fixed",
    "inset: 0",
    "width: 100%",
    "height: 100%",
    "margin: 0",
    "padding: 0",
    "border: 0",
    "z-index: 2147483647",
    "pointer-events: none",
  ].join(";");

  const shadow = host.attachShadow({ mode: "open" });

  const style = document.createElement("style");
  style.textContent = launcherCss;
  shadow.appendChild(style);

  const root = document.createElement("div");
  root.className = "bc-root";
  shadow.appendChild(root);

  const tab = document.createElement("button");
  tab.type = "button";
  tab.className = "bc-tab";
  tab.innerHTML = LOGO_SVG;
  tab.setAttribute("aria-label", "Open Beast Companion");
  tab.title = "Open Beast Companion";
  tab.addEventListener("click", onToggle);
  root.appendChild(tab);

  // Attach to <html> so a host-page body reset doesn't take it with it.
  document.documentElement.appendChild(host);
  log("launcher: attached under <html>");

  return {
    host,
    setOpen(open: boolean) {
      const label = open ? "Close Beast Companion" : "Open Beast Companion";
      tab.setAttribute("aria-label", label);
      tab.title = label;
    },
  };
}
