import { StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import App from "@/sidebar/App";
// Imported as a raw string (?inline) so Vite does NOT emit a stylesheet onto the
// host page. We inject it ONLY inside our Shadow DOM, so host CSS can't reach our
// UI and our CSS can't touch the host page.
import sidebarCss from "@/sidebar/sidebar.css?inline";
import { log } from "@/utils/log";

export const HOST_ID = "beast-companion-host";

export type MountHandle = { host: HTMLElement; unmount: () => void };

/**
 * Create an isolated Shadow DOM host and mount the React sidebar into it.
 * Logs each lifecycle step so the host page's console shows exactly how far the
 * mount got if anything goes wrong.
 */
export function mountSidebar(): MountHandle {
  log("host: creating element");
  const host = document.createElement("div");
  host.id = HOST_ID;
  // Inline, high-specificity host styling so a stray host-page rule can't move
  // or hide our layer. The host is a transparent, click-through overlay; its
  // children opt back into pointer events.
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

  log("shadow: attaching (open)");
  const shadow = host.attachShadow({ mode: "open" });

  const style = document.createElement("style");
  style.textContent = sidebarCss;
  shadow.appendChild(style);

  const mountPoint = document.createElement("div");
  mountPoint.className = "bc-root";
  shadow.appendChild(mountPoint);

  // Attach to <html> so a host-page `body.innerHTML` reset (common in ASP.NET
  // partial updates) doesn't take our host with it. The persistence guard
  // re-attaches if the page removes it anyway.
  document.documentElement.appendChild(host);
  log("host: attached under <html>");

  log("react: creating root + rendering");
  const root: Root = createRoot(mountPoint);
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
  log("react: initial render committed");

  return {
    host,
    unmount() {
      log("react: unmounting + removing host");
      root.unmount();
      host.remove();
    },
  };
}
