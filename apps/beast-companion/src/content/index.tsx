import { HOST_ID, mountSidebar, type MountHandle } from "./mount";
import { startPersistenceGuard } from "./persistence";
import { log, logError } from "@/utils/log";

/**
 * Content-script entry point.
 *
 * Security reminder: this only runs because manifest.json's content_scripts
 * .matches limits it to smartapartmentdata.com (incl. app.). Chrome does not
 * load it anywhere else — there's no runtime domain check to get wrong.
 *
 * Responsibilities: guard against double-injection, mount the Shadow-DOM UI,
 * keep it attached, and log every step for diagnosis.
 *
 * WHAT WE DELIBERATELY DO NOT DO (these caused "flash then disappear"):
 *  - No teardown on `pagehide`: ASP.NET redirects/postbacks fire it constantly.
 *  - No teardown on a `chrome.runtime` port disconnect: in MV3 the background
 *    service worker sleeps, which disconnects such ports shortly after load —
 *    which unmounted the whole UI. A real navigation re-injects this script
 *    fresh anyway, so no lifecycle-based teardown is needed at all.
 */

const INJECTED_FLAG = "__beastCompanionInjected";

declare global {
  interface Window {
    [INJECTED_FLAG]?: boolean;
  }
}

function init(): void {
  try {
    log("content script start on", location.href);

    // Idempotent: never mount twice (flag + a DOM check, so a stray host from a
    // prior context can't lead to duplicates).
    if (window[INJECTED_FLAG] || document.getElementById(HOST_ID)) {
      log("already injected — skipping");
      return;
    }
    window[INJECTED_FLAG] = true;

    const handle: MountHandle = mountSidebar();
    startPersistenceGuard(handle.host);

    log("ready — the Beast tab should be visible on the right edge and stay put");
  } catch (err) {
    logError("init failed:", err);
  }
}

init();
