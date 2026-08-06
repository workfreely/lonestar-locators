import { HOST_ID, createLauncher, type Launcher } from "./launcher";
import { startPersistenceGuard } from "./persistence";
import { detectSite, readPageContext } from "./context";
import { log, logError } from "@/utils/log";
import type { PanelSide } from "@/types";

/**
 * Content-script entry (document_start).
 *
 * Injected only on the supported sites/paths declared in the manifest
 * (smartapartmentdata.com everywhere; locatorbeast.com ONLY under /admin/*, never
 * the public marketing pages).
 *
 * Jobs: paint the launcher tab, keep it attached, OPEN the native side panel on
 * click, mirror the launcher to the panel's docked side, and report lightweight
 * page context (URL/site/section — no client data).
 *
 * OPEN-ONLY: the launcher never toggles or closes. Chrome's native X is the sole
 * close control, so there is no open/closed state to track and nothing to desync.
 */

const INJECTED_FLAG = "__beastCompanionInjected";
declare global {
  interface Window {
    [INJECTED_FLAG]?: boolean;
  }
}

function requestOpen(): void {
  log("launcher click → requesting OPEN");
  // Ask the background to open the global native panel for this window. Sent
  // synchronously inside the click handler to preserve the user gesture.
  chrome.runtime.sendMessage({ type: "OPEN_PANEL" }).catch((err) => {
    logError("sendMessage(OPEN_PANEL) failed:", err);
  });
}

/** Ask the SW which side the panel is docked on and mirror the launcher to it. */
function syncSide(launcher: Launcher): void {
  chrome.runtime
    .sendMessage({ type: "GET_PANEL_SIDE" })
    .then((res: { side?: PanelSide } | undefined) => {
      const side = res?.side === "left" ? "left" : "right";
      launcher.setSide(side);
      log(`launcher mirrored to ${side} side`);
    })
    .catch((err) => logError("GET_PANEL_SIDE failed — keeping right:", err));
}

/** Report the current page context (URL/site/section) to the SW. */
function reportContext(): void {
  const context = readPageContext();
  chrome.runtime
    .sendMessage({ type: "REPORT_CONTEXT", context })
    .catch((err) => logError("REPORT_CONTEXT failed:", err));
}

/** Re-report context when an SPA route change swaps the URL under our feet. */
function startContextWatcher(): void {
  let lastUrl = location.href;
  const check = () => {
    if (location.href === lastUrl) return;
    lastUrl = location.href;
    log("navigation detected →", lastUrl);
    reportContext();
  };
  window.addEventListener("popstate", check);
  window.addEventListener("hashchange", check);
  // Next.js/SPA pushState navigations fire no event we can hear from the isolated
  // world, so poll cheaply as a backstop.
  setInterval(check, 1000);
}

function init(): void {
  try {
    log("content start (document_start) on", location.href, "— site:", detectSite(location.host));

    if (window[INJECTED_FLAG] || document.getElementById(HOST_ID)) {
      log("already injected — skipping");
      return;
    }
    window[INJECTED_FLAG] = true;

    const launcher = createLauncher(requestOpen);
    startPersistenceGuard(launcher.host);

    // Mirror to the panel's side now, and again whenever the user returns to the
    // tab (the only time they could have moved the panel left/right — there is no
    // onLayoutChanged event, so a focus re-query is the supported approach).
    syncSide(launcher);
    window.addEventListener("focus", () => syncSide(launcher));

    reportContext();
    startContextWatcher();

    log("ready — launcher docked; click opens the native side panel (native X closes)");
  } catch (err) {
    logError("init failed:", err);
  }
}

init();
