import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { PanelApp } from "./PanelApp";
import "./sidepanel.css";
import { setPanelState } from "@/services/storage";
import { log } from "@/utils/log";

/**
 * Side-panel entry point. This runs in the NATIVE Chrome side panel document,
 * which Chrome owns and never re-injects on host-page navigation — that's what
 * eliminates the flicker.
 *
 * Lifecycle: on load we mark the panel "open"; on unload/close we clear it to
 * "closed" (used for future state restore). Closing the whole Companion is done
 * only with Chrome's native side-panel X — there is no programmatic close.
 */

log("side panel: loaded");

// Guarded so the panel still renders in a plain browser (dev/preview) where the
// chrome.* APIs aren't present. In the real extension these always exist.
if (typeof chrome !== "undefined" && chrome.storage) {
  void setPanelState("open");
  window.addEventListener("pagehide", () => {
    void setPanelState("closed");
  });
}

const container = document.getElementById("root");
if (container) {
  createRoot(container).render(
    <StrictMode>
      <PanelApp />
    </StrictMode>,
  );
}
