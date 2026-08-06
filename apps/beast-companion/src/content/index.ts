import { HOST_ID, createLauncher } from "./launcher";
import { startPersistenceGuard } from "./persistence";
import { log, logError } from "@/utils/log";

/**
 * Content-script entry (document_start, smartapartmentdata.com only).
 *
 * Jobs: paint the launcher tab, keep it attached, and REQUEST OPEN of the native
 * side panel on click. It never toggles and never closes — closing is Chrome's
 * native X — so stale open/closed state can't make a click misfire (the reopen
 * bug). No injected panel, no page-shift.
 */

const INJECTED_FLAG = "__beastCompanionInjected";
declare global {
  interface Window {
    [INJECTED_FLAG]?: boolean;
  }
}

function init(): void {
  try {
    log("content start (document_start) on", location.href);

    if (window[INJECTED_FLAG] || document.getElementById(HOST_ID)) {
      log("already injected — skipping");
      return;
    }
    window[INJECTED_FLAG] = true;

    const requestOpen = () => {
      log("launcher click → requesting OPEN");
      // Ask the background to open the native panel for this tab. Sent
      // synchronously inside the click handler to preserve the user gesture.
      chrome.runtime.sendMessage({ type: "OPEN_PANEL" }).catch((err) => {
        logError("sendMessage(OPEN_PANEL) failed:", err);
      });
    };

    const launcher = createLauncher(requestOpen);
    startPersistenceGuard(launcher.host);

    log("ready — launcher docked; click opens the native side panel");
  } catch (err) {
    logError("init failed:", err);
  }
}

init();
