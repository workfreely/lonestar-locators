import { HOST_ID, createLauncher } from "./launcher";
import { startPersistenceGuard } from "./persistence";
import { getPanelState, onPanelStateChanged } from "@/services/storage";
import { log, logError } from "@/utils/log";
import type { RuntimeMessage } from "@/types";

/**
 * Content-script entry (runs at document_start on smartapartmentdata.com only).
 *
 * Its ONLY jobs are: paint the launcher tab, keep it attached, and toggle the
 * NATIVE Chrome side panel. It injects no panel UI and no page-shift — Chrome
 * resizes the page for the native panel, so there is nothing to flicker on
 * navigation and nothing to clean up.
 *
 * Opening the native panel must come from a user gesture, so the launcher click
 * asks the background to call chrome.sidePanel.open() synchronously. Closing has
 * no API, so we ask the panel page to window.close() itself. The toolbar icon is
 * a guaranteed fallback for opening (see background: openPanelOnActionClick).
 */

const INJECTED_FLAG = "__beastCompanionInjected";
declare global {
  interface Window {
    [INJECTED_FLAG]?: boolean;
  }
}

function send(message: RuntimeMessage): void {
  void chrome.runtime.sendMessage(message).catch(() => {});
}

function init(): void {
  try {
    log("content start (document_start) on", location.href);

    if (window[INJECTED_FLAG] || document.getElementById(HOST_ID)) {
      log("already injected — skipping");
      return;
    }
    window[INJECTED_FLAG] = true;

    let isOpen = false;

    const toggle = () => {
      if (isOpen) {
        // Ask the panel page to close itself (no programmatic close API).
        send({ type: "CLOSE_PANEL" });
      } else {
        // Ask the background to open the native panel (needs this gesture).
        send({ type: "OPEN_PANEL" });
      }
    };

    const launcher = createLauncher(toggle);
    startPersistenceGuard(launcher.host);

    // Reflect the panel's open/closed state on the launcher tooltip. The side
    // panel page writes this to storage when it loads/unloads.
    void getPanelState().then((s) => {
      isOpen = s === "open";
      launcher.setOpen(isOpen);
    });
    onPanelStateChanged((s) => {
      isOpen = s === "open";
      launcher.setOpen(isOpen);
    });

    log("ready — launcher docked; click it to toggle the native side panel");
  } catch (err) {
    logError("init failed:", err);
  }
}

init();
