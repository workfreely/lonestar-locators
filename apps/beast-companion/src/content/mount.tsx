import { StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import App from "@/sidebar/App";
// Imported as a raw string (?inline) so Vite does NOT emit a stylesheet onto the
// host page. We inject it ONLY inside our Shadow DOM, so host CSS can't reach our
// UI and our CSS can't touch the host page.
import sidebarCss from "@/sidebar/sidebar.css?inline";

const HOST_ID = "beast-companion-host";

export type MountHandle = { unmount: () => void };

/**
 * Create an isolated Shadow DOM host and mount the React sidebar into it.
 *
 * Isolation strategy:
 *  - A single host <div> is appended to <html>. It is fixed, full-viewport, and
 *    pointer-events:none, so it never blocks the page; only the tab/panel inside
 *    it capture clicks.
 *  - `attachShadow({ mode: "open" })` gives us a style boundary: the host site's
 *    CSS cannot cross into our tree, and our injected CSS is scoped to the shadow
 *    root — it cannot modify any host element.
 */
export function mountSidebar(): MountHandle {
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

  const shadow = host.attachShadow({ mode: "open" });

  const style = document.createElement("style");
  style.textContent = sidebarCss;
  shadow.appendChild(style);

  const mountPoint = document.createElement("div");
  mountPoint.className = "bc-root";
  shadow.appendChild(mountPoint);

  document.documentElement.appendChild(host);

  const root: Root = createRoot(mountPoint);
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  );

  return {
    unmount() {
      root.unmount();
      host.remove();
    },
  };
}
