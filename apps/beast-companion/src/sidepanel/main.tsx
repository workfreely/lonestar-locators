import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { PanelApp } from "./PanelApp";
import "./sidepanel.css";
import { log } from "@/utils/log";

/**
 * Side-panel entry point. This runs in the NATIVE Chrome side panel document,
 * which Chrome owns and never re-injects on host-page navigation — that's what
 * eliminates the flicker.
 *
 * Open/closed state is owned by the service worker, which learns it from Chrome's
 * native sidePanel.onOpened / onClosed lifecycle events. This document does NOT
 * write panel state (no pagehide, no storage) — that stale-state path caused the
 * old reopen bug. Closing the Companion is Chrome's native side-panel X.
 */

log("side panel: loaded");

const container = document.getElementById("root");
if (container) {
  createRoot(container).render(
    <StrictMode>
      <PanelApp />
    </StrictMode>,
  );
}
