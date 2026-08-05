import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { PanelApp } from "./PanelApp";
import "./sidepanel.css";
import { setPanelState } from "@/services/storage";
import { log } from "@/utils/log";
import type { RuntimeMessage } from "@/types";

/**
 * Side-panel entry point. This runs in the NATIVE Chrome side panel document,
 * which Chrome owns and never re-injects on host-page navigation — that's what
 * eliminates the flicker.
 *
 * Lifecycle: on load we mark the panel "open" (so the injected launcher can show
 * the right tooltip and restore state); on unload we mark it "closed". Because
 * Chrome has no programmatic close API, we also listen for the launcher's
 * CLOSE_PANEL request and close ourselves.
 */

log("side panel: loaded");

// Guarded so the panel still renders in a plain browser (dev/preview) where the
// chrome.* APIs aren't present. In the real extension these always exist.
if (typeof chrome !== "undefined" && chrome.storage) {
  void setPanelState("open");
  window.addEventListener("pagehide", () => {
    void setPanelState("closed");
  });
  chrome.runtime.onMessage.addListener((message: RuntimeMessage) => {
    if (message.type === "CLOSE_PANEL") window.close();
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
