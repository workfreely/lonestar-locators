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
 * Jobs: paint the fixed launcher host, keep it attached, TOGGLE the native side
 * panel on click, mirror to the panel's docked side, report lightweight page
 * context, and mask the launcher during the native open/close animation.
 *
 * The launcher's position is 100% CSS (host is position:fixed; right:0). This
 * script NEVER computes or writes its coordinates. The resize listener here is
 * DIAGNOSTIC + an opacity mask only — it does not reposition anything.
 */

const INJECTED_FLAG = "__beastCompanionInjected";
const CLICK_DEBOUNCE_MS = 250;
const RESIZE_SETTLE_MS = 160;
const now = () => Math.round(performance.now());

declare global {
  interface Window {
    [INJECTED_FLAG]?: boolean;
  }
}

let lastClickTs = 0;
function requestToggle(): void {
  const t = now();
  if (t - lastClickTs < CLICK_DEBOUNCE_MS) {
    log(`[${t}] launcher click IGNORED (debounced)`);
    return;
  }
  lastClickTs = t;
  log(`[${t}] launcher click → requesting TOGGLE`);
  // Forwarded synchronously inside the click handler to preserve the user
  // gesture. The SW owns open/closed state and decides open-vs-close.
  chrome.runtime.sendMessage({ type: "TOGGLE_PANEL", clickTs: t }).catch((err) => {
    logError("sendMessage(TOGGLE_PANEL) failed:", err);
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
  chrome.runtime
    .sendMessage({ type: "REPORT_CONTEXT", context: readPageContext() })
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
  setInterval(check, 1000);
}

/**
 * Mask the launcher during viewport resizes (which the native side-panel open/
 * close animation triggers). Chrome composites the web contents and the browser
 * panel UI in SEPARATE layers, so during the ~200ms animated slide the web
 * viewport edge lags the panel edge and a fixed handle shows a transient seam.
 * We hide the handle (opacity only — NO coordinate math, NO slide) while frames
 * are still arriving, then reveal it flush once the viewport is stable.
 *
 * Also emits resize timestamps so they can be compared against the SW's native
 * onOpened/onClosed timestamps.
 */
function startResizeMask(launcher: Launcher): void {
  let settleTimer: number | undefined;
  window.addEventListener(
    "resize",
    () => {
      log(`[${now()}] page resize — innerWidth=${window.innerWidth} (masking launcher)`);
      launcher.host.setAttribute("data-resizing", "");
      if (settleTimer !== undefined) window.clearTimeout(settleTimer);
      settleTimer = window.setTimeout(() => {
        launcher.host.removeAttribute("data-resizing");
        log(`[${now()}] viewport settled — launcher revealed flush`);
      }, RESIZE_SETTLE_MS);
    },
    { passive: true },
  );
}

function init(): void {
  try {
    log("content start (document_start) on", location.href, "— site:", detectSite(location.host));

    if (window[INJECTED_FLAG] || document.getElementById(HOST_ID)) {
      log("already injected — skipping");
      return;
    }
    window[INJECTED_FLAG] = true;

    const launcher = createLauncher(requestToggle);
    startPersistenceGuard(launcher.host);

    // Mirror to the panel's side now, and again whenever the user returns to the
    // tab (the only time they could have moved the panel — there is no
    // onLayoutChanged event, so a focus re-query is the supported approach).
    syncSide(launcher);
    window.addEventListener("focus", () => syncSide(launcher));

    reportContext();
    startContextWatcher();
    startResizeMask(launcher);

    log("ready — launcher docked; click toggles the native side panel");
  } catch (err) {
    logError("init failed:", err);
  }
}

init();
